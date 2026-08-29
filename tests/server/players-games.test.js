/**
 * Player and game routes.
 *
 * The by-id routes (DELETE /api/players/:id, PUT and DELETE /api/games/:id) are
 * mounted with requireAuth rather than requireTeamAccess and re-implement the
 * access check by hand, so they get particular attention here: they must confirm
 * both that the caller belongs to the owning team and that their role is high
 * enough to write.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const connect = jest.fn();
jest.unstable_mockModule('../../server/db.js', () => ({
    default: { query, connect }
}));

const { default: playerRoutes } = await import('../../server/routes/players.js');
const { default: gameRoutes } = await import('../../server/routes/games.js');
const { buildApp, rows, silenceRouteErrorLogging } = await import('../helpers/test-app.js');

silenceRouteErrorLogging(jest, beforeEach, afterEach);

const ALICE = { id: 'user-alice' };

beforeEach(() => {
    query.mockReset();
    connect.mockReset();
    query.mockResolvedValue(rows());
});

/** The SQL of the nth call to pool.query, whitespace-collapsed. */
function sqlOf(callIndex) {
    return query.mock.calls[callIndex][0].replace(/\s+/g, ' ').trim();
}

/** Team-scoped routes: the first query is the requireTeamAccess lookup. */
function memberOfTeamAs(role) {
    query.mockReset();
    query.mockResolvedValueOnce(rows({ role }));
    query.mockResolvedValue(rows());
}

/**
 * By-id routes: first the resource lookup for its team, then the caller's
 * membership row for that team.
 */
function ownsResourceAs(role, teamId = 'team-1') {
    query.mockReset();
    query.mockResolvedValueOnce(rows({ team_id: teamId }));
    query.mockResolvedValueOnce(role ? rows({ role }) : rows());
    query.mockResolvedValue(rows());
}

describe('team-scoped player routes', () => {
    test('reading the roster requires team membership', async () => {
        query.mockResolvedValue(rows());

        const res = await request(buildApp(playerRoutes, ALICE)).get('/api/teams/team-1/players');

        expect(res.status).toBe(403);
    });

    test('a viewer can read the roster', async () => {
        memberOfTeamAs('viewer');

        const res = await request(buildApp(playerRoutes, ALICE)).get('/api/teams/team-1/players');

        expect(res.status).toBe(200);
    });

    test('a viewer cannot replace the roster', async () => {
        memberOfTeamAs('viewer');

        const res = await request(buildApp(playerRoutes, ALICE))
            .post('/api/teams/team-1/players').send({ players: [] });

        expect(res.status).toBe(403);
    });

    test('a viewer cannot clear the roster', async () => {
        memberOfTeamAs('viewer');

        const res = await request(buildApp(playerRoutes, ALICE)).delete('/api/teams/team-1/players');

        expect(res.status).toBe(403);
    });
});

describe('DELETE /api/players/:id', () => {
    test('requires authentication', async () => {
        const res = await request(buildApp(playerRoutes, null)).delete('/api/players/player-1');

        expect(res.status).toBe(401);
        expect(query).not.toHaveBeenCalled();
    });

    test('404s for a player that does not exist', async () => {
        query.mockResolvedValue(rows());

        const res = await request(buildApp(playerRoutes, ALICE)).delete('/api/players/nope');

        expect(res.status).toBe(404);
    });

    test('denies a user with no membership of the owning team', async () => {
        ownsResourceAs(null);

        const res = await request(buildApp(playerRoutes, ALICE)).delete('/api/players/player-1');

        expect(res.status).toBe(403);
        // The DELETE must not have run
        expect(query).toHaveBeenCalledTimes(2);
    });

    test('checks membership against the team that owns the player', async () => {
        ownsResourceAs('coach', 'team-77');

        await request(buildApp(playerRoutes, ALICE)).delete('/api/players/player-1');

        expect(query.mock.calls[1][1]).toEqual(['team-77', 'user-alice']);
    });

    test('denies a read-only viewer', async () => {
        ownsResourceAs('viewer');

        const res = await request(buildApp(playerRoutes, ALICE)).delete('/api/players/player-1');

        expect(res.status).toBe(403);
        expect(query).toHaveBeenCalledTimes(2);
    });

    test('allows a coach', async () => {
        ownsResourceAs('coach');

        const res = await request(buildApp(playerRoutes, ALICE)).delete('/api/players/player-1');

        expect(res.status).toBe(200);
        expect(query.mock.calls[2][1]).toEqual(['player-1']);
    });
});

