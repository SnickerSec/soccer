/**
 * Editing what a saved game records about the match that was actually played.
 *
 * A game is saved from a generated lineup, so everything it records about a
 * player — the quarters they played, the positions they held, the quarters
 * they sat, whether they kept goal — is *derived* from the quarters and from
 * who was available. Season stats read those derived fields and never the
 * quarters, so a lineup edited without recomputing them would show the coach a
 * corrected game and go on counting the one that was planned.
 *
 * Everything here is pure, and the bookkeeping mirrors `generateQuarterLineup`
 * in the lineup engine field for field, so a hand-edited game and a generated
 * one are the same shape and count the same way.
 */

import { isDefensivePosition } from './formations.js';
import { currentQuarters } from './season-stats.js';

/** What a position holds when nobody played it. */
export const EMPTY_SLOT = '';

/**
 * A saved game's quarters, ready to edit against a formation.
 *
 * Every position the formation has is present, empty where the game recorded
 * nobody, so a slot the coach needs to fill is on screen rather than missing.
 * Positions come back under the names the formation uses now — an old 3-3
 * stored Left/Center/Right Mid — which is also how they are written back, so
 * editing a game of that vintage settles its position names for good.
 */
export function editableQuarters(game, positions = []) {
    const saved = currentQuarters(game);
    const count = saved.length > 0 ? saved.length : 4;

    return Array.from({ length: count }, (_, index) => {
        const quarter = saved[index] || {};
        const recorded = quarter.positions || {};

        return {
            quarter: quarter.quarter ?? index + 1,
            positions: Object.fromEntries(
                positions.map((position) => [position, recorded[position] || EMPTY_SLOT])
            ),
        };
    });
}

/**
 * Put a player in a slot, taking them off whatever else they held that quarter.
 *
 * Nobody plays two positions at once, and a name left in a second slot would
 * be counted twice in that quarter — two positions played, two zone quarters,
 * off one player's afternoon.
 */
export function assignToSlot(quarters, quarterNumber, position, playerName) {
    return (quarters || []).map((quarter) => {
        if (quarter.quarter !== quarterNumber) return quarter;

        const positions = { ...quarter.positions };
        if (playerName) {
            for (const slot of Object.keys(positions)) {
                if (positions[slot] === playerName) positions[slot] = EMPTY_SLOT;
            }
        }
        positions[position] = playerName || EMPTY_SLOT;

        return { ...quarter, positions };
    });
}

/**
 * Take a player off the field for the whole match.
 *
 * Marking someone absent after the fact has to empty the slots they were
 * penciled into, or the game would record a player who was not there as having
 * played — and `recalculateGamePlayers` would then have to choose between the
 * status and the lineup.
 */
export function removePlayerFromQuarters(quarters, playerName) {
    if (!playerName) return quarters || [];

    return (quarters || []).map((quarter) => ({
        ...quarter,
        positions: Object.fromEntries(
            Object.entries(quarter.positions || {}).map(([slot, name]) => [
                slot,
                name === playerName ? EMPTY_SLOT : name,
            ])
        ),
    }));
}

/** Who took the field in a quarter, and where. */
function slotFor(quarter, playerName) {
    const entries = Object.entries(quarter.positions || {});
    const found = entries.find(([, name]) => name === playerName);
    return found ? found[0] : null;
}

/**
 * A saved game's per-player rows, recomputed from an edited lineup.
 *
 * A player who was not there records nothing: no quarters played and none sat.
 * `calculatePlayerStats` counts a game towards a player only when the game
 * names them, and an absence is a row with a status and empty counters — the
 * same shape a generated game gives someone who never entered the engine.
 */
export function recalculateGamePlayers(players = [], quarters = [], options = {}) {
    const { captains = [], statuses = {} } = options;
    const quarterList = Array.isArray(quarters) ? quarters : [];

    return (players || []).map((player) => {
        const status = statuses[player.name] ?? player.status ?? 'available';
        const base = {
            ...player,
            status,
            isCaptain: captains.includes(player.name),
            quartersPlayed: [],
            quartersSitting: [],
            positionsPlayed: [],
            offensiveQuarters: 0,
            defensiveQuarters: 0,
            goalieQuarter: null,
        };

        if (status !== 'available') return base;

        quarterList.forEach((quarter, index) => {
            const number = quarter.quarter ?? index + 1;
            const position = slotFor(quarter, player.name);

            if (!position) {
                base.quartersSitting.push(number);
                return;
            }

            base.quartersPlayed.push(number);
            base.positionsPlayed.push({ quarter: number, position });

            // The engine counts Keeper as a defensive quarter and records the
            // quarter it fell in; season stats pull it back out as its own zone.
            if (position === 'Keeper') base.goalieQuarter = number;
            if (isDefensivePosition(position)) {
                base.defensiveQuarters += 1;
            } else {
                base.offensiveQuarters += 1;
            }
        });

        return base;
    });
}

/**
 * The names a quarter has nobody for.
 *
 * An unfilled slot is allowed — a team that finished a man down played that
 * quarter short, and the record should say so — so this is what the coach is
 * shown, not what stops them saving.
 */
export function unfilledSlots(quarters = []) {
    return (quarters || []).flatMap((quarter, index) =>
        Object.entries(quarter.positions || {})
            .filter(([, name]) => !name)
            .map(([position]) => ({ quarter: quarter.quarter ?? index + 1, position }))
    );
}

/**
 * Captains, less anyone who turned out not to be there.
 *
 * `calculatePlayerStats` counts a captain game off the snapshot's `isCaptain`,
 * so leaving an absent player wearing the armband credits them for a match
 * they missed and skews who the balancing picks next week.
 */
export function captainsPresent(captains = [], statuses = {}) {
    return (captains || []).filter((name) => (statuses[name] ?? 'available') === 'available');
}
