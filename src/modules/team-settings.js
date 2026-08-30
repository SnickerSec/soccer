/**
 * How a team plays — the age division, how many take the field, the formation,
 * how many quarters — and the one place that decides what a valid set of those
 * is.
 *
 * These are pulled from the cloud now, so they no longer only come from this
 * device: they arrive from another coach's phone, from an older build, and
 * from a hand-edited row. Everything that reads them goes through
 * normalizeSettings first, so a field size nothing can be fielded with or a
 * formation this device has never heard of degrades to something playable
 * rather than reaching the lineup engine, or a <select> with no such option.
 *
 * Custom formations are the case worth knowing about: they live in this
 * device's localStorage and do not travel, so a team set to one is read back
 * elsewhere as the default for its field size. Better than a dropdown showing
 * a blank, and the coach who made it still sees their own.
 */

import { CONSTANTS } from '../constants.js';
import { FORMATIONS, getFormationsForFieldSize } from './formations.js';

export const DEFAULT_SETTINGS = {
    ageDivision: '10U',
    fieldPlayers: 7,
    formation: '2-3-1',
    quarters: 4
};

/**
 * Coerce anything into a usable settings object, key by key.
 *
 * Each field falls back on its own: a formation nobody recognises does not
 * cost the coach the division they picked.
 */
export function normalizeSettings(raw) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

    const ageDivision = CONSTANTS.AGE_DIVISIONS[source.ageDivision]
        ? source.ageDivision
        : DEFAULT_SETTINGS.ageDivision;

    // A field size counts as real if anything can be fielded with it, which
    // includes the sizes only a custom formation uses. 10U plays 7 or 6, so
    // the division does not decide this — it only supplies the fallback.
    const requested = Number(source.fieldPlayers);
    const fieldPlayers = Number.isInteger(requested) && getFormationsForFieldSize(requested).length > 0
        ? requested
        : (CONSTANTS.AGE_DIVISIONS[ageDivision]?.fieldSize || DEFAULT_SETTINGS.fieldPlayers);

    const available = getFormationsForFieldSize(fieldPlayers);
    const formation = available.includes(source.formation)
        ? source.formation
        : (FORMATIONS[fieldPlayers]?.default || available[0] || DEFAULT_SETTINGS.formation);

    const quarters = Number.isInteger(Number(source.quarters))
        && Number(source.quarters) >= 1 && Number(source.quarters) <= 8
        ? Number(source.quarters)
        : DEFAULT_SETTINGS.quarters;

    return { ageDivision, fieldPlayers, formation, quarters };
}

/**
 * True when two settings objects would play the same game.
 *
 * The push is skipped when nothing moved, so adopting the server's copy on a
 * sync does not bounce straight back at it.
 */
export function sameSettings(a, b) {
    const left = normalizeSettings(a);
    const right = normalizeSettings(b);
    return Object.keys(DEFAULT_SETTINGS).every(key => left[key] === right[key]);
}
