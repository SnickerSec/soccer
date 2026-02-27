/**
 * Game routes
 */

import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireTeamAccess } from '../middleware.js';

const router = Router();

// List games for a team
router.get('/api/teams/:teamId/games', requireTeamAccess('viewer'), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM games WHERE team_id = $1 ORDER BY game_date DESC NULLS LAST`,
            [req.params.teamId]
        );

        const games = result.rows.map(g => ({
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

        res.json({ success: true, data: games });
    } catch (error) {
        console.error('List games error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Save a game
router.post('/api/teams/:teamId/games', requireTeamAccess('coach'), async (req, res) => {
    try {
        const game = req.body;
        const result = await pool.query(
            `INSERT INTO games (team_id, name, game_date, notes, settings, lineup, player_snapshot, captains, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                req.params.teamId,
                game.name,
                game.date || null,
                game.notes || '',
                JSON.stringify(game.settings || {}),
                JSON.stringify(game.lineup || []),
                JSON.stringify(game.players || []),
                game.captains || [],
                req.user.id
            ]
        );

        const g = result.rows[0];
        res.json({
            success: true,
            data: {
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
            }
        });
    } catch (error) {
        console.error('Save game error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Bulk import games
router.post('/api/teams/:teamId/games/bulk', requireTeamAccess('coach'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { games } = req.body;
        const results = [];

        for (const game of games) {
            const result = await client.query(
                `INSERT INTO games (team_id, name, game_date, notes, settings, lineup, player_snapshot, captains, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [
                    req.params.teamId,
                    game.name,
                    game.date || null,
                    game.notes || '',
                    JSON.stringify(game.settings || {}),
                    JSON.stringify(game.lineup || []),
                    JSON.stringify(game.players || []),
                    game.captains || [],
                    req.user.id
                ]
            );
            results.push(result.rows[0]);
        }

        await client.query('COMMIT');

        const data = results.map(g => ({
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

        res.json({ success: true, data });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Bulk import games error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        client.release();
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
        const accessResult = await pool.query(
            `SELECT role FROM team_members
             WHERE team_id = $1 AND user_id = $2 AND joined_at IS NOT NULL`,
            [teamId, req.user.id]
        );

        if (accessResult.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'No access' });
        }

        const updates = req.body;
        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        if (updates.name !== undefined) {
            setClauses.push(`name = $${paramIndex++}`);
            values.push(updates.name);
        }
        if (updates.notes !== undefined) {
            setClauses.push(`notes = $${paramIndex++}`);
            values.push(updates.notes);
        }
        if (updates.date !== undefined) {
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
        const accessResult = await pool.query(
            `SELECT role FROM team_members
             WHERE team_id = $1 AND user_id = $2 AND joined_at IS NOT NULL`,
            [teamId, req.user.id]
        );

        if (accessResult.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'No access' });
        }

        await pool.query('DELETE FROM games WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete game error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
