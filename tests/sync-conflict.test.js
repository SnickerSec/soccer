/**
 * What the client does when the server rejects a roster save as stale.
 *
 * tests/integration/roster-conflict.test.js proves the server rejects the
 * write; this covers the half that decides whether the coach loses work —
 * whether the rejection is merged and retried, and what the caller is told
 * about players the merge could not settle on its own.
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';

/** Every replaceRoster call, in order, so a retry can be told from a first try. */
let writes = [];
/** Queued replies for replaceRoster, shifted one per call. */
let replies = [];
/** What the server hands back on a pull. */
let serverRoster = [];
let serverVersion = 1;
let store = {};

jest.unstable_mockModule('../public/modules/storage.js', () => ({
    safeGetFromStorage: (key) => (key in store ? store[key] : null),
    safeSetToStorage: (key, value) => { store[key] = value; },
    safeParseJSON: (raw, fallback) => {
        try {
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    },
    clearTeamScopedData: () => {}
}));

jest.unstable_mockModule('../public/modules/api-client.js', () => ({
    isAuthenticated: async () => true
}));

jest.unstable_mockModule('../public/modules/auth.js', () => ({
    getCurrentUser: async () => ({ id: 'user-1' }),
    getUserSettings: async () => ({ default_team_id: 'team-1' }),
    updateUserSettings: async () => ({ success: true })
}));

jest.unstable_mockModule('../public/modules/cloud-storage.js', () => ({
    getTeams: async () => ({ success: true, data: [] }),
    createTeam: async () => ({ success: true, data: { id: 'team-1' } }),
    getPlayers: async () => ({ success: true, data: serverRoster, version: serverVersion }),
    getGames: async () => ({ success: true, data: [] }),
    replaceRoster: async (teamId, players, expectedVersion) => {
        writes.push({ players, expectedVersion });
        return replies.shift() ?? { success: true, data: players, version: serverVersion + 1 };
    },
    saveGame: async () => ({ success: true }),
    bulkImportGames: async () => ({ success: true })
}));

async function loadSync() {
    jest.resetModules();
    return import('../public/modules/sync.js');
}

let initSync;
let pushPlayers;

const player = (name, overrides = {}) => ({
    name, number: null, isCaptain: false, mustRest: false, noKeeper: false,
    status: 'available', preferredPositions: [], sortOrder: 0,
    overallRating: null, positionalRatings: {}, ...overrides
});

const names = (roster) => roster.map(p => p.name).sort();

beforeEach(async () => {
    writes = [];
    replies = [];
    serverRoster = [player('Ana')];
    serverVersion = 4;
    store = {};
    globalThis.localStorage = { getItem: () => 'completed', setItem: () => {} };
    globalThis.navigator = { onLine: true };
    ({ initSync, pushPlayers } = await loadSync());
});

/** Signs in and pulls, so the client holds a version and a base snapshot. */
async function signedInWithRoster() {
    await initSync();
    writes = [];
}

describe('pushPlayers', () => {
    test('sends the version the roster was pulled at', async () => {
        await signedInWithRoster();

        await pushPlayers([player('Ana'), player('Ben')]);

        expect(writes[0].expectedVersion).toBe(4);
    });

    test('sends the new version on the next write, not the stale one', async () => {
        await signedInWithRoster();

        await pushPlayers([player('Ana'), player('Ben')]);
        await pushPlayers([player('Ana'), player('Ben'), player('Cleo')]);

        expect(writes[1].expectedVersion).toBe(5);
    });
});

describe('a rejected roster save', () => {
    /** The server rejects the first write, having gained `remote`. */
    function serverRejectsWith(remote, version = 9) {
        replies.push({
            success: false, conflict: true, version, data: remote,
            error: 'The roster changed since you loaded it'
        });
    }

    test('is retried against the roster that beat it', async () => {
        await signedInWithRoster();
        serverRejectsWith([player('Ana'), player('Cleo')]);

        await pushPlayers([player('Ana'), player('Ben')]);

        expect(writes).toHaveLength(2);
        expect(writes[1].expectedVersion).toBe(9);
    });

    test('keeps both coaches\' additions', async () => {
        await signedInWithRoster();
        serverRejectsWith([player('Ana'), player('Cleo')]);

        await pushPlayers([player('Ana'), player('Ben')]);

        expect(names(writes[1].players)).toEqual(['Ana', 'Ben', 'Cleo']);
    });

    test('reports the merge so the coach is not left thinking nothing happened', async () => {
        await signedInWithRoster();
        serverRejectsWith([player('Ana'), player('Cleo')]);

        const result = await pushPlayers([player('Ana'), player('Ben')]);

        expect(result.success).toBe(true);
        expect(result.merged).toBe(true);
        expect(result.conflicts).toEqual([]);
    });

    test('names the players it could not settle', async () => {
        await signedInWithRoster();
        // Both coaches gave Ana a different number
        serverRejectsWith([player('Ana', { number: 8 })]);

        const result = await pushPlayers([player('Ana', { number: 7 })]);

        expect(result.conflicts).toEqual(['Ana']);
    });

    test('is not retried a second time', async () => {
        await signedInWithRoster();
        serverRejectsWith([player('Ana'), player('Cleo')], 9);
        serverRejectsWith([player('Ana'), player('Dev')], 12);

        const result = await pushPlayers([player('Ana'), player('Ben')]);

        // A third writer is active; rebasing again would chase a moving roster
        expect(writes).toHaveLength(2);
        expect(result.success).toBe(false);
        expect(result.conflict).toBe(true);
    });

    test('leaves local storage holding what the server actually has', async () => {
        await signedInWithRoster();
        serverRejectsWith([player('Ana'), player('Cleo')], 9);
        serverRejectsWith([player('Ana'), player('Dev')], 12);

        await pushPlayers([player('Ana'), player('Ben')]);

        // Both retries failed, so the local copy must not keep claiming the
        // roster this coach wanted
        expect(names(JSON.parse(store['ayso_players']))).toEqual(['Ana', 'Cleo']);
    });

    test('adopts the saved roster locally after a successful merge', async () => {
        await signedInWithRoster();
        serverRejectsWith([player('Ana'), player('Cleo')]);

        await pushPlayers([player('Ana'), player('Ben')]);

        expect(names(JSON.parse(store['ayso_players']))).toEqual(['Ana', 'Ben', 'Cleo']);
    });

    test('the merged roster is what the next write builds on', async () => {
        await signedInWithRoster();
        serverRejectsWith([player('Ana'), player('Cleo')]);
        replies.push({ success: true, data: [player('Ana'), player('Ben'), player('Cleo')], version: 10 });

        await pushPlayers([player('Ana'), player('Ben')]);
        await pushPlayers([player('Ana')]);

        expect(writes[2].expectedVersion).toBe(10);
    });
});

describe('an offline edit replayed from the queue', () => {
    test('records the version it was built on rather than writing now', async () => {
        await signedInWithRoster();
        globalThis.navigator = { onLine: false };

        await pushPlayers([player('Ana'), player('Ben')]);

        expect(writes).toHaveLength(0);
        const [entry] = JSON.parse(store['ayso_sync_queue']);
        expect(entry.expectedVersion).toBe(4);
        expect(names(entry.base)).toEqual(['Ana']);
    });

    test('replays against that version, not unconditionally', async () => {
        await signedInWithRoster();
        globalThis.navigator = { onLine: false };
        await pushPlayers([player('Ana'), player('Ben')]);

        globalThis.navigator = { onLine: true };
        const { processQueue } = await import('../public/modules/sync.js');
        await processQueue();

        // Writing with no version would overwrite everything the other coach
        // did in the hours since the edit was made
        expect(writes[0].expectedVersion).toBe(4);
    });

    test('merges rather than clobbering when the roster moved on meanwhile', async () => {
        await signedInWithRoster();
        globalThis.navigator = { onLine: false };
        await pushPlayers([player('Ana'), player('Ben')]);

        globalThis.navigator = { onLine: true };
        replies.push({
            success: false, conflict: true, version: 9,
            data: [player('Ana'), player('Cleo')]
        });

        const { processQueue } = await import('../public/modules/sync.js');
        const result = await processQueue();

        expect(names(writes[1].players)).toEqual(['Ana', 'Ben', 'Cleo']);
        expect(result.processed).toBe(1);
    });

    test('an entry queued before versions existed still writes', async () => {
        await signedInWithRoster();
        // As an older build of this code would have recorded it
        store['ayso_sync_queue'] = JSON.stringify([
            { entityType: 'players', action: 'bulk_update', data: [player('Ana')], timestamp: 1 }
        ]);

        const { processQueue } = await import('../public/modules/sync.js');
        const result = await processQueue();

        expect(writes[0].expectedVersion).toBeUndefined();
        expect(result.processed).toBe(1);
    });
});
