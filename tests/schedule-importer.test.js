import { describe, test, expect } from '@jest/globals';
import {
  normalizeDateString,
  normalizeTimeString,
  parseSummaryDetails,
  parseIcsSchedule,
  detectScheduleColumns,
  parseCsvSchedule,
  extractFixturesFromFile,
} from '../src/modules/schedule-importer.js';

describe('normalizeDateString', () => {
  test('normalizes ISO date format (YYYY-MM-DD)', () => {
    expect(normalizeDateString('2026-09-12')).toBe('2026-09-12');
    expect(normalizeDateString('2026-9-5')).toBe('2026-09-05');
  });

  test('normalizes ICS format (YYYYMMDD)', () => {
    expect(normalizeDateString('20260912')).toBe('2026-09-12');
    expect(normalizeDateString('20261003')).toBe('2026-10-03');
  });

  test('normalizes US slash format (MM/DD/YYYY and M/D/YY)', () => {
    expect(normalizeDateString('09/12/2026')).toBe('2026-09-12');
    expect(normalizeDateString('9/5/2026')).toBe('2026-09-05');
    expect(normalizeDateString('9/12/26')).toBe('2026-09-12');
  });

  test('normalizes dash format (MM-DD-YYYY)', () => {
    expect(normalizeDateString('09-12-2026')).toBe('2026-09-12');
    expect(normalizeDateString('9-5-2026')).toBe('2026-09-05');
  });

  test('handles invalid or empty date gracefully', () => {
    expect(normalizeDateString('')).toBe('');
    expect(normalizeDateString(null)).toBe('');
  });
});

describe('normalizeTimeString', () => {
  test('normalizes 24hr string into 12hr AM/PM', () => {
    expect(normalizeTimeString('09:00')).toBe('9:00 AM');
    expect(normalizeTimeString('14:30')).toBe('2:30 PM');
    expect(normalizeTimeString('12:00')).toBe('12:00 PM');
    expect(normalizeTimeString('00:15')).toBe('12:15 AM');
  });

  test('normalizes ICS time format (HHMMSS)', () => {
    expect(normalizeTimeString('090000')).toBe('9:00 AM');
    expect(normalizeTimeString('153000')).toBe('3:30 PM');
  });

  test('preserves already formatted AM/PM string', () => {
    expect(normalizeTimeString('9:00 AM')).toBe('9:00 AM');
    expect(normalizeTimeString('2:30 PM')).toBe('2:30 PM');
  });
});

describe('parseSummaryDetails', () => {
  test('extracts opponent and home status for "vs" format', () => {
    const res1 = parseSummaryDetails('Thunder vs Lightning', 'Thunder');
    expect(res1.opponent).toBe('Lightning');
    expect(res1.homeAway).toBe('home');

    const res2 = parseSummaryDetails('vs. Red Dragons', 'Thunder');
    expect(res2.opponent).toBe('Red Dragons');
    expect(res2.homeAway).toBe('home');
  });

  test('extracts opponent and away status for "@" format', () => {
    const res = parseSummaryDetails('AYSO 10U @ Blue Sharks', 'Thunder');
    expect(res.opponent).toBe('Blue Sharks');
    expect(res.homeAway).toBe('away');
  });

  test('cleans AYSO and Match tags from opponent name', () => {
    const res = parseSummaryDetails('AYSO Match 1: Strikers vs Vipers', 'Strikers');
    expect(res.opponent).toBe('Vipers');
  });
});

