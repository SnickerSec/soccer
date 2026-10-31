/**
 * A match in progress, kept on the device so a reload does not end it.
 *
 * The score, the goals, the subs and the clock lived in the Live Match
 * dialog's state and nowhere else. iOS reloads a tab that has been in the
 * background a while, and a pull-to-refresh or a stray back-swipe does the
 * same, so any of them cost the coach the score and every sub — and the game
 * saved at the final whistle was missing them.
 *
 * One match at a time, stamped with the team it is for. It is written only
 * once the match has started, so opening the dialog to look leaves nothing
 * behind, and it lapses after a few hours so an abandoned match does not come
 * back the following weekend.
 */

import { safeGetFromStorage, safeSetToStorage, safeRemoveFromStorage, safeParseJSON } from './storage.js';

export const LIVE_MATCH_KEY = 'shinguard_live_match';

/** Long enough for a game with a late start; short enough not to reach next week. */
export const LIVE_MATCH_TTL_MS = 4 * 60 * 60 * 1000;

/** Whether anything has happened that would be worth getting back. */
export function hasStarted(match) {
    if (!match) return false;
    return Boolean(match.clockStarted) || match.homeScore > 0 || match.awayScore > 0
        || (Array.isArray(match.events) && match.events.length > 0) || match.activeQuarter > 1;
}

export function saveLiveMatch(match, now = Date.now()) {
    if (!hasStarted(match)) return false;
    return safeSetToStorage(LIVE_MATCH_KEY, JSON.stringify({ ...match, savedAt: now }));
}

/**
 * The match in progress for this team, or null. A match for another team, or
 * one not touched for longer than the TTL, is not returned.
 */
export function loadLiveMatch(teamId, now = Date.now()) {
    const saved = safeParseJSON(safeGetFromStorage(LIVE_MATCH_KEY), null);
    if (!saved || typeof saved !== 'object') return null;
    if ((saved.teamId ?? null) !== (teamId ?? null)) return null;
    if (typeof saved.savedAt !== 'number' || now - saved.savedAt > LIVE_MATCH_TTL_MS) return null;
    if (!saved.lineup || !Array.isArray(saved.lineup.quarters) || !saved.clock) return null;
    return saved;
}

export function clearLiveMatch() {
    safeRemoveFromStorage(LIVE_MATCH_KEY);
}

/**
 * Formats the live match event log (stored newest-first) into a chronological
 * summary string for the saved game's notes.
 */
export function formatMatchEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return '';
    return [...events]
        .reverse()
        .map((e) => {
            if (!e || typeof e !== 'object') return '';
            const stamp = `Q${e.quarter ?? 1} ${e.minute ?? 1}'`;
            const detail = e.type === 'goal'
                ? (e.player ? `Goal: ${e.player}` : '')
                : (e.description || '');
            return detail ? `${stamp} ${detail}` : '';
        })
        .filter(Boolean)
        .join('\n');
}
