/**
 * Renders the generated lineup: validation messages and the per-quarter cards.
 *
 * Building the DOM is separated from deciding what a swap means. Rows are made
 * swappable here, but a completed swap is handed back to the caller through
 * `onSwap` rather than mutating any lineup state directly.
 *
 * Two ways to swap, because HTML5 drag-and-drop only covers one of them:
 *
 *   - drag a row onto another (mouse)
 *   - pick a row, then pick its partner (tap, click, or Enter/Space)
 *
 * The second exists because dragstart/drop never fire for touch on iOS Safari
 * or Android Chrome, which made the feature inert on exactly the device this
 * app is installed on. It doubles as the keyboard path, since a drag has none.
 */

import { createFieldVisualization } from './field-visualization.js';

/**
 * The row awaiting a partner, or null. Module-level rather than per-grid: only
 * one selection can be open at a time across the whole lineup, and a swap can
 * pair rows in different quarters.
 */
let pendingSwap = null;

/** Text for the hint line, which doubles as each row's accessible description. */
const SWAP_HINT_ID = 'lineup-swap-hint';
const SWAP_HINT_IDLE = 'Drag a player onto another to swap them, or select two players in turn.';
const SWAP_HINT_ACTIVE = (name) => `${name} selected. Choose who to swap with, or press Escape to cancel.`;

function hintElement() {
    return document.getElementById(SWAP_HINT_ID);
}

function setHint(text) {
    const hint = hintElement();
    if (hint) hint.textContent = text;
}

/** Drops the pending selection and clears the marks that show it. */
function clearPendingSwap() {
    if (pendingSwap) {
        pendingSwap.row.classList.remove('swap-selected');
        pendingSwap.row.setAttribute('aria-selected', 'false');
    }
    pendingSwap = null;
    setHint(SWAP_HINT_IDLE);
}

/**
 * Human-readable name for a slot, for the accessible name and the hint.
 * Resting rows carry their player in the position key, so unpack that.
 */
function describeSlot(slot) {
    const resting = String(slot.position).startsWith('Sitting:');
    const where = resting ? 'resting' : slot.position;
    return `${slot.player}, ${where}, quarter ${slot.quarter}`;
}

/**
 * Selects a row, or completes the swap if one was already waiting.
 *
 * Re-selecting the same row cancels, so a mistaken pick is undone the same way
 * it was made rather than needing the keyboard.
 */
function togglePendingSwap(row, slot, onSwap) {
    // A regenerate between the two picks leaves the first row detached; treat
    // that as no selection rather than swapping against a row nobody can see.
    if (pendingSwap && !document.contains(pendingSwap.row)) {
        pendingSwap = null;
    }

    if (!pendingSwap) {
        pendingSwap = { row, slot };
        row.classList.add('swap-selected');
        row.setAttribute('aria-selected', 'true');
        setHint(SWAP_HINT_ACTIVE(describeSlot(slot)));
        return;
    }

    if (pendingSwap.row === row) {
        clearPendingSwap();
        return;
    }

    const from = pendingSwap.slot;
    clearPendingSwap();
    onSwap(from.quarter, from.position, slot.quarter, slot.position);
}

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
 * Makes a row a drag source, a drop target, and a select-to-swap control.
 *
 * `slot` identifies what the row holds — `{ quarter, position, player }`. A
 * completed swap calls onSwap(fromQuarter, fromPosition, toQuarter, toPosition),
 * where "from" is the row picked first and "to" is this row.
 */
function makeSwappable(row, slot, onSwap) {
    row.draggable = true;

    // Reachable and operable without a pointer, and named so the focus lands
    // on something announced as a player rather than as "row 3".
    //
    // No role override: a <tr> given role="button" stops being a row, which
    // leaves the table's structure incomplete and can cost a screen reader the
    // whole lineup. aria-selected is what role="row" already supports for
    // exactly this "picked, awaiting a partner" state.
    row.tabIndex = 0;
    row.setAttribute('aria-label', describeSlot(slot));
    row.setAttribute('aria-selected', 'false');
    row.setAttribute('aria-describedby', SWAP_HINT_ID);

    // Fires for taps as well as clicks, which is what gets touch working. A
    // completed drag does not emit a click, so the two paths do not collide.
    row.addEventListener('click', () => {
        togglePendingSwap(row, slot, onSwap);
    });

    row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            // Space would otherwise scroll the page out from under the lineup
            e.preventDefault();
            togglePendingSwap(row, slot, onSwap);
        } else if (e.key === 'Escape' && pendingSwap) {
            clearPendingSwap();
            row.focus();
        }
    });

    row.addEventListener('dragstart', (e) => {
        // A drag overrides a half-finished selection rather than combining
        // with it, so the two ways of swapping cannot interleave into a
        // pairing the coach did not ask for.
        clearPendingSwap();
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
    // The rows this pointed at are about to be replaced
    pendingSwap = null;

    const fragment = document.createDocumentFragment();

    // Visible as well as announced: select-to-swap leaves no trace on the page
    // otherwise, and a coach who cannot drag has no way to guess it is there.
    const hint = document.createElement('p');
    hint.id = SWAP_HINT_ID;
    hint.className = 'lineup-swap-hint';
    hint.textContent = SWAP_HINT_IDLE;
    hint.setAttribute('role', 'status');
    fragment.appendChild(hint);

    lineup.forEach(quarter => fragment.appendChild(buildQuarterCard(quarter, options)));
    return fragment;
}
