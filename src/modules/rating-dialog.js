/**
 * The star-rating dialog for one player.
 *
 * Ratings feed the lineup generator's strength balancing, so what a coach sets
 * here is not decoration. The conversion from five star counts to the two
 * fields actually stored is separated out, because that is where the rules live
 * — an unset overall is null rather than 0, and an unrated position is absent
 * rather than 0 — and the generator reads both.
 */

/** The rows of the dialog, in order. `key` is also the stored field name. */
export const RATING_CATEGORIES = [
    { key: 'overall', label: 'Overall' },
    { key: 'keeper', label: 'Goalkeeper' },
    { key: 'defense', label: 'Defense' },
    { key: 'midfield', label: 'Midfield' },
    { key: 'offense', label: 'Offense' }
];

const POSITIONAL_KEYS = RATING_CATEGORIES
    .map(c => c.key)
    .filter(key => key !== 'overall');

export const MAX_STARS = 5;

/** What a player currently has set, as star counts. */
export function ratingsOf(player) {
    const positional = player.positionalRatings || {};
    return {
        overall: player.overallRating || 0,
        ...Object.fromEntries(POSITIONAL_KEYS.map(key => [key, positional[key] || 0]))
    };
}

/**
 * Star counts to the fields stored on a player.
 *
 * Zero means unrated, and unrated has to be absent rather than 0: the generator
 * treats a missing overall as "no opinion" and falls back to an even split,
 * where a 0 would read as the worst player on the roster.
 */
export function ratingsToPlayerFields(values) {
    const positionalRatings = {};
    for (const key of POSITIONAL_KEYS) {
        if (values[key]) positionalRatings[key] = values[key];
    }
    return { overallRating: values.overall || null, positionalRatings };
}

/** Builds one row of five stars, and the reader that gets its value back. */
function buildStars(category, value, playerName) {
    const stars = document.createElement('div');
    stars.className = 'rating-stars';
    stars.dataset.category = category.key;
    stars.setAttribute('role', 'group');
    stars.setAttribute('aria-label', `${category.label} rating for ${playerName}`);

    const paint = (rating) => {
        stars.dataset.currentValue = rating;
        stars.querySelectorAll('.rating-star').forEach((star, index) => {
            const filled = index < rating;
            star.classList.toggle('filled', filled);
            star.setAttribute('aria-pressed', String(filled));
        });
    };

    for (let i = 1; i <= MAX_STARS; i++) {
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'rating-star';
        star.dataset.value = i;
        star.textContent = '★';
        // Without this a screen reader reads five identical stars per row and
        // gives no way to tell which one is being pressed
        star.setAttribute('aria-label', `${i} of ${MAX_STARS}, ${category.label}`);
        star.addEventListener('click', () => {
            const current = Number(stars.dataset.currentValue) || 0;
            // Clicking the star already at the end of the run clears the rating
            paint(current === i ? 0 : i);
        });
        stars.appendChild(star);
    }

    paint(value);
    return stars;
}

/**
 * Opens the ratings dialog for a player.
 *
 * @param {object} player
 * @param {object} options
 * @param {Function} options.onSave called with {overallRating, positionalRatings}
 */
export function openRatingDialog(player, { onSave }) {
    document.querySelector('.rating-dialog')?.remove();

    const dialog = document.createElement('dialog');
    dialog.className = 'rating-dialog';
    dialog.setAttribute('aria-label', `Ratings for ${player.name}`);

    const title = document.createElement('h3');
    title.textContent = `Ratings: ${player.name}`;

    const form = document.createElement('div');
    form.className = 'rating-form';

    const current = ratingsOf(player);
    for (const category of RATING_CATEGORIES) {
        const row = document.createElement('div');
        row.className = 'rating-row';

        const label = document.createElement('label');
        label.textContent = category.label;

        row.append(label, buildStars(category, current[category.key], player.name));
        form.appendChild(row);
    }

    const close = () => {
        dialog.close();
        dialog.remove();
    };

    /** The five star counts, read back off the form. */
    const readValues = () => Object.fromEntries(RATING_CATEGORIES.map(({ key }) => [
        key,
        Number(form.querySelector(`[data-category="${key}"]`).dataset.currentValue) || 0
    ]));

    const buttons = document.createElement('div');
    buttons.className = 'rating-dialog-buttons';
    buttons.append(
        button('Clear All', 'btn-secondary', () => {
            form.querySelectorAll('.rating-stars').forEach(stars => {
                stars.dataset.currentValue = 0;
                stars.querySelectorAll('.rating-star').forEach(star => {
                    star.classList.remove('filled');
                    star.setAttribute('aria-pressed', 'false');
                });
            });
        }),
        button('Cancel', 'btn-secondary', close),
        button('Save', 'btn-primary', () => {
            onSave(ratingsToPlayerFields(readValues()));
            close();
        })
    );

    dialog.append(title, form, buttons);

    // Close on backdrop click
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) close();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    return dialog;
}

function button(text, className, onClick) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    element.className = className;
    element.addEventListener('click', onClick);
    return element;
}
