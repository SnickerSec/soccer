/**
 * Sync Engine Module
 * Handles offline-first synchronization between localStorage and Supabase
 */

import { getSupabase, isSupabaseConfigured, isAuthenticated } from './supabase.js';
import { getCurrentUser, getUserSettings, updateUserSettings } from './auth.js';
import {
    getTeams, createTeam, getPlayers, bulkUpsertPlayers,
    getGames, saveGame, bulkImportGames, deleteAllPlayers
} from './cloud-storage.js';
import { safeGetFromStorage, safeSetToStorage, safeParseJSON } from './storage.js';

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
let realtimeSubscription = null;

/**
 * Initialize the sync engine
 * @param {Function} onStatusChange - Callback for sync status changes
 * @returns {Promise<{authenticated: boolean, teamId?: string}>}
 */
export async function initSync(onStatusChange) {
    if (onStatusChange) {
        syncListeners.push(onStatusChange);
    }

    if (!isSupabaseConfigured()) {
        updateStatus(SYNC_STATUS.OFFLINE);
        return { authenticated: false };
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

    // Initial sync
    await sync();

    return {
        authenticated: true,
        teamId: currentTeamId
    };
}

/**
 * Update sync status and notify listeners
 * @param {string} status
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
 * @param {Function} listener
 */
export function addSyncListener(listener) {
    syncListeners.push(listener);
}

/**
 * Remove a sync status listener
 * @param {Function} listener
 */
export function removeSyncListener(listener) {
    syncListeners = syncListeners.filter(l => l !== listener);
}

/**
 * Get current sync status
 * @returns {string}
 */
export function getSyncStatus() {
    return syncStatus;
}

/**
 * Get current team ID
 * @returns {string|null}
 */
export function getCurrentTeamId() {
    return currentTeamId;
}

/**
 * Set current team and sync
 * @param {string} teamId
 * @returns {Promise<{success: boolean, players?: Array, games?: Array}>}
 */
export async function setCurrentTeam(teamId) {
    currentTeamId = teamId;

    // Save as default team
    await updateUserSettings({ default_team_id: teamId });

    // Sync with new team
    return await sync();
}

/**
 * Perform a full sync with the cloud
 * @returns {Promise<{success: boolean, players?: Array, games?: Array, error?: string}>}
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

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);

        // Set up realtime subscription
        await subscribeToTeamChanges();

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
 * @param {Array} players
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function pushPlayers(players) {
    if (!currentTeamId) {
        return { success: false, error: 'No team selected' };
    }

    // Always save locally first (offline-first)
    safeSetToStorage('ayso_players', JSON.stringify(players));

    if (!navigator.onLine || !await isAuthenticated()) {
        // Queue for later sync
        queueChange('players', 'bulk_update', players);
        return { success: true, queued: true };
    }

    updateStatus(SYNC_STATUS.SYNCING);

    try {
        // Delete existing and insert new (full sync for simplicity)
        await deleteAllPlayers(currentTeamId);
        const result = await bulkUpsertPlayers(currentTeamId, players);

        if (!result.success) {
            updateStatus(SYNC_STATUS.ERROR);
            return result;
        }

        lastSyncTime = new Date();
        updateStatus(SYNC_STATUS.SYNCED);
        return { success: true, data: result.data };
    } catch (error) {
        updateStatus(SYNC_STATUS.ERROR);
        return { success: false, error: error.message };
    }
}

/**
 * Push a saved game to cloud
 * @param {object} game
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
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
 * @param {string} entityType
 * @param {string} action
 * @param {any} data
 */
function queueChange(entityType, action, data) {
    const queue = safeParseJSON(safeGetFromStorage('ayso_sync_queue'), []);
    queue.push({
        entityType,
        action,
        data,
        timestamp: Date.now()
    });
    safeSetToStorage('ayso_sync_queue', JSON.stringify(queue));
}

/**
 * Process queued changes when back online
 * @returns {Promise<{success: boolean, processed: number}>}
 */
export async function processQueue() {
    const queue = safeParseJSON(safeGetFromStorage('ayso_sync_queue'), []);
    if (queue.length === 0) {
        return { success: true, processed: 0 };
    }

    if (!navigator.onLine || !await isAuthenticated()) {
        return { success: false, processed: 0 };
    }

    let processed = 0;
    const remaining = [];

    for (const item of queue) {
        try {
            if (item.entityType === 'players' && item.action === 'bulk_update') {
                const result = await bulkUpsertPlayers(currentTeamId, item.data);
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
 * Subscribe to realtime changes for the current team
 */
async function subscribeToTeamChanges() {
    if (realtimeSubscription) {
        await realtimeSubscription.unsubscribe();
    }

    const supabase = await getSupabase();
    if (!supabase || !currentTeamId) return;

    realtimeSubscription = supabase
        .channel(`team:${currentTeamId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'players', filter: `team_id=eq.${currentTeamId}` },
            handleRealtimeChange
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'games', filter: `team_id=eq.${currentTeamId}` },
            handleRealtimeChange
        )
        .subscribe();
}

/**
 * Handle realtime changes from other clients
 * @param {object} payload
 */
function handleRealtimeChange(payload) {
    console.log('Realtime change:', payload);

    // Notify listeners to refresh
    syncListeners.forEach(listener => {
        try {
            listener(SYNC_STATUS.SYNCED, {
                teamId: currentTeamId,
                lastSync: new Date(),
                realtimeUpdate: payload
            });
        } catch (error) {
            console.error('Realtime listener error:', error);
        }
    });
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
            await bulkUpsertPlayers(currentTeamId, localPlayers);
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
    if (realtimeSubscription) {
        await realtimeSubscription.unsubscribe();
        realtimeSubscription = null;
    }
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
