/**
 * Game routes against a real PostgreSQL server.
 *
 * See tests/integration/helpers/db.js for how to run these.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import {
    hasDb, pool, gameRoutes, applySchema, truncateAll,
    seedUser, seedTeam, idleInTransactionCount
} from './helpers/db.js';
import { buildApp } from '../helpers/test-app.js';

const describeDb = hasDb ? describe : describe.skip;

describeDb('game routes against PostgreSQL', () => {
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
        app = buildApp(gameRoutes, { id: coach.id });
    });

    afterAll(async () => {
        await pool.end();
    });

    /** The game payload the app actually sends, from app.js saveCurrentGame(). */
    const aGame = (overrides = {}) => ({
        name: 'vs Bears',
        date: '2026-03-14T12:00:00.000Z',
        notes: 'Won 3-1',
        players: [{ name: 'Ana', number: 7 }],
        lineup: [{ quarter: 1, positions: { GK: 'Ana' } }],
        settings: { ageDivision: '10U', playersOnField: 7, formation: '2-3-1' },
        captains: ['Ana'],
        ...overrides
    });

    test('stores the payload the app sends', async () => {
        const res = await request(app).post(`/api/teams/${team.id}/games`).send(aGame());

        expect(res.status).toBe(200);

        const { rows: [game] } = await pool.query('SELECT * FROM games WHERE team_id = $1', [team.id]);
        expect(game.name).toBe('vs Bears');
        expect(game.notes).toBe('Won 3-1');
        // JSONB columns round trip as structures, not strings
        expect(game.settings).toEqual({ ageDivision: '10U', playersOnField: 7, formation: '2-3-1' });
        expect(game.lineup).toEqual([{ quarter: 1, positions: { GK: 'Ana' } }]);
        expect(game.player_snapshot).toEqual([{ name: 'Ana', number: 7 }]);
        expect(game.captains).toEqual(['Ana']);
    });

    test('narrows the ISO timestamp the client sends to a DATE', async () => {
        await request(app).post(`/api/teams/${team.id}/games`).send(aGame({ date: '2026-03-14T12:00:00.000Z' }));

        const { rows: [game] } = await pool.query(
            "SELECT to_char(game_date, 'YYYY-MM-DD') AS d FROM games WHERE team_id = $1", [team.id]);
        expect(game.d).toBe('2026-03-14');
    });

    test('lists that date back as a calendar date, not a timestamp', async () => {
        await request(app).post(`/api/teams/${team.id}/games`).send(aGame({ date: '2026-03-14T12:00:00.000Z' }));

        const res = await request(app).get(`/api/teams/${team.id}/games`);

        // pg hands a DATE back as a Date at local midnight, which res.json
        // would write out as a timestamp: unparseable to the client, which
        // showed it in Game History as "Invalid Date".
        expect(res.body.data[0].date).toBe('2026-03-14');
    });

    test('a game with no name is refused instead of hitting NOT NULL', async () => {
        const res = await request(app).post(`/api/teams/${team.id}/games`).send(aGame({ name: undefined }));

        expect(res.status).toBe(400);
        const { rows } = await pool.query('SELECT * FROM games WHERE team_id = $1', [team.id]);
        expect(rows).toHaveLength(0);
    });

    test('bulk import writes every game in one statement', async () => {
        const games = Array.from({ length: 12 }, (_, i) => aGame({ name: `Game ${i}` }));

        const res = await request(app).post(`/api/teams/${team.id}/games/bulk`).send({ games });

        expect(res.status).toBe(200);
        const { rows } = await pool.query('SELECT count(*)::int AS c FROM games WHERE team_id = $1', [team.id]);
        expect(rows[0].c).toBe(12);
    });

    test('bulk import accepts a null date alongside a set one', async () => {
        const res = await request(app).post(`/api/teams/${team.id}/games/bulk`).send({
            games: [aGame({ name: 'Dated' }), aGame({ name: 'Undated', date: null })]
        });

        expect(res.status).toBe(200);
        const { rows } = await pool.query(
            'SELECT name, game_date FROM games WHERE team_id = $1 ORDER BY name', [team.id]);
        expect(rows[0].game_date).not.toBeNull();
        expect(rows[1].game_date).toBeNull();
    });

    test('one invalid game rejects the whole import', async () => {
        const res = await request(app).post(`/api/teams/${team.id}/games/bulk`).send({
            games: [aGame({ name: 'Fine' }), aGame({ name: undefined })]
        });

        expect(res.status).toBe(400);
        const { rows } = await pool.query('SELECT count(*)::int AS c FROM games WHERE team_id = $1', [team.id]);
        expect(rows[0].c).toBe(0);
    });

    test('a rejected import leaves no connection in a transaction', async () => {
        await request(app).post(`/api/teams/${team.id}/games/bulk`).send({ games: 'nope' });

        expect(await idleInTransactionCount()).toBe(0);
    });

    test('games are listed newest first, undated last', async () => {
        await request(app).post(`/api/teams/${team.id}/games/bulk`).send({
            games: [
                aGame({ name: 'March', date: '2026-03-14T12:00:00.000Z' }),
                aGame({ name: 'April', date: '2026-04-01T12:00:00.000Z' }),
                aGame({ name: 'Undated', date: null })
            ]
        });

        const res = await request(app).get(`/api/teams/${team.id}/games`);

        expect(res.body.data.map(g => g.name)).toEqual(['April', 'March', 'Undated']);
    });

    test('an update touches only the editable fields', async () => {
        const created = await request(app).post(`/api/teams/${team.id}/games`).send(aGame());
        const gameId = created.body.data.id;

        const res = await request(app).put(`/api/games/${gameId}`)
            .send({ notes: 'Rescheduled', team_id: '00000000-0000-0000-0000-000000000000' });

        expect(res.status).toBe(200);
        const { rows: [game] } = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);
        expect(game.notes).toBe('Rescheduled');
        // The unknown field was ignored rather than built into the UPDATE
        expect(game.team_id).toBe(team.id);
        expect(game.name).toBe('vs Bears');
    });

    test('a coach on another team cannot touch this one\'s games', async () => {
        const created = await request(app).post(`/api/teams/${team.id}/games`).send(aGame());
        const gameId = created.body.data.id;

        const outsider = await seedUser('outsider@example.com');
        await seedTeam(outsider, 'Lions');

        const res = await request(buildApp(gameRoutes, { id: outsider.id })).delete(`/api/games/${gameId}`);

        expect(res.status).toBe(403);
        const { rows } = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);
        expect(rows).toHaveLength(1);
    });
});
