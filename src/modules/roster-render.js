/**
 * The status vocabulary a roster row is drawn from.
 *
 * The values reach three places that have to agree — the <option> values, the
 * class that colours the row, and what is stored on the player — so they live
 * here rather than being written out in the component, where a fourth spelling
 * would be one edit away.
 */

/**
 * Player statuses, as the <option> values, labels and CSS class suffixes.
 *
 * These mirror CONSTANTS.PLAYER_STATUS; tests/roster-render.test.js compares
 * the two and fails if they ever disagree.
 */
export const STATUSES = [
    { value: 'available', label: 'Available', className: 'status-available' },
    { value: 'injured', label: 'Injured', className: 'status-injured' },
    { value: 'absent', label: 'Absent', className: 'status-absent' }
];

/**
 * The class that colours a row by availability.
 *
 * An unknown status reads as available rather than as no class at all: a row
 * with no status class looks like a rendering fault rather than a player.
 */
export function statusClassFor(status) {
    const known = STATUSES.find(s => s.value === status);
    return (known || STATUSES[0]).className;
}
