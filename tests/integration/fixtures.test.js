/**
 * Fixture routes against a real PostgreSQL server.
 *
 * See tests/integration/helpers/db.js for how to run these.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import {
    hasDb, pool, fixtureRoutes, gameRoutes, applySchema, truncateAll,
    seedUser, seedTeam, readFixtures
} from './helpers/db.js';
import { buildApp } from '../helpers/test-app.js';

const describeDb = hasDb ? describe : describe.skip;

describeDb('fixture routes against PostgreSQL', () => {
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
        app = buildApp(fixtureRoutes, { id: coach.id });
    });

    afterAll(async () => {
        await pool.end();
    });

    /** The fixture payload the app sends from FixtureModal / schedule.js. */
    const aFixture = (overrides = {}) => ({
        opponent: 'Hawks',
        gameDate: '2026-09-12',
        gameTime: '10:00 AM',
        location: 'Kaha Park Field 1',
        homeAway: 'home',
        jerseyColor: 'Blue',
        snackParent: 'Smith family',
        fruitParent: 'Jones family',
        refereeDuty: 'Coach Chuck',
        fieldSetup: 'Smith family',
        status: 'upcoming',
        notes: 'Bring popup shade',
        ...overrides
    });

    test('stores the full fixture payload the client sends', async () => {
        const res = await request(app)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture());

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.opponent).toBe('Hawks');
        expect(res.body.data.gameDate).toBe('2026-09-12');
        expect(res.body.data.gameTime).toBe('10:00 AM');
        expect(res.body.data.snackParent).toBe('Smith family');
        expect(res.body.data.createdBy).toBe(coach.id);

        const rows = await readFixtures(team);
        expect(rows).toHaveLength(1);
        expect(rows[0].opponent).toBe('Hawks');
        expect(rows[0].location).toBe('Kaha Park Field 1');
        expect(rows[0].created_by).toBe(coach.id);
    });

    test('refuses a fixture with no opponent or invalid date', async () => {
        const noOpponent = await request(app)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture({ opponent: '   ' }));
        expect(noOpponent.status).toBe(400);

        const invalidDate = await request(app)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture({ gameDate: 'not-a-date' }));
        expect(invalidDate.status).toBe(400);

        const rows = await readFixtures(team);
        expect(rows).toHaveLength(0);
    });

    test('bulk import inserts multiple fixtures in one multi-row statement', async () => {
        const fixtures = [
            aFixture({ opponent: 'Tigers', gameDate: '2026-09-12', gameTime: '09:00 AM' }),
            aFixture({ opponent: 'Bears', gameDate: '2026-09-19', gameTime: '10:30 AM' }),
            aFixture({ opponent: 'Lions', gameDate: '2026-09-26', gameTime: '08:00 AM' })
        ];

        const res = await request(app)
            .post(`/api/teams/${team.id}/fixtures/bulk`)
            .send({ fixtures });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(3);

        const rows = await readFixtures(team);
        expect(rows).toHaveLength(3);
        expect(rows.map(r => r.opponent)).toEqual(['Tigers', 'Bears', 'Lions']);
    });

    test('bulk import handles an empty list as a no-op returning an empty array', async () => {
        const res = await request(app)
            .post(`/api/teams/${team.id}/fixtures/bulk`)
            .send({ fixtures: [] });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual([]);
    });

    test('one invalid fixture in bulk import rejects the entire batch atomically', async () => {
        const fixtures = [
            aFixture({ opponent: 'Valid One', gameDate: '2026-09-12' }),
            aFixture({ opponent: '', gameDate: '2026-09-19' }),
            aFixture({ opponent: 'Valid Two', gameDate: '2026-09-26' })
        ];

        const res = await request(app)
            .post(`/api/teams/${team.id}/fixtures/bulk`)
            .send({ fixtures });

        expect(res.status).toBe(400);
        const rows = await readFixtures(team);
        expect(rows).toHaveLength(0);
    });

    test('bulk import rejects more than MAX_BULK_FIXTURES (200)', async () => {
        const tooMany = Array.from({ length: 201 }, (_, i) => aFixture({ opponent: `Team ${i}` }));
        const res = await request(app)
            .post(`/api/teams/${team.id}/fixtures/bulk`)
            .send({ fixtures: tooMany });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Cannot import more than 200');
    });

    test('lists fixtures sorted by date ASC and time ASC', async () => {
        await request(app).post(`/api/teams/${team.id}/fixtures/bulk`).send({
            fixtures: [
                aFixture({ opponent: 'October Game', gameDate: '2026-10-03', gameTime: '09:00' }),
                aFixture({ opponent: 'September Late', gameDate: '2026-09-12', gameTime: '11:00' }),
                aFixture({ opponent: 'September Early', gameDate: '2026-09-12', gameTime: '08:30' })
            ]
        });

        const res = await request(app).get(`/api/teams/${team.id}/fixtures`);
        expect(res.status).toBe(200);
        expect(res.body.data.map(f => f.opponent)).toEqual([
            'September Early',
            'September Late',
            'October Game'
        ]);
    });

    test('updates editable fields on an existing fixture', async () => {
        const createRes = await request(app)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture());
        const fixtureId = createRes.body.data.id;

        const updateRes = await request(app)
            .put(`/api/fixtures/${fixtureId}`)
            .send({
                opponent: 'Hawks (Rescheduled)',
                gameTime: '11:30 AM',
                snackParent: 'Williams family',
                status: 'completed',
                notes: 'Great game, won 4-2'
            });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.data.opponent).toBe('Hawks (Rescheduled)');
        expect(updateRes.body.data.gameTime).toBe('11:30 AM');
        expect(updateRes.body.data.snackParent).toBe('Williams family');
        expect(updateRes.body.data.status).toBe('completed');

        const { rows: [f] } = await pool.query('SELECT * FROM fixtures WHERE id = $1', [fixtureId]);
        expect(f.opponent).toBe('Hawks (Rescheduled)');
        expect(f.snack_parent).toBe('Williams family');
        expect(f.status).toBe('completed');
    });

    test('updating a non-existent fixture returns 404', async () => {
        const res = await request(app)
            .put('/api/fixtures/00000000-0000-0000-0000-000000000000')
            .send({ notes: 'Ghost match' });

        expect(res.status).toBe(404);
    });

    test('deletes a fixture from PostgreSQL', async () => {
        const createRes = await request(app)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture());
        const fixtureId = createRes.body.data.id;

        const deleteRes = await request(app).delete(`/api/fixtures/${fixtureId}`);
        expect(deleteRes.status).toBe(200);

        const { rows } = await pool.query('SELECT * FROM fixtures WHERE id = $1', [fixtureId]);
        expect(rows).toHaveLength(0);
    });

    test('deleting a non-existent fixture returns 404', async () => {
        const res = await request(app).delete('/api/fixtures/00000000-0000-0000-0000-000000000000');
        expect(res.status).toBe(404);
    });

    test('deleting a team cascades and removes its fixtures', async () => {
        await request(app)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture());

        const before = await readFixtures(team);
        expect(before).toHaveLength(1);

        await pool.query('DELETE FROM teams WHERE id = $1', [team.id]);

        const { rows } = await pool.query('SELECT * FROM fixtures WHERE team_id = $1', [team.id]);
        expect(rows).toHaveLength(0);
    });

    test('deleting the creator profile sets created_by to NULL without failing', async () => {
        const createRes = await request(app)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture());
        const fixtureId = createRes.body.data.id;

        // Need another member to be owner so team is not orphaned
        const assistant = await seedUser('assistant@example.com');
        await pool.query(
            `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', NOW())`,
            [team.id, assistant.id]
        );

        // Delete the coach who created the fixture
        await pool.query('DELETE FROM profiles WHERE id = $1', [coach.id]);

        const { rows: [f] } = await pool.query('SELECT created_by FROM fixtures WHERE id = $1', [fixtureId]);
        expect(f.created_by).toBeNull();
    });

    test('deleting a linked game sets game_id to NULL on the fixture', async () => {
        const gameApp = buildApp(gameRoutes, { id: coach.id });
        const gameRes = await request(gameApp)
            .post(`/api/teams/${team.id}/games`)
            .send({ name: 'Match 1', date: '2026-09-12' });
        const gameId = gameRes.body.data.id;

        const fixRes = await request(app)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture({ gameId }));
        const fixtureId = fixRes.body.data.id;

        await request(gameApp).delete(`/api/games/${gameId}`);

        const { rows: [f] } = await pool.query('SELECT game_id FROM fixtures WHERE id = $1', [fixtureId]);
        expect(f.game_id).toBeNull();
    });

    test('a coach on another team cannot read or modify this team\'s fixtures', async () => {
        const createRes = await request(app)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture());
        const fixtureId = createRes.body.data.id;

        const outsider = await seedUser('outsider@example.com');
        const outsiderApp = buildApp(fixtureRoutes, { id: outsider.id });

        const listRes = await request(outsiderApp).get(`/api/teams/${team.id}/fixtures`);
        expect(listRes.status).toBe(403);

        const updateRes = await request(outsiderApp)
            .put(`/api/fixtures/${fixtureId}`)
            .send({ notes: 'Hacked' });
        expect(updateRes.status).toBe(403);

        const deleteRes = await request(outsiderApp).delete(`/api/fixtures/${fixtureId}`);
        expect(deleteRes.status).toBe(403);
    });

    test('a viewer on the team can list fixtures but cannot create, update, or delete', async () => {
        const createRes = await request(app)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture());
        const fixtureId = createRes.body.data.id;

        const viewer = await seedUser('parent@example.com');
        await pool.query(
            `INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES ($1, $2, 'viewer', NOW())`,
            [team.id, viewer.id]
        );
        const viewerApp = buildApp(fixtureRoutes, { id: viewer.id });

        // Viewer CAN list fixtures
        const listRes = await request(viewerApp).get(`/api/teams/${team.id}/fixtures`);
        expect(listRes.status).toBe(200);
        expect(listRes.body.data).toHaveLength(1);

        // Viewer CANNOT create
        const postRes = await request(viewerApp)
            .post(`/api/teams/${team.id}/fixtures`)
            .send(aFixture({ opponent: 'Viewer Created' }));
        expect(postRes.status).toBe(403);

        // Viewer CANNOT update
        const putRes = await request(viewerApp)
            .put(`/api/fixtures/${fixtureId}`)
            .send({ notes: 'Viewer edit' });
        expect(putRes.status).toBe(403);

        // Viewer CANNOT delete
        const delRes = await request(viewerApp).delete(`/api/fixtures/${fixtureId}`);
        expect(delRes.status).toBe(403);
    });
});
