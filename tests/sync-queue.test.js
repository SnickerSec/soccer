/**
 * The offline queue drains before the cloud pull overwrites local storage.
 *
 * sync() replaces ayso_players / ayso_lineup_history with the server's copy
 * outright. Pulling before pushing therefore discards edits made at the field:
 * the roster they were queued against is gone, and the queue entries sit in
 * localStorage unnoticed.
 *
 * processQueue() used to run only from the 'online' event, which fires on a
 * transition — so an app reopened on wifi never saw one and never drained.
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';

/** Order-sensitive log of what reached the network, in the order it did. */
let calls = [];
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
    getCurrentUser: async () => ({ id: 'user-1', email: 'coach@example.com' }),
    getUserSettings: async () => ({ default_team_id: 'team-1' }),
    updateUserSettings: async () => ({ success: true })
}));

jest.unstable_mockModule('../public/modules/cloud-storage.js', () => ({
    getTeams: async () => ({ success: true, data: [] }),
    createTeam: async () => ({ success: true, data: { id: 'team-1' } }),
    getPlayers: async () => {
        calls.push('pull:getPlayers');
        return { success: true, data: [{ name: 'Server Roster' }] };
    },
    getGames: async () => {
        calls.push('pull:getGames');
        return { success: true, data: [] };
    },
    replaceRoster: async (teamId, players) => {
        calls.push(`push:replaceRoster:${players.map(p => p.name).join(',')}`);
        return { success: true };
    },
    saveGame: async (teamId, game) => {
        calls.push(`push:saveGame:${game.name}`);
        return { success: true };
    },
    bulkImportGames: async () => ({ success: true })
}));

/**
 * A fresh copy of the module per test. sync.js keeps currentTeamId and the
 * status at module level, so a shared import would let an initSync in one test
 * satisfy the "no team selected" guard in another.
 */
async function loadSync() {
    jest.resetModules();
    return import('../public/modules/sync.js');
}

let initSync;
let processQueue;

/** Queue entries as pushPlayers/pushGame would have written them offline. */
function queueOfflineRosterEdit(players) {
    store['ayso_sync_queue'] = JSON.stringify([
        { entityType: 'players', action: 'bulk_update', data: players, timestamp: 1 }
    ]);
}

beforeEach(async () => {
    calls = [];
    store = {};
    // Set by a completed first sign-in; leaving it unset runs the migration path
    globalThis.localStorage = { getItem: () => 'completed', setItem: () => {} };
    globalThis.navigator = { onLine: true };
    ({ initSync, processQueue } = await loadSync());
});

describe('initSync', () => {
    test('pushes queued offline edits before pulling from the cloud', async () => {
        queueOfflineRosterEdit([{ name: 'Edited At The Field' }]);

        await initSync();

        expect(calls).toEqual([
            'push:replaceRoster:Edited At The Field',
            'pull:getPlayers',
            'pull:getGames'
        ]);
    });

    test('the queued roster reaches the server rather than being overwritten', async () => {
        queueOfflineRosterEdit([{ name: 'Edited At The Field' }]);

        await initSync();

        expect(calls).toContain('push:replaceRoster:Edited At The Field');
        // Drained, not left behind for an 'online' event that may never fire
        expect(JSON.parse(store['ayso_sync_queue'])).toEqual([]);
    });

    test('still pulls when there is nothing queued', async () => {
        await initSync();

        expect(calls).toEqual(['pull:getPlayers', 'pull:getGames']);
    });

    test('the pull lands after the push, so local storage ends up current', async () => {
        queueOfflineRosterEdit([{ name: 'Edited At The Field' }]);

        await initSync();

        expect(JSON.parse(store['ayso_players'])).toEqual([{ name: 'Server Roster' }]);
    });
});

describe('processQueue', () => {
    test('keeps the queue when offline rather than dropping it', async () => {
        globalThis.navigator = { onLine: false };
        queueOfflineRosterEdit([{ name: 'Edited At The Field' }]);

        const result = await processQueue();

        expect(result.processed).toBe(0);
        expect(JSON.parse(store['ayso_sync_queue'])).toHaveLength(1);
    });

    test('keeps the queue when no team is selected, since a push needs one', async () => {
        // No initSync, so currentTeamId is still null
        queueOfflineRosterEdit([{ name: 'Edited At The Field' }]);

        const result = await processQueue();

        expect(result.processed).toBe(0);
        expect(calls).toEqual([]);
        expect(JSON.parse(store['ayso_sync_queue'])).toHaveLength(1);
    });

    test('reports nothing to do on an empty queue', async () => {
        const result = await processQueue();

        expect(result).toEqual({ success: true, processed: 0 });
    });
});
