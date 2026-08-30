/**
 * Renaming a player, and the season history that has to move with them.
 *
 * A player is identified by name in `players` (UNIQUE(team_id, name)) and again
 * inside every saved game's `player_snapshot`, `lineup` and `captains`. So the
 * thing worth proving here is not that a name changed, but that it changed
 * everywhere at once and inside the roster replace's own transaction: a rename
 * that committed the roster and failed the games would split one player into a
 * renamed entry with no history and an orphan holding all of it.
 *
 * The pure rewriting lives in server/player-rename.js and is tested directly;
 * the route tests then cover where it sits in the transaction.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const connect = jest.fn();
jest.unstable_mockModule('../../server/db.js', () => ({
    default: { query, connect }
}));

const { default: playerRoutes } = await import('../../server/routes/players.js');
const { validateRenames, renameMap, rewriteGameNames } =
    await import('../../server/player-rename.js');
const { buildApp, rows, silenceRouteErrorLogging } = await import('../helpers/test-app.js');

silenceRouteErrorLogging(jest, beforeEach, afterEach);

const ALICE = { id: 'user-alice' };

beforeEach(() => {
    query.mockReset();
    connect.mockReset();
    query.mockResolvedValue(rows());
});

/** Team-scoped routes: the first query is the requireTeamAccess lookup. */
function memberOfTeamAs(role) {
    query.mockReset();
    query.mockResolvedValueOnce(rows({ role }));
    query.mockResolvedValue(rows());
}

describe('validateRenames', () => {
    test('an absent payload is not an error — most saves rename nobody', () => {
        expect(validateRenames(undefined)).toBeNull();
        expect(validateRenames(null)).toBeNull();
        expect(validateRenames([])).toBeNull();
    });

    test('accepts a well-formed rename', () => {
        expect(validateRenames([{ from: 'Alex Kim', to: 'Alexander Kim' }])).toBeNull();
    });

    test('rejects anything that is not a list of objects', () => {
        expect(validateRenames('Alex')).toMatch(/must be an array/);
        expect(validateRenames(['Alex'])).toMatch(/must be an object/);
        expect(validateRenames([['Alex', 'Alexander']])).toMatch(/must be an object/);
    });

    test('both names are required, non-blank and bounded', () => {
        expect(validateRenames([{ from: '', to: 'Alexander' }])).toMatch(/required/);
        expect(validateRenames([{ from: 'Alex', to: '   ' }])).toMatch(/required/);
        expect(validateRenames([{ from: 'Alex' }])).toMatch(/required/);
        expect(validateRenames([{ from: 'Alex', to: 'x'.repeat(256) }])).toMatch(/required/);
    });

    test('a rename has to change something', () => {
        expect(validateRenames([{ from: 'Alex', to: 'Alex' }])).toMatch(/must change/);
    });

    test('refuses to rename one player twice, or two players onto one name', () => {
        expect(validateRenames([
            { from: 'Alex', to: 'Alexander' },
            { from: 'Alex', to: 'Al' }
        ])).toMatch(/twice/);

        expect(validateRenames([
            { from: 'Alex', to: 'Sam' },
            { from: 'Ben', to: 'Sam' }
        ])).toMatch(/same name/);
    });

    /**
     * A→B alongside B→C cannot be applied by one pass over a lookup, and the
     * order that would make it work is not something the payload states. No UI
     * produces one, so it is refused rather than guessed at.
     */
    test('refuses chains and swaps', () => {
        expect(validateRenames([
            { from: 'Alex', to: 'Ben' },
            { from: 'Ben', to: 'Chris' }
        ])).toMatch(/chained or swapped/);

        expect(validateRenames([
            { from: 'Alex', to: 'Ben' },
            { from: 'Ben', to: 'Alex' }
        ])).toMatch(/chained or swapped/);
    });
});

