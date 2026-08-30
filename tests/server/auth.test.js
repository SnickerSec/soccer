/**
 * Auth routes tests.
 *
 * Covers session state reporting (/api/auth/me) and logout lifecycle (/api/auth/logout).
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const { default: authRoutes } = await import('../../server/routes/auth.js');
const { silenceRouteErrorLogging } = await import('../helpers/test-app.js');

silenceRouteErrorLogging(jest, beforeEach, afterEach);

function buildAuthApp({ user = null, logoutError = null } = {}) {
    const app = express();
    app.use(express.json());

    app.use((req, res, next) => {
        if (user) req.user = user;

        req.logout = (cb) => {
            req.user = null;
            cb(logoutError);
        };

        req.session = {
            destroy: (cb) => {
                cb();
            }
        };

        next();
    });

    app.use(authRoutes);

    // Error handler
    app.use((err, _req, res, _next) => {
        res.status(500).json({ success: false, error: err.message });
    });

    return app;
}

describe('GET /api/auth/me', () => {
    test('returns data: null when user is not signed in', async () => {
        const app = buildAuthApp({ user: null });
        const res = await request(app).get('/api/auth/me');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            data: null
        });
    });

    test('returns mapped user profile fields when authenticated', async () => {
        const testUser = {
            id: 'u-12345',
            email: 'coach@example.com',
            display_name: 'Coach Sarah',
            avatar_url: 'https://example.com/avatar.jpg',
            created_at: '2026-08-30T10:00:00Z',
            secret_token_never_expose: 'super-secret'
        };

        const app = buildAuthApp({ user: testUser });
        const res = await request(app).get('/api/auth/me');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            data: {
                id: 'u-12345',
                email: 'coach@example.com',
                displayName: 'Coach Sarah',
                avatarUrl: 'https://example.com/avatar.jpg',
                createdAt: '2026-08-30T10:00:00Z'
            }
        });
        // Ensures internal properties are omitted
        expect(res.body.data.secret_token_never_expose).toBeUndefined();
    });
});

describe('POST /api/auth/logout', () => {
    test('logs out and destroys the session on success', async () => {
        const app = buildAuthApp({
            user: { id: 'u-1', display_name: 'Coach' }
        });

        const res = await request(app).post('/api/auth/logout');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true });
    });

    test('propagates logout failure to error handler', async () => {
        const app = buildAuthApp({
            user: { id: 'u-1' },
            logoutError: new Error('Session cleanup failed')
        });

        const res = await request(app).post('/api/auth/logout');

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
            success: false,
            error: 'Session cleanup failed'
        });
    });
});
