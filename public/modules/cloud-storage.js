/**
 * Cloud Storage Module
 * CRUD operations for teams, players, and games in Supabase
 */

import { getSupabase, getUser } from './supabase.js';

// ============================================
// TEAM OPERATIONS
// ============================================

/**
 * Get all teams the current user belongs to
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function getTeams() {
    const supabase = await getSupabase();
    const user = await getUser();

    if (!supabase || !user) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { data, error } = await supabase
            .from('teams')
            .select(`
                *,
                team_members!inner (
                    role,
                    joined_at
                )
            `)
            .eq('team_members.user_id', user.id)
            .not('team_members.joined_at', 'is', null)
            .order('created_at', { ascending: false });

        if (error) {
            return { success: false, error: error.message };
        }

        // Flatten the response
        const teams = data.map(team => ({
            id: team.id,
            name: team.name,
            ageDivision: team.age_division,
            createdBy: team.created_by,
            createdAt: team.created_at,
            role: team.team_members[0]?.role || 'viewer'
        }));

        return { success: true, data: teams };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Create a new team
 * @param {string} name
 * @param {string} ageDivision
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function createTeam(name, ageDivision = '10U') {
    const supabase = await getSupabase();
    const user = await getUser();

    if (!supabase || !user) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { data, error } = await supabase
            .from('teams')
            .insert({
                name,
                age_division: ageDivision,
                created_by: user.id
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return {
            success: true,
            data: {
                id: data.id,
                name: data.name,
                ageDivision: data.age_division,
                createdBy: data.created_by,
                createdAt: data.created_at,
                role: 'owner'
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update a team
 * @param {string} teamId
 * @param {object} updates
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateTeam(teamId, updates) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { error } = await supabase
            .from('teams')
            .update({
                name: updates.name,
                age_division: updates.ageDivision
            })
            .eq('id', teamId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a team
 * @param {string} teamId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteTeam(teamId) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { error } = await supabase
            .from('teams')
            .delete()
            .eq('id', teamId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================
// PLAYER OPERATIONS
// ============================================

/**
 * Get all players for a team
 * @param {string} teamId
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function getPlayers(teamId) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('team_id', teamId)
            .order('sort_order', { ascending: true });

        if (error) {
            return { success: false, error: error.message };
        }

        // Convert to app format
        const players = data.map(p => ({
            id: p.id,
            name: p.name,
            number: p.number,
            isCaptain: p.is_captain,
            mustRest: p.must_rest,
            noKeeper: p.no_keeper,
            status: p.status,
            preferredPositions: p.preferred_positions || [],
            sortOrder: p.sort_order
        }));

        return { success: true, data: players };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Add or update a player
 * @param {string} teamId
 * @param {object} player
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function upsertPlayer(teamId, player) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const playerData = {
            team_id: teamId,
            name: player.name,
            number: player.number || null,
            is_captain: player.isCaptain || false,
            must_rest: player.mustRest || false,
            no_keeper: player.noKeeper || false,
            status: player.status || 'available',
            preferred_positions: player.preferredPositions || [],
            sort_order: player.sortOrder ?? 0
        };

        // If player has an ID, update; otherwise insert
        if (player.id) {
            playerData.id = player.id;
        }

        const { data, error } = await supabase
            .from('players')
            .upsert(playerData, {
                onConflict: player.id ? 'id' : 'team_id,name'
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return {
            success: true,
            data: {
                id: data.id,
                name: data.name,
                number: data.number,
                isCaptain: data.is_captain,
                mustRest: data.must_rest,
                noKeeper: data.no_keeper,
                status: data.status,
                preferredPositions: data.preferred_positions || [],
                sortOrder: data.sort_order
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Bulk upsert players (for initial sync or batch updates)
 * @param {string} teamId
 * @param {Array} players
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function bulkUpsertPlayers(teamId, players) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const playerData = players.map((p, index) => ({
            id: p.id || undefined,
            team_id: teamId,
            name: p.name,
            number: p.number || null,
            is_captain: p.isCaptain || false,
            must_rest: p.mustRest || false,
            no_keeper: p.noKeeper || false,
            status: p.status || 'available',
            preferred_positions: p.preferredPositions || [],
            sort_order: p.sortOrder ?? index
        }));

        const { data, error } = await supabase
            .from('players')
            .upsert(playerData, {
                onConflict: 'team_id,name'
            })
            .select();

        if (error) {
            return { success: false, error: error.message };
        }

        const result = data.map(p => ({
            id: p.id,
            name: p.name,
            number: p.number,
            isCaptain: p.is_captain,
            mustRest: p.must_rest,
            noKeeper: p.no_keeper,
            status: p.status,
            preferredPositions: p.preferred_positions || [],
            sortOrder: p.sort_order
        }));

        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a player
 * @param {string} playerId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deletePlayer(playerId) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { error } = await supabase
            .from('players')
            .delete()
            .eq('id', playerId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete all players for a team (used when syncing full roster)
 * @param {string} teamId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteAllPlayers(teamId) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { error } = await supabase
            .from('players')
            .delete()
            .eq('team_id', teamId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================
// GAME OPERATIONS
// ============================================

/**
 * Get all games for a team
 * @param {string} teamId
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function getGames(teamId) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .eq('team_id', teamId)
            .order('game_date', { ascending: false });

        if (error) {
            return { success: false, error: error.message };
        }

        // Convert to app format
        const games = data.map(g => ({
            id: g.id,
            name: g.name,
            date: g.game_date,
            notes: g.notes,
            settings: g.settings,
            lineup: g.lineup,
            players: g.player_snapshot,
            captains: g.captains || [],
            createdBy: g.created_by,
            createdAt: g.created_at
        }));

        return { success: true, data: games };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Save a new game
 * @param {string} teamId
 * @param {object} game
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function saveGame(teamId, game) {
    const supabase = await getSupabase();
    const user = await getUser();

    if (!supabase || !user) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { data, error } = await supabase
            .from('games')
            .insert({
                team_id: teamId,
                name: game.name,
                game_date: game.date,
                notes: game.notes || '',
                settings: game.settings,
                lineup: game.lineup,
                player_snapshot: game.players,
                captains: game.captains || [],
                created_by: user.id
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return {
            success: true,
            data: {
                id: data.id,
                name: data.name,
                date: data.game_date,
                notes: data.notes,
                settings: data.settings,
                lineup: data.lineup,
                players: data.player_snapshot,
                captains: data.captains || [],
                createdBy: data.created_by,
                createdAt: data.created_at
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update a game
 * @param {string} gameId
 * @param {object} updates
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateGame(gameId, updates) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const updateData = {};
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.notes !== undefined) updateData.notes = updates.notes;
        if (updates.date !== undefined) updateData.game_date = updates.date;

        const { error } = await supabase
            .from('games')
            .update(updateData)
            .eq('id', gameId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete a game
 * @param {string} gameId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteGame(gameId) {
    const supabase = await getSupabase();

    if (!supabase) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { error } = await supabase
            .from('games')
            .delete()
            .eq('id', gameId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Bulk import games (for migration)
 * @param {string} teamId
 * @param {Array} games
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function bulkImportGames(teamId, games) {
    const supabase = await getSupabase();
    const user = await getUser();

    if (!supabase || !user) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const gamesData = games.map(g => ({
            team_id: teamId,
            name: g.name,
            game_date: g.date,
            notes: g.notes || '',
            settings: g.settings,
            lineup: g.lineup,
            player_snapshot: g.players,
            captains: g.captains || [],
            created_by: user.id
        }));

        const { data, error } = await supabase
            .from('games')
            .insert(gamesData)
            .select();

        if (error) {
            return { success: false, error: error.message };
        }

        const result = data.map(g => ({
            id: g.id,
            name: g.name,
            date: g.game_date,
            notes: g.notes,
            settings: g.settings,
            lineup: g.lineup,
            players: g.player_snapshot,
            captains: g.captains || [],
            createdBy: g.created_by,
            createdAt: g.created_at
        }));

        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
