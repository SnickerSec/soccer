/**
 * Player routes
 */

import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireTeamAccess, getTeamRole, roleSatisfies } from '../middleware.js';
import { validateRenames, renameMap, rewriteGameNames } from '../player-rename.js';

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

/**
 * Moves a player's name across the roster and every game that records it.
 *
 * Runs inside the roster-replace transaction and before the replace itself, so
 * the upsert that follows matches the renamed row by its new name and updates
 * it rather than deleting the old row and inserting a fresh one — which would
 * hand the player a new id and drop the row's history.
 *
 * Returns an error message when a target name is already taken. Letting that
 * reach the UNIQUE(team_id, name) constraint instead would surface as an
 * opaque 500 from inside the transaction.
 */
async function applyRenames(client, teamId, renames) {
    const map = renameMap(renames);
    const froms = [...map.keys()];
    const tos = [...map.values()];

    const taken = await client.query(
        'SELECT name FROM players WHERE team_id = $1 AND name = ANY($2::text[])',
        [teamId, tos]
    );

    if (taken.rows.length > 0) {
        return `A player named "${taken.rows[0].name}" is already on this roster`;
    }

    // One statement for the whole set: unnest pairs each old name with its new
    // one, so a rename costs a single round trip however many it carries. A
    // `from` that is no longer on the roster simply matches nothing.
    await client.query(
        `UPDATE players SET name = pairs.to_name
         FROM (SELECT unnest($2::text[]) AS from_name, unnest($3::text[]) AS to_name) AS pairs
         WHERE players.team_id = $1 AND players.name = pairs.from_name`,
        [teamId, froms, tos]
    );

    // Games hold names inside JSONB and a TEXT[], so they are rewritten in
    // JavaScript rather than in SQL. Only the rows that actually mention the
    // player are written back.
    const games = await client.query(
        'SELECT id, player_snapshot, lineup, captains FROM games WHERE team_id = $1',
        [teamId]
    );

    for (const row of games.rows) {
        const rewritten = rewriteGameNames(row, map);
        if (!rewritten.changed) continue;

        await client.query(
            `UPDATE games SET player_snapshot = $1, lineup = $2, captains = $3
             WHERE id = $4`,
            [
                JSON.stringify(rewritten.playerSnapshot),
                JSON.stringify(rewritten.lineup),
                rewritten.captains,
                row.id
            ]
        );
    }

    return null;
}

/**
 * The roster's concurrency token. Read alongside the roster so a client can
 * hand it back on write, and bumped by every write.
 */
async function readRosterVersion(client, teamId) {
    const { rows } = await client.query(
        'SELECT roster_version FROM teams WHERE id = $1',
        [teamId]
    );
    return rows[0] ? Number(rows[0].roster_version) : null;
}

// List players for a team
router.get('/api/teams/:teamId/players', requireTeamAccess('viewer'), async (req, res) => {
    try {
        const teamId = req.params.teamId;

        // One round trip: the version has to describe the same roster that is
        // being returned, and two queries could straddle another coach's write.
        const result = await pool.query(
            `SELECT p.*, t.roster_version
               FROM teams t
               LEFT JOIN players p ON p.team_id = t.id
              WHERE t.id = $1
              ORDER BY p.sort_order ASC`,
            [teamId]
        );

        // The LEFT JOIN still yields one row for a team with an empty roster
        const players = result.rows.filter(row => row.id !== null).map(mapPlayer);
        const version = result.rows[0] ? Number(result.rows[0].roster_version) : null;

        res.json({ success: true, data: players, version });
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
    const { players, expectedVersion, renames } = req.body;

    const invalid = validatePlayers(players);
    if (invalid) {
        return res.status(400).json({ success: false, error: invalid });
    }

    const invalidRenames = validateRenames(renames);
    if (invalidRenames) {
        return res.status(400).json({ success: false, error: invalidRenames });
    }

    if (expectedVersion !== undefined && !Number.isInteger(expectedVersion)) {
        return res.status(400).json({ success: false, error: 'expectedVersion must be an integer' });
    }

    const teamId = req.params.teamId;
    const toWrite = dedupeByName(players);
    const keepNames = toWrite.map(p => p.name);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // FOR UPDATE holds the team row for the rest of the transaction, so two
        // coaches saving at once are serialised here rather than both reading
        // the same version and both deciding they are current.
        const locked = await client.query(
            'SELECT roster_version FROM teams WHERE id = $1 FOR UPDATE',
            [teamId]
        );

        if (locked.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Team not found' });
        }

        const currentVersion = Number(locked.rows[0].roster_version);

        // Omitting expectedVersion writes unconditionally. Kept for the offline
        // queue, whose entries were recorded before any version was known, and
        // so that an older client is not locked out by a newer server.
        if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
            // Read before releasing: still inside the transaction that holds
            // the lock, so this roster is the one currentVersion describes. On
            // the pool after ROLLBACK, a third write could land in between and
            // the pair handed back would not match.
            const current = await client.query(
                'SELECT * FROM players WHERE team_id = $1 ORDER BY sort_order ASC',
                [teamId]
            );

            await client.query('ROLLBACK');

            // The caller cannot merge without seeing what it collided with, so
            // send the winning roster back rather than only saying "conflict".
            return res.status(409).json({
                success: false,
                conflict: true,
                error: 'The roster changed since you loaded it',
                version: currentVersion,
                data: current.rows.map(mapPlayer)
            });
        }

        // Before the replace, so the upsert below matches renamed players by
        // their new name and keeps their row — see applyRenames.
        if (Array.isArray(renames) && renames.length > 0) {
            const renameError = await applyRenames(client, teamId, renames);
            if (renameError) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, error: renameError });
            }
        }

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

        const bumped = await client.query(
            'UPDATE teams SET roster_version = roster_version + 1 WHERE id = $1 RETURNING roster_version',
            [teamId]
        );

        await client.query('COMMIT');

        res.json({
            success: true,
            data: inSentOrder(rows, toWrite),
            version: Number(bumped.rows[0].roster_version)
        });
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
