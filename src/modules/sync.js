/**
 * Sync Engine Module
 * Handles offline-first synchronization between localStorage and the server
 */

import { isAuthenticated } from './api-client.js';
import { getCurrentUser, getUserSettings, updateUserSettings } from './auth.js';
import {
    getTeams, createTeam, getPlayers, replaceRoster,
    getGames, saveGame, updateGame, deleteGame, bulkImportGames,
    getFixtures, saveFixture, updateFixture, deleteFixture, bulkImportFixtures,
    getTeamSettings, saveTeamSettings
} from './cloud-storage.js';
import { safeGetFromStorage, safeSetToStorage, safeParseJSON } from './storage.js';
import { mergeRosters } from './roster-merge.js';
import { surviveMerge } from './player-rename.js';
import { normalizeSettings, sameSettings, DEFAULT_SETTINGS } from './team-settings.js';

// Sync status enum
export const SYNC_STATUS = {
    IDLE: 'idle',
    SYNCING: 'syncing',
    SYNCED: 'synced',
    ERROR: 'error',
    OFFLINE: 'offline'
};

// Sync engine state
let syncStatus = SYNC_STATUS.OFFLINE;
let currentTeamId = null;
let lastSyncTime = null;
let syncListeners = [];

/**
 * The roster version last read from the server, and the roster as it was at
 * that version.
 *
 * Both are needed to resolve a rejected write: the version says what the write
 * was built on, and the snapshot is the merge's `base` — without it there is no
 * way to tell a player this coach removed from one the other coach added.
 *
 * Kept in memory rather than localStorage: after a reload the roster is pulled
 * fresh anyway, and a base that outlived its pull would be worse than none.
 */
let rosterVersion = null;
let rosterBase = null;

/** Records what a pull returned, as the reference for the next write. */
function rememberRoster(players, version) {
    rosterBase = JSON.parse(JSON.stringify(players || []));
    rosterVersion = version ?? null;
}

/**
 * Initialize the sync engine
 * @param {Function} onStatusChange - Callback for sync status changes
 * @returns {Promise<{authenticated: boolean, teamId?: string}>}
 */
export async function initSync(onStatusChange) {
    if (onStatusChange) {
        syncListeners.push(onStatusChange);
    }

    const authenticated = await isAuthenticated();
    if (!authenticated) {
        updateStatus(SYNC_STATUS.OFFLINE);
        return { authenticated: false };
    }

    // Get user settings to find default team
    const settings = await getUserSettings();
    if (settings?.default_team_id) {
        currentTeamId = settings.default_team_id;
    }

    // Check for migration needs
    const migrationStatus = localStorage.getItem('ayso_migration_status');
    if (migrationStatus !== 'completed') {
        await migrateLocalDataToCloud();
    }

    // Drain anything queued while offline BEFORE pulling. sync() overwrites
    // local storage with the server's copy, so pulling first would replace the
    // roster the queued edits were made against and strand them.
    //
    // This has to happen at startup and not only in the 'online' handler: that
    // event fires on a transition, so an app reopened on wifi never sees one,
    // and edits made at the field in an earlier session sat in the queue
    // forever while the local roster silently reverted.
    await processQueue();

    // Initial sync
    await sync();

    return {
        authenticated: true,
        teamId: currentTeamId
    };
}

/**
 * Update sync status and notify listeners
 */
function updateStatus(status, extra = {}) {
    syncStatus = status;
    syncListeners.forEach(listener => {
        try {
            listener(status, { teamId: currentTeamId, lastSync: lastSyncTime, ...extra });
        } catch (error) {
            console.error('Sync listener error:', error);
        }
    });
}

/**
 * Add a sync status listener
 */
export function addSyncListener(listener) {
    syncListeners.push(listener);
}

/**
 * Remove a sync status listener
 */
export function removeSyncListener(listener) {
    syncListeners = syncListeners.filter(l => l !== listener);
}

/**
 * Get current sync status
 */
