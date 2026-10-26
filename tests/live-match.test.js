/**
 * The match in progress, kept on the device so a reload does not end it.
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';

let store = {};

jest.unstable_mockModule('../src/modules/storage.js', () => ({
    safeGetFromStorage: (key) => (key in store ? store[key] : null),
    safeSetToStorage: (key, value) => { store[key] = value; return true; },
    safeRemoveFromStorage: (key) => { delete store[key]; return true; },
    safeParseJSON: (raw, fallback) => {
        try {
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    },
}));

const { saveLiveMatch, loadLiveMatch, clearLiveMatch, hasStarted, LIVE_MATCH_TTL_MS } =
    await import('../src/modules/live-match.js');

const T0 = 1_700_000_000_000;

const match = (overrides = {}) => ({
    teamId: 'team-1',
    lineup: { quarters: [{ quarter: 1, positions: { Keeper: 'Ana' } }] },
    quarterMinutes: 12.5,
    activeQuarter: 1,
    clock: { running: false, endsAt: null, remainingMs: 750000 },
    clockStarted: false,
    homeScore: 0,
    awayScore: 0,
    events: [],
    ...overrides,
});

beforeEach(() => {
    store = {};
});

describe('the match in progress', () => {
    test('opening the dialog to look leaves nothing behind', () => {
        expect(hasStarted(match())).toBe(false);
        expect(saveLiveMatch(match(), T0)).toBe(false);
        expect(loadLiveMatch('team-1', T0)).toBeNull();
    });

    test('a started match comes back as it was', () => {
        const started = match({ clockStarted: true, homeScore: 2, activeQuarter: 3 });
        saveLiveMatch(started, T0);

        expect(loadLiveMatch('team-1', T0 + 60_000)).toMatchObject({
            homeScore: 2, activeQuarter: 3, clockStarted: true, savedAt: T0,
        });
    });

    test('a goal alone is enough to count as started', () => {
        expect(hasStarted(match({ events: [{ type: 'goal' }] }))).toBe(true);
        expect(hasStarted(match({ awayScore: 1 }))).toBe(true);
    });

    test('another team\'s match is not offered', () => {
        saveLiveMatch(match({ clockStarted: true }), T0);
        expect(loadLiveMatch('team-2', T0)).toBeNull();
    });

    test('signed out, the match belongs to no team and is found as such', () => {
        saveLiveMatch(match({ teamId: null, clockStarted: true }), T0);
        expect(loadLiveMatch(null, T0)).not.toBeNull();
        expect(loadLiveMatch(undefined, T0)).not.toBeNull();
    });

    test('an abandoned match lapses rather than coming back next weekend', () => {
        saveLiveMatch(match({ clockStarted: true }), T0);
        expect(loadLiveMatch('team-1', T0 + LIVE_MATCH_TTL_MS - 1)).not.toBeNull();
        expect(loadLiveMatch('team-1', T0 + LIVE_MATCH_TTL_MS + 1)).toBeNull();
    });

    test('a finished or discarded match is gone', () => {
        saveLiveMatch(match({ clockStarted: true }), T0);
        clearLiveMatch();
        expect(loadLiveMatch('team-1', T0)).toBeNull();
    });

    test('something that is not a match is ignored rather than opened', () => {
        store.shinguard_live_match = JSON.stringify({ teamId: 'team-1', savedAt: T0 });
        expect(loadLiveMatch('team-1', T0)).toBeNull();
        store.shinguard_live_match = 'not json';
        expect(loadLiveMatch('team-1', T0)).toBeNull();
    });
});
