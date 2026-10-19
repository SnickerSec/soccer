/**
 * Pruning expired invites against a real PostgreSQL server.
 *
 * The DELETE decides which team_members rows go, and a row with a person in it
 * must never be one of them; that is a question about the actual columns and
 * the on_team_created trigger's owner row, which a mocked pool cannot answer.
 *
 * See tests/integration/helpers/db.js for how to run these.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import { hasDb, pool, inviteRoutes, applySchema, truncateAll, seedUser, seedTeam, addMember } from './helpers/db.js';
import { buildApp } from '../helpers/test-app.js';
import { pruneExpiredInvites } from '../../server/maintenance.js';

const describeDb = hasDb ? describe : describe.skip;

describeDb('pruning expired invites against PostgreSQL', () => {
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

    async function seedInvite(token, expiresIn) {
        await pool.query(
            `INSERT INTO team_members (team_id, role, invite_token, invite_expires_at, invited_by)
             VALUES ($1, 'coach', $2, NOW() + $3::interval, $4)`,
            [team.id, token, expiresIn, owner.id]
        );
    }

    const tokens = async () =>
        (await pool.query('SELECT invite_token FROM team_members WHERE invite_token IS NOT NULL ORDER BY invite_token'))
            .rows.map((r) => r.invite_token);

    const memberEmails = async () =>
        (await pool.query(
            `SELECT p.email FROM team_members tm JOIN profiles p ON p.id = tm.user_id
             WHERE tm.team_id = $1 ORDER BY p.email`,
            [team.id]
        )).rows.map((r) => r.email);

    test('removes an expired invite and keeps a live one', async () => {
        await seedInvite('expired', '-1 day');
        await seedInvite('live', '7 days');

        expect(await pruneExpiredInvites(pool)).toBe(1);
        expect(await tokens()).toEqual(['live']);
    });

    test('never touches a member, however their row reads', async () => {
        const coach = await seedUser('coach@example.com');
        await addMember(team, coach, 'coach');
        // A member row that still carries a past expiry — nothing writes one
        // today, but the guard is that a row naming a person is not an invite.
        await pool.query(
            `UPDATE team_members SET invite_expires_at = NOW() - interval '1 day' WHERE user_id = $1`,
            [coach.id]
        );

        expect(await pruneExpiredInvites(pool)).toBe(0);
        expect(await memberEmails()).toEqual(['coach@example.com', 'owner@example.com']);
    });

    test('an accepted invite is a member and stays one', async () => {
        await seedInvite('accepted', '1 day');
        const coach = await seedUser('coach@example.com');
        const accepted = await request(buildApp(inviteRoutes, { id: coach.id })).post('/api/invites/accepted/accept');
        expect(accepted.status).toBe(200);

        // Long after the link would have expired
        await pool.query(`UPDATE team_members SET invited_at = NOW() - interval '60 days'`);

        expect(await pruneExpiredInvites(pool)).toBe(0);
        expect(await memberEmails()).toEqual(['coach@example.com', 'owner@example.com']);
    });
});
