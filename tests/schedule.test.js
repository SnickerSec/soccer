/**
 * Tests for Match Scheduling, Volunteer Duty Tracking, and Calendar Exports
 */

import { describe, test, expect } from '@jest/globals';
import {
    parseLocalDate,
    formatMatchDate,
    formatTimeString,
    formatParentMemo,
    generateIcsEvent,
    generateSeasonIcs,
    calculateVolunteerStats,
    exportScheduleCsv,
} from '../src/modules/schedule.js';

describe('parseLocalDate', () => {
    test('reads a plain calendar date as that local day', () => {
        const date = parseLocalDate('2026-09-12');

        expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 8, 12]);
    });

    test('reads the date out of an ISO timestamp rather than choking on it', () => {
        // What the server used to answer with, and what old local saves hold:
        // splitting on '-' took '12T00:00:00.000Z' for the day and gave NaN.
        const date = parseLocalDate('2026-09-12T00:00:00.000Z');

        expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 8, 12]);
    });

    test('does not shift the day for a timestamp late in the UTC evening', () => {
        expect(parseLocalDate('2026-09-12T23:30:00.000Z').getDate()).toBe(12);
    });

    test('still accepts a single-digit month and day', () => {
        const date = parseLocalDate('2026-9-2');

        expect([date.getMonth(), date.getDate()]).toEqual([8, 2]);
    });
});

describe('formatMatchDate and formatTimeString', () => {
    test('formats a fixture date that arrived as a timestamp', () => {
        expect(formatMatchDate('2026-09-12T00:00:00.000Z')).toContain('Sep 12');
    });


    test('formats valid date string', () => {
        const formatted = formatMatchDate('2026-09-12');
        expect(formatted).toContain('Sep 12');
    });

    test('formats date with kickoff time', () => {
        const formatted = formatMatchDate('2026-09-12', '09:30');
        expect(formatted).toContain('Sep 12');
        expect(formatted).toContain('9:30 AM');
    });

    test('formats time string 24h to 12h AM/PM', () => {
        expect(formatTimeString('09:00')).toBe('9:00 AM');
        expect(formatTimeString('14:30')).toBe('2:30 PM');
        expect(formatTimeString('12:00')).toBe('12:00 PM');
        expect(formatTimeString('00:15')).toBe('12:15 AM');
    });

    test('preserves existing AM/PM string', () => {
        expect(formatTimeString('10:00 AM')).toBe('10:00 AM');
        expect(formatTimeString('3:15 PM')).toBe('3:15 PM');
    });
});

describe('formatParentMemo', () => {
    test('generates formatted parent reminder memo with all details', () => {
        const fixture = {
            gameDate: '2026-09-12',
            gameTime: '09:00',
            opponent: 'Thunder FC',
            homeAway: 'home',
            location: 'Kaneohe District Park - Field 2',
            jerseyColor: 'Royal Blue',
            fruitParent: 'Maya\'s Family',
            snackParent: 'Liam\'s Family',
            refereeDuty: 'Coach Dave',
            notes: 'Please arrive 25 minutes early for warmups.',
        };

        const memo = formatParentMemo(fixture, 'Blue Dragons');

        expect(memo).toContain('⚽ AYSO Match Day: Blue Dragons');
        expect(memo).toContain('vs Thunder FC (Home)');
        expect(memo).toContain('Kaneohe District Park - Field 2');
        expect(memo).toContain('Royal Blue');
        expect(memo).toContain('🍊 Halftime Fruit: Maya\'s Family');
        expect(memo).toContain('🍪 Post-Game Snack: Liam\'s Family');
        expect(memo).toContain('🚩 Referee / Lines: Coach Dave');
        expect(memo).toContain('Please arrive 25 minutes early for warmups.');
    });

    test('handles fixture with minimal fields', () => {
        const fixture = {
            gameDate: '2026-10-03',
            opponent: 'Strikers',
            homeAway: 'away',
        };

        const memo = formatParentMemo(fixture, 'Team 4');
        expect(memo).toContain('vs Strikers (Away)');
        expect(memo).not.toContain('Family Volunteer Duties:');
    });
});

