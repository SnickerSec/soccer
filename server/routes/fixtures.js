/**
 * Fixtures & Match Scheduling Routes
 */

import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireTeamAccess, getTeamRole, roleSatisfies } from '../middleware.js';
import { toDateOnly } from '../date.js';

const router = Router();

const MAX_BULK_FIXTURES = 200;

/** A fixtures row as the API exposes it. */
export function mapFixture(f) {
    return {
        id: f.id,
        teamId: f.team_id,
        gameDate: toDateOnly(f.game_date),
        gameTime: f.game_time || '',
        opponent: f.opponent,
        location: f.location || '',
        homeAway: f.home_away || 'home',
        jerseyColor: f.jersey_color || '',
        snackParent: f.snack_parent || '',
        fruitParent: f.fruit_parent || '',
        refereeDuty: f.referee_duty || '',
        fieldSetup: f.field_setup || '',
        status: f.status || 'upcoming',
        notes: f.notes || '',
        gameId: f.game_id || null,
        createdBy: f.created_by,
        createdAt: f.created_at,
        updatedAt: f.updated_at
    };
}

/**
 * Validates a fixture payload, returning an error string or null.
 */
export function validateFixture(fixture) {
    if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
        return 'A fixture object is required';
    }

    const { opponent, gameDate, homeAway, status, gameTime, location, jerseyColor, snackParent, fruitParent, refereeDuty, fieldSetup, notes } = fixture;

    if (!opponent || typeof opponent !== 'string' || opponent.trim().length === 0 || opponent.length > 255) {
        return 'Opponent name is required and must be under 255 characters';
    }

    if (!gameDate || typeof gameDate !== 'string' || Number.isNaN(Date.parse(gameDate))) {
        return 'Game date is required and must be a valid date';
    }

    if (homeAway !== undefined && homeAway !== null && !['home', 'away'].includes(homeAway)) {
        return 'Home/away must be either "home" or "away"';
    }

    if (status !== undefined && status !== null && !['upcoming', 'completed', 'canceled'].includes(status)) {
        return 'Status must be "upcoming", "completed", or "canceled"';
    }

    const stringFields = { gameTime, location, jerseyColor, snackParent, fruitParent, refereeDuty, fieldSetup, notes };
    for (const [key, val] of Object.entries(stringFields)) {
        if (val !== undefined && val !== null && typeof val !== 'string') {
            return `${key} must be a string`;
        }
    }

    return null;
}

/** The INSERT parameters for one fixture, in column order. */
function fixtureValues(fixture, teamId, userId) {
    return [
        teamId,
        fixture.gameDate,
        fixture.gameTime || '',
        fixture.opponent.trim(),
        fixture.location || '',
        fixture.homeAway || 'home',
        fixture.jerseyColor || '',
        fixture.snackParent || '',
        fixture.fruitParent || '',
        fixture.refereeDuty || '',
        fixture.fieldSetup || '',
        fixture.status || 'upcoming',
        fixture.notes || '',
        fixture.gameId || null,
        userId
    ];
}

const FIXTURE_COLUMNS = 'team_id, game_date, game_time, opponent, location, home_away, jersey_color, snack_parent, fruit_parent, referee_duty, field_setup, status, notes, game_id, created_by';

