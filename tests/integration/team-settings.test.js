/**
 * Team settings routes against a real PostgreSQL server.
 *
 * The mocked-pool tests prove the route builds the right SQL. What only a real
 * database can answer is whether `settings || $2::jsonb` merges the way the
 * partial writes rely on, whether the column the migration adds is actually
 * there, and whether a settings write leaves roster_version alone — a coach
 * changing the formation must not reject another coach's in-flight roster
 * edit.
 *
 * See tests/integration/helpers/db.js for how to run these.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import {
    hasDb, pool, settingsRoutes, applySchema, truncateAll,
    seedUser, seedTeam, addMember
} from './helpers/db.js';
import { buildApp } from '../helpers/test-app.js';

const describeDb = hasDb ? describe : describe.skip;

describeDb('team settings against PostgreSQL', () => {
    let coach;
    let team;
    let app;

    beforeAll(async () => {
        await applySchema();
    });

    beforeEach(async () => {
        await truncateAll();
        coach = await seedUser('coach@example.com');
        team = await seedTeam(coach);
        app = buildApp(settingsRoutes, { id: coach.id });
    });

    afterAll(async () => {
        await pool.end();
    });

    /** The team row as the database has it. */
    async function storedTeam() {
        const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1', [team.id]);
        return rows[0];
    }

    test('a team nobody has set up yet reads back its division and nothing else', async () => {
        const res = await request(app).get(`/api/teams/${team.id}/settings`);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ ageDivision: '10U' });
    });

    test('what a coach writes is what the next device reads', async () => {
        await request(app)
            .put(`/api/teams/${team.id}/settings`)
            .send({ ageDivision: '12U', fieldPlayers: 9, formation: '3-2-3', quarters: 4 });

        const res = await request(app).get(`/api/teams/${team.id}/settings`);

        expect(res.body.data).toEqual({
            ageDivision: '12U', fieldPlayers: 9, formation: '3-2-3', quarters: 4
        });
    });

    test('a partial write keeps the settings it does not mention', async () => {
        await request(app)
            .put(`/api/teams/${team.id}/settings`)
            .send({ fieldPlayers: 9, formation: '3-2-3' });

        await request(app)
            .put(`/api/teams/${team.id}/settings`)
            .send({ formation: '3-3-2' });

        const res = await request(app).get(`/api/teams/${team.id}/settings`);
        expect(res.body.data).toMatchObject({ fieldPlayers: 9, formation: '3-3-2' });
    });

    test('the division lands in its own column, not a second copy in the JSONB', async () => {
        await request(app)
            .put(`/api/teams/${team.id}/settings`)
            .send({ ageDivision: '14U', fieldPlayers: 11, formation: '4-4-2' });

        const row = await storedTeam();
        expect(row.age_division).toBe('14U');
        expect(row.settings).toEqual({ fieldPlayers: 11, formation: '4-4-2' });
    });

    test('a write that names no division leaves the one the team had', async () => {
        await request(app)
            .put(`/api/teams/${team.id}/settings`)
            .send({ ageDivision: '12U' });

        await request(app)
            .put(`/api/teams/${team.id}/settings`)
            .send({ formation: '3-3-2' });

        expect((await storedTeam()).age_division).toBe('12U');
    });

    test('the roster version is untouched, so an in-flight roster edit still applies', async () => {
        const before = (await storedTeam()).roster_version;

        await request(app)
            .put(`/api/teams/${team.id}/settings`)
            .send({ ageDivision: '12U', fieldPlayers: 9, formation: '3-2-3' });

        expect((await storedTeam()).roster_version).toBe(before);
    });

    test('a viewer reads the settings but cannot change them', async () => {
        const parent = await seedUser('parent@example.com');
        await addMember(team, parent, 'viewer');
        const asParent = buildApp(settingsRoutes, { id: parent.id });

        expect((await request(asParent).get(`/api/teams/${team.id}/settings`)).status).toBe(200);

        const write = await request(asParent)
            .put(`/api/teams/${team.id}/settings`)
            .send({ formation: '3-3-2' });

        expect(write.status).toBe(403);
    });

    test('a coach on another team cannot read or write this one\'s', async () => {
        const stranger = await seedUser('stranger@example.com');
        const asStranger = buildApp(settingsRoutes, { id: stranger.id });

        expect((await request(asStranger).get(`/api/teams/${team.id}/settings`)).status).toBe(403);
        expect((await request(asStranger)
            .put(`/api/teams/${team.id}/settings`)
            .send({ formation: '3-3-2' })).status).toBe(403);
    });

    test('a settings write does not disturb another team\'s', async () => {
        const other = await seedTeam(coach, 'Sharks');

        await request(app)
            .put(`/api/teams/${team.id}/settings`)
            .send({ ageDivision: '12U', fieldPlayers: 9 });

        const res = await request(app).get(`/api/teams/${other.id}/settings`);
        expect(res.body.data).toEqual({ ageDivision: '10U' });
    });

    test('a payload the route refuses writes nothing', async () => {
        await request(app)
            .put(`/api/teams/${team.id}/settings`)
            .send({ fieldPlayers: 9 });

        const res = await request(app)
            .put(`/api/teams/${team.id}/settings`)
            .send({ fieldPlayers: 40 });

        expect(res.status).toBe(400);
        expect((await storedTeam()).settings).toEqual({ fieldPlayers: 9 });
    });
    describe('the coach\'s own settings', () => {
        async function storedSettings() {
            const { rows } = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [coach.id]);
            return rows[0];
        }

        test('the first write inserts a row for the coach', async () => {
            await request(app).put('/api/settings').send({ theme: 'light', default_team_id: team.id });

            expect(await storedSettings()).toMatchObject({ theme: 'light', default_team_id: team.id });
        });

        test('recording which team is open does not put the coach back into dark', async () => {
            // Every team switch writes default_team_id. It used to substitute the
            // default theme rather than leaving the stored one, so a coach who
            // works in light was dragged back to dark by switching teams.
            await request(app).put('/api/settings').send({ theme: 'light' });
            await request(app).put('/api/settings').send({ default_team_id: team.id });

            expect(await storedSettings()).toMatchObject({ theme: 'light', default_team_id: team.id });
        });

        test('a coach with no row yet gets the dark default rather than a null theme', async () => {
            await request(app).put('/api/settings').send({ default_team_id: team.id });

            expect((await storedSettings()).theme).toBe('dark');
        });

        test('a theme the column would refuse is a 400, not a constraint violation', async () => {
            const res = await request(app).put('/api/settings').send({ theme: 'neon' });

            expect(res.status).toBe(400);
            expect(await storedSettings()).toBeUndefined();
        });
    });
});
