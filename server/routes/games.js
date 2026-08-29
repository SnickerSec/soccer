/**
 * Game routes
 */

import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireTeamAccess, getTeamRole, roleSatisfies } from '../middleware.js';
import { toDateOnly } from '../date.js';

const router = Router();

/**
 * Upper bound on a single bulk import. This path exists to migrate a browser's
 * local history to the cloud on first sign-in, which is a season of games, not
 * thousands.
 */
const MAX_BULK_GAMES = 200;

/** A games row as the API exposes it. */
function mapGame(g) {
    return {
        id: g.id,
        name: g.name,
        date: toDateOnly(g.game_date),
        notes: g.notes,
        settings: g.settings,
        lineup: g.lineup,
        players: g.player_snapshot,
        captains: g.captains || [],
        createdBy: g.created_by,
        createdAt: g.created_at
    };
}

/**
 * Validates one game payload, returning an error message or null.
 *
 * Without this a missing name reached the NOT NULL constraint and surfaced as
 * an opaque 500 rather than telling the caller what was wrong.
 */
function validateGame(game) {
    if (!game || typeof game !== 'object' || Array.isArray(game)) {
        return 'A game object is required';
    }

    const { name, date, notes, captains } = game;

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 255) {
        return 'Game name is required and must be under 255 characters';
    }

    // The client sends a full ISO timestamp, which the DATE column narrows.
    if (date !== undefined && date !== null && date !== '' && Number.isNaN(Date.parse(date))) {
        return 'Game date must be a valid date';
    }

    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
        return 'Game notes must be a string';
    }

    if (captains !== undefined && captains !== null &&
        (!Array.isArray(captains) || captains.some(c => typeof c !== 'string'))) {
        return 'Game captains must be an array of names';
    }

    return null;
}

/** The INSERT parameters for one game, in column order. */
function gameValues(game, teamId, userId) {
    return [
        teamId,
        game.name,
        game.date || null,
        game.notes || '',
        JSON.stringify(game.settings || {}),
        JSON.stringify(game.lineup || []),
        JSON.stringify(game.players || []),
        game.captains || [],
        userId
    ];
}

const GAME_COLUMNS = 'team_id, name, game_date, notes, settings, lineup, player_snapshot, captains, created_by';

// List games for a team
router.get('/api/teams/:teamId/games', requireTeamAccess('viewer'), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM games WHERE team_id = $1 ORDER BY game_date DESC NULLS LAST`,
            [req.params.teamId]
        );

        res.json({ success: true, data: result.rows.map(mapGame) });
    } catch (error) {
        console.error('List games error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Save a game
router.post('/api/teams/:teamId/games', requireTeamAccess('coach'), async (req, res) => {
    const invalid = validateGame(req.body);
    if (invalid) {
        return res.status(400).json({ success: false, error: invalid });
    }

    try {
        const result = await pool.query(
            `INSERT INTO games (${GAME_COLUMNS})
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            gameValues(req.body, req.params.teamId, req.user.id)
        );

        res.json({ success: true, data: mapGame(result.rows[0]) });
    } catch (error) {
        console.error('Save game error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Bulk import games
router.post('/api/teams/:teamId/games/bulk', requireTeamAccess('coach'), async (req, res) => {
    const { games } = req.body;

    if (!Array.isArray(games)) {
        return res.status(400).json({ success: false, error: 'games must be an array' });
    }

    if (games.length > MAX_BULK_GAMES) {
        return res.status(400).json({ success: false, error: `Cannot import more than ${MAX_BULK_GAMES} games at once` });
    }

    for (const game of games) {
        const invalid = validateGame(game);
        if (invalid) {
            return res.status(400).json({ success: false, error: invalid });
        }
    }

    if (games.length === 0) {
        return res.json({ success: true, data: [] });
    }

    // One statement instead of a transaction with an insert per game: a single
    // multi-row INSERT is already atomic, so there is no BEGIN left to unwind.
    const values = [];
    const tuples = games.map((game) => {
        const n = values.length;
        values.push(...gameValues(game, req.params.teamId, req.user.id));
        return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}, $${n + 8}, $${n + 9})`;
    });

    try {
        const result = await pool.query(
            `INSERT INTO games (${GAME_COLUMNS})
             VALUES ${tuples.join(', ')}
             RETURNING *`,
            values
        );

        res.json({ success: true, data: result.rows.map(mapGame) });
    } catch (error) {
        console.error('Bulk import games error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update a game
router.put('/api/games/:id', requireAuth, async (req, res) => {
    try {
        // Verify access
        const gameResult = await pool.query('SELECT team_id FROM games WHERE id = $1', [req.params.id]);
        if (gameResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Game not found' });
        }

        const teamId = gameResult.rows[0].team_id;
        // Membership alone is not enough: a viewer is read-only, so writes
        // require at least coach.
        const role = await getTeamRole(teamId, req.user.id);

        if (role === null) {
            return res.status(403).json({ success: false, error: 'No access' });
        }

        if (!roleSatisfies(role, 'coach')) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions' });
        }

        const updates = req.body;
        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        if (updates.name !== undefined) {
            if (!updates.name || typeof updates.name !== 'string' || updates.name.trim().length === 0 || updates.name.length > 255) {
                return res.status(400).json({ success: false, error: 'Game name is required and must be under 255 characters' });
            }
            setClauses.push(`name = $${paramIndex++}`);
            values.push(updates.name);
        }
        if (updates.notes !== undefined) {
            if (updates.notes !== null && typeof updates.notes !== 'string') {
                return res.status(400).json({ success: false, error: 'Game notes must be a string' });
            }
            setClauses.push(`notes = $${paramIndex++}`);
            values.push(updates.notes);
        }
        if (updates.date !== undefined) {
            if (updates.date !== null && updates.date !== '' && Number.isNaN(Date.parse(updates.date))) {
                return res.status(400).json({ success: false, error: 'Game date must be a valid date' });
            }
            setClauses.push(`game_date = $${paramIndex++}`);
            values.push(updates.date);
        }

        if (setClauses.length > 0) {
            values.push(req.params.id);
            await pool.query(
                `UPDATE games SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
                values
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update game error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete a game
router.delete('/api/games/:id', requireAuth, async (req, res) => {
    try {
        // Verify access
        const gameResult = await pool.query('SELECT team_id FROM games WHERE id = $1', [req.params.id]);
        if (gameResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Game not found' });
        }

        const teamId = gameResult.rows[0].team_id;
        // Membership alone is not enough: a viewer is read-only, so writes
        // require at least coach.
        const role = await getTeamRole(teamId, req.user.id);

        if (role === null) {
            return res.status(403).json({ success: false, error: 'No access' });
        }

        if (!roleSatisfies(role, 'coach')) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions' });
        }

        await pool.query('DELETE FROM games WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete game error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
