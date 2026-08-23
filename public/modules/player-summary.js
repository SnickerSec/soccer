/**
 * The player summary table under a generated lineup: who played when, and the
 * two preference toggles that change the next generation.
 *
 * The cell text is worked out separately from the table that holds it. Those
 * are the parts a coach reads off to check the rotation is fair, and every one
 * of them has an empty case that has to say something rather than nothing.
 */

/** Columns, in order. */
export const SUMMARY_HEADERS = [
    'Rest', 'No Keeper', 'Player', 'Captain',
    'Quarters Played', 'Quarters Resting', 'Defense/Offense', 'Positions'
];

/** A quarter list, or "None" — never an empty cell that reads as missing data. */
const quarterList = (quarters) => (quarters || []).join(', ') || 'None';

export function playerLabel(player) {
    return `${player.name}${player.number ? ` #${player.number}` : ''}`;
}

export function captainLabel(player) {
    return player.isCaptain ? '⭐ Yes' : 'No';
}

/** How many quarters they spent on each half of the pitch. */
export function balanceLabel(player) {
    return `D: ${player.defensiveQuarters || 0} / O: ${player.offensiveQuarters || 0}`;
}

export function positionsLabel(player) {
    const positions = (player.positionsPlayed || [])
        .map(p => `Q${p.quarter}: ${p.position}`)
        .join(', ');
    return positions || 'None';
}

/** The six read-only cells of a row, in column order. */
export function summaryCells(player) {
    return [
        playerLabel(player),
        captainLabel(player),
        quarterList(player.quartersPlayed),
        quarterList(player.quartersSitting),
        balanceLabel(player),
        positionsLabel(player)
    ];
}

/** One of the two preference checkboxes. */
function toggleCell(player, { className, title, label, checked, onChange }) {
    const cell = document.createElement('td');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = className;
    input.checked = Boolean(checked);
    input.title = title;
    // The column header names the setting but not the player, and a screen
    // reader reading a row needs both
    input.setAttribute('aria-label', `${label} for ${player.name}`);
    input.addEventListener('change', () => onChange(player.name));

    cell.appendChild(input);
    return cell;
}

function buildRow(player, { onToggleRest, onToggleNoKeeper }) {
    const row = document.createElement('tr');

    row.append(
        toggleCell(player, {
            className: 'rest-checkbox',
            title: 'Check to ensure this player rests at least 1 quarter',
            label: 'Must rest at least one quarter',
            checked: player.mustRest,
            onChange: onToggleRest
        }),
        toggleCell(player, {
            className: 'no-keeper-checkbox',
            title: 'Check to prevent this player from playing keeper',
            label: 'Never play keeper',
            checked: player.noKeeper,
            onChange: onToggleNoKeeper
        })
    );

    for (const text of summaryCells(player)) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.appendChild(cell);
    }

    return row;
}

/**
 * The summary table.
 *
 * @param {Array} players
 * @param {object} handlers
 * @param {Function} handlers.onToggleRest called with a player name
 * @param {Function} handlers.onToggleNoKeeper called with a player name
 */
export function buildPlayerSummaryTable(players, handlers) {
    const table = document.createElement('table');

    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const text of SUMMARY_HEADERS) {
        const cell = document.createElement('th');
        // scope is what ties a cell to its column for a screen reader reading
        // across a row
        cell.scope = 'col';
        cell.textContent = text;
        headRow.appendChild(cell);
    }
    head.appendChild(headRow);

    const body = document.createElement('tbody');
    for (const player of players) {
        body.appendChild(buildRow(player, handlers));
    }

    table.append(head, body);
    return table;
}
