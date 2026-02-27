/**
 * Cloud Storage Module
 * CRUD operations for teams, players, and games via REST API
 */

import { api, getUser } from './api-client.js';

// ============================================
// TEAM OPERATIONS
// ============================================

/**
 * Get all teams the current user belongs to
 */
export async function getTeams() {
    try {
        return await api.get('/api/teams');
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Create a new team
 */
export async function createTeam(name, ageDivision = '10U') {
    try {
        return await api.post('/api/teams', { name, ageDivision });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update a team
 */
export async function updateTeam(teamId, updates) {
    try {
        return await api.put(`/api/teams/${teamId}`, {
            name: updates.name,
            ageDivision: updates.ageDivision
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a team
 */
export async function deleteTeam(teamId) {
    try {
        return await api.delete(`/api/teams/${teamId}`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================
// PLAYER OPERATIONS
// ============================================

/**
 * Get all players for a team
 */
export async function getPlayers(teamId) {
    try {
        return await api.get(`/api/teams/${teamId}/players`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Add or update a player (single upsert via bulk endpoint)
 */
export async function upsertPlayer(teamId, player) {
    try {
        const result = await api.post(`/api/teams/${teamId}/players`, { players: [player] });
        if (result.success && result.data?.length > 0) {
            return { success: true, data: result.data[0] };
        }
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Bulk upsert players
 */
export async function bulkUpsertPlayers(teamId, players) {
    try {
        return await api.post(`/api/teams/${teamId}/players`, { players });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a player
 */
export async function deletePlayer(playerId) {
    try {
        return await api.delete(`/api/players/${playerId}`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete all players for a team
 */
export async function deleteAllPlayers(teamId) {
    try {
        return await api.delete(`/api/teams/${teamId}/players`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================
// GAME OPERATIONS
// ============================================

/**
 * Get all games for a team
 */
export async function getGames(teamId) {
    try {
        return await api.get(`/api/teams/${teamId}/games`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Save a new game
 */
export async function saveGame(teamId, game) {
    try {
        return await api.post(`/api/teams/${teamId}/games`, game);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update a game
 */
export async function updateGame(gameId, updates) {
    try {
        return await api.put(`/api/games/${gameId}`, updates);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a game
 */
export async function deleteGame(gameId) {
    try {
        return await api.delete(`/api/games/${gameId}`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Bulk import games
 */
export async function bulkImportGames(teamId, games) {
    try {
        return await api.post(`/api/teams/${teamId}/games/bulk`, { games });
    } catch (error) {
        return { success: false, error: error.message };
    }
}
