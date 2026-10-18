/**
 * How strong each line of a quarter is, going by the player ratings.
 *
 * The lineup strategy and the readout on the quarter cards both read
 * strength from here, so what the coach is shown is what the generator was
 * steering by. Everyone Plays leaves a focus less room than its name
 * suggests, and without this readout a Defense focus that mostly strengthened
 * midfield looked like a setting that did nothing.
 */

/** The line a position belongs to, named after its rating category. */
export function lineOf(position) {
    if (position === 'Keeper') return 'keeper';
    if (position.includes('Back')) return 'defense';
    if (position.includes('Mid') || position === 'Midfield') return 'midfield';
    return 'offense';
}

/**
 * A player's strength in a line, on the one-to-five scale the rating dialog
 * uses. The rating for that line wins, then the overall, then a neutral 3 —
 * an unrated player is "no opinion", not the weakest on the roster.
 */
export function strengthIn(player, category) {
    const positional = (player?.positionalRatings || {})[category];
    if (positional) return positional;
    return player?.overallRating || 3;
}

/**
 * Whether the strategy has anything to go on for a player. Only the overall
 * and the three outfield ratings count: the keeper pick has its own rules,
 * and a keeper rating alone leaves the player a neutral 3 everywhere else.
 */
export function ratedForStrategy(player) {
    const positional = player?.positionalRatings || {};
    return Boolean(player?.overallRating || positional.defense || positional.midfield || positional.offense);
}

/** The outfield lines, back to front, as the readout shows them. */
export const LINES = [
    { key: 'defense', label: 'Back' },
    { key: 'midfield', label: 'Mid' },
    { key: 'offense', label: 'Front' }
];

/**
 * Average strength of each outfield line in a quarter, or null when nobody
 * on the field is rated — an average of neutral threes says nothing, and
 * showing it would read as a judgement.
 *
 * `players` are looked up by name, since a quarter records only names. A
 * line the formation does not have comes back null.
 */
export function quarterLineStrength(quarter, players = []) {
    const byName = new Map((players || []).filter(p => p?.name).map(p => [p.name, p]));
    const sums = {};
    let anyRated = false;

    Object.entries(quarter?.positions || {}).forEach(([position, value]) => {
        const line = lineOf(position);
        if (line === 'keeper') return;
        const name = typeof value === 'string' ? value : value?.name;
        const player = byName.get(name);
        if (player && ratedForStrategy(player)) anyRated = true;
        const entry = (sums[line] ||= { total: 0, count: 0 });
        entry.total += strengthIn(player, line);
        entry.count++;
    });

    if (!anyRated) return null;
    return Object.fromEntries(LINES.map(({ key }) => [
        key, sums[key] ? sums[key].total / sums[key].count : null
    ]));
}
