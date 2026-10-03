/**
 * The quarter cards, flattened for the printed sheet.
 *
 * A coach on the touchline reads paper, so the sheet holds only what is needed
 * to make a substitution: the position, the player in it and the number on
 * their back. The numbers live on the roster and the lineup records only names
 * — the engine assigns `positions[position] = player.name` — so they are looked
 * up here rather than left off the page.
 */

import { getPositionsForFormation } from './formations.js';
import { sittingInQuarter } from './lineup-engine.js';

/** Jersey numbers by player name, skipping anyone who has not been given one. */
function numbersByName(players) {
    const numbers = new Map();
    (players || []).forEach((player) => {
        if (player?.name && player.number !== undefined && player.number !== null && player.number !== '') {
            numbers.set(player.name, player.number);
        }
    });
    return numbers;
}

/**
 * One printed row. A slot the engine could not fill reads 'TBD', as it does on
 * screen: a blank on paper looks like a printing fault rather than a gap in the
 * lineup.
 */
function entryFor(value, numbers, captains) {
    const name = (typeof value === 'string' ? value : value?.name) || '';
    const number = (typeof value === 'object' && value?.number != null)
        ? value.number
        : numbers.get(name);

    return {
        name: name || 'TBD',
        number: name && number !== undefined ? number : null,
        isCaptain: Boolean(name) && captains.includes(name)
    };
}

/**
 * The lineup as quarter cards: each with its positions in formation order and
 * the players sitting that quarter. An empty lineup prints nothing rather than
 * a page of headings.
 *
 * Who is resting comes from `sittingInQuarter`, which works it out from the
 * roster for a quarter that does not list them.
 */
export function printableQuarters(lineup, players = [], captains = []) {
    if (!lineup || !Array.isArray(lineup.quarters) || lineup.quarters.length === 0) {
        return [];
    }

    const canonical = getPositionsForFormation(
        lineup.fieldPlayers || 7,
        lineup.formation || '2-3-1'
    );
    const numbers = numbersByName(players);
    const captainNames = Array.isArray(captains) ? captains : [];

    return lineup.quarters.map((quarter, index) => {
        const positions = quarter?.positions || {};

        return {
            quarter: quarter?.quarter || index + 1,
            rows: canonical.map((position) => ({
                position,
                ...entryFor(positions[position], numbers, captainNames)
            })),
            sitting: sittingInQuarter(quarter, players)
                .map((value) => entryFor(value, numbers, captainNames))
        };
    });
}
