/**
 * Invite routes.
 *
 * The accept flow runs in a transaction with three outcomes — invalid, already
 * a member, and joined — and each must leave the transaction in the right
 * state. A COMMIT on a failure path, or a missing ROLLBACK, leaks a connection
 * and can half-apply a membership change.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const connect = jest.fn();
jest.unstable_mockModule('../../server/db.js', () => ({
    default: { query, connect }
}));

const { default: inviteRoutes } = await import('../../server/routes/invites.js');
const { buildApp, rows, silenceRouteErrorLogging } = await import('../helpers/test-app.js');

silenceRouteErrorLogging(jest, beforeEach, afterEach);

const ALICE = { id: 'user-alice' };

/**
 * A client whose queries are answered by `responses` in order, recording the
 * transaction verbs so tests can assert COMMIT vs ROLLBACK.
 */
function stubClient(responses) {
    const statements = [];
    const released = { count: 0 };
    let index = 0;

    connect.mockResolvedValue({
        query: async (sql) => {
            const verb = String(sql).trim().split(/\s+/)[0].toUpperCase();
            statements.push(verb);
            const next = responses[index++];
            if (next instanceof Error) throw next;
            return next ?? rows();
        },
        release: () => { released.count++; }
    });

    return { statements, released };
}

beforeEach(() => {
    query.mockReset();
    connect.mockReset();
});

describe('GET /api/invites/:token', () => {
    test('is public — no authentication needed to preview an invite', async () => {
        query.mockResolvedValue(rows({
            team_name: 'Tigers', role: 'coach',
            invited_by_name: 'Bob', invite_expires_at: '2026-12-01'
        }));

        const res = await request(buildApp(inviteRoutes, null)).get('/api/invites/tok-123');

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
            teamName: 'Tigers', role: 'coach', invitedBy: 'Bob', expiresAt: '2026-12-01'
        });
    });

    test('only matches unexpired, unclaimed invites', async () => {
        query.mockResolvedValue(rows());

        await request(buildApp(inviteRoutes, null)).get('/api/invites/tok-123');

        const [sql, params] = query.mock.calls[0];
        expect(params).toEqual(['tok-123']);
        expect(sql).toContain('invite_expires_at > NOW()');
        expect(sql).toContain('joined_at IS NULL');
    });

    test('reports an unknown token as invalid without leaking whether it existed', async () => {
        query.mockResolvedValue(rows());

        const res = await request(buildApp(inviteRoutes, null)).get('/api/invites/nope');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: false, error: 'Invalid or expired invite' });
    });

    test('returns 500 without leaking the database error', async () => {
        query.mockRejectedValue(new Error('column "invite_token" does not exist'));

        const res = await request(buildApp(inviteRoutes, null)).get('/api/invites/tok-123');

        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toContain('invite_token');
    });
});

describe('POST /api/invites/:token/accept', () => {
    test('requires authentication', async () => {
        const res = await request(buildApp(inviteRoutes, null)).post('/api/invites/tok/accept');

        expect(res.status).toBe(401);
        expect(connect).not.toHaveBeenCalled();
    });

    test('joins the team and commits', async () => {
        const client = stubClient([
            rows(),                                          // BEGIN
            rows({ id: 'member-1', team_id: 'team-1' }),     // find invite
            rows(),                                          // existing membership: none
            rows(),                                          // UPDATE
            rows()                                           // COMMIT
        ]);

        const res = await request(buildApp(inviteRoutes, ALICE)).post('/api/invites/tok/accept');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: { teamId: 'team-1' } });
        expect(client.statements).toContain('COMMIT');
        expect(client.statements).not.toContain('ROLLBACK');
        expect(client.released.count).toBe(1);
    });

    test('rolls back an invalid or expired token', async () => {
        const client = stubClient([
            rows(),   // BEGIN
            rows(),   // find invite: none
            rows()    // ROLLBACK
        ]);

        const res = await request(buildApp(inviteRoutes, ALICE)).post('/api/invites/expired/accept');

        expect(res.body).toEqual({ success: false, error: 'Invalid or expired invite' });
        expect(client.statements).toContain('ROLLBACK');
        expect(client.statements).not.toContain('COMMIT');
        expect(client.released.count).toBe(1);
    });

    test('discards the invite when the user is already a member', async () => {
        const client = stubClient([
            rows(),                                        // BEGIN
            rows({ id: 'member-9', team_id: 'team-1' }),   // find invite
            rows({ '?column?': 1 }),                       // already a member
            rows(),                                        // DELETE the unused invite
            rows()                                         // COMMIT
        ]);

        const res = await request(buildApp(inviteRoutes, ALICE)).post('/api/invites/tok/accept');

        expect(res.body).toEqual({ success: false, error: 'Already a member of this team' });
        // The spare invite row is cleaned up rather than left claimable
        expect(client.statements).toContain('DELETE');
        expect(client.statements).toContain('COMMIT');
        expect(client.released.count).toBe(1);
    });

    test('rolls back and releases the connection when a statement throws', async () => {
        const client = stubClient([
            rows(),                                        // BEGIN
            rows({ id: 'member-1', team_id: 'team-1' }),   // find invite
            rows(),                                        // no existing membership
            new Error('deadlock detected'),                // UPDATE fails
            rows()                                         // ROLLBACK
        ]);

        const res = await request(buildApp(inviteRoutes, ALICE)).post('/api/invites/tok/accept');

        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toContain('deadlock');
        expect(client.statements).toContain('ROLLBACK');
        expect(client.released.count).toBe(1);
    });

    test('binds the accepting user from the session, not the request body', async () => {
        const bound = [];
        connect.mockResolvedValue({
            query: async (sql, params) => {
                bound.push({ sql: String(sql).trim().split(/\s+/)[0].toUpperCase(), params });
                if (String(sql).includes('SELECT id, team_id')) {
                    return rows({ id: 'member-1', team_id: 'team-1' });
                }
                return rows();
            },
            release: () => {}
        });

        await request(buildApp(inviteRoutes, ALICE))
            .post('/api/invites/tok/accept')
            .send({ user_id: 'user-mallory' });

        const update = bound.find(b => b.sql === 'UPDATE');
        expect(update.params).toEqual(['user-alice', 'member-1']);
    });
});
