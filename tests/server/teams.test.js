/**
 * Team routes.
 *
 * Covers who is allowed to do what, and the input validation that guards the
 * SQL underneath — particularly invite generation, where a permissive role
 * would let an owner mint an invite that escalates privileges.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const connect = jest.fn();
jest.unstable_mockModule('../../server/db.js', () => ({
    default: { query, connect }
}));

const { default: teamRoutes } = await import('../../server/routes/teams.js');
const { buildApp, rows, silenceRouteErrorLogging } = await import('../helpers/test-app.js');

silenceRouteErrorLogging(jest, beforeEach, afterEach);

const ALICE = { id: 'user-alice' };

/** Membership lookups come first; this sets the role requireTeamAccess sees. */
function actingAs(role) {
    query.mockReset();
    query.mockResolvedValueOnce(rows({ role }));
    query.mockResolvedValue(rows());
}

beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue(rows());
});

describe('GET /api/teams', () => {
    test('requires authentication', async () => {
        const res = await request(buildApp(teamRoutes, null)).get('/api/teams');
        expect(res.status).toBe(401);
    });

    test('returns only teams the user has joined', async () => {
        query.mockResolvedValue(rows({
            id: 'team-1', name: 'Tigers', age_division: '10U',
            created_by: 'user-alice', created_at: '2026-01-01', role: 'owner'
        }));

        const res = await request(buildApp(teamRoutes, ALICE)).get('/api/teams');

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([expect.objectContaining({ id: 'team-1', role: 'owner' })]);

        const [sql, params] = query.mock.calls[0];
        expect(params).toEqual(['user-alice']);
        expect(sql).toContain('tm.user_id = $1');
        // Pending invites are not joined teams
        expect(sql).toContain('joined_at IS NOT NULL');
    });

    test('returns 500 without leaking the database error', async () => {
        query.mockRejectedValue(new Error('relation "teams" does not exist'));

        const res = await request(buildApp(teamRoutes, ALICE)).get('/api/teams');

        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toContain('relation');
    });
});

describe('POST /api/teams', () => {
    test('requires authentication', async () => {
        const res = await request(buildApp(teamRoutes, null))
            .post('/api/teams').send({ name: 'Tigers' });

        expect(res.status).toBe(401);
        expect(query).not.toHaveBeenCalled();
    });

    test.each([
        ['a missing name', {}],
        ['an empty name', { name: '' }],
        ['a whitespace-only name', { name: '   ' }],
        ['a non-string name', { name: 12345 }],
        ['a name over 255 characters', { name: 'x'.repeat(256) }]
    ])('rejects %s', async (_label, body) => {
        const res = await request(buildApp(teamRoutes, ALICE)).post('/api/teams').send(body);

        expect(res.status).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });

    test('creates the team owned by the requesting user', async () => {
        query.mockResolvedValue(rows({
            id: 'team-9', name: 'Tigers', age_division: '12U',
            created_by: 'user-alice', created_at: '2026-01-01'
        }));

        const res = await request(buildApp(teamRoutes, ALICE))
            .post('/api/teams').send({ name: 'Tigers', ageDivision: '12U' });

        expect(res.status).toBe(200);
        expect(res.body.data.role).toBe('owner');
        // created_by comes from the session, never from the request body
        expect(query.mock.calls[0][1]).toEqual(['Tigers', '12U', 'user-alice']);
    });

    test('ignores a created_by supplied by the client', async () => {
        query.mockResolvedValue(rows({ id: 't', name: 'Tigers', age_division: '10U' }));

        await request(buildApp(teamRoutes, ALICE))
            .post('/api/teams').send({ name: 'Tigers', created_by: 'user-mallory' });

        expect(query.mock.calls[0][1]).toContain('user-alice');
        expect(query.mock.calls[0][1]).not.toContain('user-mallory');
    });

    test('defaults the age division to 10U', async () => {
        query.mockResolvedValue(rows({ id: 't', name: 'Tigers', age_division: '10U' }));

        await request(buildApp(teamRoutes, ALICE)).post('/api/teams').send({ name: 'Tigers' });

        expect(query.mock.calls[0][1][1]).toBe('10U');
    });
});