describe('rewriteGameNames', () => {
    const map = renameMap([{ from: 'Alex Kim', to: 'Alexander Kim' }]);

    test('moves the name through the snapshot, the lineup and the captains', () => {
        const result = rewriteGameNames({
            player_snapshot: [
                { name: 'Alex Kim', status: 'available', quartersPlayed: [1, 2] },
                { name: 'Ben Ortiz', status: 'absent' }
            ],
            lineup: [
                { quarter: 1, positions: { Keeper: 'Alex Kim', 'Left Back': 'Ben Ortiz' } },
                { quarter: 2, positions: { Keeper: 'Ben Ortiz' } }
            ],
            captains: ['Alex Kim', 'Ben Ortiz']
        }, map);

        expect(result.changed).toBe(true);
        expect(result.playerSnapshot).toEqual([
            { name: 'Alexander Kim', status: 'available', quartersPlayed: [1, 2] },
            { name: 'Ben Ortiz', status: 'absent' }
        ]);
        expect(result.lineup[0].positions).toEqual({
            Keeper: 'Alexander Kim',
            'Left Back': 'Ben Ortiz'
        });
        expect(result.lineup[1].positions).toEqual({ Keeper: 'Ben Ortiz' });
        expect(result.captains).toEqual(['Alexander Kim', 'Ben Ortiz']);
    });

    test('leaves the rest of a player untouched', () => {
        const result = rewriteGameNames({
            player_snapshot: [{ name: 'Alex Kim', overallRating: 4, positionsPlayed: [{ quarter: 1, position: 'Keeper' }] }],
            lineup: [],
            captains: []
        }, map);

        expect(result.playerSnapshot[0]).toEqual({
            name: 'Alexander Kim',
            overallRating: 4,
            positionsPlayed: [{ quarter: 1, position: 'Keeper' }]
        });
    });

    /** A game the player never appeared in must not be written back at all. */
    test('reports no change for a game the player is absent from', () => {
        const result = rewriteGameNames({
            player_snapshot: [{ name: 'Ben Ortiz' }],
            lineup: [{ quarter: 1, positions: { Keeper: 'Ben Ortiz' } }],
            captains: ['Ben Ortiz']
        }, map);

        expect(result.changed).toBe(false);
    });

    /**
     * `lineup` is empty for every game the current client saves, and older rows
     * may hold shapes this code never wrote. Malformed JSONB must pass through
     * rather than throw inside the transaction.
     */
    test('survives empty and malformed columns', () => {
        const result = rewriteGameNames({
            player_snapshot: [],
            lineup: [{ quarter: 1 }, null, { quarter: 2, positions: 'nonsense' }],
            captains: null
        }, map);

        expect(result.changed).toBe(false);
        expect(result.lineup).toEqual([{ quarter: 1 }, null, { quarter: 2, positions: 'nonsense' }]);
        expect(result.captains).toBeNull();
    });
});

