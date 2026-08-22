/**
 * Invite acceptance against a real PostgreSQL server.
 *
 * An invite link is single-use: `joined_at IS NULL` is what spends it. Whether
 * two people opening the same link at once can both spend it is a question
 * about row locking under READ COMMITTED, which a mocked client cannot answer —
 * it will agree that a row was locked and then let both writes through.
 *
 * See tests/integration/helpers/db.js for how to run these.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import {
    hasDb, pool, inviteRoutes, applySchema, truncateAll,
    seedUser, seedTeam, idleInTransactionCount
} from './helpers/db.js';
import { buildApp } from '../helpers/test-app.js';

const describeDb = hasDb ? describe : describe.skip;

describeDb('invite acceptance against PostgreSQL', () => {
    let owner;
    let team;

    beforeAll(async () => {
        await applySchema();
    });

    beforeEach(async () => {
        await truncateAll();
        owner = await seedUser('owner@example.com');
        team = await seedTeam(owner);
    });

    afterAll(async () => {
        await pool.end();
    });

    /** An unclaimed invite, as POST /api/teams/:teamId/invites writes one. */
    async function seedInvite(token, { role = 'coach', expiresIn = '7 days' } = {}) {
        await pool.query(
            `INSERT INTO team_members (team_id, role, invite_token, invite_expires_at, invited_by)
             VALUES ($1, $2, $3, NOW() + $4::interval, $5)`,
            [team.id, role, token, expiresIn, owner.id]
        );
    }

    const accept = (user, token) =>
        request(buildApp(inviteRoutes, { id: user.id })).post(`/api/invites/${token}/accept`);

    /**
     * Everyone actually on the team, invites excluded.
     *
     * The owner is in here too — the on_team_created trigger adds their row —
     * so tests about who accepted an invite have to say so explicitly rather
     * than counting the list.
     */
    async function members() {
        const { rows } = await pool.query(
            `SELECT user_id FROM team_members
             WHERE team_id = $1 AND joined_at IS NOT NULL`,
            [team.id]
        );
        return rows.map(r => r.user_id);
    }

    test('one person accepting joins the team', async () => {
        const coach = await seedUser('coach@example.com');
        await seedInvite('tok-1');

        const res = await accept(coach, 'tok-1');

        expect(res.body.success).toBe(true);
        expect(await members()).toContain(coach.id);
    });

    test('the link cannot be spent twice in sequence', async () => {
        const first = await seedUser('first@example.com');
        const second = await seedUser('second@example.com');
        await seedInvite('tok-1');

        await accept(first, 'tok-1');
        const res = await accept(second, 'tok-1');

        expect(res.body.success).toBe(false);
        expect(await members()).not.toContain(second.id);
    });

    describe('two people opening the same link at once', () => {
        test('only one of them joins', async () => {
            const first = await seedUser('first@example.com');
            const second = await seedUser('second@example.com');
            await seedInvite('tok-1');

            const results = await Promise.all([
                accept(first, 'tok-1'),
                accept(second, 'tok-1')
            ]);

            const succeeded = results.filter(r => r.body.success);
            expect(succeeded).toHaveLength(1);
        });

        test('nobody is told they joined without actually joining', async () => {
            const first = await seedUser('first@example.com');
            const second = await seedUser('second@example.com');
            await seedInvite('tok-1');

            const [a, b] = await Promise.all([
                accept(first, 'tok-1'),
                accept(second, 'tok-1')
            ]);

            // The failure this guards: both transactions read the row as
            // unclaimed, both UPDATE, the second overwrites user_id, and the
            // first walks away with a success response and no membership.
            const joined = await members();
            const told = [
                a.body.success ? first.id : null,
                b.body.success ? second.id : null
            ].filter(Boolean);

            // Whoever was told they joined is on the team, and whoever was not
            // told is off it — the two answers cannot disagree.
            expect(told).toHaveLength(1);
            expect(joined).toContain(told[0]);

            const rejected = told[0] === first.id ? second.id : first.id;
            expect(joined).not.toContain(rejected);
        });

        test('leaves exactly one membership row, not two', async () => {
            const first = await seedUser('first@example.com');
            const second = await seedUser('second@example.com');
            await seedInvite('tok-1');

            await Promise.all([accept(first, 'tok-1'), accept(second, 'tok-1')]);

            const { rows } = await pool.query(
                'SELECT count(*)::int AS c FROM team_members WHERE team_id = $1 AND invite_token IS NULL',
                [team.id]
            );
            // The owner's row from the on_team_created trigger, plus one joiner
            expect(rows[0].c).toBe(2);
        });

        test('does not leave a connection idle in transaction', async () => {
            const first = await seedUser('first@example.com');
            const second = await seedUser('second@example.com');
            await seedInvite('tok-1');

            await Promise.all([accept(first, 'tok-1'), accept(second, 'tok-1')]);

            // The losing request returns from inside the transaction
            expect(await idleInTransactionCount()).toBe(0);
        });
    });

    test('an expired link is refused', async () => {
        const coach = await seedUser('coach@example.com');
        await seedInvite('tok-1', { expiresIn: '-1 day' });

        const res = await accept(coach, 'tok-1');

        expect(res.body.success).toBe(false);
        expect(await members()).not.toContain(coach.id);
    });

    test('an existing member re-using a link discards it rather than joining twice', async () => {
        const coach = await seedUser('coach@example.com');
        await seedInvite('tok-1');
        await accept(coach, 'tok-1');

        await seedInvite('tok-2');
        const res = await accept(coach, 'tok-2');

        expect(res.body.success).toBe(false);
        const { rows } = await pool.query(
            'SELECT count(*)::int AS c FROM team_members WHERE team_id = $1 AND user_id = $2',
            [team.id, coach.id]
        );
        expect(rows[0].c).toBe(1);
        // The unused invite is cleared out rather than left dangling
        const { rows: leftover } = await pool.query(
            'SELECT count(*)::int AS c FROM team_members WHERE invite_token = $1',
            ['tok-2']
        );
        expect(leftover[0].c).toBe(0);
    });
});
