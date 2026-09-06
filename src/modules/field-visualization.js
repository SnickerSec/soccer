/**
 * Naming for the pitch diagram's player markers.
 *
 * The diagram itself is `src/components/FieldVisualization.jsx`, and its colours
 * are the `--pitch-*` tokens in `src/index.css`. This module used to carry a
 * second, DOM-building implementation of the same pitch — `createFieldVisualization`,
 * a leftover of the pre-React app — along with its own copy of the marker colours
 * and the pitch geometry. Nothing but its own test imported it, and a duplicate
 * palette is exactly the two-sources-of-truth shape that has bitten this repo
 * before, so it was removed rather than kept in step.
 */

/**
 * The label drawn on a marker when the player has no shirt number.
 *
 * First and last initial for a full name, the first two letters for a single
 * word — a marker is 36 units across and anything longer does not fit.
 */
export function getPlayerInitials(name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return parts[0][0] + parts[parts.length - 1][0];
    }
    return name.substring(0, 2).toUpperCase();
}