export function getSyncStatus() {
    return syncStatus;
}

/**
 * Get current team ID
 */
export function getCurrentTeamId() {
    return currentTeamId;
}

/**
 * Set current team and sync
 */
export async function setCurrentTeam(teamId) {
    currentTeamId = teamId;

    // The snapshot describes the team being left; carrying it over would make
    // the next write claim another team's version.
    rosterBase = null;
    rosterVersion = null;

    // Save as default team
    await updateUserSettings({ default_team_id: teamId });

    // Sync with new team
    return await sync();
}

/**
 * Perform a full sync with the cloud
 */
export async function sync() {
    if (!currentTeamId) {
        updateStatus(SYNC_STATUS.OFFLINE);
        return { success: false, error: 'No team selected' };
    }

    if (!navigator.onLine) {
        updateStatus(SYNC_STATUS.OFFLINE);
        return { success: false, error: 'Offline' };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        // Pull data from cloud
        const [playersResult, gamesResult, fixturesResult, settingsResult] = await Promise.all([
            getPlayers(currentTeamId),
            getGames(currentTeamId),
            getFixtures(currentTeamId),
            getTeamSettings(currentTeamId)
        ]);

        if (!playersResult.success || !gamesResult.success) {
            updateStatus(SYNC_STATUS.ERROR);
            return {
                success: false,
                error: playersResult.error || gamesResult.error
            };
        }

        // Update local storage with cloud data
        safeSetToStorage('ayso_players', JSON.stringify(playersResult.data));
        safeSetToStorage('ayso_lineup_history', JSON.stringify(gamesResult.data));

        // The schedule is pulled with the rest so a match another coach added —
        // or cancelled — arrives on an ordinary sync. It used to be fetched
        // only when the team was switched, and only adopted when the server
        // had at least one match, so a deletion made on another device could
        // never reach this one: the match came back every time.
        //
        // The server's list replaces the local one outright, as history does.
        // Anything on the device that the cloud has not got is therefore gone,
        // which is why migrateLocalDataToCloud uploads the schedule a coach
        // built before they signed in.
        let fixtures;
        if (fixturesResult.success && Array.isArray(fixturesResult.data)) {
            fixtures = fixturesResult.data;
            writeLocalFixtures(fixtures);
        } else {
            // Not fatal: the roster and the season history are what the app is
            // for, and refusing to sync them because the schedule failed would
            // be the worse trade. The local schedule stands until the next try.
            console.warn('Sync: could not pull the schedule:', fixturesResult.error);
        }

        // How this team plays, which used to be whatever this device happened
        // to have been set to. Normalized on the way in: it may name a custom
        // formation only the coach who made it has.
        let settings;
        if (settingsResult.success && settingsResult.data) {
            settings = normalizeSettings(settingsResult.data);
            writeLocalSettings(settings);
        } else if (!settingsResult.success) {
            // Not fatal, for the same reason the schedule is not: the roster
            // and the season history are what the app is for.
            console.warn('Sync: could not pull the team settings:', settingsResult.error);
        }

        // What the next write will claim to be built on
        rememberRoster(playersResult.data, playersResult.version);

        lastSyncTime = new Date();
        // `pulled` tells a listener that local storage now holds the server's
        // copy rather than the screen's — the app reloads the schedule from it.
        // A push reports SYNCED too, and re-reading on one of those would race
        // the state that is being pushed.
        updateStatus(SYNC_STATUS.SYNCED, { pulled: true });

        return {
            success: true,
            players: playersResult.data,
            games: gamesResult.data,
            fixtures,
            settings
        };
    } catch (error) {
        console.error('Sync error:', error);
        updateStatus(SYNC_STATUS.ERROR);
        return { success: false, error: error.message };
    }
}

/**
 * Push local players to cloud
 */
