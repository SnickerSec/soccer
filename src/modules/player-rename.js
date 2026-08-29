/**
 * Renaming a player in the local roster and season history.
 *
 * The server does the same to its own copy (`server/player-rename.js`) when the
 * roster save carrying the rename lands. This side exists because the app is
 * offline-first: the coach sees the new name across the season tab immediately,
 * whether or not there is a network, and a signed-out coach with no cloud team
 * at all still gets a rename that keeps their history.
 *
 * A saved game holds names in three places, and in two shapes. A game saved on
 * this device keys its per-quarter lineup as `quarters`; one pulled from the
 * cloud arrives as `lineup` (see mapGame in server/routes/games.js). Both are
 * handled here rather than normalised, because normalising would rewrite games
 * this rename has no business touching.
 */

const MAX_NAME_LENGTH = 255;

/**
 * Checks a proposed rename against the current roster, returning an error
 * message or null.
 *
 * The duplicate check is case-insensitive to match handleAddPlayer: a roster
 * holding both "alex kim" and "Alex Kim" is a mistake however it was made, and
 * the two would be separate players in every season total.
 */
export function validateRename(players, from, to) {
    const trimmed = typeof to === 'string' ? to.trim() : '';

    if (trimmed.length === 0) {
        return 'A player name cannot be empty';
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
        return `A player name must be under ${MAX_NAME_LENGTH} characters`;
    }
    if (trimmed === from) {
        return null;
    }
    if ((players || []).some(p => p.name !== from && p.name.toLowerCase() === trimmed.toLowerCase())) {
        return `Player with name "${trimmed}" already exists`;
    }

    return null;
}

/**
 * Maps a list, handing back the list itself when nothing in it moved.
 *
 * Identity is the signal React re-renders on, and it is what renameInGame uses
 * to decide whether a game was touched at all — a fresh array of unchanged
 * elements would report every game as rewritten.
 */
function mapIfChanged(list, rewrite) {
    if (!Array.isArray(list)) return list;

    let changed = false;
    const mapped = list.map(item => {
        const next = rewrite(item);
        if (next !== item) changed = true;
        return next;
    });

    return changed ? mapped : list;
}

/** The per-quarter position map, which holds names as its values. */
function renameInQuarters(quarters, from, to) {
    return mapIfChanged(quarters, quarter => {
        const positions = quarter && quarter.positions;
        if (!positions || typeof positions !== 'object' || Array.isArray(positions)) {
            return quarter;
        }

        let changed = false;
        const rewritten = {};
        for (const [position, name] of Object.entries(positions)) {
            if (name === from) {
                rewritten[position] = to;
                changed = true;
            } else {
                rewritten[position] = name;
            }
        }

        return changed ? { ...quarter, positions: rewritten } : quarter;
    });
}

/** A roster snapshot: the per-player record season stats are built from. */
function renameInSnapshot(snapshot, from, to) {
    return mapIfChanged(snapshot, player =>
        player && typeof player === 'object' && player.name === from
            ? { ...player, name: to }
            : player
    );
}

/** A plain list of names. */
function renameInNames(names, from, to) {
    return mapIfChanged(names, name => (name === from ? to : name));
}

/**
 * Rewrites one saved game so it records the new name.
 *
 * Returns the game unchanged — the same object, not a copy — when the player
 * never appeared in it, so React sees new identities only for the games that
 * actually moved.
 */
export function renameInGame(game, from, to) {
    if (!game || typeof game !== 'object') return game;

    const players = renameInSnapshot(game.players, from, to);
    const quarters = renameInQuarters(game.quarters, from, to);
    const lineup = renameInQuarters(game.lineup, from, to);
    const captains = renameInNames(game.captains, from, to);

    if (players === game.players && quarters === game.quarters &&
        lineup === game.lineup && captains === game.captains) {
        return game;
    }

    const renamed = { ...game };
    if (players !== game.players) renamed.players = players;
    if (quarters !== game.quarters) renamed.quarters = quarters;
    if (lineup !== game.lineup) renamed.lineup = lineup;
    if (captains !== game.captains) renamed.captains = captains;
    return renamed;
}

/** Every saved game, rewritten. */
export function renameInGames(games, from, to) {
    if (!Array.isArray(games)) return games;
    return games.map(game => renameInGame(game, from, to));
}

/**
 * Rewrites a generated lineup — the one currently on screen, which is held
 * separately from the saved games and carries its own player stats.
 */
export function renameInLineup(lineup, from, to) {
    if (!lineup || typeof lineup !== 'object') return lineup;

    const quarters = renameInQuarters(lineup.quarters, from, to);
    const playerStats = renameInSnapshot(lineup.playerStats, from, to);

    if (quarters === lineup.quarters && playerStats === lineup.playerStats) {
        return lineup;
    }

    return { ...lineup, quarters, playerStats };
}

/**
 * Decides which renames still apply once a rejected save has been merged.
 *
 * mergeRosters matches players by name, so a rename reads to it as a remove
 * plus an add. Usually that resolves the way the rename intended: the old name
 * is gone from the merged roster and the new one is there. But when the other
 * coach edited that same player, the merge keeps their version — and the
 * merged roster then holds both the old name and the new one, which would save
 * the player twice and rename a history that still belongs to the old entry.
 *
 * In that case the rename loses: its new entry is dropped and the old name
 * stands, because the other coach's edit is the one already recorded on the
 * server. The name is returned in `dropped` so the coach is told rather than
 * left wondering where the rename went.
 */
export function surviveMerge(merged, renames) {
    if (!Array.isArray(renames) || renames.length === 0) {
        return { renames: [], roster: merged, dropped: [] };
    }

    const names = new Set(merged.map(p => p.name));
    const kept = [];
    const dropped = [];
    const abandoned = new Set();

    for (const rename of renames) {
        if (names.has(rename.from)) {
            dropped.push(rename.from);
            abandoned.add(rename.to);
        } else {
            kept.push(rename);
        }
    }

    if (abandoned.size === 0) {
        return { renames: kept, roster: merged, dropped };
    }

    // Renumber, because dropping an entry leaves a gap in sortOrder that would
    // render the roster in an order neither coach chose.
    const roster = merged
        .filter(p => !abandoned.has(p.name))
        .map((player, index) => ({ ...player, sortOrder: index }));

    return { renames: kept, roster, dropped };
}