/**
 * Settings routes
 *
 * Two kinds, kept apart on purpose. /api/settings is the coach: their theme
 * and which team they were last looking at. /api/teams/:teamId/settings is how
 * the team plays — division, field size, formation, quarters — which belongs
 * to the team, because two coaches sharing a side want the same answer and a
 * coach running two sides wants a different one for each.
 */

import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireTeamAccess } from '../middleware.js';

const router = Router();

/** The team's play settings as the API exposes them. */
export function mapTeamSettings(row) {
    const stored = (row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings))
        ? row.settings
        : {};

    // age_division has its own column, which the team list and team creation
    // already read, so it answers for the division here too rather than being
    // stored a second time inside the JSONB.
    return { ...stored, ageDivision: row.age_division || '10U' };
}

/**
 * Validates a play-settings payload, returning an error string or null.
 *
 * Every field is optional — a body says what it is changing — but anything
 * present has to be usable, so a formation nobody can field is refused here
 * rather than reaching another coach's device.
 */
export function validateTeamSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return 'A settings object is required';
    }

    const { ageDivision, fieldPlayers, formation, quarters } = settings;

    // Divisions are not enumerated here: POST /api/teams does not enumerate
    // them either, and a second list on the server would be one more thing to
    // remember when AYSO adds one.
    if (ageDivision !== undefined && ageDivision !== null
        && (typeof ageDivision !== 'string' || ageDivision.trim().length === 0 || ageDivision.length > 16)) {
        return 'Age division must be a short non-empty string';
    }

    if (fieldPlayers !== undefined && fieldPlayers !== null
        && (!Number.isInteger(fieldPlayers) || fieldPlayers < 3 || fieldPlayers > 11)) {
        return 'Field players must be a whole number between 3 and 11';
    }

    // Custom formations are named by the coach, so this is a length check and
    // not a list.
    if (formation !== undefined && formation !== null
        && (typeof formation !== 'string' || formation.trim().length === 0 || formation.length > 64)) {
        return 'Formation must be a non-empty name under 64 characters';
    }

    if (quarters !== undefined && quarters !== null
        && (!Number.isInteger(quarters) || quarters < 1 || quarters > 8)) {
        return 'Quarters must be a whole number between 1 and 8';
    }

    return null;
}

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
        const settings = req.body || {};

        if (settings.theme !== undefined && settings.theme !== null
            && settings.theme !== 'dark' && settings.theme !== 'light') {
            return res.status(400).json({ success: false, error: 'Theme must be "dark" or "light"' });
        }

        // Each column keeps its stored value when the body does not mention it.
        // This used to substitute a default instead, so recording which team
        // was last opened — which sync does on every team switch — put a coach
        // who works in the light theme back into the dark one.
        await pool.query(
            `INSERT INTO user_settings (user_id, theme, default_team_id, default_settings)
             VALUES ($1, COALESCE($2::text, 'dark'), $3::uuid, COALESCE($4::jsonb, '{}'::jsonb))
             ON CONFLICT (user_id) DO UPDATE SET
                theme = COALESCE($2::text, user_settings.theme),
                default_team_id = COALESCE($3::uuid, user_settings.default_team_id),
                default_settings = COALESCE($4::jsonb, user_settings.default_settings)`,
            [
                req.user.id,
                settings.theme || null,
                settings.default_team_id || null,
                settings.default_settings ? JSON.stringify(settings.default_settings) : null
            ]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Get a team's play settings
router.get('/api/teams/:teamId/settings', requireTeamAccess('viewer'), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT age_division, settings FROM teams WHERE id = $1',
            [req.params.teamId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Team not found' });
        }

        res.json({ success: true, data: mapTeamSettings(result.rows[0]) });
    } catch (error) {
        console.error('Get team settings error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update a team's play settings. Coaches, who already write the roster and the
// games these settings decide the shape of.
router.put('/api/teams/:teamId/settings', requireTeamAccess('coach'), async (req, res) => {
    try {
        const settings = req.body || {};

        const error = validateTeamSettings(settings);
        if (error) {
            return res.status(400).json({ success: false, error });
        }

        const { ageDivision, ...play } = settings;

        // Merged rather than replaced, so a build that sends only what it
        // knows about does not drop the rest. roster_version is deliberately
        // untouched: a formation change must not reject a roster edit another
        // coach is in the middle of.
        const result = await pool.query(
            `UPDATE teams
                SET settings = settings || $2::jsonb,
                    age_division = COALESCE($3, age_division)
              WHERE id = $1
          RETURNING age_division, settings`,
            [req.params.teamId, JSON.stringify(play), ageDivision || null]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Team not found' });
        }

        res.json({ success: true, data: mapTeamSettings(result.rows[0]) });
    } catch (error) {
        console.error('Update team settings error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