describe('PUT /api/teams/:id', () => {
    test('denies a coach', async () => {
        actingAs('coach');

        const res = await request(buildApp(teamRoutes, ALICE))
            .put('/api/teams/team-1').send({ name: 'Renamed' });

        expect(res.status).toBe(403);
        // Only the membership check ran; no UPDATE was issued
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('allows an owner', async () => {
        actingAs('owner');

        const res = await request(buildApp(teamRoutes, ALICE))
            .put('/api/teams/team-1').send({ name: 'Renamed' });

        expect(res.status).toBe(200);
        expect(query.mock.calls[1][1]).toEqual(['Renamed', undefined, 'team-1']);
    });

    test('rejects an invalid name before writing', async () => {
        actingAs('owner');

        const res = await request(buildApp(teamRoutes, ALICE))
            .put('/api/teams/team-1').send({ name: '   ' });

        expect(res.status).toBe(400);
        expect(query).toHaveBeenCalledTimes(1);
    });
});

describe('DELETE /api/teams/:id', () => {
    test('denies a viewer', async () => {
        actingAs('viewer');

        const res = await request(buildApp(teamRoutes, ALICE)).delete('/api/teams/team-1');

        expect(res.status).toBe(403);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('allows an owner and deletes only that team', async () => {
        actingAs('owner');

        const res = await request(buildApp(teamRoutes, ALICE)).delete('/api/teams/team-1');

        expect(res.status).toBe(200);
        expect(query.mock.calls[1][1]).toEqual(['team-1']);
    });
});

describe('GET /api/teams/:teamId/members', () => {
    test('denies a non-member', async () => {
        query.mockReset();
        query.mockResolvedValue(rows());

        const res = await request(buildApp(teamRoutes, ALICE)).get('/api/teams/team-1/members');

        expect(res.status).toBe(403);
    });

    test('allows a viewer', async () => {
        actingAs('viewer');

        const res = await request(buildApp(teamRoutes, ALICE)).get('/api/teams/team-1/members');

        expect(res.status).toBe(200);
        expect(query.mock.calls[1][1]).toEqual(['team-1']);
    });
});

describe('POST /api/teams/:teamId/invite', () => {
    test('denies a coach generating invites', async () => {
        actingAs('coach');

        const res = await request(buildApp(teamRoutes, ALICE))
            .post('/api/teams/team-1/invite').send({ role: 'coach' });

        expect(res.status).toBe(403);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('refuses to mint an owner invite', async () => {
        actingAs('owner');

        const res = await request(buildApp(teamRoutes, ALICE))
            .post('/api/teams/team-1/invite').send({ role: 'owner' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Role must be coach or viewer');
        expect(query).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['zero days', 0],
        ['negative days', -5],
        ['over the 30 day cap', 31],
        ['not a number', 'forever']
    ])('rejects an expiry of %s', async (_label, expiresInDays) => {
        actingAs('owner');

        const res = await request(buildApp(teamRoutes, ALICE))
            .post('/api/teams/team-1/invite').send({ role: 'coach', expiresInDays });

        expect(res.status).toBe(400);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('issues a token an owner can share', async () => {
        actingAs('owner');

        const res = await request(buildApp(teamRoutes, ALICE))
            .post('/api/teams/team-1/invite').send({ role: 'coach', expiresInDays: 7 });

        expect(res.status).toBe(200);
        expect(res.body.data.token).toEqual(expect.any(String));
        expect(res.body.data.token.length).toBeGreaterThan(20);
        expect(res.body.data.url).toContain(`invite=${res.body.data.token}`);

        const [, params] = query.mock.calls[1];
        expect(params[0]).toBe('team-1');
        expect(params[1]).toBe('coach');
        expect(params[3]).toBe('7 days');
        expect(params[4]).toBe('user-alice');
    });

    test('issues a different token each time', async () => {
        actingAs('owner');
        const first = await request(buildApp(teamRoutes, ALICE))
            .post('/api/teams/team-1/invite').send({ role: 'coach' });

        actingAs('owner');
        const second = await request(buildApp(teamRoutes, ALICE))
            .post('/api/teams/team-1/invite').send({ role: 'coach' });

        expect(first.body.data.token).not.toBe(second.body.data.token);
    });

    test('rejects a non-numeric expiry rather than coercing it into the interval', async () => {
        actingAs('owner');

        const res = await request(buildApp(teamRoutes, ALICE))
            .post('/api/teams/team-1/invite').send({ role: 'coach', expiresInDays: '7; DROP TABLE teams' });

        // Number() on that string is NaN, so it fails the range check outright
        // and never reaches the `${days} days` interval string
        expect(res.status).toBe(400);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('floors a fractional expiry into the interval', async () => {
        actingAs('owner');

        await request(buildApp(teamRoutes, ALICE))
            .post('/api/teams/team-1/invite').send({ role: 'coach', expiresInDays: 7.9 });

        expect(query.mock.calls[1][1][3]).toBe('7 days');
    });
});

/**
 * Removing a member runs in a transaction: it locks the target row, counts the
 * remaining owners if that row is one, and only then deletes. Whether the lock
 * actually serialises two owners removing each other is
 * tests/integration/team-membership.test.js; this covers the shape.
 */
describe('DELETE /api/teams/:teamId/members/:memberId', () => {
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
                statements.push({ verb: String(sql).trim().split(/\s+/)[0].toUpperCase(), sql, params });
                const next = responses[i++];
                if (next instanceof Error) throw next;
                return next ?? rows();
            },
            release: () => { released.count++; }
        });

        return { statements, released };
    }

    test('denies a coach removing members', async () => {
        actingAs('coach');
        stubClient();

        const res = await request(buildApp(teamRoutes, ALICE))
            .delete('/api/teams/team-1/members/member-2');

        expect(res.status).toBe(403);
        expect(connect).not.toHaveBeenCalled();
    });

    test('scopes the lookup to the team, so a member id from another team is not found', async () => {
        actingAs('owner');
        //                        BEGIN     SELECT finds nothing
        const client = stubClient([rows(), rows()]);

        const res = await request(buildApp(teamRoutes, ALICE))
            .delete('/api/teams/team-1/members/member-2');

        expect(res.status).toBe(404);
        expect(client.statements[1].params).toEqual(['member-2', 'team-1']);
        expect(client.statements[1].sql).toContain('team_id = $2');
        expect(client.released.count).toBe(1);
    });

    test('removes a coach without counting owners', async () => {
        actingAs('owner');
        //                        BEGIN     SELECT target        DELETE
        const client = stubClient([rows(), rows({ role: 'coach' }), rows()]);

        const res = await request(buildApp(teamRoutes, ALICE))
            .delete('/api/teams/team-1/members/member-2');

        expect(res.status).toBe(200);
        expect(client.statements.map(s => s.verb)).toEqual(['BEGIN', 'SELECT', 'DELETE', 'COMMIT']);
    });

    test('locks the row it is about to remove', async () => {
        actingAs('owner');
        const client = stubClient([rows(), rows({ role: 'coach' }), rows()]);

        await request(buildApp(teamRoutes, ALICE))
            .delete('/api/teams/team-1/members/member-2');

        expect(client.statements[1].sql).toContain('FOR UPDATE');
    });

    test('refuses to remove the last owner', async () => {
        actingAs('owner');
        //                        BEGIN     SELECT target        COUNT owners
        const client = stubClient([rows(), rows({ role: 'owner' }), rows({ count: 1 })]);

        const res = await request(buildApp(teamRoutes, ALICE))
            .delete('/api/teams/team-1/members/member-2');

        expect(res.status).toBe(409);
        // No DELETE, and the transaction is unwound
        expect(client.statements.map(s => s.verb)).toEqual(['BEGIN', 'SELECT', 'SELECT', 'ROLLBACK']);
        expect(client.released.count).toBe(1);
    });

    test('removes an owner when another remains', async () => {
        actingAs('owner');
        const client = stubClient([rows(), rows({ role: 'owner' }), rows({ count: 2 }), rows()]);

        const res = await request(buildApp(teamRoutes, ALICE))
            .delete('/api/teams/team-1/members/member-2');

        expect(res.status).toBe(200);
        expect(client.statements.map(s => s.verb))
            .toEqual(['BEGIN', 'SELECT', 'SELECT', 'DELETE', 'COMMIT']);
    });

    test('still answers when the rollback itself fails', async () => {
        actingAs('owner');
        // A dropped connection fails BEGIN and ROLLBACK alike
        const client = stubClient([
            new Error('connection terminated'),
            new Error('connection terminated')
        ]);

        const res = await request(buildApp(teamRoutes, ALICE))
            .delete('/api/teams/team-1/members/member-2');

        expect(res.status).toBe(500);
        expect(client.released.count).toBe(1);
    });
});

describe('DELETE /api/teams/:teamId/membership', () => {
    function stubClient(responses = []) {
        const statements = [];
        let i = 0;
        connect.mockResolvedValue({
            query: async (sql, params) => {
                statements.push({ verb: String(sql).trim().split(/\s+/)[0].toUpperCase(), sql, params });
                const next = responses[i++];
                if (next instanceof Error) throw next;
                return next ?? rows();
            },
            release: () => {}
        });
        return { statements };
    }

    test('a viewer may leave — the lowest role is enough', async () => {
        actingAs('viewer');
        stubClient([rows(), rows({ id: 'member-9', role: 'viewer' }), rows()]);

        const res = await request(buildApp(teamRoutes, ALICE))
            .delete('/api/teams/team-1/membership');

        expect(res.status).toBe(200);
    });

    test('takes the caller\'s own row, from the session rather than the request', async () => {
        actingAs('coach');
        const client = stubClient([rows(), rows({ id: 'member-9', role: 'coach' }), rows()]);

        await request(buildApp(teamRoutes, ALICE))
            .delete('/api/teams/team-1/membership')
            .send({ user_id: 'user-mallory' });

        expect(client.statements[1].params).toEqual(['team-1', 'user-alice']);
        expect(client.statements[2].params).toEqual(['member-9']);
    });

    test('refuses when the caller is the only owner', async () => {
        actingAs('owner');
        const client = stubClient([rows(), rows({ id: 'member-1', role: 'owner' }), rows({ count: 1 })]);

        const res = await request(buildApp(teamRoutes, ALICE))
            .delete('/api/teams/team-1/membership');

        expect(res.status).toBe(409);
        expect(client.statements.map(s => s.verb)).toEqual(['BEGIN', 'SELECT', 'SELECT', 'ROLLBACK']);
    });
});