export async function pushPlayers(players, { renames } = {}) {
    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    // Always save locally first (offline-first)
    safeSetToStorage('ayso_players', JSON.stringify(players));

    if (!navigator.onLine || !await isAuthenticated()) {
        // Queue for later sync. The renames travel with the roster that
        // carries the new names, so replaying the entry still moves the
        // player's saved games with them however much later that happens.
        queueChange('players', 'bulk_update', players, {
            expectedVersion: rosterVersion,
            base: rosterBase,
            renames
        });
        return { success: true, queued: true };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        return await writeRoster(players, {
            expectedVersion: rosterVersion,
            base: rosterBase,
            renames
        });
    } catch (error) {
        updateStatus(SYNC_STATUS.ERROR);
        return { success: false, error: error.message };
    }
}

/**
 * Writes a roster, merging and retrying once if another coach got there first.
 *
 * Shared by a live save and by an offline edit replayed from the queue, because
 * the queued one is the more dangerous of the two: it was built against a
 * roster that may be hours old, so applying it unconditionally would overwrite
 * everything done since.
 *
 * `expectedVersion` is what the write was built on, `base` the roster at that
 * version. Both come from the caller rather than module state so a queue entry
 * can supply the pair it recorded rather than whatever is current now.
 *
 * Retried once only: a second rejection means a third writer is active, and
 * looping would keep rebasing on a roster that keeps moving.
 */
async function writeRoster(players, { expectedVersion, base, renames }) {
    // One atomic replace. Doing this as a delete followed by an upload left
    // the roster empty if the second request never landed.
    const result = await replaceRoster(currentTeamId, players, expectedVersion, renames);

    if (!result.conflict) {
        if (!result.success) {
            updateStatus(SYNC_STATUS.ERROR);
            return result;
        }

        rememberRoster(result.data, result.version);
        safeSetToStorage('ayso_players', JSON.stringify(result.data));

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);
        return { success: true, data: result.data };
    }

    // `conflicts` names players both coaches edited differently. Those are
    // reported rather than settled — the merge keeps the other coach's value,
    // so the save is safe either way, but the caller should say so rather than
    // let an edit vanish without a word.
    const { merged, conflicts } = mergeRosters({
        base,
        local: players,
        remote: result.data
    });

    // The first attempt was rolled back, so nothing was renamed yet and the
    // retry has to carry the renames again — but only those the merge actually
    // kept. See surviveMerge.
    const { renames: keptRenames, roster, dropped } = surviveMerge(merged, renames);

    const retry = await replaceRoster(currentTeamId, roster, result.version, keptRenames);

    if (!retry.success) {
        // Includes a second conflict: hand back the server's roster so the
        // caller can show what is actually there rather than a stale local one.
        rememberRoster(result.data, result.version);
        safeSetToStorage('ayso_players', JSON.stringify(result.data));
        updateStatus(SYNC_STATUS.ERROR);
        return {
            success: false,
            conflict: true,
            error: 'The roster was changed by someone else while saving',
            data: result.data
        };
    }

    rememberRoster(retry.data, retry.version);
    safeSetToStorage('ayso_players', JSON.stringify(retry.data));

    lastSyncTime = new Date();
    updateStatus(SYNC_STATUS.SYNCED);

    return {
        success: true,
        merged: true,
        // Deduplicated: an abandoned rename is usually also a merge conflict on
        // the same player, and naming them twice reads as two separate losses.
        conflicts: [...new Set([...conflicts, ...dropped])],
        data: retry.data
    };
}

/**
 * Push a saved game to cloud
 */
/** The game history as it stands on this device. */
function readLocalGames() {
    return safeParseJSON(safeGetFromStorage('ayso_lineup_history'), []);
}

function writeLocalGames(games) {
    safeSetToStorage('ayso_lineup_history', JSON.stringify(games));
}

/**
 * Folds an edit into a record that is still queued for creation, if it is.
 *
 * A game saved at the field and edited before the signal came back has never
 * been seen by the server, so there is no row to PUT to: the edit belongs in
 * the creation that has yet to replay. Returns whether it found one. A match
 * added to the schedule offline and then rescheduled is the same story.
 */
