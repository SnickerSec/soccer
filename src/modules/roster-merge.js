/**
 * Three-way merge for a roster, used when a save is rejected as stale.
 *
 * Two coaches can hold the same team (team_members.role grants 'coach' and above
 * write access), and a roster write replaces the whole list. Without a merge,
 * the second save silently discards the first's work — which is what the
 * server's 409 now prevents and this decides what to do about.
 *
 * The three sides:
 *   base   — the roster as it was pulled, before any local edit
 *   local  — what this coach is trying to save
 *   remote — what the server has now, which base no longer matches
 *
 * Players are matched by name, which is what the server keys on too
 * (UNIQUE(team_id, name)). A rename therefore reads as a remove plus an add,
 * the same way it does to the server.
 */

/**
 * Fields that make up a player, for deciding whether two versions differ.
 *
 * sortOrder is deliberately absent: the merge renumbers it at the end, so
 * counting it here would turn a reorder by both coaches into a conflict on
 * every player who moved, when there is nothing to settle.
 */
const FIELDS = [
    'number', 'isCaptain', 'mustRest', 'noKeeper', 'status',
    'preferredPositions', 'overallRating', 'positionalRatings'
];

function byName(players) {
    return new Map((players || []).map(p => [p.name, p]));
}

/**
 * Whether two versions of the same player differ in any field a coach can set.
 *
 * Compared field by field rather than by stringifying the whole object: the
 * server returns an `id` the local copy has not got, and key order is not
 * guaranteed to match either.
 */
function differs(a, b) {
    return FIELDS.some(field => {
        const left = a[field];
        const right = b[field];
        if (left === right) return false;
        // Arrays (preferredPositions) and objects (positionalRatings) need a
        // value comparison; both are small and JSON-safe.
        if (typeof left === 'object' || typeof right === 'object') {
            return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
        }
        // null and undefined both mean "unset" across the wire
        if (left == null && right == null) return false;
        return true;
    });
}

/**
 * Merges a rejected local roster against the roster that beat it.
 *
 * Returns `{ merged, conflicts }`. `merged` is the roster to save; `conflicts`
 * names the players both sides edited differently, which no rule can settle
 * without asking. When there are conflicts the caller should ask rather than
 * save — `merged` holds the remote value for those players, so saving anyway
 * keeps the other coach's edit rather than inventing a blend.
 *
 * @param {object} args
 * @param {Array} args.base    roster as pulled, before local edits
 * @param {Array} args.local   roster this client tried to save
 * @param {Array} args.remote  roster the server has now
 */
export function mergeRosters({ base, local, remote }) {
    const baseByName = byName(base);
    const localByName = byName(local);
    const remoteByName = byName(remote);

    const conflicts = [];
    const merged = [];
    const taken = new Set();

    /** Every name either side knows about, remote first so its order leads. */
    const names = [...remoteByName.keys()];
    for (const name of localByName.keys()) {
        if (!remoteByName.has(name)) names.push(name);
    }

    for (const name of names) {
        if (taken.has(name)) continue;
        taken.add(name);

        const inBase = baseByName.get(name);
        const inLocal = localByName.get(name);
        const inRemote = remoteByName.get(name);

        if (!inLocal) {
            // Absent from base too, so this is the other coach's new player
            // rather than one removed here. Nothing was removed; keep it.
            if (!inBase) {
                if (inRemote) merged.push(inRemote);
                continue;
            }

            // Removed locally. Only honour it if the other coach left the
            // player alone — a remove racing an edit is a genuine
            // disagreement, and deleting someone another coach just updated
            // is the worse guess.
            if (inRemote && differs(inBase, inRemote)) {
                conflicts.push(name);
                merged.push(inRemote);
            }
            continue;
        }

        // Added locally, and the other coach added the same name too. Same
        // person, two entries: take theirs and flag it if the details differ.
        if (!inBase && inRemote) {
            if (differs(inLocal, inRemote)) {
                conflicts.push(name);
                merged.push(inRemote);
            } else {
                merged.push(inRemote);
            }
            continue;
        }

        // Added locally, unknown to the other coach: keep it.
        if (!inBase) {
            merged.push(inLocal);
            continue;
        }

        // Removed by the other coach while edited here. Keeping the player is
        // the recoverable choice: a wrongly-kept player is deleted again in a
        // tap, a wrongly-deleted one has to be re-entered from memory.
        if (!inRemote) {
            if (differs(inBase, inLocal)) {
                conflicts.push(name);
                merged.push(inLocal);
            }
            continue;
        }

        const changedLocally = differs(inBase, inLocal);
        const changedRemotely = differs(inBase, inRemote);

        if (changedLocally && changedRemotely) {
            if (differs(inLocal, inRemote)) {
                conflicts.push(name);
                merged.push(inRemote);
            } else {
                // Both made the same edit; nothing to settle
                merged.push(inRemote);
            }
        } else if (changedLocally) {
            merged.push(inLocal);
        } else {
            merged.push(inRemote);
        }
    }

    // sortOrder is positional, so a merged list carrying two sides' indexes
    // would render in an order neither coach chose. Copied rather than
    // assigned in place: these are references into the caller's own arrays.
    return {
        merged: merged.map((player, index) => ({ ...player, sortOrder: index })),
        conflicts
    };
}
