/**
 * Renaming a player, and carrying their season history with them.
 *
 * A player is identified by name everywhere it matters: `players` is keyed
 * UNIQUE(team_id, name), the roster replace matches rows by name, and a saved
 * game stores names rather than ids inside `player_snapshot`, `lineup` and
 * `captains`. So a rename that only touched `players` would leave every game
 * that player appeared in pointing at a name nobody holds any more, and season
 * stats — which key on name — would show the renamed player with no history
 * and an orphan entry beside them holding all of it.
 *
 * The rewrite therefore moves the name everywhere it is stored, in the same
 * transaction as the roster write that requested it. It is done here in
 * JavaScript rather than as JSONB surgery in SQL because the shapes are nested
 * and worth testing directly; renames are rare enough that reading a team's
 * games to rewrite them costs nothing on the paths that do not rename.
 */

const MAX_NAME_LENGTH = 255;

/**
 * Upper bound on renames in one save, matching the roster cap in
 * server/routes/players.js: there cannot be more renames than there are
 * players to rename.
 */
const MAX_RENAMES = 100;

/**
 * Validates a `renames` payload, returning an error message or null.
 *
 * Chains and swaps (A→B alongside B→C) are refused rather than ordered: a
 * single pass over the map cannot apply them correctly, and no interface
 * produces one. Refusing keeps the applied result identical to the requested
 * one, which is what matters when it is rewriting history.
 */
export function validateRenames(renames) {
    if (renames === undefined || renames === null) {
        return null;
    }

    if (!Array.isArray(renames)) {
        return 'renames must be an array';
    }

    if (renames.length > MAX_RENAMES) {
        return `A save cannot carry more than ${MAX_RENAMES} renames`;
    }

    const froms = new Set();
    const tos = new Set();

    for (const rename of renames) {
        if (!rename || typeof rename !== 'object' || Array.isArray(rename)) {
            return 'Each rename must be an object';
        }

        const { from, to } = rename;

        for (const value of [from, to]) {
            if (!value || typeof value !== 'string' || value.trim().length === 0 ||
                value.length > MAX_NAME_LENGTH) {
                return `Rename names are required and must be under ${MAX_NAME_LENGTH} characters`;
            }
        }

        if (from === to) {
            return 'A rename must change the name';
        }
        if (froms.has(from)) {
            return 'A player cannot be renamed twice in one save';
        }
        if (tos.has(to)) {
            return 'Two players cannot be renamed to the same name';
        }

        froms.add(from);
        tos.add(to);
    }

    for (const to of tos) {
        if (froms.has(to)) {
            return 'Renames cannot be chained or swapped in one save';
        }
    }

    return null;
}

/** The renames as a lookup, which is how every rewrite below wants them. */
export function renameMap(renames) {
    return new Map((renames || []).map(({ from, to }) => [from, to]));
}

/** The roster entries in `player_snapshot`, each carrying its own `name`. */
function rewriteSnapshot(snapshot, map) {
    if (!Array.isArray(snapshot)) return { changed: false, value: snapshot };

    let changed = false;
    const value = snapshot.map(player => {
        if (!player || typeof player !== 'object' || !map.has(player.name)) {
            return player;
        }
        changed = true;
        return { ...player, name: map.get(player.name) };
    });

    return { changed, value };
}

/**
 * The per-quarter lineup, which holds names as the *values* of its position
 * map — `{ quarter: 1, positions: { Keeper: 'Alex Kim' } }`.
 */
function rewriteLineup(lineup, map) {
    if (!Array.isArray(lineup)) return { changed: false, value: lineup };

    let changed = false;
    const value = lineup.map(quarter => {
        const positions = quarter && quarter.positions;
        if (!positions || typeof positions !== 'object' || Array.isArray(positions)) {
            return quarter;
        }

        let quarterChanged = false;
        const rewritten = {};
        for (const [position, name] of Object.entries(positions)) {
            if (typeof name === 'string' && map.has(name)) {
                rewritten[position] = map.get(name);
                quarterChanged = true;
            } else {
                rewritten[position] = name;
            }
        }

        if (!quarterChanged) return quarter;
        changed = true;
        return { ...quarter, positions: rewritten };
    });

    return { changed, value };
}

/** `games.captains` is a plain TEXT[] of names. */
function rewriteCaptains(captains, map) {
    if (!Array.isArray(captains)) return { changed: false, value: captains };

    let changed = false;
    const value = captains.map(name => {
        if (typeof name === 'string' && map.has(name)) {
            changed = true;
            return map.get(name);
        }
        return name;
    });

    return { changed, value };
}

/**
 * Applies a set of renames to one `games` row.
 *
 * Returns `{ changed, playerSnapshot, lineup, captains }`. When `changed` is
 * false the row is left alone rather than rewritten to the same value, so a
 * rename only touches the games the player actually appeared in.
 *
 * @param {object} row a games row: { player_snapshot, lineup, captains }
 * @param {Map<string,string>} map from old name to new
 */
export function rewriteGameNames(row, map) {
    const snapshot = rewriteSnapshot(row.player_snapshot, map);
    const lineup = rewriteLineup(row.lineup, map);
    const captains = rewriteCaptains(row.captains, map);

    return {
        changed: snapshot.changed || lineup.changed || captains.changed,
        playerSnapshot: snapshot.value,
        lineup: lineup.value,
        captains: captains.value
    };
}
