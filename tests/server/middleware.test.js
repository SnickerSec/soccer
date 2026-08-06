/**
 * Authorization middleware.
 *
 * requireTeamAccess is the only thing standing between one coach and another
 * team's roster, so these cover the deny paths as carefully as the allow paths.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const query = jest.fn();
jest.unstable_mockModule('../../server/db.js', () => ({
    default: { query, connect: jest.fn() }
}));

const { requireAuth, requireTeamAccess } = await import('../../server/middleware.js');
const { rows, silenceRouteErrorLogging } = await import('../helpers/test-app.js');

silenceRouteErrorLogging(jest, beforeEach, afterEach);

/** An app whose single route is guarded by `middleware`. */
function guardedApp(middleware, user, path = '/api/teams/:teamId/thing') {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        if (user) req.user = user;
        next();
    });
    app.get(path, middleware, (req, res) => {
        res.json({ success: true, teamRole: req.teamRole });
    });
    return app;
}

const ALICE = { id: 'user-alice' };

beforeEach(() => {
    query.mockReset();
});

describe('requireAuth', () => {
    test('rejects an anonymous request with 401', async () => {
        const app = guardedApp(requireAuth, null, '/api/thing');
        const res = await request(app).get('/api/thing');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ success: false, error: 'Not authenticated' });
    });

    test('passes a signed-in request through', async () => {
        const app = guardedApp(requireAuth, ALICE, '/api/thing');
        const res = await request(app).get('/api/thing');

        expect(res.status).toBe(200);
    });
});

describe('requireTeamAccess', () => {
    test('rejects an anonymous request before touching the database', async () => {
        const app = guardedApp(requireTeamAccess('viewer'), null);
        const res = await request(app).get('/api/teams/team-1/thing');

        expect(res.status).toBe(401);
        expect(query).not.toHaveBeenCalled();
    });

    test('denies a user who is not a member of the team', async () => {
        query.mockResolvedValue(rows());

        const app = guardedApp(requireTeamAccess('viewer'), ALICE);
        const res = await request(app).get('/api/teams/someone-elses-team/thing');

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('No access to this team');
    });

    test('scopes the membership lookup to the requesting user and team', async () => {
        query.mockResolvedValue(rows({ role: 'owner' }));

        const app = guardedApp(requireTeamAccess('viewer'), ALICE);
        await request(app).get('/api/teams/team-1/thing');

        const [sql, params] = query.mock.calls[0];
        expect(params).toEqual(['team-1', 'user-alice']);
        // A pending invite row must not count as membership
        expect(sql).toContain('joined_at IS NOT NULL');
    });

    describe('role hierarchy', () => {
        const cases = [
            { role: 'viewer', required: 'viewer', allowed: true, outcome: 'allowed' },
            { role: 'viewer', required: 'coach', allowed: false, outcome: 'denied' },
            { role: 'viewer', required: 'owner', allowed: false, outcome: 'denied' },
            { role: 'coach', required: 'viewer', allowed: true, outcome: 'allowed' },
            { role: 'coach', required: 'coach', allowed: true, outcome: 'allowed' },
            { role: 'coach', required: 'owner', allowed: false, outcome: 'denied' },
            { role: 'owner', required: 'viewer', allowed: true, outcome: 'allowed' },
            { role: 'owner', required: 'coach', allowed: true, outcome: 'allowed' },
            { role: 'owner', required: 'owner', allowed: true, outcome: 'allowed' }
        ];

        test.each(cases)('a $role is $outcome on a $required-only route', async ({ role, required, allowed }) => {
            query.mockResolvedValue(rows({ role }));

            const app = guardedApp(requireTeamAccess(required), ALICE);
            const res = await request(app).get('/api/teams/team-1/thing');

            if (allowed) {
                expect(res.status).toBe(200);
                expect(res.body.teamRole).toBe(role);
            } else {
                expect(res.status).toBe(403);
                expect(res.body.error).toBe('Insufficient permissions');
            }
        });
    });

    test('denies an unrecognised role rather than defaulting to allowed', async () => {
        query.mockResolvedValue(rows({ role: 'superadmin' }));

        const app = guardedApp(requireTeamAccess('viewer'), ALICE);
        const res = await request(app).get('/api/teams/team-1/thing');

        expect(res.status).toBe(403);
    });

    test('reads the team id from :id as well as :teamId', async () => {
        query.mockResolvedValue(rows({ role: 'owner' }));

        const app = guardedApp(requireTeamAccess('owner'), ALICE, '/api/teams/:id');
        const res = await request(app).get('/api/teams/team-42');

        expect(res.status).toBe(200);
        expect(query.mock.calls[0][1]).toEqual(['team-42', 'user-alice']);
    });

    test('fails closed when the database errors', async () => {
        query.mockRejectedValue(new Error('connection refused'));

        const app = guardedApp(requireTeamAccess('viewer'), ALICE);
        const res = await request(app).get('/api/teams/team-1/thing');

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });
});
