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
jest.unstable_mockModule('../../server/db.js', () => ({
    default: { query, connect: jest.fn() }
}));

const { default: playerRoutes } = await import('../../server/routes/players.js');
const { default: gameRoutes } = await import('../../server/routes/games.js');
const { buildApp, rows, silenceRouteErrorLogging } = await import('../helpers/test-app.js');

silenceRouteErrorLogging(jest, beforeEach, afterEach);

const ALICE = { id: 'user-alice' };

beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue(rows());
});

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