function editQueuedSave(entityType, id, updates) {
    const queue = safeParseJSON(safeGetFromStorage('ayso_sync_queue'), []);
    const entry = queue.find(item =>
        item.entityType === entityType && item.action === 'save' && item.data?.id === id
    );
    if (!entry) return false;

    entry.data = { ...entry.data, ...updates };
    safeSetToStorage('ayso_sync_queue', JSON.stringify(queue));
    return true;
}

/**
 * Drops a queued creation for a record that has since been deleted.
 *
 * Replaying it would create the game in the cloud seconds before the delete
 * removed it again — or, if the delete could not be queued against an id the
 * server never issued, leave it there for good.
 */
function dropQueuedSave(entityType, id) {
    const queue = safeParseJSON(safeGetFromStorage('ayso_sync_queue'), []);
    const remaining = queue.filter(item => !(
        item.entityType === entityType && item.data?.id === id
    ));
    if (remaining.length === queue.length) return false;

    safeSetToStorage('ayso_sync_queue', JSON.stringify(remaining));
    return true;
}

export async function pushGame(game) {
    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    // Save locally first
    const localGames = readLocalGames();
    const existingIndex = localGames.findIndex(g => g.id === game.id);
    if (existingIndex >= 0) {
        localGames[existingIndex] = game;
    } else {
        localGames.unshift(game);
    }
    writeLocalGames(localGames);

    if (!navigator.onLine || !await isAuthenticated()) {
        queueChange('games', 'save', game);
        return { success: true, queued: true };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        const result = await saveGame(currentTeamId, game);

        if (!result.success) {
            updateStatus(SYNC_STATUS.ERROR);
            return result;
        }

        // Update local with cloud ID
        const updatedGames = readLocalGames();
        const idx = updatedGames.findIndex(g => g.id === game.id || g.name === game.name);
        if (idx >= 0) {
            updatedGames[idx] = result.data;
            writeLocalGames(updatedGames);
        }

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);
        return result;
    } catch (error) {
        updateStatus(SYNC_STATUS.ERROR);
        return { success: false, error: error.message };
    }
}

/**
 * Change a saved game — its notes, its name, its date — everywhere it is kept.
 *
 * The edit used to be made in React state and localStorage only, which the
 * next sync() overwrote with the server's copy: a coach's match notes survived
 * until the app next pulled, and no one else ever saw them.
 */
export async function pushGameUpdate(gameId, updates) {
    const games = readLocalGames();
    const index = games.findIndex(g => g.id === gameId);
    if (index >= 0) {
        games[index] = { ...games[index], ...updates };
        writeLocalGames(games);
    }

    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    if (editQueuedSave('games', gameId, updates)) {
        return { success: true, queued: true };
    }

    if (!navigator.onLine || !await isAuthenticated()) {
        queueChange('games', 'update', { id: gameId, updates });
        return { success: true, queued: true };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        const result = await updateGame(gameId, updates);
        if (!result.success) {
            // Queued rather than dropped: the edit is already on the device,
            // and the coach was told it was saved.
            queueChange('games', 'update', { id: gameId, updates });
            updateStatus(SYNC_STATUS.ERROR);
            return result;
        }

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);
        return result;
    } catch (error) {
        queueChange('games', 'update', { id: gameId, updates });
        updateStatus(SYNC_STATUS.ERROR);
        return { success: false, error: error.message };
    }
}

/**
 * Delete a saved game from the device and the cloud.
 *
 * The delete only ever reached the device: the call was made with the team id
 * where the game id belongs, so the server was asked for a game that does not
 * exist and answered 404 into an empty catch. The row stayed, and the next
 * sync() — which replaces local history with the server's list — brought the
 * deleted game back.
 */
