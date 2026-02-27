/**
 * Player routes
 */

import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireTeamAccess } from '../middleware.js';

const router = Router();

// List players for a team
router.get('/api/teams/:teamId/players', requireTeamAccess('viewer'), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM players WHERE team_id = $1 ORDER BY sort_order ASC`,
            [req.params.teamId]
        );

        const players = result.rows.map(p => ({
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

        res.json({ success: true, data: players });
    } catch (error) {
        console.error('List players error:', error);
        res.status(500).json({ success: false, error: 'Failed to list players' });
    }
});

// Bulk upsert players
router.post('/api/teams/:teamId/players', requireTeamAccess('coach'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { players } = req.body;

        if (!Array.isArray(players)) {
            return res.status(400).json({ success: false, error: 'players must be an array' });
        }

        for (const p of players) {
            if (!p.name || typeof p.name !== 'string' || p.name.trim().length === 0 || p.name.length > 255) {
                return res.status(400).json({ success: false, error: 'Each player name is required and must be under 255 characters' });
            }
        }

        const teamId = req.params.teamId;
        const results = [];

        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const result = await client.query(
                `INSERT INTO players (team_id, name, number, is_captain, must_rest, no_keeper, status, preferred_positions, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (team_id, name) DO UPDATE SET
                    number = EXCLUDED.number,
                    is_captain = EXCLUDED.is_captain,
                    must_rest = EXCLUDED.must_rest,
                    no_keeper = EXCLUDED.no_keeper,
                    status = EXCLUDED.status,
                    preferred_positions = EXCLUDED.preferred_positions,
                    sort_order = EXCLUDED.sort_order
                 RETURNING *`,
                [
                    teamId,
                    p.name,
                    p.number || null,
                    p.isCaptain || false,
                    p.mustRest || false,
                    p.noKeeper || false,
                    p.status || 'available',
                    p.preferredPositions || [],
                    p.sortOrder ?? i
                ]
            );
            results.push(result.rows[0]);
        }

        await client.query('COMMIT');

        const data = results.map(p => ({
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

        res.json({ success: true, data });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Bulk upsert players error:', error);
        res.status(500).json({ success: false, error: 'Failed to save players' });
    } finally {
        client.release();
    }
});

// Delete all players for a team
router.delete('/api/teams/:teamId/players', requireTeamAccess('coach'), async (req, res) => {
    try {
        await pool.query('DELETE FROM players WHERE team_id = $1', [req.params.teamId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete all players error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete players' });
    }
});

// Delete single player
router.delete('/api/players/:id', requireAuth, async (req, res) => {
    try {
        // Verify user has access to the team this player belongs to
        const playerResult = await pool.query(
            'SELECT team_id FROM players WHERE id = $1',
            [req.params.id]
        );

        if (playerResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Player not found' });
        }

        const teamId = playerResult.rows[0].team_id;
        const accessResult = await pool.query(
            `SELECT role FROM team_members
             WHERE team_id = $1 AND user_id = $2 AND joined_at IS NOT NULL`,
            [teamId, req.user.id]
        );

        if (accessResult.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'No access' });
        }

        await pool.query('DELETE FROM players WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete player error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete player' });
    }
});

export default router;
