/**
 * Renaming a player against a real PostgreSQL server.
 *
 * The mocked route tests show which statements the rename builds; these show
 * that PostgreSQL accepts them and what the rows hold afterwards. That matters
 * more here than elsewhere: the rename pairs its names with `unnest` in a FROM
 * clause and writes JSONB and a TEXT[] back into `games`, none of which a
 * mocked pool can reject.
 *
 * The property being protected is that a rename moves the player rather than
 * replacing them — same row, same id, season history intact — because the
 * roster replace matches on name and every saved game records the name too.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import {
    hasDb, pool, playerRoutes, gameRoutes, applySchema, truncateAll,
    seedUser, seedTeam, readRoster, idleInTransactionCount
} from './helpers/db.js';
import { buildApp } from '../helpers/test-app.js';

const describeDb = hasDb ? describe : describe.skip;

describeDb('renaming a player against PostgreSQL', () => {
    let coach;
    let team;
    let app;
    let games;

    beforeAll(async () => {
        await applySchema();
    });

    beforeEach(async () => {
        await truncateAll();
        coach = await seedUser('coach@example.com');
        team = await seedTeam(coach);
        app = buildApp(playerRoutes, { id: coach.id });
        games = buildApp(gameRoutes, { id: coach.id });
    });

    afterAll(async () => {
        await pool.end();
    });

    /** The roster the rename tests start from, and the version it sits at. */
    async function seedRoster() {
        const res = await request(app).put(`/api/teams/${team.id}/players`).send({
            players: [{ name: 'Alex Kim', number: 7 }, { name: 'Ben Ortiz', number: 3 }]
        });
        expect(res.status).toBe(200);
        return res.body.version;
    }

    /** A saved game recording both players, across all three name-bearing columns. */
    async function seedGame(name = 'vs Rockets') {
        const res = await request(games).post(`/api/teams/${team.id}/games`).send({
            name,
            date: '2026-04-11',
            players: [
                { name: 'Alex Kim', status: 'available', quartersPlayed: [1, 2], isCaptain: true },
                { name: 'Ben Ortiz', status: 'available', quartersPlayed: [3, 4] }
            ],
            lineup: [
                { quarter: 1, positions: { Keeper: 'Alex Kim', 'Left Back': 'Ben Ortiz' } }
            ],
            captains: ['Alex Kim']
        });
        expect(res.status).toBe(200);
        return res.body.data.id;
    }

    const readGame = async (id) => {
        const { rows } = await pool.query(
            'SELECT player_snapshot, lineup, captains FROM games WHERE id = $1',
            [id]
        );
        return rows[0];
    };

    const rename = (body) =>
        request(app).put(`/api/teams/${team.id}/players`).send(body);

    test('keeps the row, and its id, rather than replacing the player', async () => {
        const version = await seedRoster();
        const before = await readRoster(team);
        const alex = before.find(p => p.name === 'Alex Kim');

        const res = await rename({
            players: [{ name: 'Alexander Kim', number: 7 }, { name: 'Ben Ortiz', number: 3 }],
            expectedVersion: version,
            renames: [{ from: 'Alex Kim', to: 'Alexander Kim' }]
        });

        expect(res.status).toBe(200);

        const after = await readRoster(team);
        expect(after.map(p => p.name)).toEqual(['Alexander Kim', 'Ben Ortiz']);

        // The same row moved: a delete-and-insert would have minted a new id
        const alexander = after.find(p => p.name === 'Alexander Kim');
        expect(alexander.id).toBe(alex.id);
        expect(alexander.created_at).toEqual(alex.created_at);
        expect(alexander.number).toBe(7);
    });

    test('moves the name through the saved game that records it', async () => {
        const version = await seedRoster();
        const gameId = await seedGame();

        const res = await rename({
            players: [{ name: 'Alexander Kim', number: 7 }, { name: 'Ben Ortiz', number: 3 }],
            expectedVersion: version,
            renames: [{ from: 'Alex Kim', to: 'Alexander Kim' }]
        });

        expect(res.status).toBe(200);

        const game = await readGame(gameId);
        expect(game.player_snapshot.map(p => p.name)).toEqual(['Alexander Kim', 'Ben Ortiz']);
        expect(game.lineup[0].positions).toEqual({
            Keeper: 'Alexander Kim',
            'Left Back': 'Ben Ortiz'
        });
        expect(game.captains).toEqual(['Alexander Kim']);

        // Everything else about the record survives the rewrite
        expect(game.player_snapshot[0]).toEqual({
            name: 'Alexander Kim',
            status: 'available',
            quartersPlayed: [1, 2],
            isCaptain: true
        });
    });

    test('leaves a game the player never appeared in alone', async () => {
        const version = await seedRoster();
        const withAlex = await seedGame('vs Rockets');

        const other = await request(games).post(`/api/teams/${team.id}/games`).send({
            name: 'vs Comets',
            players: [{ name: 'Ben Ortiz', status: 'available' }],
            lineup: [{ quarter: 1, positions: { Keeper: 'Ben Ortiz' } }],
            captains: ['Ben Ortiz']
        });
        const untouched = await readGame(other.body.data.id);

        await rename({
            players: [{ name: 'Alexander Kim', number: 7 }, { name: 'Ben Ortiz', number: 3 }],
            expectedVersion: version,
            renames: [{ from: 'Alex Kim', to: 'Alexander Kim' }]
        });

        expect(await readGame(other.body.data.id)).toEqual(untouched);
        expect((await readGame(withAlex)).captains).toEqual(['Alexander Kim']);
    });

    /**
     * UNIQUE(team_id, name) would reject this from inside the transaction, so
     * what matters is that it is caught first and that nothing half-applies.
     */
    test('refuses a rename onto a name already taken, changing nothing', async () => {
        const version = await seedRoster();
        const gameId = await seedGame();
        const before = await readGame(gameId);

        const res = await rename({
            players: [{ name: 'Ben Ortiz', number: 3 }],
            expectedVersion: version,
            renames: [{ from: 'Alex Kim', to: 'Ben Ortiz' }]
        });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/already on this roster/);

        // The roster still holds both, and the game is untouched: the rejected
        // rename rolled back the replace that travelled with it
        expect((await readRoster(team)).map(p => p.name)).toEqual(['Alex Kim', 'Ben Ortiz']);
        expect(await readGame(gameId)).toEqual(before);
        expect(await idleInTransactionCount()).toBe(0);
    });

    test('renames several players in one save', async () => {
        const version = await seedRoster();
        const gameId = await seedGame();

        const res = await rename({
            players: [{ name: 'Alexander Kim' }, { name: 'Benjamin Ortiz' }],
            expectedVersion: version,
            renames: [
                { from: 'Alex Kim', to: 'Alexander Kim' },
                { from: 'Ben Ortiz', to: 'Benjamin Ortiz' }
            ]
        });

        expect(res.status).toBe(200);
        expect((await readRoster(team)).map(p => p.name))
            .toEqual(['Alexander Kim', 'Benjamin Ortiz']);

        const game = await readGame(gameId);
        expect(game.player_snapshot.map(p => p.name))
            .toEqual(['Alexander Kim', 'Benjamin Ortiz']);
        expect(game.lineup[0].positions).toEqual({
            Keeper: 'Alexander Kim',
            'Left Back': 'Benjamin Ortiz'
        });
    });

    test('bumps the roster version once, like any other roster write', async () => {
        const version = await seedRoster();

        const res = await rename({
            players: [{ name: 'Alexander Kim' }, { name: 'Ben Ortiz' }],
            expectedVersion: version,
            renames: [{ from: 'Alex Kim', to: 'Alexander Kim' }]
        });

        expect(res.body.version).toBe(version + 1);
    });

    /**
     * A rename built on a roster someone else has already replaced must not be
     * applied: the names it wants to move may no longer mean what they did.
     */
    test('a stale save renames nothing', async () => {
        const version = await seedRoster();
        const gameId = await seedGame();

        // Another coach gets there first, which moves the version on
        await rename({ players: [{ name: 'Alex Kim' }, { name: 'Ben Ortiz' }, { name: 'Cass Lee' }] });

        const res = await rename({
            players: [{ name: 'Alexander Kim' }, { name: 'Ben Ortiz' }],
            expectedVersion: version,
            renames: [{ from: 'Alex Kim', to: 'Alexander Kim' }]
        });

        expect(res.status).toBe(409);
        expect(res.body.conflict).toBe(true);
        expect((await readRoster(team)).map(p => p.name).sort())
            .toEqual(['Alex Kim', 'Ben Ortiz', 'Cass Lee']);
        expect((await readGame(gameId)).captains).toEqual(['Alex Kim']);
    });

    test('a rename for someone no longer on the roster is a quiet no-op', async () => {
        const version = await seedRoster();
        const gameId = await seedGame();

        const res = await rename({
            players: [{ name: 'Alex Kim' }, { name: 'Ben Ortiz' }],
            expectedVersion: version,
            renames: [{ from: 'Departed Player', to: 'Someone Else' }]
        });

        expect(res.status).toBe(200);
        expect((await readRoster(team)).map(p => p.name)).toEqual(['Alex Kim', 'Ben Ortiz']);
        expect((await readGame(gameId)).captains).toEqual(['Alex Kim']);
    });
});