export async function pushGameDelete(gameId) {
    writeLocalGames(readLocalGames().filter(g => g.id !== gameId));

    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    // Never created up there: dropping the queued creation is the whole job.
    if (dropQueuedSave('games', gameId)) {
        return { success: true, queued: false };
    }

    if (!navigator.onLine || !await isAuthenticated()) {
        queueChange('games', 'delete', { id: gameId });
        return { success: true, queued: true };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        const result = await deleteGame(gameId);
        if (!result.success && result.status !== 404) {
            queueChange('games', 'delete', { id: gameId });
            updateStatus(SYNC_STATUS.ERROR);
            return result;
        }

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);
        return { success: true };
    } catch (error) {
        queueChange('games', 'delete', { id: gameId });
        updateStatus(SYNC_STATUS.ERROR);
        return { success: false, error: error.message };
    }
}

/** The match schedule as it stands on this device. */
function readLocalFixtures() {
    return safeParseJSON(safeGetFromStorage('ayso_schedule_fixtures'), []);
}

function writeLocalFixtures(fixtures) {
    safeSetToStorage('ayso_schedule_fixtures', JSON.stringify(fixtures));
}

/**
 * Push a fixture to cloud, or queue it until there is a connection.
 *
 * Unlike pushGame there is no local write here: App holds the schedule in
 * state and persists it to localStorage on every change, so the match is
 * already safe on the device by the time this is called. What was missing was
 * the other half — with no signal the write simply failed, and a match added
 * on the touchline never reached the coaches who were not there.
 */
export async function pushFixture(fixture) {
    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    if (!navigator.onLine || !await isAuthenticated()) {
        queueChange('fixtures', 'save', fixture);
        return { success: true, queued: true };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        const result = await saveFixture(currentTeamId, fixture);

        if (!result.success) {
            updateStatus(SYNC_STATUS.ERROR);
            return result;
        }

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);
        return result;
    } catch (error) {
        updateStatus(SYNC_STATUS.ERROR);
        return { success: false, error: error.message };
    }
}

/**
 * Change a match on the schedule — its time, its pitch, whose turn the snacks
 * are — everywhere it is kept.
 *
 * The edit went straight to the server inside a catch that only logged, so on
 * the touchline with no signal the coach was told the match had moved and no
 * one else ever heard. It is queued now, the way a game edit is.
 */
export async function pushFixtureUpdate(fixtureId, updates) {
    const fixtures = readLocalFixtures();
    const index = fixtures.findIndex(f => f.id === fixtureId);
    if (index >= 0) {
        fixtures[index] = { ...fixtures[index], ...updates };
        writeLocalFixtures(fixtures);
    }

    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    if (editQueuedSave('fixtures', fixtureId, updates)) {
        return { success: true, queued: true };
    }

    if (!navigator.onLine || !await isAuthenticated()) {
        queueChange('fixtures', 'update', { id: fixtureId, updates });
        return { success: true, queued: true };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        const result = await updateFixture(fixtureId, updates);
        if (!result.success) {
            // Queued rather than dropped: the edit is already on the device,
            // and the coach was told it was saved.
            queueChange('fixtures', 'update', { id: fixtureId, updates });
            updateStatus(SYNC_STATUS.ERROR);
            return result;
        }

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);
        return result;
    } catch (error) {
        queueChange('fixtures', 'update', { id: fixtureId, updates });
        updateStatus(SYNC_STATUS.ERROR);
        return { success: false, error: error.message };
    }
}

/**
 * Remove a match from the schedule, on the device and in the cloud.
 *
 * Now that sync() pulls the schedule and replaces the local copy with it, a
 * delete that never reached the server is not merely invisible to the other
 * coaches: the next pull hands the cancelled match straight back.
 */