describe('team-scoped game routes', () => {
    test('a viewer can read game history', async () => {
        memberOfTeamAs('viewer');

        const res = await request(buildApp(gameRoutes, ALICE)).get('/api/teams/team-1/games');

        expect(res.status).toBe(200);
    });

    test('answers a game date as a calendar date, not a timestamp', async () => {
        query.mockReset();
        query.mockResolvedValueOnce(rows({ role: 'viewer' }));
        // pg parses a DATE column into a Date at local midnight, which res.json
        // would otherwise serialise as '2026-03-14T…Z' — unparseable to the
        // client, which showed it in Game History as "Invalid Date".
        query.mockResolvedValueOnce(rows({
            id: 'game-1', name: 'vs Tigers', game_date: new Date(2026, 2, 14)
        }));

        const res = await request(buildApp(gameRoutes, ALICE)).get('/api/teams/team-1/games');

        expect(res.body.data[0].date).toBe('2026-03-14');
    });

    test('leaves a game saved without a date null', async () => {
        query.mockReset();
        query.mockResolvedValueOnce(rows({ role: 'viewer' }));
        query.mockResolvedValueOnce(rows({ id: 'game-1', name: 'vs Tigers', game_date: null }));

        const res = await request(buildApp(gameRoutes, ALICE)).get('/api/teams/team-1/games');

        expect(res.body.data[0].date).toBeNull();
    });

    test('a viewer cannot save a game', async () => {
        memberOfTeamAs('viewer');

        const res = await request(buildApp(gameRoutes, ALICE))
            .post('/api/teams/team-1/games').send({ name: 'vs Tigers' });

        expect(res.status).toBe(403);
    });

    test('a viewer cannot bulk-upload games', async () => {
        memberOfTeamAs('viewer');

        const res = await request(buildApp(gameRoutes, ALICE))
            .post('/api/teams/team-1/games/bulk').send({ games: [] });

        expect(res.status).toBe(403);
    });
});

describe('PUT /api/games/:id', () => {
    test('requires authentication', async () => {
        const res = await request(buildApp(gameRoutes, null))
            .put('/api/games/game-1').send({ name: 'x' });

        expect(res.status).toBe(401);
        expect(query).not.toHaveBeenCalled();
    });

    test('404s for a game that does not exist', async () => {
        query.mockResolvedValue(rows());

        const res = await request(buildApp(gameRoutes, ALICE))
            .put('/api/games/nope').send({ name: 'x' });

        expect(res.status).toBe(404);
    });

    test('denies a user with no membership of the owning team', async () => {
        ownsResourceAs(null);

        const res = await request(buildApp(gameRoutes, ALICE))
            .put('/api/games/game-1').send({ name: 'Renamed' });

        expect(res.status).toBe(403);
        expect(query).toHaveBeenCalledTimes(2);
    });

    test('denies a read-only viewer', async () => {
        ownsResourceAs('viewer');

        const res = await request(buildApp(gameRoutes, ALICE))
            .put('/api/games/game-1').send({ name: 'Renamed' });

        expect(res.status).toBe(403);
        expect(query).toHaveBeenCalledTimes(2);
    });

    test('allows a coach to update the editable fields', async () => {
        ownsResourceAs('coach');

        const res = await request(buildApp(gameRoutes, ALICE))
            .put('/api/games/game-1').send({ name: 'Renamed', notes: 'Won', date: '2026-03-14' });

        expect(res.status).toBe(200);
        const [sql, values] = query.mock.calls[2];
        expect(sql).toContain('UPDATE games SET');
        expect(values).toEqual(['Renamed', 'Won', '2026-03-14', 'game-1']);
    });

    test('ignores unknown fields rather than building them into the UPDATE', async () => {
        ownsResourceAs('coach');

        await request(buildApp(gameRoutes, ALICE))
            .put('/api/games/game-1').send({ team_id: 'team-mallory', id: 'other' });

        // Nothing updatable was supplied, so no UPDATE runs at all
        expect(query).toHaveBeenCalledTimes(2);
    });
});

