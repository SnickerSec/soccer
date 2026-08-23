/**
 * The player evaluation list — the form behind the printable evaluation PDF.
 *
 * The rating here is not the one the lineup generator reads. This is
 * `player.rating`, a 1-5 end-of-season assessment that goes on the AYSO form;
 * the generator uses `player.overallRating` and `player.positionalRatings`,
 * which are set in the ratings dialog. Two fields, two purposes, similar names.
 */

/** The AYSO evaluation scale, as the <option> values and their wording. */
export const EVALUATION_RATINGS = [
    { value: '', label: '-' },
    { value: '1', label: '1 - Limited' },
    { value: '2', label: '2 - Fair' },
    { value: '3', label: '3 - Average' },
    { value: '4', label: '4 - Very Accomplished' },
    { value: '5', label: '5 - Excellent' }
];

const EMPTY_MESSAGE = 'No players added yet. Add players in the Roster Management tab.';

/**
 * Whether an option is the one currently set.
 *
 * The unrated case is why this is a function: parseInt('') is NaN, and NaN
 * matches nothing, so a player with no rating used to leave every option
 * unselected and rely on the browser falling back to the first one.
 */
export function isSelectedRating(player, optionValue) {
    if (optionValue === '') return player.rating == null;
    return player.rating === Number(optionValue);
}

function nameCell(player) {
    const cell = document.createElement('div');
    cell.className = 'eval-player-name';
    cell.appendChild(document.createTextNode(player.name));

    if (player.number) {
        const number = document.createElement('span');
        number.className = 'eval-player-number';
        number.textContent = `#${player.number}`;
        cell.appendChild(number);
    }

    return cell;
}

function ratingField(player, index, onRatingChange) {
    const group = document.createElement('div');
    group.className = 'eval-rating-group';

    const label = document.createElement('label');
    label.setAttribute('for', `rating-${index}`);
    label.textContent = 'Rating';

    const select = document.createElement('select');
    select.id = `rating-${index}`;
    // The visible label says only "Rating", which is ambiguous once several
    // players are on screen
    select.setAttribute('aria-label', `Rating for ${player.name}`);
    select.addEventListener('change', () => onRatingChange(index, select.value));

    for (const rating of EVALUATION_RATINGS) {
        const option = document.createElement('option');
        option.value = rating.value;
        option.textContent = rating.label;
        option.selected = isSelectedRating(player, rating.value);
        select.appendChild(option);
    }

    group.append(label, select);
    return group;
}

function commentField(player, index, onCommentChange) {
    const group = document.createElement('div');
    group.className = 'eval-comment-group';

    const label = document.createElement('label');
    label.setAttribute('for', `comment-${index}`);
    label.textContent = 'Comments / Parental Support';

    const textarea = document.createElement('textarea');
    textarea.id = `comment-${index}`;
    textarea.placeholder = 'Enter comments about player skill or parental support...';
    textarea.value = player.comment || '';
    textarea.setAttribute('aria-label', `Comments for ${player.name}`);
    textarea.addEventListener('change', () => onCommentChange(index, textarea.value));

    group.append(label, textarea);
    return group;
}

/**
 * The evaluation form for the whole roster, as a fragment.
 *
 * @param {Array} players
 * @param {object} handlers
 * @param {Function} handlers.onRatingChange called with (index, value)
 * @param {Function} handlers.onCommentChange called with (index, text)
 */
export function buildEvaluationList(players, { onRatingChange, onCommentChange }) {
    const fragment = document.createDocumentFragment();

    if (players.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'evaluation-empty';
        empty.textContent = EMPTY_MESSAGE;
        fragment.appendChild(empty);
        return fragment;
    }

    players.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = 'evaluation-player-item';
        item.append(
            nameCell(player),
            ratingField(player, index, onRatingChange),
            commentField(player, index, onCommentChange)
        );
        fragment.appendChild(item);
    });

    return fragment;
}