export async function pushFixtureDelete(fixtureId) {
    writeLocalFixtures(readLocalFixtures().filter(f => f.id !== fixtureId));

    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    // Never created up there: dropping the queued creation is the whole job.
    if (dropQueuedSave('fixtures', fixtureId)) {
        return { success: true, queued: false };
    }

    if (!navigator.onLine || !await isAuthenticated()) {
        queueChange('fixtures', 'delete', { id: fixtureId });
        return { success: true, queued: true };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        const result = await deleteFixture(fixtureId);
        // A 404 is another coach having deleted it first, which is the outcome
        // this was asking for.
        if (!result.success && result.status !== 404) {
            queueChange('fixtures', 'delete', { id: fixtureId });
            updateStatus(SYNC_STATUS.ERROR);
            return result;
        }

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);
        return { success: true };
    } catch (error) {
        queueChange('fixtures', 'delete', { id: fixtureId });
        updateStatus(SYNC_STATUS.ERROR);
        return { success: false, error: error.message };
    }
}

function writeLocalSettings(settings) {
    safeSetToStorage('ayso_settings', JSON.stringify(settings));
}

/**
 * Change how the team plays, everywhere it is kept.
 *
 * The division, the field size and the formation lived on the device and
 * nowhere else, so a coach who set up 12U on the laptop and opened the app on
 * their phone at the field was handed 10U and a 7v7 formation — and the
 * assistant coach never saw either.
 *
 * Local first, then the server, then the queue with no signal, like a game or
 * a match. There is no merge and no version: these are four fields the whole
 * team shares, and the coach who changed one last is the one who meant it.
 */
export async function pushSettings(settings) {
    const next = normalizeSettings(settings);
    writeLocalSettings(next);

    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    if (!navigator.onLine || !await isAuthenticated()) {
        queueSettings(currentTeamId, next);
        return { success: true, queued: true };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        const result = await saveTeamSettings(currentTeamId, next);

        if (!result.success) {
            updateStatus(SYNC_STATUS.ERROR);
            return result;
        }

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);
        return result;
    } catch (error) {
        updateStatus(SYNC_STATUS.ERROR);
        return { success: false, error: error.message };
    }
}

/**
 * Queue how the team plays, replacing anything already queued for that team.
 *
 * Unlike a game or a match there is only ever one answer per team, and it is
 * sent whole rather than as a patch: five taps at the field with no signal are
 * one write, not five that replay in order to the same end.
 *
 * The team is stamped on the entry because this is the first thing every team
 * always has a value for. A replay that went to whichever team happened to be
 * open would not fail — it would quietly hand one side the other's formation.
 */
function queueSettings(teamId, settings) {
    const queue = safeParseJSON(safeGetFromStorage('ayso_sync_queue'), []);
    const remaining = queue.filter(item => !(
        item.entityType === 'settings' && (item.teamId || teamId) === teamId
    ));
    remaining.push({
        entityType: 'settings',
        action: 'update',
        teamId,
        data: settings,
        timestamp: Date.now()
    });
    safeSetToStorage('ayso_sync_queue', JSON.stringify(remaining));
}

/**
 * Swaps the id this device invented for the one the server issued, once a
 * queued match has replayed.
 */
function adoptFixtureId(localId, saved) {
    if (!localId || !saved?.id || saved.id === localId) return;

    const fixtures = readLocalFixtures();
    const index = fixtures.findIndex(f => f.id === localId);
    if (index < 0) return;

    fixtures[index] = { ...fixtures[index], ...saved };
    writeLocalFixtures(fixtures);
}

/**
 * Queue a change for later sync (when offline)
 */
function queueChange(entityType, action, data, context = {}) {
    const queue = safeParseJSON(safeGetFromStorage('ayso_sync_queue'), []);
    queue.push({
        entityType,
        action,
        data,
        // What the edit was built on, so a replay hours later can be merged
        // against whatever happened in between rather than overwriting it.
        // Absent on entries queued by an older version of this code.
        ...context,
        timestamp: Date.now()
    });
    safeSetToStorage('ayso_sync_queue', JSON.stringify(queue));
}

/**
 * Process queued changes when back online
 */
