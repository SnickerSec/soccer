/**
 * Removing members, and leaving a team, against a real PostgreSQL server.
 *
 * Every administrative route on a team — rename, invite, remove, delete —
 * requires owner, and nothing grants the role. A team with no owner is
 * therefore unadministrable and cannot even be deleted; it sits in every
 * member's list with the roster and season history inside. So "the last owner
 * cannot be removed" is not a nicety, it is the only thing keeping a team
 * recoverable.
 *
 * See tests/integration/helpers/db.js for how to run these.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import {
    hasDb, pool, teamRoutes, applySchema, truncateAll,
    seedUser, seedTeam, addMember, idleInTransactionCount
} from './helpers/db.js';
import { buildApp } from '../helpers/test-app.js';

const describeDb = hasDb ? describe : describe.skip;

describeDb('team membership against PostgreSQL', () => {
    let owner;
    let team;
    let ownerApp;

    beforeAll(async () => {
        await applySchema();
    });

    beforeEach(async () => {
        await truncateAll();
        owner = await seedUser('owner@example.com');
        team = await seedTeam(owner);
        ownerApp = buildApp(teamRoutes, { id: owner.id });
    });

    afterAll(async () => {
        await pool.end();
    });

    const appFor = (user) => buildApp(teamRoutes, { id: user.id });

    /** The team_members row id for a user. */
    async function memberIdOf(user) {
        const { rows } = await pool.query(
            'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
            [team.id, user.id]
        );
        return rows[0]?.id;
    }

    async function ownerCount() {
        const { rows } = await pool.query(
            `SELECT count(*)::int AS c FROM team_members
             WHERE team_id = $1 AND role = 'owner' AND joined_at IS NOT NULL`,
            [team.id]
        );
        return rows[0].c;
    }

    const removeMember = (app, memberId) =>
        request(app).delete(`/api/teams/${team.id}/members/${memberId}`);
    const leave = (app) => request(app).delete(`/api/teams/${team.id}/membership`);

    describe('removing a member', () => {
        test('an owner can remove a coach', async () => {
            const coach = await seedUser('coach@example.com');
            await addMember(team, coach, 'coach');

            const res = await removeMember(ownerApp, await memberIdOf(coach));

            expect(res.status).toBe(200);
            expect(await memberIdOf(coach)).toBeUndefined();
        });

        test('the only owner cannot be removed', async () => {
            const res = await removeMember(ownerApp, await memberIdOf(owner));

            expect(res.status).toBe(409);
            expect(await ownerCount()).toBe(1);
        });

        test('says why, rather than just refusing', async () => {
            const res = await removeMember(ownerApp, await memberIdOf(owner));

            expect(res.body.error).toMatch(/owner/i);
        });

        test('an owner can be removed once there is a second one', async () => {
            const second = await seedUser('second@example.com');
            await addMember(team, second, 'owner');

            const res = await removeMember(ownerApp, await memberIdOf(owner));

            expect(res.status).toBe(200);
            expect(await ownerCount()).toBe(1);
        });

        test('a member id from another team is not removable through this one', async () => {
            const stranger = await seedUser('stranger@example.com');
            const otherTeam = await seedTeam(stranger, 'Lions');
            const { rows } = await pool.query(
                'SELECT id FROM team_members WHERE team_id = $1', [otherTeam.id]);

            const res = await removeMember(ownerApp, rows[0].id);

            expect(res.status).toBe(404);
            const still = await pool.query(
                'SELECT count(*)::int AS c FROM team_members WHERE id = $1', [rows[0].id]);
            expect(still.rows[0].c).toBe(1);
        });

        test('a coach cannot remove anyone', async () => {
            const coach = await seedUser('coach@example.com');
            await addMember(team, coach, 'coach');

            const res = await removeMember(appFor(coach), await memberIdOf(owner));

            expect(res.status).toBe(403);
        });

        test('a refusal does not leave a connection idle in transaction', async () => {
            await removeMember(ownerApp, await memberIdOf(owner));

            expect(await idleInTransactionCount()).toBe(0);
        });

        test('two owners removing each other at once cannot empty the team', async () => {
            const second = await seedUser('second@example.com');
            await addMember(team, second, 'owner');

            const [a, b] = await Promise.all([
                removeMember(ownerApp, await memberIdOf(second)),
                removeMember(appFor(second), await memberIdOf(owner))
            ]);

            // Exactly one lands. The refusal can be either 409 — you would be
            // the last owner — or 403, when the other request committed first
            // and the middleware no longer sees you as an owner at all. Which
            // one depends on ordering; that a single owner remains does not.
            const succeeded = [a, b].filter(res => res.status === 200);
            expect(succeeded).toHaveLength(1);
            expect([a.status, b.status]).toEqual(
                expect.arrayContaining([200])
            );
            expect([409, 403]).toContain([a, b].find(res => res.status !== 200).status);
            expect(await ownerCount()).toBe(1);
        });
    });

    describe('leaving a team', () => {
        test('a coach can leave', async () => {
            const coach = await seedUser('coach@example.com');
            await addMember(team, coach, 'coach');

            const res = await leave(appFor(coach));

            expect(res.status).toBe(200);
            expect(await memberIdOf(coach)).toBeUndefined();
        });

        test('a viewer can leave', async () => {
            const viewer = await seedUser('viewer@example.com');
            await addMember(team, viewer, 'viewer');

            expect((await leave(appFor(viewer))).status).toBe(200);
        });

        test('leaving takes only your own row', async () => {
            const coach = await seedUser('coach@example.com');
            await addMember(team, coach, 'coach');

            await leave(appFor(coach));

            expect(await memberIdOf(owner)).toBeDefined();
        });

        test('the only owner cannot leave', async () => {
            const res = await leave(ownerApp);

            expect(res.status).toBe(409);
            expect(await ownerCount()).toBe(1);
        });

        test('an owner can leave once there is a second one', async () => {
            const second = await seedUser('second@example.com');
            await addMember(team, second, 'owner');

            expect((await leave(ownerApp)).status).toBe(200);
            expect(await ownerCount()).toBe(1);
        });

        test('someone who is not a member gets no access, not a 200', async () => {
            const stranger = await seedUser('stranger@example.com');

            expect((await leave(appFor(stranger))).status).toBe(403);
        });

        test('leaving does not leave a connection idle in transaction', async () => {
            const coach = await seedUser('coach@example.com');
            await addMember(team, coach, 'coach');

            await leave(appFor(coach));

            expect(await idleInTransactionCount()).toBe(0);
        });
    });

    test('a team always keeps someone who can administer it', async () => {
        const coach = await seedUser('coach@example.com');
        await addMember(team, coach, 'coach');

        // Every route out of ownership, tried
        await leave(ownerApp);
        await removeMember(ownerApp, await memberIdOf(owner));

        expect(await ownerCount()).toBe(1);
        // And that owner can still delete the team, so it is never stranded
        expect((await request(ownerApp).delete(`/api/teams/${team.id}`)).status).toBe(200);
    });
});
