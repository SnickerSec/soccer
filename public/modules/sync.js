/**
 * Sync Engine Module
 * Handles offline-first synchronization between localStorage and the server
 */

import { isAuthenticated } from './api-client.js';
import { getCurrentUser, getUserSettings, updateUserSettings } from './auth.js';
import {
    getTeams, createTeam, getPlayers, replaceRoster,
    getGames, saveGame, bulkImportGames
} from './cloud-storage.js';
import { safeGetFromStorage, safeSetToStorage, safeParseJSON } from './storage.js';
import { mergeRosters } from './roster-merge.js';

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
function updateStatus(status) {
    syncStatus = status;
    syncListeners.forEach(listener => {
        try {
            listener(status, { teamId: currentTeamId, lastSync: lastSyncTime });
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
        const [playersResult, gamesResult] = await Promise.all([
            getPlayers(currentTeamId),
            getGames(currentTeamId)
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

        // What the next write will claim to be built on
        rememberRoster(playersResult.data, playersResult.version);

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);

        return {
            success: true,
            players: playersResult.data,
            games: gamesResult.data
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
export async function pushPlayers(players) {
    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    // Always save locally first (offline-first)
    safeSetToStorage('ayso_players', JSON.stringify(players));

    if (!navigator.onLine || !await isAuthenticated()) {
        // Queue for later sync
        queueChange('players', 'bulk_update', players, {
            expectedVersion: rosterVersion,
            base: rosterBase
        });
        return { success: true, queued: true };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        return await writeRoster(players, { expectedVersion: rosterVersion, base: rosterBase });
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
async function writeRoster(players, { expectedVersion, base }) {
    // One atomic replace. Doing this as a delete followed by an upload left
    // the roster empty if the second request never landed.
    const result = await replaceRoster(currentTeamId, players, expectedVersion);

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

    const retry = await replaceRoster(currentTeamId, merged, result.version);

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
        conflicts,
        data: retry.data
    };
}

/**
 * Push a saved game to cloud
 */
export async function pushGame(game) {
    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    // Save locally first
    const localGames = safeParseJSON(safeGetFromStorage('ayso_lineup_history'), []);
    const existingIndex = localGames.findIndex(g => g.id === game.id);
    if (existingIndex >= 0) {
        localGames[existingIndex] = game;
    } else {
        localGames.unshift(game);
    }
    safeSetToStorage('ayso_lineup_history', JSON.stringify(localGames));

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
        const updatedGames = safeParseJSON(safeGetFromStorage('ayso_lineup_history'), []);
        const idx = updatedGames.findIndex(g => g.id === game.id || g.name === game.name);
        if (idx >= 0) {
            updatedGames[idx] = result.data;
            safeSetToStorage('ayso_lineup_history', JSON.stringify(updatedGames));
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
                    base: item.base
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
    const localSettings = safeParseJSON(safeGetFromStorage('ayso_settings'), {});

    // Skip if no data to migrate
    if (localPlayers.length === 0 && localGames.length === 0) {
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

        // Save user settings
        await updateUserSettings({
            theme: localStorage.getItem('ayso_theme') || 'dark',
            default_team_id: currentTeamId,
            default_settings: localSettings
        });

        localStorage.setItem('ayso_migration_status', 'completed');
        localStorage.setItem('ayso_migration_date', new Date().toISOString());

        updateStatus(SYNC_STATUS.SYNCED);
        console.log('Migration completed successfully');
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
        console.log('Back online, processing queue...');
        await processQueue();
        await sync();
    });

    window.addEventListener('offline', () => {
        console.log('Went offline');
        updateStatus(SYNC_STATUS.OFFLINE);
    });
}