describe('parseIcsSchedule', () => {
  const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TeamSnap//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:event-1@ayso.org
DTSTART:20260912T090000Z
SUMMARY:Thunder vs Sharks
LOCATION:Kapiolani Park\\, Field 3
DESCRIPTION:Jersey: Blue\\nSnack: Alice\\nFruit: Bob\\nReferee: Charlie\\nField Setup: Dave
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:event-2@ayso.org
DTSTART:20260919T103000Z
SUMMARY:Thunder @ Dragons (Away)
LOCATION:Waipio Soccer Complex
DESCRIPTION:Away match against Dragons. Wear White.
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:event-3@ayso.org
DTSTART:20260926T080000Z
SUMMARY:vs Tornadoes
LOCATION:Kapiolani Park
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

  test('parses multiple VEVENT entries into fixtures', () => {
    const fixtures = parseIcsSchedule(sampleIcs, 'Thunder');
    expect(fixtures).toHaveLength(3);

    // Event 1
    expect(fixtures[0].gameDate).toBe('2026-09-12');
    expect(fixtures[0].gameTime).toBe('9:00 AM');
    expect(fixtures[0].opponent).toBe('Sharks');
    expect(fixtures[0].homeAway).toBe('home');
    expect(fixtures[0].location).toBe('Kapiolani Park, Field 3');
    expect(fixtures[0].jerseyColor).toBe('Blue');
    expect(fixtures[0].snackParent).toBe('Alice');
    expect(fixtures[0].fruitParent).toBe('Bob');
    expect(fixtures[0].refereeDuty).toBe('Charlie');
    expect(fixtures[0].fieldSetup).toBe('Dave');
    expect(fixtures[0].status).toBe('upcoming');

    // Event 2
    expect(fixtures[1].gameDate).toBe('2026-09-19');
    expect(fixtures[1].gameTime).toBe('10:30 AM');
    expect(fixtures[1].opponent).toBe('Dragons');
    expect(fixtures[1].homeAway).toBe('away');
    expect(fixtures[1].location).toBe('Waipio Soccer Complex');

    // Event 3 (Cancelled)
    expect(fixtures[2].gameDate).toBe('2026-09-26');
    expect(fixtures[2].gameTime).toBe('8:00 AM');
    expect(fixtures[2].opponent).toBe('Tornadoes');
    expect(fixtures[2].status).toBe('canceled');
  });

  test('handles unfolded lines correctly', () => {
    const foldedIcs = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:event-folded
DTSTART:20261003T110000Z
SUMMARY:Thunder vs Very Long Opponent 
 Name That Wraps
LOCATION:Kapiolani Park Field 1
END:VEVENT
END:VCALENDAR`;

    const fixtures = parseIcsSchedule(foldedIcs, 'Thunder');
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].opponent).toBe('Very Long Opponent Name That Wraps');
  });
});

describe('parseCsvSchedule', () => {
  const sampleCsv = `Date,Time,Opponent,Home/Away,Location / Field,Jersey Color,Post-Game Snack,Halftime Fruit,Referee Duty,Field Setup,Status,Notes
2026-09-12,09:00,Red Storm,Home,Kapiolani Park Field 1,Blue,Alice Smith,Bob Jones,Charlie,Dave,upcoming,Season opener
2026-09-19,10:30,Blue Wave,Away,Waipio Field 4,White,Emily,Frank,,,upcoming,Bring extra water`;

  test('parses standard schedule CSV correctly', () => {
    const fixtures = parseCsvSchedule(sampleCsv);
    expect(fixtures).toHaveLength(2);

    expect(fixtures[0].gameDate).toBe('2026-09-12');
    expect(fixtures[0].gameTime).toBe('9:00 AM');
    expect(fixtures[0].opponent).toBe('Red Storm');
    expect(fixtures[0].homeAway).toBe('home');
    expect(fixtures[0].location).toBe('Kapiolani Park Field 1');
    expect(fixtures[0].jerseyColor).toBe('Blue');
    expect(fixtures[0].snackParent).toBe('Alice Smith');
    expect(fixtures[0].fruitParent).toBe('Bob Jones');
    expect(fixtures[0].refereeDuty).toBe('Charlie');
    expect(fixtures[0].fieldSetup).toBe('Dave');
    expect(fixtures[0].notes).toBe('Season opener');

    expect(fixtures[1].gameDate).toBe('2026-09-19');
    expect(fixtures[1].gameTime).toBe('10:30 AM');
    expect(fixtures[1].opponent).toBe('Blue Wave');
    expect(fixtures[1].homeAway).toBe('away');
  });

  test('handles loose column headers and formatting', () => {
    const looseCsv = `Match Date,Start,Team,Field
9/12/2026,2:00 PM,Cobras,Field 2
9/19/2026,8:30 AM,Hawks,Field 5`;

    const fixtures = parseCsvSchedule(looseCsv);
    expect(fixtures).toHaveLength(2);
    expect(fixtures[0].gameDate).toBe('2026-09-12');
    expect(fixtures[0].gameTime).toBe('2:00 PM');
    expect(fixtures[0].opponent).toBe('Cobras');
    expect(fixtures[0].location).toBe('Field 2');
  });
});

describe('extractFixturesFromFile', () => {
  test('parses File object with .ics extension and sorts chronologically', async () => {
    const icsContent = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:e2
DTSTART:20261010T090000Z
SUMMARY:vs Dragons
END:VEVENT
BEGIN:VEVENT
UID:e1
DTSTART:20260912T090000Z
SUMMARY:vs Sharks
END:VEVENT
END:VCALENDAR`;

    const mockFile = {
      name: 'schedule.ics',
      text: async () => icsContent,
    };

    const res = await extractFixturesFromFile(mockFile, 'Thunder');
    expect(res.platform).toBe('iCalendar (.ics)');
    expect(res.count).toBe(2);
    // Chronologically sorted
    expect(res.fixtures[0].gameDate).toBe('2026-09-12');
    expect(res.fixtures[1].gameDate).toBe('2026-10-10');
  });
});
