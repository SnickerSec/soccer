/**
 * Roster concurrency against a real PostgreSQL server.
 *
 * A team can have several coaches (team_members.role grants 'coach' and above
 * write access) and a roster write replaces the whole list, so without a version
 * check the second save silently discards the first. The version is a column
 * and the check is a SELECT ... FOR UPDATE, neither of which a mocked pool can
 * prove anything about: the mock will happily agree that a row was locked.
 *
 * See tests/integration/helpers/db.js for how to run these.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import {
    hasDb, pool, playerRoutes, applySchema, truncateAll,
    seedUser, seedTeam, addMember, readRoster, idleInTransactionCount
} from './helpers/db.js';
import { buildApp } from '../helpers/test-app.js';

const describeDb = hasDb ? describe : describe.skip;

describeDb('roster concurrency against PostgreSQL', () => {
    let owner;
    let team;
    let app;

    beforeAll(async () => {
        await applySchema();
    });

    beforeEach(async () => {
        await truncateAll();
        owner = await seedUser('owner@example.com');
        team = await seedTeam(owner);
        app = buildApp(playerRoutes, { id: owner.id });
    });

    afterAll(async () => {
        await pool.end();
    });

    /** Saves a roster and returns the response body. */
    function put(players, expectedVersion) {
        const body = expectedVersion === undefined
            ? { players }
            : { players, expectedVersion };
        return request(app).put(`/api/teams/${team.id}/players`).send(body);
    }

    const roster = (...names) => names.map((name, i) => ({ name, sortOrder: i }));

    describe('the version a roster is read at', () => {
        test('comes back with the roster', async () => {
            const res = await request(app).get(`/api/teams/${team.id}/players`);

            expect(res.status).toBe(200);
            expect(typeof res.body.version).toBe('number');
        });

        test('is present for a team with no players yet', async () => {
            const res = await request(app).get(`/api/teams/${team.id}/players`);

            // The LEFT JOIN has to still yield the team row, or a first-ever
            // save would have no version to build on
            expect(res.body.data).toEqual([]);
            expect(res.body.version).toBe(1);
        });

        test('advances on every write', async () => {
            const first = await put(roster('Ana'));
            const second = await put(roster('Ana', 'Ben'));

            expect(second.body.version).toBeGreaterThan(first.body.version);
        });

        test('does not move when the team is renamed', async () => {
            const before = await request(app).get(`/api/teams/${team.id}/players`);

            await pool.query('UPDATE teams SET name = $1 WHERE id = $2', ['Lions', team.id]);

            const after = await request(app).get(`/api/teams/${team.id}/players`);
            // Reusing updated_at would have made a rename invalidate every
            // coach's in-flight roster edit
            expect(after.body.version).toBe(before.body.version);
        });
    });

    describe('a write built on a stale version', () => {
        test('is rejected rather than applied', async () => {
            const first = await put(roster('Ana'));
            const staleVersion = first.body.version;

            // Another coach saves in between
            await put(roster('Ana', 'Ben'), staleVersion);

            const res = await put(roster('Ana', 'Cleo'), staleVersion);

            expect(res.status).toBe(409);
            expect(res.body.conflict).toBe(true);
        });

        test('leaves the roster exactly as the other coach left it', async () => {
            const first = await put(roster('Ana'));
            const stale = first.body.version;
            await put(roster('Ana', 'Ben'), stale);

            await put(roster('Cleo'), stale);

            const stored = await readRoster(team);
            expect(stored.map(p => p.name).sort()).toEqual(['Ana', 'Ben']);
        });

        test('hands back the roster it lost to, so the client can merge', async () => {
            const first = await put(roster('Ana'));
            const stale = first.body.version;
            await put(roster('Ana', 'Ben'), stale);

            const res = await put(roster('Ana', 'Cleo'), stale);

            expect(res.body.data.map(p => p.name).sort()).toEqual(['Ana', 'Ben']);
            expect(res.body.version).toBeGreaterThan(stale);
        });

        test('the version it hands back is the one that then succeeds', async () => {
            const first = await put(roster('Ana'));
            const stale = first.body.version;
            await put(roster('Ana', 'Ben'), stale);

            const conflict = await put(roster('Ana', 'Cleo'), stale);
            const retry = await put(roster('Ana', 'Ben', 'Cleo'), conflict.body.version);

            expect(retry.status).toBe(200);
            expect((await readRoster(team)).map(p => p.name).sort())
                .toEqual(['Ana', 'Ben', 'Cleo']);
        });

        test('does not advance the version', async () => {
            const first = await put(roster('Ana'));
            const stale = first.body.version;
            const second = await put(roster('Ana', 'Ben'), stale);

            await put(roster('Cleo'), stale);

            const after = await request(app).get(`/api/teams/${team.id}/players`);
            expect(after.body.version).toBe(second.body.version);
        });
    });

    describe('a write that sends no version', () => {
        test('still applies, so the offline queue is not stranded', async () => {
            await put(roster('Ana'));

            // Queue entries were recorded before any version was known
            const res = await put(roster('Ben'));

            expect(res.status).toBe(200);
            expect((await readRoster(team)).map(p => p.name)).toEqual(['Ben']);
        });

        test('advances the version anyway, so others see the change', async () => {
            const first = await put(roster('Ana'));
            const second = await put(roster('Ben'));

            expect(second.body.version).toBeGreaterThan(first.body.version);
        });

        test('is rejected when the version is not an integer', async () => {
            const res = await request(app)
                .put(`/api/teams/${team.id}/players`)
                .send({ players: roster('Ana'), expectedVersion: 'latest' });

            expect(res.status).toBe(400);
        });
    });

    describe('two coaches saving at once', () => {
        test('only one wins, and the loser is told', async () => {
            const coach = await seedUser('coach@example.com');
            await addMember(team, coach, 'coach');
            const coachApp = buildApp(playerRoutes, { id: coach.id });

            const start = await put(roster('Ana'));
            const version = start.body.version;

            // Both build on the same version and fire together. FOR UPDATE has
            // to serialise them; without it both read "current" and both write.
            const [a, b] = await Promise.all([
                put(roster('Ana', 'Ben'), version),
                request(coachApp)
                    .put(`/api/teams/${team.id}/players`)
                    .send({ players: roster('Ana', 'Cleo'), expectedVersion: version })
            ]);

            const statuses = [a.status, b.status].sort();
            expect(statuses).toEqual([200, 409]);
        });

        test('the roster is one coach\'s, never a blend of both', async () => {
            const start = await put(roster('Ana'));
            const version = start.body.version;

            await Promise.all([
                put(roster('Ana', 'Ben'), version),
                put(roster('Ana', 'Cleo'), version)
            ]);

            const names = (await readRoster(team)).map(p => p.name).sort();
            expect([['Ana', 'Ben'], ['Ana', 'Cleo']]).toContainEqual(names);
        });
    });

    test('a rejected write does not leak its connection', async () => {
        const first = await put(roster('Ana'));
        const stale = first.body.version;
        await put(roster('Ana', 'Ben'), stale);

        await put(roster('Cleo'), stale);

        // The conflict path returns from inside the transaction; a missed
        // ROLLBACK would hand the next request a client mid-transaction
        expect(await idleInTransactionCount()).toBe(0);
    });

    test('a version for a team that does not exist is a 404, not a crash', async () => {
        await pool.query('DELETE FROM teams WHERE id = $1', [team.id]);

        const res = await put(roster('Ana'), 1);

        // requireTeamAccess rejects a vanished team before the handler runs
        expect([403, 404]).toContain(res.status);
    });
});
