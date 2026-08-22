/**
 * Player routes
 */

import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireTeamAccess, getTeamRole, roleSatisfies } from '../middleware.js';

const router = Router();

/**
 * Upper bound on a single roster write. A real AYSO roster is well under this;
 * the cap is here so a malformed or hostile payload cannot turn one request
 * into an unbounded insert.
 */
const MAX_PLAYERS = 100;

/** A players row as the API exposes it. */
function mapPlayer(p) {
    return {
        id: p.id,
        name: p.name,
        number: p.number,
        isCaptain: p.is_captain,
        mustRest: p.must_rest,
        noKeeper: p.no_keeper,
        status: p.status,
        preferredPositions: p.preferred_positions || [],
        sortOrder: p.sort_order,
        overallRating: p.overall_rating,
        positionalRatings: p.positional_ratings || {}
    };
}

/**
 * Validates a bulk roster payload, returning an error message or null.
 *
 * Runs before any database work: a rejected payload should never open a
 * transaction it then has to unwind.
 */
function validatePlayers(players) {
    if (!Array.isArray(players)) {
        return 'players must be an array';
    }

    if (players.length > MAX_PLAYERS) {
        return `A roster cannot exceed ${MAX_PLAYERS} players`;
    }

    for (const p of players) {
        if (!p || typeof p !== 'object') {
            return 'Each player must be an object';
        }
        if (!p.name || typeof p.name !== 'string' || p.name.trim().length === 0 || p.name.length > 255) {
            return 'Each player name is required and must be under 255 characters';
        }
        // The column has a 1-5 CHECK; without this the violation comes back as
        // an opaque 500 instead of saying which value was wrong.
        if (p.overallRating !== undefined && p.overallRating !== null && p.overallRating !== 0 &&
            !(Number.isInteger(p.overallRating) && p.overallRating >= 1 && p.overallRating <= 5)) {
            return 'Player ratings must be whole numbers from 1 to 5';
        }
        if (p.positionalRatings !== undefined && p.positionalRatings !== null &&
            (typeof p.positionalRatings !== 'object' || Array.isArray(p.positionalRatings))) {
            return 'Positional ratings must be an object';
        }
    }

    return null;
}

/**
 * Collapses repeats of the same name, keeping the last one.
 *
 * `ON CONFLICT DO UPDATE` cannot touch the same row twice within one statement,
 * so a multi-row upsert has to be deduplicated first. Last-wins matches what
 * row-at-a-time upserts did: a later entry overwrote the earlier one.
 *
 * sort_order is resolved from the original index before deduplication, so
 * dropping a duplicate does not renumber the players after it.
 */
function dedupeByName(players) {
    const byName = new Map();

    players.forEach((p, i) => {
        byName.set(p.name, { ...p, sortOrder: p.sortOrder ?? i });
    });

    return [...byName.values()];
}

// List players for a team
router.get('/api/teams/:teamId/players', requireTeamAccess('viewer'), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM players WHERE team_id = $1 ORDER BY sort_order ASC`,
            [req.params.teamId]
        );

        res.json({ success: true, data: result.rows.map(mapPlayer) });
    } catch (error) {
        console.error('List players error:', error);
        res.status(500).json({ success: false, error: 'Failed to list players' });
    }
});

// Bulk upsert players
router.post('/api/teams/:teamId/players', requireTeamAccess('coach'), async (req, res) => {
    const { players } = req.body;

    const invalid = validatePlayers(players);
    if (invalid) {
        return res.status(400).json({ success: false, error: invalid });
    }

    if (players.length === 0) {
        return res.json({ success: true, data: [] });
    }

    const teamId = req.params.teamId;
    const toWrite = dedupeByName(players);

    // One multi-row statement rather than a round trip per player: a 20-player
    // roster used to cost 20 sequential queries on every roster edit.
    const values = [teamId];
    const tuples = toWrite.map((p) => {
        const n = values.length;
        values.push(
            p.name,
            p.number || null,
            p.isCaptain || false,
            p.mustRest || false,
            p.noKeeper || false,
            p.status || 'available',
            p.preferredPositions || [],
            p.sortOrder,
            p.overallRating || null,
            JSON.stringify(p.positionalRatings || {})
        );
        return `($1, $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}, $${n + 8}, $${n + 9}, $${n + 10})`;
    });

    try {
        const result = await pool.query(
            `INSERT INTO players (team_id, name, number, is_captain, must_rest, no_keeper, status, preferred_positions, sort_order, overall_rating, positional_ratings)
             VALUES ${tuples.join(', ')}
             ON CONFLICT (team_id, name) DO UPDATE SET
                number = EXCLUDED.number,
                is_captain = EXCLUDED.is_captain,
                must_rest = EXCLUDED.must_rest,
                no_keeper = EXCLUDED.no_keeper,
                status = EXCLUDED.status,
                preferred_positions = EXCLUDED.preferred_positions,
                sort_order = EXCLUDED.sort_order,
                overall_rating = EXCLUDED.overall_rating,
                positional_ratings = EXCLUDED.positional_ratings
             RETURNING *`,
            values
        );

        // RETURNING order is not guaranteed, so hand back the roster in the
        // order it was sent.
        const saved = new Map(result.rows.map(row => [row.name, row]));
        const data = toWrite
            .map(p => saved.get(p.name))
            .filter(Boolean)
            .map(mapPlayer);

        res.json({ success: true, data });
    } catch (error) {
        console.error('Bulk upsert players error:', error);
        res.status(500).json({ success: false, error: 'Failed to save players' });
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
        // Membership alone is not enough: a viewer is read-only, so writes
        // require at least coach.
        const role = await getTeamRole(teamId, req.user.id);

        if (role === null) {
            return res.status(403).json({ success: false, error: 'No access' });
        }

        if (!roleSatisfies(role, 'coach')) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions' });
        }

        await pool.query('DELETE FROM players WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete player error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete player' });
    }
});

export default router;
