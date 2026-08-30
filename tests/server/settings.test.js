/**
 * Settings routes tests
 *
 * Two settings live here and are deliberately not the same thing: the coach's
 * own (theme, which team they had open) and the team's (how it plays). The
 * second is what a coach's phone used to get wrong, having only ever known
 * whatever that device had been set to.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

const query = jest.fn();
const connect = jest.fn();
jest.unstable_mockModule('../../server/db.js', () => ({
    default: { query, connect }
}));

const { default: settingsRoutes, validateTeamSettings, mapTeamSettings } =
    await import('../../server/routes/settings.js');
const { buildApp, rows, silenceRouteErrorLogging } = await import('../helpers/test-app.js');

silenceRouteErrorLogging(jest, beforeEach, afterEach);

const ALICE = { id: 'user-alice' };

beforeEach(() => {
    query.mockReset();
    connect.mockReset();
    query.mockResolvedValue(rows());
});

/** The first query a team-scoped route makes is the membership check. */
function memberOfTeamAs(role) {
    query.mockReset();
    query.mockResolvedValueOnce(rows({ role }));
    query.mockResolvedValue(rows());
}

describe('user settings', () => {
    test('a body that only names the team leaves the theme alone', async () => {
        // The theme used to be defaulted rather than left, so recording which
        // team was last opened — which happens on every team switch — put a
        // coach who works in light back into dark.
        const res = await request(buildApp(settingsRoutes, ALICE))
            .put('/api/settings')
            .send({ default_team_id: 'team-1' });

        expect(res.status).toBe(200);
        const [, params] = query.mock.calls[0];
        expect(params[1]).toBeNull();
    });

    test('a theme that is neither dark nor light is refused', async () => {
        const res = await request(buildApp(settingsRoutes, ALICE))
            .put('/api/settings')
            .send({ theme: 'neon' });

        expect(res.status).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });

    test('the coach\'s theme is written when they send one', async () => {
        const res = await request(buildApp(settingsRoutes, ALICE))
            .put('/api/settings')
            .send({ theme: 'light' });

        expect(res.status).toBe(200);
        expect(query.mock.calls[0][1][1]).toBe('light');
    });
});

describe('mapTeamSettings', () => {
    test('the division comes from its column, not the JSONB', async () => {
        const mapped = mapTeamSettings({
            age_division: '12U',
            settings: { fieldPlayers: 9, formation: '3-3-2', ageDivision: '10U' }
        });

        expect(mapped).toEqual({ ageDivision: '12U', fieldPlayers: 9, formation: '3-3-2' });
    });

    test('a team nobody has set up yet still names its division', async () => {
        expect(mapTeamSettings({ age_division: '14U', settings: {} }))
            .toEqual({ ageDivision: '14U' });
    });

    test('a settings column that is not an object is ignored rather than spread', async () => {
        expect(mapTeamSettings({ age_division: '10U', settings: null }))
            .toEqual({ ageDivision: '10U' });
        expect(mapTeamSettings({ age_division: '10U', settings: [1, 2] }))
            .toEqual({ ageDivision: '10U' });
    });
});

describe('validateTeamSettings', () => {
    test('a body may change one field without naming the rest', () => {
        expect(validateTeamSettings({ formation: '3-2-1' })).toBeNull();
    });

    test('a field size nobody could field is refused', () => {
        expect(validateTeamSettings({ fieldPlayers: 25 })).toMatch(/between 3 and 11/);
        expect(validateTeamSettings({ fieldPlayers: 7.5 })).toMatch(/between 3 and 11/);
    });

    test('quarters outside a game are refused', () => {
        expect(validateTeamSettings({ quarters: 0 })).toMatch(/between 1 and 8/);
    });

    test('a formation is a name, so a custom one passes', () => {
        expect(validateTeamSettings({ formation: 'Maya\'s Diamond' })).toBeNull();
        expect(validateTeamSettings({ formation: '' })).toMatch(/Formation/);
        expect(validateTeamSettings({ formation: 'x'.repeat(65) })).toMatch(/Formation/);
    });

    test('the division is checked for shape, not against a list of divisions', () => {
        expect(validateTeamSettings({ ageDivision: '8U' })).toBeNull();
        expect(validateTeamSettings({ ageDivision: 42 })).toMatch(/Age division/);
    });

    test('anything that is not an object at all is refused', () => {
        expect(validateTeamSettings(null)).toMatch(/settings object/);
        expect(validateTeamSettings([])).toMatch(/settings object/);
    });
});