export async function processQueue() {
    const queue = safeParseJSON(safeGetFromStorage('ayso_sync_queue'), []);
    if (queue.length === 0) {
        return { success: true, processed: 0 };
    }

    if (!navigator.onLine || !await isAuthenticated()) {
        return { success: false, processed: 0 };
    }

    // Every queued action is scoped to a team. With none selected there is
    // nothing to push to, and draining now would discard the queue.
    if (!currentTeamId) {
        return { success: false, processed: 0 };
    }

    let processed = 0;
    const remaining = [];

    for (const item of queue) {
        try {
            if (item.entityType === 'players' && item.action === 'bulk_update') {
                // Through the same merge as a live save. An entry recorded
                // before this carried a version has expectedVersion undefined,
                // which writes unconditionally — the old behaviour, kept so an
                // upgrade does not strand what is already queued.
                const result = await writeRoster(item.data, {
                    expectedVersion: item.expectedVersion,
                    base: item.base,
                    renames: item.renames
                });
                if (result.success) {
                    processed++;
                } else {
                    remaining.push(item);
                }
            } else if (item.entityType === 'games' && item.action === 'save') {
                const result = await saveGame(currentTeamId, item.data);
                if (result.success) {
                    processed++;
                } else {
                    remaining.push(item);
                }
            } else if (item.entityType === 'games' && item.action === 'update') {
                const result = await updateGame(item.data.id, item.data.updates);
                // A 404 means the game has since been deleted, by this coach on
                // another device or by another coach. There is nothing left to
                // edit, so the entry is done rather than retried forever.
                if (result.success || result.status === 404) {
                    processed++;
                } else {
                    remaining.push(item);
                }
            } else if (item.entityType === 'games' && item.action === 'delete') {
                const result = await deleteGame(item.data.id);
                if (result.success || result.status === 404) {
                    processed++;
                } else {
                    remaining.push(item);
                }
            } else if (item.entityType === 'fixtures' && item.action === 'save') {
                const result = await saveFixture(currentTeamId, item.data);
                if (result.success) {
                    // The server issues the id, and the local copy still
                    // holds the one this device made up. Adopting
                    // the real one here is what lets a later edit or delete
                    // name a row the server has heard of — without it they
                    // 404, and the pull hands the match back.
                    adoptFixtureId(item.data?.id, result.data);
                    processed++;
                } else {
                    remaining.push(item);
                }
            } else if (item.entityType === 'fixtures' && item.action === 'update') {
                const result = await updateFixture(item.data.id, item.data.updates);
                // A 404 means the match has since been deleted, by this coach
                // on another device or by another coach. There is nothing left
                // to edit, so the entry is done rather than retried forever.
                if (result.success || result.status === 404) {
                    processed++;
                } else {
                    remaining.push(item);
                }
            } else if (item.entityType === 'fixtures' && item.action === 'delete') {
                const result = await deleteFixture(item.data.id);
                if (result.success || result.status === 404) {
                    processed++;
                } else {
                    remaining.push(item);
                }
            } else if (item.entityType === 'settings' && item.action === 'update') {
                // To the team the change was made against, not whichever one
                // is open now. An entry from a build that stamped no team is
                // replayed the old way rather than dropped.
                const result = await saveTeamSettings(item.teamId || currentTeamId, item.data);
                // 403 is a viewer, who cannot change how the team plays, and
                // 404 a team that has since been deleted. Neither improves by
                // being retried at every drain from here on.
                if (result.success || result.status === 403 || result.status === 404) {
                    processed++;
                } else {
                    remaining.push(item);
                }
            } else {
                // An entry this build has no branch for: queued by a newer one,
                // or a type added to queueChange and forgotten here. Keeping it
                // costs a no-op per drain, where falling through to neither
                // branch dropped the coach's edit with nothing to show for it.
                console.warn('Sync queue: keeping an entry this build cannot replay:',
                    item.entityType, item.action);
                remaining.push(item);
            }
        } catch (error) {
            console.error('Queue processing error:', error);
            remaining.push(item);
        }
    }

    safeSetToStorage('ayso_sync_queue', JSON.stringify(remaining));
    return { success: true, processed };
}

