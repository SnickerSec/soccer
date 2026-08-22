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

const PLAYER_COLUMNS = 'team_id, name, number, is_captain, must_rest, no_keeper, status, preferred_positions, sort_order, overall_rating, positional_ratings';

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
        // number and overall_rating both carry CHECK constraints; without these
        // a violation comes back as an opaque 500 instead of saying which value
        // was wrong — and inside the roster replace it would roll the whole
        // transaction back.
        if (p.number !== undefined && p.number !== null && p.number !== '' &&
            !(Number.isInteger(Number(p.number)) && Number(p.number) >= 0 && Number(p.number) <= 99)) {
            return 'Player numbers must be whole numbers from 0 to 99';
        }
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

/**
 * A multi-row upsert for the whole roster, so a roster edit costs one round
 * trip rather than one per player. team_id is bound once as $1 and reused by
 * every row.
 */
function upsertPlayersSql(players) {
    const tuples = players.map((_, i) => {
        const n = i * 10 + 1;
        return `($1, $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}, $${n + 8}, $${n + 9}, $${n + 10})`;
    });

    return `INSERT INTO players (${PLAYER_COLUMNS})
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
            RETURNING *`;
}

/** The bind parameters matching upsertPlayersSql, in column order. */
function upsertPlayersValues(players, teamId) {
    const values = [teamId];

    for (const p of players) {
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
    }

    return values;
}

/**
 * RETURNING gives no order guarantee, so hand the roster back in the order it
 * was sent.
 */
function inSentOrder(rows, sent) {
    const saved = new Map(rows.map(row => [row.name, row]));
    return sent.map(p => saved.get(p.name)).filter(Boolean).map(mapPlayer);
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

// Bulk upsert players — adds and updates, but never removes
router.post('/api/teams/:teamId/players', requireTeamAccess('coach'), async (req, res) => {
    const { players } = req.body;

    const invalid = validatePlayers(players);
    if (invalid) {
        return res.status(400).json({ success: false, error: invalid });
    }

    if (players.length === 0) {
        return res.json({ success: true, data: [] });
    }

    const toWrite = dedupeByName(players);

    try {
        const result = await pool.query(
            upsertPlayersSql(toWrite),
            upsertPlayersValues(toWrite, req.params.teamId)
        );

        res.json({ success: true, data: inSentOrder(result.rows, toWrite) });
    } catch (error) {
        console.error('Bulk upsert players error:', error);
        res.status(500).json({ success: false, error: 'Failed to save players' });
    }
});

/**
 * Replace a team's roster in one transaction.
 *
 * The client used to do this as two requests — DELETE the roster, then POST the
 * new one — so a failure or a dropped connection between them left the team
 * with no players at all. One transaction makes the swap atomic: either the new
 * roster lands or the old one is untouched.
 *
 * This is also what makes a removal sync. A plain upsert only adds and updates,
 * so a player deleted locally (or deleted while offline and then replayed from
 * the queue) stayed on the server forever.
 */
router.put('/api/teams/:teamId/players', requireTeamAccess('coach'), async (req, res) => {
    const { players } = req.body;

    const invalid = validatePlayers(players);
    if (invalid) {
        return res.status(400).json({ success: false, error: invalid });
    }

    const teamId = req.params.teamId;
    const toWrite = dedupeByName(players);
    const keepNames = toWrite.map(p => p.name);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Drop whoever is no longer on the roster. An empty roster clears it.
        await client.query(
            'DELETE FROM players WHERE team_id = $1 AND name <> ALL($2::text[])',
            [teamId, keepNames]
        );

        let rows = [];
        if (toWrite.length > 0) {
            const result = await client.query(
                upsertPlayersSql(toWrite),
                upsertPlayersValues(toWrite, teamId)
            );
            rows = result.rows;
        }

        await client.query('COMMIT');

        res.json({ success: true, data: inSentOrder(rows, toWrite) });
    } catch (error) {
        // A failed BEGIN would make ROLLBACK throw as well, and that would
        // escape the handler and leave the request hanging.
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Rollback failed after roster replace error:', rollbackError);
        }
        console.error('Replace roster error:', error);
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
