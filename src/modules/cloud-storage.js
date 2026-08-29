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
 * Replace a team's roster with exactly this list, atomically.
 *
 * Prefer this over deleting and then re-uploading: the server does both in one
 * transaction, so an interrupted sync cannot leave the team with no players.
 *
 * `expectedVersion` is the roster version this write was built on. The server
 * rejects the write with 409 and `conflict: true` when the roster has moved on
 * since, rather than letting it overwrite another coach's edits.
 */
export async function replaceRoster(teamId, players, expectedVersion, renames) {
    try {
        const body = { players };
        // Omitted rather than sent as undefined: the server treats an absent
        // expectedVersion as an unconditional write, which is what a queued
        // offline edit needs — it was recorded before any version was known.
        if (expectedVersion !== undefined && expectedVersion !== null) {
            body.expectedVersion = expectedVersion;
        }
        // Renames ride along with the roster they belong to, so the name moves
        // across the player's saved games in the same transaction that saves
        // the new roster rather than in a second request that could not land.
        if (Array.isArray(renames) && renames.length > 0) {
            body.renames = renames;
        }
        return await api.put(`/api/teams/${teamId}/players`, body);
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

// ============================================
// FIXTURE / SCHEDULE OPERATIONS
// ============================================

/**
 * Get all fixtures for a team
 */
export async function getFixtures(teamId) {
    try {
        return await api.get(`/api/teams/${teamId}/fixtures`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Save a new fixture
 */
export async function saveFixture(teamId, fixture) {
    try {
        return await api.post(`/api/teams/${teamId}/fixtures`, fixture);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update a fixture
 */
export async function updateFixture(fixtureId, updates) {
    try {
        return await api.put(`/api/fixtures/${fixtureId}`, updates);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a fixture
 */
export async function deleteFixture(fixtureId) {
    try {
        return await api.delete(`/api/fixtures/${fixtureId}`);
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Bulk import fixtures
 */
export async function bulkImportFixtures(teamId, fixtures) {
    try {
        return await api.post(`/api/teams/${teamId}/fixtures/bulk`, { fixtures });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