/**
 * Migrate localStorage data to cloud on first sign-in
 */
async function migrateLocalDataToCloud() {
    const user = await getCurrentUser();
    if (!user) return;

    const localPlayers = safeParseJSON(safeGetFromStorage('ayso_players'), []);
    const localGames = safeParseJSON(safeGetFromStorage('ayso_lineup_history'), []);
    const localFixtures = readLocalFixtures();
    const localSettings = safeParseJSON(safeGetFromStorage('ayso_settings'), {});

    // Skip if no data to migrate. Settings count as data when the coach has
    // moved them off the defaults: the pull is authoritative, so a 12U side
    // set up before signing in would otherwise be handed back as 10U.
    const settingsWorthKeeping = !sameSettings(localSettings, DEFAULT_SETTINGS);
    if (localPlayers.length === 0 && localGames.length === 0 && localFixtures.length === 0
        && !settingsWorthKeeping) {
        localStorage.setItem('ayso_migration_status', 'completed');
        return;
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        // Check if user already has teams
        const teamsResult = await getTeams();
        if (teamsResult.success && teamsResult.data.length > 0) {
            // Use existing team
            currentTeamId = teamsResult.data[0].id;
        } else {
            // Create new team
            const teamResult = await createTeam(
                'My Team',
                localSettings.ageDivision || '10U'
            );
            if (!teamResult.success) {
                console.error('Failed to create team:', teamResult.error);
                updateStatus(SYNC_STATUS.ERROR);
                return;
            }
            currentTeamId = teamResult.data.id;
        }

        // Migrate players
        if (localPlayers.length > 0) {
            await replaceRoster(currentTeamId, localPlayers);
        }

        // Migrate games
        if (localGames.length > 0) {
            await bulkImportGames(currentTeamId, localGames);
        }

        // Migrate the schedule. This matters more than it looks: sync() now
        // replaces the local schedule with the server's, so a season a coach
        // planned before signing in would be pulled out from under them on the
        // first sync if it were not sent up here first.
        //
        // A match the server would reject takes the whole batch down with it,
        // so the ones it cannot accept are left behind rather than costing the
        // coach the rest of the season.
        const migratable = localFixtures.filter(f => (
            f && typeof f.opponent === 'string' && f.opponent.trim()
            && typeof f.gameDate === 'string' && !Number.isNaN(Date.parse(f.gameDate))
        ));
        if (migratable.length > 0) {
            await bulkImportFixtures(currentTeamId, migratable);
        }

        // How the coach had the app set up, for the same reason as the
        // schedule: sync() replaces the local copy with the team's, so a
        // division and formation chosen before signing in have to be sent up
        // first or the first sync takes them away.
        if (settingsWorthKeeping) {
            await saveTeamSettings(currentTeamId, normalizeSettings(localSettings));
        }

        // Save user settings. default_settings is not written here any more:
        // how the team plays belongs to the team, and a per-user copy that
        // nothing read was what let two devices disagree in the first place.
        await updateUserSettings({
            theme: localStorage.getItem('ayso_theme') || 'dark',
            default_team_id: currentTeamId
        });

        localStorage.setItem('ayso_migration_status', 'completed');
        localStorage.setItem('ayso_migration_date', new Date().toISOString());

        updateStatus(SYNC_STATUS.SYNCED);
    } catch (error) {
        console.error('Migration error:', error);
        updateStatus(SYNC_STATUS.ERROR);
    }
}

/**
 * Clean up sync engine
 */
export async function cleanup() {
    syncListeners = [];
    currentTeamId = null;
    updateStatus(SYNC_STATUS.OFFLINE);
}

// Listen for online/offline events
if (typeof window !== 'undefined') {
    window.addEventListener('online', async () => {
        await processQueue();
        await sync();
    });

    window.addEventListener('offline', () => {
        updateStatus(SYNC_STATUS.OFFLINE);
    });
}
