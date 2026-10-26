/**
 * The Live Match quarter clock, as the moment a quarter ends.
 *
 * It used to count down by taking a second off on every setInterval tick.
 * Phones throttle timers when the screen locks and iOS suspends the page
 * outright, so a coach who pocketed the phone for a 12.5 minute quarter came
 * back to a clock that had stopped while they were not looking, and a whistle
 * that never went. A running clock is an end time instead, and what is left is
 * worked out from the wall clock whenever anyone looks — a frozen tab misses
 * no time, and a reload does not either, since an end time can be stored.
 *
 * Pure, with `now` passed in, so a test can say what time it is.
 */

/** A stopped clock with a whole quarter on it. */
export function freshClock(quarterMinutes) {
    return { running: false, endsAt: null, remainingMs: Math.round(quarterMinutes * 60) * 1000 };
}

/** Milliseconds left at `now`, never below zero. */
export function remainingMs(clock, now) {
    if (clock.running && clock.endsAt != null) return Math.max(0, clock.endsAt - now);
    return Math.max(0, clock.remainingMs);
}

/** Whole seconds to show: 0.4s left reads as 1, not 0, until it is really up. */
export function displaySeconds(clock, now) {
    return Math.ceil(remainingMs(clock, now) / 1000);
}

export function startClock(clock, now) {
    if (clock.running) return clock;
    return { running: true, endsAt: now + remainingMs(clock, now), remainingMs: remainingMs(clock, now) };
}

export function pauseClock(clock, now) {
    if (!clock.running) return clock;
    return { running: false, endsAt: null, remainingMs: remainingMs(clock, now) };
}

/** True once a running clock has reached zero and has not yet been stopped. */
export function hasExpired(clock, now) {
    return clock.running && remainingMs(clock, now) === 0;
}

/** The minute of the quarter an event at `now` falls in, counting from 1. */
export function minuteOfQuarter(clock, quarterMinutes, now) {
    const elapsedMs = Math.round(quarterMinutes * 60) * 1000 - remainingMs(clock, now);
    return Math.max(1, Math.ceil(elapsedMs / 60000));
}
