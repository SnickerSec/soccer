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
/** What each roster write was given, so a replayed entry's version is visible. */
let rosterWrites = [];
/** What the server does with a write. Reassigned by the tests that need it to fail. */
let rosterResult;
let gameResult;

jest.unstable_mockModule('../src/modules/storage.js', () => ({
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

jest.unstable_mockModule('../src/modules/api-client.js', () => ({
    isAuthenticated: async () => true
}));

jest.unstable_mockModule('../src/modules/auth.js', () => ({
    getCurrentUser: async () => ({ id: 'user-1', email: 'coach@example.com' }),
    getUserSettings: async () => ({ default_team_id: 'team-1' }),
    updateUserSettings: async () => ({ success: true })
}));

jest.unstable_mockModule('../src/modules/cloud-storage.js', () => ({
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
    replaceRoster: async (teamId, players, expectedVersion, renames) => {
        calls.push(`push:replaceRoster:${players.map(p => p.name).join(',')}`);
        rosterWrites.push({ players, expectedVersion, renames });
        return rosterResult(players);
    },
    saveGame: async (teamId, game) => {
        calls.push(`push:saveGame:${game.name}`);
        return gameResult(game);
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
    return import('../src/modules/sync.js');
}

let initSync;
let processQueue;
let pushGame;

/** Queue entries as pushPlayers/pushGame would have written them offline. */
function queueOfflineRosterEdit(players) {
    store['ayso_sync_queue'] = JSON.stringify([
        { entityType: 'players', action: 'bulk_update', data: players, timestamp: 1 }
    ]);
}

/** Whatever the caller wants queued, as processQueue will read it back. */
function queueEntries(...entries) {
    store['ayso_sync_queue'] = JSON.stringify(entries);
}

const queuedRoster = (players, context = {}) =>
    ({ entityType: 'players', action: 'bulk_update', data: players, timestamp: 1, ...context });

const queuedGame = (game) =>
    ({ entityType: 'games', action: 'save', data: game, timestamp: 2 });

const remainingQueue = () => JSON.parse(store['ayso_sync_queue']);

/**
 * A signed-in session with a team selected, and nothing left queued.
 *
 * processQueue refuses to run without a team, and initSync is what picks one —
 * but it also drains, so the queue is filled after it rather than before.
 */
async function signInWithTeam() {
    await initSync();
    calls = [];
    rosterWrites = [];
    store['ayso_sync_queue'] = JSON.stringify([]);
}

beforeEach(async () => {
    calls = [];
    store = {};
    rosterWrites = [];
    rosterResult = (players) => ({ success: true, data: players, version: 2 });
    gameResult = (game) => ({ success: true, data: { ...game, id: 'cloud-1' } });
    // Set by a completed first sign-in; leaving it unset runs the migration path
    globalThis.localStorage = { getItem: () => 'completed', setItem: () => {} };
    globalThis.navigator = { onLine: true };
    ({ initSync, processQueue, pushGame } = await loadSync());
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

/**
 * What happens to an entry that cannot be replayed.
 *
 * The queue is the only copy of an edit made at the field: local storage holds
 * the roster, but the fact that it has not reached the server yet lives here
 * alone. So the rule is that an entry leaves the queue when, and only when, the
 * server has taken it.
 */
describe('processQueue and the entries it cannot replay', () => {
    beforeEach(signInWithTeam);

    test('a write the server refuses stays queued for the next try', async () => {
        rosterResult = () => ({ success: false, error: 'Server error' });
        queueEntries(queuedRoster([{ name: 'Edited At The Field' }]));

        const result = await processQueue();

        expect(result.processed).toBe(0);
        expect(remainingQueue()).toHaveLength(1);
        expect(remainingQueue()[0].data).toEqual([{ name: 'Edited At The Field' }]);
    });

    test('a write that throws stays queued rather than taking the drain down', async () => {
        rosterResult = () => { throw new Error('Network down mid-flight'); };
        queueEntries(queuedRoster([{ name: 'Edited At The Field' }]), queuedGame({ name: 'Game 1' }));

        const result = await processQueue();

        // The game after it still went out
        expect(result.processed).toBe(1);
        expect(calls).toContain('push:saveGame:Game 1');
        expect(remainingQueue()).toHaveLength(1);
        expect(remainingQueue()[0].entityType).toBe('players');
    });

    test('the ones that landed are dropped and the one that did not is kept', async () => {
        gameResult = (game) => ({ success: game.name !== 'Game 2' });
        queueEntries(
            queuedGame({ name: 'Game 1' }),
            queuedGame({ name: 'Game 2' }),
            queuedGame({ name: 'Game 3' })
        );

        const result = await processQueue();

        expect(result.processed).toBe(2);
        expect(remainingQueue().map(item => item.data.name)).toEqual(['Game 2']);
    });

    test('an entry this build has no branch for is kept, not silently dropped', async () => {
        // A fixture queued by a newer build, or a type added to queueChange and
        // forgotten here: falling through both branches used to discard it
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        queueEntries({ entityType: 'fixtures', action: 'save', data: { opponent: 'Rovers' }, timestamp: 3 });

        const result = await processQueue();

        expect(result.processed).toBe(0);
        expect(calls).toEqual([]);
        expect(remainingQueue()).toHaveLength(1);
        expect(remainingQueue()[0].data).toEqual({ opponent: 'Rovers' });
        warn.mockRestore();
    });
});

/**
 * The version a replayed roster carries.
 *
 * A queue entry records the version it was built on so the replay can be merged
 * against whatever happened in between. Entries written before that existed
 * have none, and have to keep writing unconditionally: refusing them would
 * strand edits that are already queued when a coach's app updates.
 */
describe('processQueue and roster versions', () => {
    beforeEach(signInWithTeam);

    test('replays an entry against the version it was built on', async () => {
        queueEntries(queuedRoster([{ name: 'Ana' }], {
            expectedVersion: 7,
            base: [{ name: 'Ana' }],
            renames: [{ from: 'Anna', to: 'Ana' }]
        }));

        await processQueue();

        expect(rosterWrites).toHaveLength(1);
        expect(rosterWrites[0].expectedVersion).toBe(7);
        expect(rosterWrites[0].renames).toEqual([{ from: 'Anna', to: 'Ana' }]);
    });

    test('an entry from before versions existed writes unconditionally', async () => {
        queueEntries(queuedRoster([{ name: 'Ana' }]));

        const result = await processQueue();

        expect(result.processed).toBe(1);
        expect(rosterWrites[0].expectedVersion).toBeUndefined();
        expect(remainingQueue()).toEqual([]);
    });
});

/**
 * pushGame writes locally first, then either sends or queues.
 *
 * The local write is what makes the app usable with no signal; the queue is
 * what gets the game to the other coaches once there is one.
 */
describe('pushGame', () => {
    beforeEach(signInWithTeam);

    test('offline, the game is saved locally and queued', async () => {
        globalThis.navigator = { onLine: false };

        const result = await pushGame({ id: 'local-1', name: 'vs Rovers' });

        expect(result).toEqual({ success: true, queued: true });
        expect(calls).toEqual([]);
        expect(JSON.parse(store['ayso_lineup_history'])).toEqual([
            { id: 'local-1', name: 'vs Rovers' }
        ]);
        expect(remainingQueue()).toHaveLength(1);
        expect(remainingQueue()[0].entityType).toBe('games');
    });

    test('online, the server copy replaces the local one, id and all', async () => {
        const result = await pushGame({ id: 'local-1', name: 'vs Rovers' });

        expect(result.success).toBe(true);
        expect(calls).toEqual(['push:saveGame:vs Rovers']);
        // The cloud id is what a later update or delete is addressed to
        expect(JSON.parse(store['ayso_lineup_history'])).toEqual([
            { id: 'cloud-1', name: 'vs Rovers' }
        ]);
        expect(remainingQueue()).toEqual([]);
    });

    test('a game the server refuses is still the local copy', async () => {
        gameResult = () => ({ success: false, error: 'Server error' });

        const result = await pushGame({ id: 'local-1', name: 'vs Rovers' });

        expect(result.success).toBe(false);
        expect(JSON.parse(store['ayso_lineup_history'])).toEqual([
            { id: 'local-1', name: 'vs Rovers' }
        ]);
    });
});