// List fixtures for a team
router.get('/api/teams/:teamId/fixtures', requireTeamAccess('viewer'), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM fixtures WHERE team_id = $1 ORDER BY game_date ASC, game_time ASC`,
            [req.params.teamId]
        );

        res.json({ success: true, data: result.rows.map(mapFixture) });
    } catch (error) {
        console.error('List fixtures error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Create a new fixture
router.post('/api/teams/:teamId/fixtures', requireTeamAccess('coach'), async (req, res) => {
    const invalid = validateFixture(req.body);
    if (invalid) {
        return res.status(400).json({ success: false, error: invalid });
    }

    try {
        const result = await pool.query(
            `INSERT INTO fixtures (${FIXTURE_COLUMNS})
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING *`,
            fixtureValues(req.body, req.params.teamId, req.user.id)
        );

        res.json({ success: true, data: mapFixture(result.rows[0]) });
    } catch (error) {
        console.error('Save fixture error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Bulk import fixtures
router.post('/api/teams/:teamId/fixtures/bulk', requireTeamAccess('coach'), async (req, res) => {
    const { fixtures } = req.body;

    if (!Array.isArray(fixtures)) {
        return res.status(400).json({ success: false, error: 'fixtures must be an array' });
    }

    if (fixtures.length > MAX_BULK_FIXTURES) {
        return res.status(400).json({ success: false, error: `Cannot import more than ${MAX_BULK_FIXTURES} fixtures at once` });
    }

    for (const fix of fixtures) {
        const invalid = validateFixture(fix);
        if (invalid) {
            return res.status(400).json({ success: false, error: invalid });
        }
    }

    if (fixtures.length === 0) {
        return res.json({ success: true, data: [] });
    }

    const values = [];
    const tuples = fixtures.map((fix) => {
        const n = values.length;
        values.push(...fixtureValues(fix, req.params.teamId, req.user.id));
        return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}, $${n + 8}, $${n + 9}, $${n + 10}, $${n + 11}, $${n + 12}, $${n + 13}, $${n + 14}, $${n + 15})`;
    });

    try {
        const result = await pool.query(
            `INSERT INTO fixtures (${FIXTURE_COLUMNS})
             VALUES ${tuples.join(', ')}
             RETURNING *`,
            values
        );

        res.json({ success: true, data: result.rows.map(mapFixture) });
    } catch (error) {
        console.error('Bulk import fixtures error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Update a fixture
router.put('/api/fixtures/:id', requireAuth, async (req, res) => {
    try {
        const fixtureResult = await pool.query('SELECT team_id FROM fixtures WHERE id = $1', [req.params.id]);
        if (fixtureResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Fixture not found' });
        }

        const teamId = fixtureResult.rows[0].team_id;
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

        if (updates.opponent !== undefined) {
            if (!updates.opponent || typeof updates.opponent !== 'string' || updates.opponent.trim().length === 0 || updates.opponent.length > 255) {
                return res.status(400).json({ success: false, error: 'Opponent name is required and must be under 255 characters' });
            }
            setClauses.push(`opponent = $${paramIndex++}`);
            values.push(updates.opponent.trim());
        }

        if (updates.gameDate !== undefined) {
            if (!updates.gameDate || typeof updates.gameDate !== 'string' || Number.isNaN(Date.parse(updates.gameDate))) {
                return res.status(400).json({ success: false, error: 'Game date must be a valid date' });
            }
            setClauses.push(`game_date = $${paramIndex++}`);
            values.push(updates.gameDate);
        }

        if (updates.gameTime !== undefined) {
            setClauses.push(`game_time = $${paramIndex++}`);
            values.push(updates.gameTime || '');
        }

        if (updates.location !== undefined) {
            setClauses.push(`location = $${paramIndex++}`);
            values.push(updates.location || '');
        }

        if (updates.homeAway !== undefined) {
            if (!['home', 'away'].includes(updates.homeAway)) {
                return res.status(400).json({ success: false, error: 'Home/away must be either "home" or "away"' });
            }
            setClauses.push(`home_away = $${paramIndex++}`);
            values.push(updates.homeAway);
        }

        if (updates.jerseyColor !== undefined) {
            setClauses.push(`jersey_color = $${paramIndex++}`);
            values.push(updates.jerseyColor || '');
        }

        if (updates.snackParent !== undefined) {
            setClauses.push(`snack_parent = $${paramIndex++}`);
            values.push(updates.snackParent || '');
        }

        if (updates.fruitParent !== undefined) {
            setClauses.push(`fruit_parent = $${paramIndex++}`);
            values.push(updates.fruitParent || '');
        }

        if (updates.refereeDuty !== undefined) {
            setClauses.push(`referee_duty = $${paramIndex++}`);
            values.push(updates.refereeDuty || '');
        }

        if (updates.fieldSetup !== undefined) {
            setClauses.push(`field_setup = $${paramIndex++}`);
            values.push(updates.fieldSetup || '');
        }

        if (updates.status !== undefined) {
            if (!['upcoming', 'completed', 'canceled'].includes(updates.status)) {
                return res.status(400).json({ success: false, error: 'Status must be "upcoming", "completed", or "canceled"' });
            }
            setClauses.push(`status = $${paramIndex++}`);
            values.push(updates.status);
        }

        if (updates.notes !== undefined) {
            setClauses.push(`notes = $${paramIndex++}`);
            values.push(updates.notes || '');
        }

        if (updates.gameId !== undefined) {
            setClauses.push(`game_id = $${paramIndex++}`);
            values.push(updates.gameId || null);
        }

        if (setClauses.length > 0) {
            values.push(req.params.id);
            const result = await pool.query(
                `UPDATE fixtures SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
                values
            );
            return res.json({ success: true, data: mapFixture(result.rows[0]) });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update fixture error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Delete a fixture
router.delete('/api/fixtures/:id', requireAuth, async (req, res) => {
    try {
        const fixtureResult = await pool.query('SELECT team_id FROM fixtures WHERE id = $1', [req.params.id]);
        if (fixtureResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Fixture not found' });
        }

        const teamId = fixtureResult.rows[0].team_id;
        const role = await getTeamRole(teamId, req.user.id);

        if (role === null) {
            return res.status(403).json({ success: false, error: 'No access' });
        }

        if (!roleSatisfies(role, 'coach')) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions' });
        }

        await pool.query('DELETE FROM fixtures WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete fixture error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
