/**
 * Player routes against a real PostgreSQL server.
 *
 * See tests/integration/helpers/db.js for how to run these. The unit tests
 * cover which SQL the routes build; these cover whether PostgreSQL accepts it
 * and what the rows actually look like afterwards.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import {
    hasDb, pool, playerRoutes, applySchema, truncateAll,
    seedUser, seedTeam, addMember, readRoster, idleInTransactionCount
} from './helpers/db.js';
import { buildApp } from '../helpers/test-app.js';

const describeDb = hasDb ? describe : describe.skip;

describeDb('player routes against PostgreSQL', () => {
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
        app = buildApp(playerRoutes, { id: coach.id });
    });

    afterAll(async () => {
        await pool.end();
    });

    describe('bulk upsert', () => {
        test('stores every column the API accepts', async () => {
            const res = await request(app).post(`/api/teams/${team.id}/players`).send({
                players: [{
                    name: 'Ana', number: 7, isCaptain: true, mustRest: true, noKeeper: true,
                    status: 'injured', preferredPositions: ['Forward', 'Mid'],
                    overallRating: 4, positionalRatings: { keeper: 2, offense: 5 }
                }]
            });

            expect(res.status).toBe(200);

            const [ana] = await readRoster(team);
            expect(ana.number).toBe(7);
            expect(ana.is_captain).toBe(true);
            expect(ana.must_rest).toBe(true);
            expect(ana.no_keeper).toBe(true);
            expect(ana.status).toBe('injured');
            // The columns the Railway schema was missing until recently
            expect(ana.overall_rating).toBe(4);
            expect(ana.positional_ratings).toEqual({ keeper: 2, offense: 5 });
            // TEXT[] and JSONB both survive the round trip
            expect(ana.preferred_positions).toEqual(['Forward', 'Mid']);
        });

        test('writes a whole roster in one multi-row statement', async () => {
            const players = Array.from({ length: 18 }, (_, i) => ({ name: `Player ${i}`, number: i }));

            const res = await request(app).post(`/api/teams/${team.id}/players`).send({ players });

            expect(res.status).toBe(200);
            expect(await readRoster(team)).toHaveLength(18);
            expect(res.body.data.map(p => p.name)).toEqual(players.map(p => p.name));
        });

        test('a second push updates in place rather than duplicating', async () => {
            await request(app).post(`/api/teams/${team.id}/players`)
                .send({ players: [{ name: 'Ana', number: 7 }, { name: 'Bo' }] });
            const [anaBefore] = await readRoster(team);

            const res = await request(app).post(`/api/teams/${team.id}/players`)
                .send({ players: [{ name: 'Ana', number: 10, preferredPositions: ['Keeper'] }] });

            expect(res.status).toBe(200);
            const roster = await readRoster(team);
            // Bo is untouched — POST adds and updates but never removes
            expect(roster.map(p => p.name).sort()).toEqual(['Ana', 'Bo']);
            const ana = roster.find(p => p.name === 'Ana');
            expect(ana.id).toBe(anaBefore.id);
            expect(ana.number).toBe(10);
            expect(ana.preferred_positions).toEqual(['Keeper']);
        });

        test('a name repeated in one payload does not abort the statement', async () => {
            // ON CONFLICT DO UPDATE cannot affect the same row twice, so an
            // undeduplicated payload would make PostgreSQL reject the write.
            const res = await request(app).post(`/api/teams/${team.id}/players`)
                .send({ players: [{ name: 'Ana', number: 1 }, { name: 'Bo' }, { name: 'Ana', number: 9 }] });

            expect(res.status).toBe(200);
            const roster = await readRoster(team);
            expect(roster).toHaveLength(2);
            expect(roster.find(p => p.name === 'Ana').number).toBe(9);
        });

        test('an out-of-range value is refused before it reaches the constraint', async () => {
            const res = await request(app).post(`/api/teams/${team.id}/players`)
                .send({ players: [{ name: 'Ana', overallRating: 9 }] });

            expect(res.status).toBe(400);
            expect(await readRoster(team)).toHaveLength(0);
        });

        test('a rejected payload leaves no connection in a transaction', async () => {
            await request(app).post(`/api/teams/${team.id}/players`).send({ players: 'not-an-array' });

            expect(await idleInTransactionCount()).toBe(0);
        });
    });

    describe('roster replace', () => {
        beforeEach(async () => {
            await request(app).post(`/api/teams/${team.id}/players`)
                .send({ players: [{ name: 'Ana', number: 7 }, { name: 'Bo' }, { name: 'Cy' }] });
        });

        test('removes players left off the roster', async () => {
            const res = await request(app).put(`/api/teams/${team.id}/players`)
                .send({ players: [{ name: 'Ana' }, { name: 'Dee' }] });

            expect(res.status).toBe(200);
            expect((await readRoster(team)).map(p => p.name).sort()).toEqual(['Ana', 'Dee']);
        });

        test('a kept player is updated, not recreated', async () => {
            const anaBefore = (await readRoster(team)).find(p => p.name === 'Ana');

            await request(app).put(`/api/teams/${team.id}/players`)
                .send({ players: [{ name: 'Ana', number: 12 }] });

            const ana = (await readRoster(team)).find(p => p.name === 'Ana');
            expect(ana.id).toBe(anaBefore.id);
            expect(ana.number).toBe(12);
        });

        test('an empty roster clears the team', async () => {
            const res = await request(app).put(`/api/teams/${team.id}/players`).send({ players: [] });

            expect(res.status).toBe(200);
            expect(await readRoster(team)).toHaveLength(0);
        });

        test('a failed replace leaves the previous roster intact', async () => {
            // Drive the route's two statements by hand with a value the number
            // CHECK rejects: validation catches this at the edge now, so this is
            // how the transaction's atomicity itself gets exercised.
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(
                    'DELETE FROM players WHERE team_id = $1 AND name <> ALL($2::text[])',
                    [team.id, ['Ana']]
                );
                await client.query(
                    'INSERT INTO players (team_id, name, number) VALUES ($1, $2, $3)',
                    [team.id, 'Zed', 999]
                );
                await client.query('COMMIT');
                throw new Error('expected the number CHECK to reject jersey 999');
            } catch (error) {
                expect(error.message).toMatch(/players_number_check|violates check constraint/);
                await client.query('ROLLBACK');
            } finally {
                client.release();
            }

            // The delete was part of the same transaction, so it went too
            expect((await readRoster(team)).map(p => p.name).sort()).toEqual(['Ana', 'Bo', 'Cy']);
        });

        test('commits leave no connection in a transaction', async () => {
            await request(app).put(`/api/teams/${team.id}/players`).send({ players: [{ name: 'Ana' }] });

            expect(await idleInTransactionCount()).toBe(0);
        });
    });

    describe('permissions are enforced against real membership rows', () => {
        test('a viewer cannot write', async () => {
            const viewer = await seedUser('viewer@example.com');
            await addMember(team, viewer, 'viewer');

            const res = await request(buildApp(playerRoutes, { id: viewer.id }))
                .put(`/api/teams/${team.id}/players`).send({ players: [] });

            expect(res.status).toBe(403);
        });

        test('a coach can write', async () => {
            const other = await seedUser('assistant@example.com');
            await addMember(team, other, 'coach');

            const res = await request(buildApp(playerRoutes, { id: other.id }))
                .put(`/api/teams/${team.id}/players`).send({ players: [{ name: 'Ana' }] });

            expect(res.status).toBe(200);
        });

        test('a stranger cannot read another team roster', async () => {
            const stranger = await seedUser('stranger@example.com');

            const res = await request(buildApp(playerRoutes, { id: stranger.id }))
                .get(`/api/teams/${team.id}/players`);

            expect(res.status).toBe(403);
        });
    });

    test('deleting a team takes its roster with it', async () => {
        await request(app).post(`/api/teams/${team.id}/players`).send({ players: [{ name: 'Ana' }] });

        await pool.query('DELETE FROM teams WHERE id = $1', [team.id]);

        const { rows } = await pool.query('SELECT * FROM players WHERE team_id = $1', [team.id]);
        expect(rows).toHaveLength(0);
    });
});
