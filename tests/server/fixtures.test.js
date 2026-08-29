/**
 * Fixture and Match Schedule routes tests
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const connect = jest.fn();
jest.unstable_mockModule('../../server/db.js', () => ({
    default: { query, connect }
}));

const { default: fixtureRoutes } = await import('../../server/routes/fixtures.js');
const { buildApp, rows, silenceRouteErrorLogging } = await import('../helpers/test-app.js');

silenceRouteErrorLogging(jest, beforeEach, afterEach);

const ALICE = { id: 'user-alice' };

beforeEach(() => {
    query.mockReset();
    connect.mockReset();
    query.mockResolvedValue(rows());
});

function memberOfTeamAs(role) {
    query.mockReset();
    query.mockResolvedValueOnce(rows({ role }));
    query.mockResolvedValue(rows());
}

function ownsFixtureAs(role, teamId = 'team-1') {
    query.mockReset();
    query.mockResolvedValueOnce(rows({ team_id: teamId }));
    query.mockResolvedValueOnce(role ? rows({ role }) : rows());
    query.mockResolvedValue(rows());
}

describe('team-scoped fixture routes', () => {
    test('reading fixtures requires team membership', async () => {
        query.mockResolvedValue(rows());

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .get('/api/teams/team-1/fixtures');

        expect(res.status).toBe(403);
    });

    test('reading fixtures returns mapped fixture objects', async () => {
        query.mockResolvedValueOnce(rows({ role: 'viewer' }));
        query.mockResolvedValueOnce(rows({
            id: 'fix-1',
            team_id: 'team-1',
            game_date: '2026-09-12',
            game_time: '09:00',
            opponent: 'Thunder FC',
            location: 'Field 2',
            home_away: 'home',
            jersey_color: 'Blue',
            snack_parent: 'Liam',
            fruit_parent: 'Maya',
            referee_duty: 'Dave',
            field_setup: 'John',
            status: 'upcoming',
            notes: 'Arrive early'
        }));

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .get('/api/teams/team-1/fixtures');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data[0]).toMatchObject({
            id: 'fix-1',
            opponent: 'Thunder FC',
            snackParent: 'Liam',
            fruitParent: 'Maya'
        });
    });

    test('answers a fixture date as a calendar date, not a timestamp', async () => {
        query.mockResolvedValueOnce(rows({ role: 'viewer' }));
        // As pg hands a DATE column back: a Date at local midnight, which
        // serialises to a UTC timestamp and lands on the previous day east of
        // UTC.
        query.mockResolvedValueOnce(rows({
            id: 'fix-1', game_date: new Date(2026, 8, 12), opponent: 'Thunder FC'
        }));

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .get('/api/teams/team-1/fixtures');

        expect(res.body.data[0].gameDate).toBe('2026-09-12');
    });

    test('creating a fixture requires coach role', async () => {
        memberOfTeamAs('viewer');

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .post('/api/teams/team-1/fixtures')
            .send({
                gameDate: '2026-09-12',
                opponent: 'Thunder FC'
            });

        expect(res.status).toBe(403);
    });

    test('creating a fixture validates required fields', async () => {
        memberOfTeamAs('coach');

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .post('/api/teams/team-1/fixtures')
            .send({
                gameDate: '2026-09-12',
                opponent: ''
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Opponent name is required');
    });

    test('creating a fixture succeeds for coach', async () => {
        query.mockResolvedValueOnce(rows({ role: 'coach' }));
        query.mockResolvedValueOnce(rows({
            id: 'fix-new',
            team_id: 'team-1',
            game_date: '2026-09-12',
            opponent: 'Thunder FC',
            home_away: 'home',
            status: 'upcoming'
        }));

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .post('/api/teams/team-1/fixtures')
            .send({
                gameDate: '2026-09-12',
                opponent: 'Thunder FC',
                homeAway: 'home'
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe('fix-new');
    });

    test('bulk importing fixtures requires coach role and validates array', async () => {
        memberOfTeamAs('viewer');

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .post('/api/teams/team-1/fixtures/bulk')
            .send({ fixtures: [] });

        expect(res.status).toBe(403);
    });

    test('bulk importing empty array returns empty list', async () => {
        memberOfTeamAs('coach');

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .post('/api/teams/team-1/fixtures/bulk')
            .send({ fixtures: [] });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });
});

describe('by-id fixture routes', () => {
    test('updating fixture requires coach role', async () => {
        ownsFixtureAs('viewer');

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .put('/api/fixtures/fix-1')
            .send({ opponent: 'New Name' });

        expect(res.status).toBe(403);
    });

    test('updating fixture succeeds for coach', async () => {
        query.mockReset();
        query.mockResolvedValueOnce(rows({ team_id: 'team-1' }));
        query.mockResolvedValueOnce(rows({ role: 'coach' }));
        query.mockResolvedValueOnce(rows({
            id: 'fix-1',
            team_id: 'team-1',
            game_date: '2026-09-12',
            opponent: 'Updated Opponent',
            status: 'upcoming'
        }));

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .put('/api/fixtures/fix-1')
            .send({ opponent: 'Updated Opponent' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('deleting fixture succeeds for coach', async () => {
        ownsFixtureAs('coach');

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .delete('/api/fixtures/fix-1');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('updating nonexistent fixture returns 404', async () => {
        query.mockResolvedValue(rows());

        const res = await request(buildApp(fixtureRoutes, ALICE))
            .put('/api/fixtures/fix-missing')
            .send({ opponent: 'Test' });

        expect(res.status).toBe(404);
    });
});
