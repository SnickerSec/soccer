/**
 * The Live Match clock as an end time.
 *
 * It used to take a second off per setInterval tick, and a phone that locks
 * its screen throttles or suspends those ticks — so the clock stopped while
 * the coach was not looking. These pin that time passes whether or not
 * anything was running to count it.
 */

import { describe, test, expect } from '@jest/globals';
import {
    freshClock, remainingMs, displaySeconds, startClock, pauseClock, hasExpired, minuteOfQuarter
} from '../src/modules/match-clock.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('match clock', () => {
    test('a fresh clock holds the whole quarter and does not move', () => {
        const clock = freshClock(12.5);
        expect(displaySeconds(clock, T0)).toBe(750);
        expect(displaySeconds(clock, T0 + 10 * MIN)).toBe(750);
    });

    test('a running clock loses the time that passed, however little was looking', () => {
        const clock = startClock(freshClock(12.5), T0);
        // Five minutes with the screen locked: no ticks, still five minutes
        expect(displaySeconds(clock, T0 + 5 * MIN)).toBe(450);
    });

    test('pausing keeps what was left, and starting again carries on from it', () => {
        let clock = startClock(freshClock(10), T0);
        clock = pauseClock(clock, T0 + 3 * MIN);
        expect(displaySeconds(clock, T0 + 20 * MIN)).toBe(420);

        clock = startClock(clock, T0 + 20 * MIN);
        expect(displaySeconds(clock, T0 + 21 * MIN)).toBe(360);
    });

    test('it never reads below zero, and says when it has run out', () => {
        const clock = startClock(freshClock(10), T0);
        expect(hasExpired(clock, T0 + 9 * MIN)).toBe(false);
        expect(remainingMs(clock, T0 + 15 * MIN)).toBe(0);
        expect(hasExpired(clock, T0 + 15 * MIN)).toBe(true);
        // Once stopped at zero it has expired already, and does not again
        expect(hasExpired(pauseClock(clock, T0 + 15 * MIN), T0 + 16 * MIN)).toBe(false);
    });

    test('part of a second left still reads as a second', () => {
        const clock = startClock(freshClock(1), T0);
        expect(displaySeconds(clock, T0 + 59_600)).toBe(1);
    });

    test('an event is dated by the minute of the quarter it fell in', () => {
        const clock = startClock(freshClock(12.5), T0);
        expect(minuteOfQuarter(clock, 12.5, T0)).toBe(1);
        expect(minuteOfQuarter(clock, 12.5, T0 + 30_000)).toBe(1);
        expect(minuteOfQuarter(clock, 12.5, T0 + 4 * MIN + 1)).toBe(5);
    });

    test('starting a running clock or pausing a stopped one changes nothing', () => {
        const running = startClock(freshClock(10), T0);
        expect(startClock(running, T0 + MIN)).toBe(running);
        const stopped = freshClock(10);
        expect(pauseClock(stopped, T0)).toBe(stopped);
    });
});
