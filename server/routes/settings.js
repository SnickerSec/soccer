/**
 * User settings routes
 */

import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware.js';

const router = Router();

// Get user settings
router.get('/api/settings', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );

        res.json({ success: true, data: result.rows[0] || null });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Upsert user settings
router.put('/api/settings', requireAuth, async (req, res) => {
    try {
        const settings = req.body;

        await pool.query(
            `INSERT INTO user_settings (user_id, theme, default_team_id, default_settings)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id) DO UPDATE SET
                theme = COALESCE(EXCLUDED.theme, user_settings.theme),
                default_team_id = COALESCE(EXCLUDED.default_team_id, user_settings.default_team_id),
                default_settings = COALESCE(EXCLUDED.default_settings, user_settings.default_settings)`,
            [
                req.user.id,
                settings.theme || 'dark',
                settings.default_team_id || null,
                settings.default_settings ? JSON.stringify(settings.default_settings) : '{}'
            ]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
