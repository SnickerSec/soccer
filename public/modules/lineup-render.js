/**
 * Renders the generated lineup: validation messages and the per-quarter cards.
 *
 * Building the DOM is separated from deciding what a drag means. Rows are made
 * draggable here, but a completed drop is handed back to the caller through
 * `onSwap` rather than mutating any lineup state directly.
 */

import { createFieldVisualization } from './field-visualization.js';

/**
 * Replaces the contents of `container` with the rotation validation result.
 *
 * The container is a live region, so writing into it is what announces rule
 * violations to screen readers.
 */
export function renderValidationMessages(container, issues) {
    container.textContent = '';

    if (issues.length === 0) {
        const p = document.createElement('p');
        p.className = 'success';
        p.textContent = '✓ All rotation rules satisfied!';
        container.appendChild(p);
        container.classList.remove('has-issues');
        return;
    }

    const heading = document.createElement('h3');
    heading.textContent = 'Rotation Issues:';
    container.appendChild(heading);

    issues.forEach(issue => {
        const p = document.createElement('p');
        p.textContent = issue;
        container.appendChild(p);
    });

    container.classList.add('has-issues');
}

/**
 * Makes a row both a drag source and a drop target.
 *
 * `slot` identifies what the row holds — `{ quarter, position, player }`. A
 * drop calls onSwap(fromQuarter, fromPosition, toQuarter, toPosition), where
 * "from" is the row being dragged and "to" is this row.
 */
function makeSwappable(row, slot, onSwap) {
    row.draggable = true;

    row.addEventListener('dragstart', (e) => {
        row.classList.add('dragging');
        e.dataTransfer.setData('text/plain', JSON.stringify(slot));
        e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
    });

    row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
    });

    row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const from = JSON.parse(e.dataTransfer.getData('text/plain'));
        onSwap(from.quarter, from.position, slot.quarter, slot.position);
    });
}

/**
 * The player cell: shirt number, captain star, then the name.
 *
 * `displayName` is shown as-is so an unfilled position can read "TBD" while
 * `player` is undefined.
 */
function buildPlayerNameCell(displayName, player) {
    const cell = document.createElement('td');
    cell.className = 'player-name';

    if (player?.number) {
        const number = document.createElement('span');
        number.className = 'player-number';
        number.textContent = `#${player.number}`;
        cell.appendChild(number);
        cell.appendChild(document.createTextNode(' '));
    }

    if (player?.isCaptain) {
        const star = document.createElement('span');
        star.className = 'captain-star';
        star.textContent = '⭐';
        cell.appendChild(star);
        cell.appendChild(document.createTextNode(' '));
    }

    cell.appendChild(document.createTextNode(displayName));
    return cell;
}

function buildPositionCell(text, className = 'position') {
    const cell = document.createElement('td');
    cell.className = className;
    cell.textContent = text;
    return cell;
}

/** One row per position on the field. */
function buildPositionRow(quarter, position, players, onSwap) {
    const playerName = quarter.positions[position] || 'TBD';
    const player = players.find(p => p.name === playerName);

    const row = document.createElement('tr');
    row.className = position === 'Keeper' ? 'keeper-row draggable-row' : 'draggable-row';
    row.dataset.quarter = quarter.quarter;
    row.dataset.position = position;
    row.dataset.player = playerName;

    makeSwappable(row, { quarter: quarter.quarter, position, player: playerName }, onSwap);

    row.appendChild(buildPositionCell(`${position}:`));
    row.appendChild(buildPlayerNameCell(playerName, player));
    return row;
}

/**
 * One row per resting player.
 *
 * Their slot is keyed `Sitting:<name>` so a drop can tell benched players apart
 * from one another, since they share a quarter and have no position.
 */
function buildSittingRow(quarter, player, isFirst, onSwap) {
    const row = document.createElement('tr');
    // draggable-row carries the grab cursor and the dragging/drag-over
    // feedback. Bench rows are draggable, so without it they moved with no
    // visual response at all.
    row.className = 'sitting-row draggable-row';

    makeSwappable(
        row,
        { quarter: quarter.quarter, position: `Sitting:${player.name}`, player: player.name },
        onSwap
    );

    row.appendChild(buildPositionCell(isFirst ? 'Resting:' : ''));
    row.appendChild(buildPlayerNameCell(player.name, player));
    return row;
}

/** A quarter's card: heading, pitch diagram, and the position/resting table. */
function buildQuarterCard(quarter, { positions, players, onSwap }) {
    const card = document.createElement('div');
    card.className = 'quarter-lineup';

    const heading = document.createElement('h3');
    heading.textContent = `Quarter ${quarter.quarter}`;
    card.appendChild(heading);

    card.appendChild(createFieldVisualization(quarter, positions, players));

    const table = document.createElement('table');

    positions.forEach(position => {
        table.appendChild(buildPositionRow(quarter, position, players, onSwap));
    });

    players
        .filter(p => p.quartersSitting.includes(quarter.quarter))
        .forEach((player, index) => {
            table.appendChild(buildSittingRow(quarter, player, index === 0, onSwap));
        });

    card.appendChild(table);
    return card;
}

/**
 * Builds every quarter card as a fragment, for the caller to place.
 *
 * @param lineup   the quarters to render
 * @param options  positions (in display order), players, and onSwap
 */
export function buildLineupGrid(lineup, options) {
    const fragment = document.createDocumentFragment();
    lineup.forEach(quarter => fragment.appendChild(buildQuarterCard(quarter, options)));
    return fragment;
}
