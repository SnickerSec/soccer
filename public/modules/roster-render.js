/**
 * The roster list: one row per player, with the controls that edit them.
 *
 * Built as DOM nodes rather than markup, so a player name is never parsed as
 * HTML. Nothing here listens for anything — the list is handled by delegation
 * on the container, and every control carries the dataset the handler reads —
 * which is what lets this be a plain function of the roster.
 */

/**
 * Player statuses, as the <option> values and the CSS class suffixes.
 *
 * These mirror CONSTANTS.PLAYER_STATUS. constants.js is a plain script rather
 * than a module, so it cannot be imported here; tests/roster-render.test.js
 * reads it and fails if the two ever disagree.
 */
export const STATUSES = [
    { value: 'available', symbol: '●', className: 'status-available' },
    { value: 'injured', symbol: '✚', className: 'status-injured' },
    { value: 'absent', symbol: '✖', className: 'status-absent' }
];

const DEFAULT_STATUS = 'available';

/** The class that colours a row by availability. */
export function statusClassFor(status) {
    const known = STATUSES.find(s => s.value === status);
    return (known || STATUSES[0]).className;
}

/** What a screen reader reads for the row itself. */
export function playerAriaLabel(player) {
    return `Player ${player.name}${player.number ? ` number ${player.number}` : ''}`;
}

/**
 * One of the small toggle buttons in a row.
 *
 * The three of these were written out longhand and had drifted apart in the
 * details — which of them set aria-pressed, which set a title.
 */
function prefButton({ player, pref, className, label, title, text, active, opensDialog }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pref-checkbox ${className}${active ? ' active' : ''}`;
    button.dataset.player = player.name;
    button.dataset.pref = pref;
    button.setAttribute('aria-label', label);
    button.title = title;
    button.textContent = text;

    if (opensDialog) {
        // Not a toggle: it opens the ratings dialog, and aria-pressed on a
        // button that opens something announces a state it does not have.
        button.setAttribute('aria-haspopup', 'dialog');
    } else {
        // String(Boolean(...)) rather than the raw property: a player object
        // without the key set aria-pressed="undefined".
        button.setAttribute('aria-pressed', String(Boolean(active)));
    }

    return button;
}

function captainCheckbox(player, isCaptain) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'captain-checkbox';
    input.checked = isCaptain;
    input.dataset.player = player.name;
    input.setAttribute('aria-label', `Select ${player.name} as captain`);
    input.title = 'Captain';
    return input;
}

function numberInput(player, index, { min, max }) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'player-number-edit';
    input.value = player.number || '';
    input.placeholder = '#';
    input.min = min;
    input.max = max;
    input.dataset.index = index;
    input.setAttribute('aria-label', `Jersey number for ${player.name}`);
    // Clicking the field must not also toggle the row it sits in
    input.onclick = (event) => event.stopPropagation();
    return input;
}

function nameCell(player, isCaptain) {
    const span = document.createElement('span');
    span.className = 'player-name-display';

    if (isCaptain) {
        const star = document.createElement('span');
        star.className = 'captain-star';
        star.textContent = '★';
        span.append(star, document.createTextNode(' '));
    }

    span.appendChild(document.createTextNode(player.name));
    return span;
}

function statusSelect(player, status) {
    const select = document.createElement('select');
    select.className = `player-status-select ${statusClassFor(status)}`;
    select.dataset.player = player.name;
    select.setAttribute('aria-label', `Status for ${player.name}`);

    for (const { value, symbol } of STATUSES) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = symbol;
        option.selected = status === value;
        select.appendChild(option);
    }

    return select;
}

function removeButton(player) {
    const button = document.createElement('button');
    button.className = 'remove-btn';
    button.dataset.player = player.name;
    button.setAttribute('aria-label', `Remove ${player.name} from roster`);
    button.title = 'Remove player';
    button.textContent = '×';
    return button;
}

/** One roster row. */
function buildPlayerRow(player, index, { isCaptain, numberRange }) {
    const item = document.createElement('li');
    item.setAttribute('role', 'listitem');
    item.setAttribute('aria-label', playerAriaLabel(player));

    const status = player.status || DEFAULT_STATUS;
    const hasRating = player.overallRating != null;

    const prefs = document.createElement('div');
    prefs.className = 'player-preferences';
    prefs.append(
        prefButton({
            player, pref: 'noKeeper', className: 'no-keeper', text: 'GK',
            title: 'No Keeper', active: player.noKeeper,
            label: `Toggle no goalkeeper for ${player.name}`
        }),
        prefButton({
            player, pref: 'mustRest', className: 'must-rest', text: 'R',
            title: 'Must Rest', active: player.mustRest,
            label: `Toggle must rest for ${player.name}`
        }),
        prefButton({
            player, pref: 'rating', className: 'player-rating-btn',
            text: hasRating ? player.overallRating : '★',
            title: hasRating ? `Overall: ${player.overallRating}/5` : 'Set Rating',
            active: hasRating,
            opensDialog: true,
            label: `Set ratings for ${player.name}`
        }),
        statusSelect(player, status)
    );

    const container = document.createElement('div');
    container.className = 'player-item-container';
    container.append(
        captainCheckbox(player, isCaptain),
        numberInput(player, index, numberRange),
        nameCell(player, isCaptain),
        prefs
    );

    item.append(container, removeButton(player));
    return item;
}

/**
 * The whole roster, as a fragment for the caller to place.
 *
 * @param {Array} players
 * @param {object} options
 * @param {Array<string>} options.captains names currently marked captain
 * @param {{min: number, max: number}} options.numberRange allowed shirt numbers
 */
export function buildRosterList(players, { captains = [], numberRange }) {
    const fragment = document.createDocumentFragment();

    players.forEach((player, index) => {
        fragment.appendChild(buildPlayerRow(player, index, {
            isCaptain: captains.includes(player.name),
            numberRange
        }));
    });

    return fragment;
}