describe('DELETE /api/games/:id', () => {
    test('denies a user with no membership of the owning team', async () => {
        ownsResourceAs(null);

        const res = await request(buildApp(gameRoutes, ALICE)).delete('/api/games/game-1');

        expect(res.status).toBe(403);
        expect(query).toHaveBeenCalledTimes(2);
    });

    test('denies a read-only viewer', async () => {
        ownsResourceAs('viewer');

        const res = await request(buildApp(gameRoutes, ALICE)).delete('/api/games/game-1');

        expect(res.status).toBe(403);
        expect(query).toHaveBeenCalledTimes(2);
    });

    test('allows a coach', async () => {
        ownsResourceAs('coach');

        const res = await request(buildApp(gameRoutes, ALICE)).delete('/api/games/game-1');

        expect(res.status).toBe(200);
        expect(query.mock.calls[2][1]).toEqual(['game-1']);
    });
});

/**
 * The bulk roster write used to open a transaction before validating, and its
 * two 400 paths returned without rolling back — releasing a connection that was
 * still idle in a transaction back into the pool. Validation now happens before
 * any database work, and the write is a single statement, so there is no
 * transaction left to leak.
 */
describe('POST /api/teams/:teamId/players validation', () => {
    const post = (body) => request(buildApp(playerRoutes, ALICE))
        .post('/api/teams/team-1/players').send(body);

    test('rejects a non-array payload without touching the database', async () => {
        memberOfTeamAs('coach');

        const res = await post({ players: 'nope' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/must be an array/);
        // Only the requireTeamAccess lookup ran, and no transaction was opened
        expect(query).toHaveBeenCalledTimes(1);
        expect(connect).not.toHaveBeenCalled();
    });

    test('rejects a player with no name without touching the database', async () => {
        memberOfTeamAs('coach');

        const res = await post({ players: [{ name: 'Ana' }, { number: 7 }] });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/name is required/);
        expect(query).toHaveBeenCalledTimes(1);
        expect(connect).not.toHaveBeenCalled();
    });

    test('rejects a name over 255 characters', async () => {
        memberOfTeamAs('coach');

        const res = await post({ players: [{ name: 'a'.repeat(256) }] });

        expect(res.status).toBe(400);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('rejects a jersey number outside the 0-99 the column enforces', async () => {
        memberOfTeamAs('coach');

        const res = await post({ players: [{ name: 'Ana', number: 999 }] });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/0 to 99/);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('accepts a player with no jersey number', async () => {
        memberOfTeamAs('coach');

        const res = await post({ players: [{ name: 'Ana' }, { name: 'Bo', number: '' }] });

        expect(res.status).toBe(200);
    });

    test('rejects a rating outside the 1-5 scale the column enforces', async () => {
        memberOfTeamAs('coach');

        const res = await post({ players: [{ name: 'Ana', overallRating: 9 }] });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/1 to 5/);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('accepts an unrated player', async () => {
        memberOfTeamAs('coach');

        // 0 is how the UI spells "not rated"; the route stores it as NULL
        const res = await post({ players: [{ name: 'Ana', overallRating: 0 }] });

        expect(res.status).toBe(200);
        expect(query.mock.calls[1][1][9]).toBeNull();
    });

    test('rejects positional ratings that are not an object', async () => {
        memberOfTeamAs('coach');

        const res = await post({ players: [{ name: 'Ana', positionalRatings: [1, 2] }] });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/must be an object/);
    });

    test('caps how many players one request can write', async () => {
        memberOfTeamAs('coach');

        const players = Array.from({ length: 101 }, (_, i) => ({ name: `Player ${i}` }));
        const res = await post({ players });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/cannot exceed/);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('accepts a roster at the cap', async () => {
        memberOfTeamAs('coach');

        const players = Array.from({ length: 100 }, (_, i) => ({ name: `Player ${i}` }));
        const res = await post({ players });

        expect(res.status).toBe(200);
    });

    test('an empty roster succeeds without a write', async () => {
        memberOfTeamAs('coach');

        const res = await post({ players: [] });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        expect(query).toHaveBeenCalledTimes(1);
    });
});

describe('POST /api/teams/:teamId/players write', () => {
    const post = (body) => request(buildApp(playerRoutes, ALICE))
        .post('/api/teams/team-1/players').send(body);

    test('writes the whole roster in one statement', async () => {
        memberOfTeamAs('coach');

        await post({ players: [{ name: 'Ana' }, { name: 'Bo' }, { name: 'Cy' }] });

        // The access lookup, then exactly one INSERT — not one per player
        expect(query).toHaveBeenCalledTimes(2);
        const sql = sqlOf(1);
        expect(sql).toContain('INSERT INTO players');
        expect(sql).toContain('ON CONFLICT (team_id, name) DO UPDATE');
        // team_id is bound once and reused by every row
        expect(sql).toContain('VALUES ($1, $2,');
        expect(query.mock.calls[1][1][0]).toBe('team-1');
    });

    test('numbers sort_order from position when the client omits it', async () => {
        memberOfTeamAs('coach');

        await post({ players: [{ name: 'Ana' }, { name: 'Bo' }] });

        const values = query.mock.calls[1][1];
        // [teamId, then 10 params per player]; sort_order is the 8th of each
        expect(values[8]).toBe(0);
        expect(values[18]).toBe(1);
    });

    test('honours an explicit sortOrder', async () => {
        memberOfTeamAs('coach');

        await post({ players: [{ name: 'Ana', sortOrder: 5 }] });

        expect(query.mock.calls[1][1][8]).toBe(5);
    });

    test('collapses a repeated name, keeping the last entry', async () => {
        memberOfTeamAs('coach');

        // ON CONFLICT DO UPDATE cannot hit the same row twice in one statement,
        // so a duplicate would make Postgres reject the whole write.
        await post({ players: [{ name: 'Ana', number: 1 }, { name: 'Bo' }, { name: 'Ana', number: 9 }] });

        const values = query.mock.calls[1][1];
        const names = [values[1], values[11], values[21]];
        expect(names).toEqual(['Ana', 'Bo', undefined]);
        // The surviving Ana is the later one...
        expect(values[2]).toBe(9);
        // ...and Bo keeps the sort_order its original position implied
        expect(values[18]).toBe(1);
    });

    test('returns the roster in the order it was sent', async () => {
        query.mockReset();
        query.mockResolvedValueOnce(rows({ role: 'coach' }));
        // RETURNING gives no order guarantee, so answer out of order on purpose
        query.mockResolvedValueOnce(rows(
            { id: 'p2', name: 'Bo' },
            { id: 'p1', name: 'Ana' }
        ));

        const res = await post({ players: [{ name: 'Ana' }, { name: 'Bo' }] });

        expect(res.body.data.map(p => p.name)).toEqual(['Ana', 'Bo']);
    });
});

describe('POST /api/teams/:teamId/games validation', () => {
    const post = (body) => request(buildApp(gameRoutes, ALICE))
        .post('/api/teams/team-1/games').send(body);

    test('rejects a game with no name rather than letting NOT NULL 500', async () => {
        memberOfTeamAs('coach');

        const res = await post({ notes: 'no name' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/name is required/);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('rejects an unparseable date', async () => {
        memberOfTeamAs('coach');

        const res = await post({ name: 'vs Tigers', date: 'last thursday' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/valid date/);
    });

    test('accepts the ISO timestamp the client actually sends', async () => {
        memberOfTeamAs('coach');
        query.mockResolvedValue(rows({ id: 'game-1', name: 'vs Tigers' }));

        const res = await post({ name: 'vs Tigers', date: '2026-03-14T12:00:00.000Z' });

        expect(res.status).toBe(200);
    });

    test('rejects captains that are not a list of names', async () => {
        memberOfTeamAs('coach');

        const res = await post({ name: 'vs Tigers', captains: [{ name: 'Ana' }] });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/captains/);
    });
});

describe('POST /api/teams/:teamId/games/bulk validation', () => {
    const post = (body) => request(buildApp(gameRoutes, ALICE))
        .post('/api/teams/team-1/games/bulk').send(body);

    test('rejects a non-array payload instead of throwing on iteration', async () => {
        memberOfTeamAs('coach');

        const res = await post({ games: { name: 'vs Tigers' } });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/must be an array/);
        expect(connect).not.toHaveBeenCalled();
    });

    test('rejects a missing payload', async () => {
        memberOfTeamAs('coach');

        const res = await post({});

        expect(res.status).toBe(400);
    });

    test('caps how many games one import can write', async () => {
        memberOfTeamAs('coach');

        const games = Array.from({ length: 201 }, (_, i) => ({ name: `Game ${i}` }));
        const res = await post({ games });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/more than 200/);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('validates every game, not just the first', async () => {
        memberOfTeamAs('coach');

        const res = await post({ games: [{ name: 'vs Tigers' }, { notes: 'nameless' }] });

        expect(res.status).toBe(400);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('imports in one statement with no transaction to unwind', async () => {
        memberOfTeamAs('coach');

        await post({ games: [{ name: 'vs Tigers' }, { name: 'vs Bears' }] });

        expect(query).toHaveBeenCalledTimes(2);
        expect(sqlOf(1)).toContain('INSERT INTO games');
        expect(connect).not.toHaveBeenCalled();
        const values = query.mock.calls[1][1];
        expect(values[1]).toBe('vs Tigers');
        expect(values[10]).toBe('vs Bears');
    });

    test('an empty import succeeds without a write', async () => {
        memberOfTeamAs('coach');

        const res = await post({ games: [] });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        expect(query).toHaveBeenCalledTimes(1);
    });
});

describe('PUT /api/games/:id validation', () => {
    test('rejects blanking the name', async () => {
        ownsResourceAs('coach');

        const res = await request(buildApp(gameRoutes, ALICE))
            .put('/api/games/game-1').send({ name: '   ' });

        expect(res.status).toBe(400);
        // The lookup and membership check ran; the UPDATE did not
        expect(query).toHaveBeenCalledTimes(2);
    });

    test('rejects an unparseable date', async () => {
        ownsResourceAs('coach');

        const res = await request(buildApp(gameRoutes, ALICE))
            .put('/api/games/game-1').send({ date: 'soon' });

        expect(res.status).toBe(400);
        expect(query).toHaveBeenCalledTimes(2);
    });
});

/**
 * PUT /api/teams/:teamId/players — the atomic roster replace.
 *
 * This exists because the client used to delete the roster and then upload the
 * new one as two requests: anything failing in between left the team with no
 * players. Both statements now share one transaction, so what matters here is
 * that it commits on success, rolls back on failure, and always releases the
 * connection.
 *
 * The transaction opens with SELECT ... FOR UPDATE on the team, to read and
 * hold the roster version, and closes by bumping it — so the statement order is
 * BEGIN, SELECT, DELETE, INSERT, UPDATE, COMMIT. Whether the lock actually
 * serialises two coaches is not something a mocked client can show; that is
 * tests/integration/roster-conflict.test.js.
 */
describe('PUT /api/teams/:teamId/players', () => {
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
                statements.push({ verb: String(sql).trim().split(/\s+/)[0].toUpperCase(), params });
                const next = responses[i++];
                if (next instanceof Error) throw next;
                return next ?? rows();
            },
            release: () => { released.count++; }
        });

        return { statements, released };
    }

    /** What the opening SELECT ... FOR UPDATE returns for a live team. */
    const lockedAt = (version = 3) => rows({ roster_version: version });

    test('a viewer cannot replace the roster', async () => {
        memberOfTeamAs('viewer');

        const res = await put({ players: [] });

        expect(res.status).toBe(403);
        expect(connect).not.toHaveBeenCalled();
    });

    test('validates before opening a transaction', async () => {
        memberOfTeamAs('coach');

        const res = await put({ players: [{ number: 3 }] });

        expect(res.status).toBe(400);
        expect(connect).not.toHaveBeenCalled();
    });

    test('deletes the departed and upserts the rest, then commits', async () => {
        memberOfTeamAs('coach');
        //           BEGIN     SELECT       DELETE    INSERT                        UPDATE
        const client = stubClient([
            rows(), lockedAt(), rows(), rows({ id: 'p1', name: 'Ana' }), rows({ roster_version: 4 })
        ]);

        const res = await put({ players: [{ name: 'Ana' }] });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([expect.objectContaining({ id: 'p1', name: 'Ana' })]);
        expect(client.statements.map(s => s.verb))
            .toEqual(['BEGIN', 'SELECT', 'DELETE', 'INSERT', 'UPDATE', 'COMMIT']);
        // The DELETE keeps exactly the names that were sent
        expect(client.statements[2].params).toEqual(['team-1', ['Ana']]);
        expect(client.released.count).toBe(1);
    });

    test('hands back the version the write landed at', async () => {
        memberOfTeamAs('coach');
        const client = stubClient([
            rows(), lockedAt(3), rows(), rows({ id: 'p1', name: 'Ana' }), rows({ roster_version: 4 })
        ]);

        const res = await put({ players: [{ name: 'Ana' }] });

        // The client sends this back on its next write, so it has to be the
        // bumped value rather than the one that was read
        expect(res.body.version).toBe(4);
        expect(client.statements[4].verb).toBe('UPDATE');
    });

    test('an empty roster clears the team without an INSERT', async () => {
        memberOfTeamAs('coach');
        const client = stubClient([rows(), lockedAt(), rows(), rows({ roster_version: 4 })]);

        const res = await put({ players: [] });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        expect(client.statements.map(s => s.verb))
            .toEqual(['BEGIN', 'SELECT', 'DELETE', 'UPDATE', 'COMMIT']);
        // An empty keep-list deletes every player on the team
        expect(client.statements[2].params).toEqual(['team-1', []]);
    });

    test('rolls back and releases when the upsert fails', async () => {
        memberOfTeamAs('coach');
        //           BEGIN     SELECT       DELETE    INSERT
        const client = stubClient([
            rows(), lockedAt(), rows(), new Error('constraint violation')
        ]);

        const res = await put({ players: [{ name: 'Ana' }] });

        expect(res.status).toBe(500);
        expect(client.statements.map(s => s.verb))
            .toEqual(['BEGIN', 'SELECT', 'DELETE', 'INSERT', 'ROLLBACK']);
        expect(client.released.count).toBe(1);
    });

    test('still answers when the rollback itself fails', async () => {
        memberOfTeamAs('coach');
        // Everything the client is asked to do throws, rollback included
        const client = stubClient([
            new Error('connection lost'),
            new Error('connection lost'),
            new Error('connection lost')
        ]);

        const res = await put({ players: [{ name: 'Ana' }] });

        // Without the guard around ROLLBACK this request would hang
        expect(res.status).toBe(500);
        expect(client.released.count).toBe(1);
    });

    test('collapses duplicate names the same way the upsert does', async () => {
        memberOfTeamAs('coach');
        const client = stubClient([rows(), lockedAt(), rows(), rows(), rows({ roster_version: 4 })]);

        await put({ players: [{ name: 'Ana', number: 1 }, { name: 'Ana', number: 9 }] });

        expect(client.statements[2].params).toEqual(['team-1', ['Ana']]);
        // One row in the INSERT, carrying the later number
        expect(client.statements[3].params[2]).toBe(9);
    });

    test('rejects a stale version without touching the roster', async () => {
        memberOfTeamAs('coach');
        //           BEGIN     SELECT           SELECT (the roster it lost to)
        const client = stubClient([rows(), lockedAt(7), rows({ id: 'p1', name: 'Cleo' })]);

        const res = await put({ players: [{ name: 'Ana' }], expectedVersion: 3 });

        expect(res.status).toBe(409);
        expect(res.body.conflict).toBe(true);
        expect(res.body.version).toBe(7);
        expect(res.body.data).toEqual([expect.objectContaining({ name: 'Cleo' })]);
        // No DELETE, no INSERT, and the transaction is unwound
        expect(client.statements.map(s => s.verb))
            .toEqual(['BEGIN', 'SELECT', 'SELECT', 'ROLLBACK']);
        expect(client.released.count).toBe(1);
    });

    test('writes when the version matches', async () => {
        memberOfTeamAs('coach');
        const client = stubClient([
            rows(), lockedAt(7), rows(), rows({ id: 'p1', name: 'Ana' }), rows({ roster_version: 8 })
        ]);

        const res = await put({ players: [{ name: 'Ana' }], expectedVersion: 7 });

        expect(res.status).toBe(200);
        expect(client.statements.map(s => s.verb))
            .toEqual(['BEGIN', 'SELECT', 'DELETE', 'INSERT', 'UPDATE', 'COMMIT']);
    });

    test('a team that vanished mid-request is a 404, not a write', async () => {
        memberOfTeamAs('coach');
        //           BEGIN     SELECT finds nothing to lock
        const client = stubClient([rows(), rows()]);

        const res = await put({ players: [{ name: 'Ana' }], expectedVersion: 1 });

        expect(res.status).toBe(404);
        expect(client.statements.map(s => s.verb)).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
        expect(client.released.count).toBe(1);
    });

    test('a non-integer version is rejected before a transaction opens', async () => {
        memberOfTeamAs('coach');

        const res = await put({ players: [{ name: 'Ana' }], expectedVersion: '3' });

        expect(res.status).toBe(400);
        expect(connect).not.toHaveBeenCalled();
    });
});
