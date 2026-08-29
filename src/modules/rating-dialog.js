/**
 * What the star-rating dialog stores for a player.
 *
 * Ratings feed the lineup generator's strength balancing, so what a coach sets
 * here is not decoration. The conversion from five star counts to the two
 * fields actually stored lives here rather than in the component, because that
 * is where the rules are — an unset overall is null rather than 0, and an
 * unrated position is absent rather than 0 — and the generator reads both.
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