describe('PUT /api/teams/:teamId/players with renames', () => {
    const put = (body) => request(buildApp(playerRoutes, ALICE))
        .put('/api/teams/team-1/players').send(body);

    /**
     * A client answering with `responses` in order, recording its statements.
     * Every statement consumes one response, BEGIN and COMMIT included.
     */
    function stubClient(responses = []) {
        const statements = [];
        const released = { count: 0 };
        let i = 0;

        connect.mockResolvedValue({
            query: async (sql, params) => {
                statements.push({
                    sql: String(sql).replace(/\s+/g, ' ').trim(),
                    verb: String(sql).trim().split(/\s+/)[0].toUpperCase(),
                    params
                });
                const next = responses[i++];
                if (next instanceof Error) throw next;
                return next ?? rows();
            },
            release: () => { released.count++; }
        });

        return { statements, released };
    }

    const lockedAt = (version = 3) => rows({ roster_version: version });

    test('rejects a malformed rename before opening a transaction', async () => {
        memberOfTeamAs('coach');

        const res = await put({ players: [{ name: 'Alex' }], renames: 'Alex' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/must be an array/);
        expect(connect).not.toHaveBeenCalled();
    });

    /**
     * The order is what makes the rename keep the player's row: renaming before
     * the replace means the upsert matches them by their new name and updates
     * them, where renaming after would have the DELETE see a name no longer on
     * the roster and remove the player — new id, history detached.
     */
    test('renames before replacing the roster, in one transaction', async () => {
        memberOfTeamAs('coach');
        const client = stubClient([
            rows(),                                    // BEGIN
            lockedAt(),                                // SELECT ... FOR UPDATE
            rows(),                                    // SELECT: is the new name taken?
            rows(),                                    // UPDATE players ... rename
            rows({ id: 'g1', player_snapshot: [{ name: 'Alex Kim' }], lineup: [], captains: [] }),
            rows(),                                    // UPDATE games
            rows(),                                    // DELETE departed
            rows({ id: 'p1', name: 'Alexander Kim' }), // INSERT ... ON CONFLICT
            rows({ roster_version: 4 })                // UPDATE roster_version
        ]);

        const res = await put({
            players: [{ name: 'Alexander Kim' }],
            expectedVersion: 3,
            renames: [{ from: 'Alex Kim', to: 'Alexander Kim' }]
        });

        expect(res.status).toBe(200);
        expect(client.statements.map(s => s.verb)).toEqual([
            'BEGIN', 'SELECT', 'SELECT', 'UPDATE', 'SELECT', 'UPDATE',
            'DELETE', 'INSERT', 'UPDATE', 'COMMIT'
        ]);
        // The rename pairs old name with new
        expect(client.statements[3].params).toEqual(['team-1', ['Alex Kim'], ['Alexander Kim']]);
        // ...and the DELETE that follows keeps the new name, not the old
        expect(client.statements[6].params).toEqual(['team-1', ['Alexander Kim']]);
        expect(client.released.count).toBe(1);
    });

    test('rewrites only the games the player appears in, batched in a single update', async () => {
        memberOfTeamAs('coach');
        const client = stubClient([
            rows(),
            lockedAt(),
            rows(),
            rows(),
            rows(
                { id: 'g1', player_snapshot: [{ name: 'Alex Kim' }], lineup: [], captains: [] },
                { id: 'g2', player_snapshot: [{ name: 'Ben Ortiz' }], lineup: [], captains: [] }
            ),
            rows(),                                    // UPDATE games — g1 only
            rows(),
            rows({ id: 'p1', name: 'Alexander Kim' }),
            rows({ roster_version: 4 })
        ]);

        const res = await put({
            players: [{ name: 'Alexander Kim' }],
            expectedVersion: 3,
            renames: [{ from: 'Alex Kim', to: 'Alexander Kim' }]
        });

        expect(res.status).toBe(200);

        const gameWrites = client.statements.filter(s => s.sql.startsWith('UPDATE games'));
        expect(gameWrites).toHaveLength(1);
        const batch = JSON.parse(gameWrites[0].params[0]);
        expect(batch).toHaveLength(1);
        expect(batch[0].id).toBe('g1');
        expect(batch[0].player_snapshot).toEqual([{ name: 'Alexander Kim' }]);
    });

    test('batches updates across multiple matching games in a single statement', async () => {
        memberOfTeamAs('coach');
        const client = stubClient([
            rows(),
            lockedAt(),
            rows(),
            rows(),
            rows(
                { id: 'g1', player_snapshot: [{ name: 'Alex Kim' }], lineup: [], captains: [] },
                { id: 'g2', player_snapshot: [{ name: 'Alex Kim' }, { name: 'Ben Ortiz' }], lineup: [], captains: ['Alex Kim'] }
            ),
            rows(),                                    // UPDATE games — g1 and g2 in 1 statement
            rows(),
            rows({ id: 'p1', name: 'Alexander Kim' }),
            rows({ roster_version: 4 })
        ]);

        const res = await put({
            players: [{ name: 'Alexander Kim' }],
            expectedVersion: 3,
            renames: [{ from: 'Alex Kim', to: 'Alexander Kim' }]
        });

        expect(res.status).toBe(200);

        const gameWrites = client.statements.filter(s => s.sql.startsWith('UPDATE games'));
        expect(gameWrites).toHaveLength(1);
        const batch = JSON.parse(gameWrites[0].params[0]);
        expect(batch).toHaveLength(2);
        expect(batch.map(g => g.id)).toEqual(['g1', 'g2']);
        expect(batch[1].captains).toEqual(['Alexander Kim']);
    });

    /**
     * UNIQUE(team_id, name) would reject this anyway, but from inside the
     * transaction and as an opaque 500. Checked first so the coach is told
     * which name is in the way.
     */
    test('refuses a rename onto a name already on the roster, and rolls back', async () => {
        memberOfTeamAs('coach');
        const client = stubClient([
            rows(),
            lockedAt(),
            rows({ name: 'Ben Ortiz' })   // the target name is taken
        ]);

        const res = await put({
            players: [{ name: 'Ben Ortiz' }],
            expectedVersion: 3,
            renames: [{ from: 'Alex Kim', to: 'Ben Ortiz' }]
        });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/already on this roster/);
        expect(client.statements.map(s => s.verb))
            .toEqual(['BEGIN', 'SELECT', 'SELECT', 'ROLLBACK']);
        expect(client.released.count).toBe(1);
    });

    /**
     * A stale save must not rename anything: the roster it was built on is gone,
     * so the names it wants to move may not be the ones on the team any more.
     */
    test('a version conflict short-circuits before any rename', async () => {
        memberOfTeamAs('coach');
        const client = stubClient([
            rows(),
            lockedAt(9),                             // someone else wrote first
            rows({ id: 'p1', name: 'Alex Kim' })     // the winning roster, read back
        ]);

        const res = await put({
            players: [{ name: 'Alexander Kim' }],
            expectedVersion: 3,
            renames: [{ from: 'Alex Kim', to: 'Alexander Kim' }]
        });

        expect(res.status).toBe(409);
        expect(res.body.conflict).toBe(true);
        expect(client.statements.map(s => s.verb))
            .toEqual(['BEGIN', 'SELECT', 'SELECT', 'ROLLBACK']);
        expect(client.statements.some(s => s.sql.startsWith('UPDATE players SET name'))).toBe(false);
    });

    test('a save with no renames touches neither players names nor games', async () => {
        memberOfTeamAs('coach');
        const client = stubClient([
            rows(), lockedAt(), rows(), rows({ id: 'p1', name: 'Ana' }), rows({ roster_version: 4 })
        ]);

        const res = await put({ players: [{ name: 'Ana' }], expectedVersion: 3 });

        expect(res.status).toBe(200);
        expect(client.statements.map(s => s.verb))
            .toEqual(['BEGIN', 'SELECT', 'DELETE', 'INSERT', 'UPDATE', 'COMMIT']);
    });
});