describe('team settings routes', () => {
    test('reading them requires team membership', async () => {
        query.mockResolvedValue(rows());

        const res = await request(buildApp(settingsRoutes, ALICE))
            .get('/api/teams/team-1/settings');

        expect(res.status).toBe(403);
    });

    test('a viewer may read how the team plays', async () => {
        query.mockResolvedValueOnce(rows({ role: 'viewer' }));
        query.mockResolvedValueOnce(rows({
            age_division: '12U',
            settings: { fieldPlayers: 9, formation: '3-3-2', quarters: 4 }
        }));

        const res = await request(buildApp(settingsRoutes, ALICE))
            .get('/api/teams/team-1/settings');

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
            ageDivision: '12U', fieldPlayers: 9, formation: '3-3-2', quarters: 4
        });
    });

    test('a viewer may not change how the team plays', async () => {
        memberOfTeamAs('viewer');

        const res = await request(buildApp(settingsRoutes, ALICE))
            .put('/api/teams/team-1/settings')
            .send({ formation: '3-2-1' });

        expect(res.status).toBe(403);
    });

    test('a coach may, since they already write the roster it shapes', async () => {
        query.mockResolvedValueOnce(rows({ role: 'coach' }));
        query.mockResolvedValueOnce(rows({
            age_division: '12U',
            settings: { fieldPlayers: 9, formation: '3-2-3' }
        }));

        const res = await request(buildApp(settingsRoutes, ALICE))
            .put('/api/teams/team-1/settings')
            .send({ ageDivision: '12U', fieldPlayers: 9, formation: '3-2-3' });

        expect(res.status).toBe(200);
        expect(res.body.data.formation).toBe('3-2-3');
    });

    test('the division is written to its column and kept out of the JSONB', async () => {
        query.mockResolvedValueOnce(rows({ role: 'coach' }));
        query.mockResolvedValueOnce(rows({ age_division: '12U', settings: { fieldPlayers: 9 } }));

        await request(buildApp(settingsRoutes, ALICE))
            .put('/api/teams/team-1/settings')
            .send({ ageDivision: '12U', fieldPlayers: 9 });

        const [sql, params] = query.mock.calls[1];
        expect(sql).toMatch(/age_division = COALESCE/);
        expect(JSON.parse(params[1])).toEqual({ fieldPlayers: 9 });
        expect(params[2]).toBe('12U');
    });

    test('a write merges rather than replacing, so a partial body keeps the rest', async () => {
        query.mockResolvedValueOnce(rows({ role: 'coach' }));
        query.mockResolvedValueOnce(rows({ age_division: '10U', settings: {} }));

        await request(buildApp(settingsRoutes, ALICE))
            .put('/api/teams/team-1/settings')
            .send({ formation: '3-2-1' });

        expect(query.mock.calls[1][0]).toMatch(/settings \|\| \$2::jsonb/);
    });

    test('the roster version is left alone, so a formation change cannot reject a roster edit', async () => {
        query.mockResolvedValueOnce(rows({ role: 'coach' }));
        query.mockResolvedValueOnce(rows({ age_division: '10U', settings: {} }));

        await request(buildApp(settingsRoutes, ALICE))
            .put('/api/teams/team-1/settings')
            .send({ formation: '3-2-1' });

        expect(query.mock.calls[1][0]).not.toMatch(/roster_version/);
    });

    test('a bad payload is refused before it reaches the database', async () => {
        memberOfTeamAs('coach');

        const res = await request(buildApp(settingsRoutes, ALICE))
            .put('/api/teams/team-1/settings')
            .send({ fieldPlayers: 40 });

        expect(res.status).toBe(400);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('a team that has since been deleted answers 404, not a 500', async () => {
        query.mockResolvedValueOnce(rows({ role: 'coach' }));
        query.mockResolvedValueOnce(rows());

        const res = await request(buildApp(settingsRoutes, ALICE))
            .put('/api/teams/team-1/settings')
            .send({ formation: '3-2-1' });

        expect(res.status).toBe(404);
    });
});
