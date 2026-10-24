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
import { LINEUP_STRATEGIES } from './lineup-engine.js';

export const DEFAULT_SETTINGS = {
    ageDivision: '10U',
    fieldPlayers: 7,
    formation: '2-3-1',
    quarters: 4,
    // Only a player on the field at least three quarters may keep. A player
    // who plays two and spends one of them in goal gets a single quarter of
    // outfield play all game.
    keeperPlaysThree: false,
    // Where the player ratings send the stronger players: spread evenly over
    // the field, or towards the back or the front. Unrated rosters play the
    // same whichever is picked.
    lineupStrategy: 'balanced',
    // The header of the AYSO Player Evaluation Form. It belongs to the team
    // like the rest: the form is filled in once a season, often by whichever
    // coach gets to it, and retyping it on every device was the alternative.
    // An empty division means "follow the team's age division".
    evaluation: { coachName: '', assistantCoach: '', division: '', gender: 'Boys' }
};

/** What the evaluation form offers; mirrored in server/routes/settings.js. */
export const EVALUATION_DIVISIONS = ['U6', 'U8', 'U10', 'U12', 'U14', 'U16', 'U19'];
export const EVALUATION_GENDERS = ['Boys', 'Girls', 'Coed'];
export const EVALUATION_NAME_MAX = 60;

function normalizeEvaluation(raw) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const name = value => (typeof value === 'string' ? value.slice(0, EVALUATION_NAME_MAX) : '');
    return {
        coachName: name(source.coachName),
        assistantCoach: name(source.assistantCoach),
        division: EVALUATION_DIVISIONS.includes(source.division) ? source.division : '',
        gender: EVALUATION_GENDERS.includes(source.gender) ? source.gender : DEFAULT_SETTINGS.evaluation.gender
    };
}

/**
 * The form's division: the one the coach picked, else the team's own — 10U
 * reads as U10 on the form.
 */
export function evaluationDivision(settings) {
    const picked = settings?.evaluation?.division;
    if (EVALUATION_DIVISIONS.includes(picked)) return picked;
    const fromTeam = /^(\d+)U$/.exec(settings?.ageDivision || '');
    const derived = fromTeam ? `U${fromTeam[1]}` : null;
    return EVALUATION_DIVISIONS.includes(derived) ? derived : 'U10';
}

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

    const keeperPlaysThree = source.keeperPlaysThree === true;

    const lineupStrategy = LINEUP_STRATEGIES.includes(source.lineupStrategy)
        ? source.lineupStrategy
        : DEFAULT_SETTINGS.lineupStrategy;

    const evaluation = normalizeEvaluation(source.evaluation);

    return { ageDivision, fieldPlayers, formation, quarters, keeperPlaysThree, lineupStrategy, evaluation };
}

/**
 * True when two settings objects would play the same game and fill in the
 * same evaluation form.
 *
 * The push is skipped when nothing moved, so adopting the server's copy on a
 * sync does not bounce straight back at it.
 */
export function sameSettings(a, b) {
    const left = normalizeSettings(a);
    const right = normalizeSettings(b);
    return Object.keys(DEFAULT_SETTINGS).every(key => (key === 'evaluation'
        ? Object.keys(DEFAULT_SETTINGS.evaluation).every(field => left.evaluation[field] === right.evaluation[field])
        : left[key] === right[key]));
}