describe('iCalendar (.ics) generation', () => {
    test('generates valid RFC 5545 iCalendar event', () => {
        const fixture = {
            id: 'fix-123',
            gameDate: '2026-09-12',
            gameTime: '09:00',
            opponent: 'Tigers',
            homeAway: 'home',
            location: 'Kapiolani Park, Field 3',
            jerseyColor: 'Blue',
            snackParent: 'Sarah',
            fruitParent: 'John',
            notes: 'Bring water bottles',
        };

        const eventIcs = generateIcsEvent(fixture, 'Hawaiian Strikers', '10U');

        expect(eventIcs).toContain('BEGIN:VEVENT');
        expect(eventIcs).toContain('END:VEVENT');
        expect(eventIcs).toContain('SUMMARY:Hawaiian Strikers vs Tigers (Home)');
        expect(eventIcs).toContain('LOCATION:Kapiolani Park\\, Field 3');
        expect(eventIcs).toContain('DTSTART:20260912T090000');
        expect(eventIcs).toContain('BEGIN:VALARM');
        expect(eventIcs).toContain('TRIGGER:-PT2H');
    });

    test('generates full season calendar', () => {
        const fixtures = [
            { id: '1', gameDate: '2026-09-12', gameTime: '09:00', opponent: 'Tigers', homeAway: 'home' },
            { id: '2', gameDate: '2026-09-19', gameTime: '10:30', opponent: 'Lions', homeAway: 'away' },
            { id: '3', gameDate: '2026-09-26', opponent: 'Bears', status: 'canceled' },
        ];

        const seasonIcs = generateSeasonIcs(fixtures, 'Hawaiian Strikers', '10U');

        expect(seasonIcs).toContain('BEGIN:VCALENDAR');
        expect(seasonIcs).toContain('END:VCALENDAR');
        expect(seasonIcs).toContain('PRODID:-//Shinguard//Match Schedule Calendar//EN');
        expect(seasonIcs).toContain('Hawaiian Strikers vs Tigers');
        expect(seasonIcs).toContain('Hawaiian Strikers vs Lions');
        // Canceled match should be omitted
        expect(seasonIcs).not.toContain('Hawaiian Strikers vs Bears');
    });
});

describe('calculateVolunteerStats', () => {
    test('aggregates volunteer duties and calculates coverage', () => {
        const players = [
            { name: 'Alex' },
            { name: 'Maya' },
            { name: 'Liam' },
            { name: 'Chloe' }
        ];

        const fixtures = [
            {
                gameDate: '2026-09-12',
                opponent: 'Tigers',
                fruitParent: 'Maya',
                snackParent: 'Liam',
                refereeDuty: 'Alex',
                status: 'upcoming'
            },
            {
                gameDate: '2026-09-19',
                opponent: 'Lions',
                fruitParent: 'Alex',
                snackParent: 'Maya',
                status: 'upcoming'
            },
            {
                gameDate: '2026-09-26',
                opponent: 'Bears',
                fruitParent: '',
                snackParent: '',
                status: 'upcoming'
            }
        ];

        const stats = calculateVolunteerStats(fixtures, players);

        expect(stats.totalGames).toBe(3);
        expect(stats.statsByPlayer['Maya'].fruitCount).toBe(1);
        expect(stats.statsByPlayer['Maya'].snackCount).toBe(1);
        expect(stats.statsByPlayer['Maya'].totalDuties).toBe(2);

        expect(stats.statsByPlayer['Chloe'].totalDuties).toBe(0);
        expect(stats.unassignedPlayers.some((p) => p.name === 'Chloe')).toBe(true);

        expect(stats.unassignedFruitFixtures).toBe(1);
        expect(stats.unassignedSnackFixtures).toBe(1);
        expect(stats.snackCoveragePct).toBe(67);
        expect(stats.fruitCoveragePct).toBe(67);
    });
});

describe('exportScheduleCsv', () => {
    test('generates valid CSV of fixtures', () => {
        const fixtures = [
            {
                gameDate: '2026-09-12',
                gameTime: '09:00',
                opponent: 'Thunder FC',
                homeAway: 'home',
                location: 'Field 2',
                jerseyColor: 'Blue',
                snackParent: 'Liam',
                fruitParent: 'Maya',
                refereeDuty: 'Dave',
                fieldSetup: 'John',
                status: 'upcoming',
                notes: 'Arrive early'
            }
        ];

        const csv = exportScheduleCsv(fixtures, 'Blue Dragons');

        expect(csv).toContain('"Date","Time","Opponent","Home/Away"');
        expect(csv).toContain('"2026-09-12","09:00","Thunder FC","Home","Field 2","Blue","Liam","Maya","Dave","John","upcoming","Arrive early"');
    });
});
