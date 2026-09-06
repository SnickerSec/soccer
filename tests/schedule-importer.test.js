import { describe, test, expect } from '@jest/globals';
import {
  normalizeDateString,
  normalizeTimeString,
  parseSummaryDetails,
  parseIcsSchedule,
  parseIcsCalendar,
  parseIcsDateTime,
  parseIcsDescription,
  normalizeIcsLocation,
  classifyIcsEvent,
  detectIcsPlatform,
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

  test('drops the TeamSnap event label', () => {
    const res = parseSummaryDetails('Game: U10B-02 Williams vs U10B-07 Shaffer', 'U10B-02 Williams');
    expect(res.opponent).toBe('U10B-07 Shaffer');
    expect(res.homeAway).toBe('home');
  });

  test('takes the other side when the coach"s team is named second', () => {
    const res = parseSummaryDetails('Game: U10B-07 Shaffer vs U10B-02 Williams', 'U10B-02 Williams');
    expect(res.opponent).toBe('U10B-07 Shaffer');
    expect(res.homeAway).toBe('away');
  });

  test('leaves the venue out of the opponent name', () => {
    const res = parseSummaryDetails('Thunder vs Sharks at Kailua District Park', 'Thunder');
    expect(res.opponent).toBe('Sharks');
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
    const fixtures = parseIcsSchedule(sampleIcs, 'Thunder', 'UTC');
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

    const fixtures = parseIcsSchedule(foldedIcs, 'Thunder', 'UTC');
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

    const res = await extractFixturesFromFile(mockFile, 'Thunder', 'UTC');
    expect(res.platform).toBe('iCalendar (.ics)');
    expect(res.count).toBe(2);
    // Chronologically sorted
    expect(res.fixtures[0].gameDate).toBe('2026-09-12');
    expect(res.fixtures[1].gameDate).toBe('2026-10-10');
  });
});

describe('parseIcsDateTime', () => {
  test('reads a UTC stamp as the coach"s own calendar date and clock', () => {
    // 2pm Saturday in Hawaii is midnight Sunday UTC: reading the digits as
    // written filed the whole season a day late, at 12:00 AM.
    expect(parseIcsDateTime('20260830T000000Z', '', 'Pacific/Honolulu')).toEqual({
      gameDate: '2026-08-29',
      gameTime: '2:00 PM',
    });
    expect(parseIcsDateTime('20260912T090000Z', '', 'America/New_York')).toEqual({
      gameDate: '2026-09-12',
      gameTime: '5:00 AM',
    });
  });

  test('converts a TZID wall time into the reading zone', () => {
    expect(
      parseIcsDateTime('20260912T090000', 'TZID=America/New_York', 'America/Los_Angeles')
    ).toEqual({ gameDate: '2026-09-12', gameTime: '6:00 AM' });
  });

  test('takes a floating time as written', () => {
    expect(parseIcsDateTime('20260912T090000', '', 'Pacific/Honolulu')).toEqual({
      gameDate: '2026-09-12',
      gameTime: '9:00 AM',
    });
  });

  test('falls back to the digits for a zone the runtime does not know', () => {
    expect(
      parseIcsDateTime('20260912T090000', 'TZID=Pacific Standard Time', 'Pacific/Honolulu')
    ).toEqual({ gameDate: '2026-09-12', gameTime: '9:00 AM' });
  });

  test('handles an all-day date with no time', () => {
    expect(parseIcsDateTime('20260912', 'VALUE=DATE', 'Pacific/Honolulu')).toEqual({
      gameDate: '2026-09-12',
      gameTime: '',
    });
  });
});

describe('classifyIcsEvent', () => {
  test('recognises games, practices and unlabelled events', () => {
    expect(classifyIcsEvent('Game: U10B-02 Williams vs U10B-07 Shaffer')).toBe('game');
    expect(classifyIcsEvent('vs Sharks')).toBe('game');
    expect(classifyIcsEvent('Practice: U10B-02 Williams Practice at Kaha Park')).toBe('other');
    expect(classifyIcsEvent('Team Photo Day')).toBe('other');
    expect(classifyIcsEvent('End of season BBQ')).toBe('unknown');
  });

  test('a practice that names an opponent is still a practice', () => {
    expect(classifyIcsEvent('Practice: Thunder vs Reserves')).toBe('other');
  });

  test('reads CATEGORIES when the summary says nothing', () => {
    expect(classifyIcsEvent('Kailua District Park', 'Practice')).toBe('other');
    expect(classifyIcsEvent('Kailua District Park', 'Game')).toBe('game');
  });
});

describe('normalizeIcsLocation', () => {
  test('flattens a venue and its address onto one line', () => {
    expect(
      normalizeIcsLocation('Kawai Nui Neighborhood Park\nKaha St, Kailua, HI 96734, USA')
    ).toBe('Kawai Nui Neighborhood Park, Kaha St, Kailua, HI 96734, USA');
  });

  test('leaves a single-line location alone', () => {
    expect(normalizeIcsLocation('Kapiolani Park, Field 3')).toBe('Kapiolani Park, Field 3');
  });
});

describe('parseIcsDescription', () => {
  test('keeps the duties and drops what the fixture already says', () => {
    const description = [
      'Game: U10B-02 Williams vs U10B-07 Shaffer',
      'Location: Kailua District Park - PAV Field 1',
      'Kailua District Park, South Kainalu Drive, Kailua, HI',
      'Duration: 1 hour 15 minutes',
      'Link: https://link.teamsnapone.com/j8yu/lti6qv3a?deep_link_value=tsone',
    ].join('\n');

    const parsed = parseIcsDescription(description, {
      summary: 'Game: U10B-02 Williams vs U10B-07 Shaffer',
      location:
        'Kailua District Park - PAV Field 1\nKailua District Park, South Kainalu Drive, Kailua, HI',
    });

    expect(parsed.notes).toBe('');
  });

  test('lifts volunteer duties out of the notes', () => {
    const parsed = parseIcsDescription(
      'Jersey: Blue\nSnack: Alice\nFruit: Bob\nReferee: Charlie\nField Setup: Dave\nBring extra water'
    );
    expect(parsed.jerseyColor).toBe('Blue');
    expect(parsed.snackParent).toBe('Alice');
    expect(parsed.fruitParent).toBe('Bob');
    expect(parsed.refereeDuty).toBe('Charlie');
    expect(parsed.fieldSetup).toBe('Dave');
    expect(parsed.notes).toBe('Bring extra water');
  });
});

describe('detectIcsPlatform', () => {
  test('names the service the calendar came from', () => {
    expect(detectIcsPlatform('BEGIN:VCALENDAR\nPRODID:-//TeamSnap//TeamSnap Calendar//EN')).toBe(
      'TeamSnap Calendar'
    );
    expect(detectIcsPlatform('BEGIN:VCALENDAR\nPRODID:-//Google Inc//Google Calendar//EN')).toBe(
      'Google Calendar'
    );
    expect(detectIcsPlatform('BEGIN:VCALENDAR\nPRODID:-//Some League//EN')).toBe('iCalendar (.ics)');
  });
});

describe('a TeamSnap "one calendar" dump', () => {
  // The shape TeamSnap exports: CRLF, tab-folded lines, the whole calendar
  // rather than the match list, and every DTSTART in UTC.
  const teamsnapIcs = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'PRODID:-//TeamSnap//TeamSnap Calendar//EN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:TeamSnap ONE Schedule',
    'BEGIN:VEVENT',
    'UID:event-979924@teamsnapone.com',
    'SUMMARY:Practice: U10B-02 Williams Practice at Kaha Park',
    'DTSTART:20260811T030000Z',
    'DESCRIPTION:Practice: U10B-02 Williams Practice at Kaha Park\\nLocation: Kaw',
    '\tai Nui Neighborhood Park\\nKaha St\\, Kailua\\, HI 96734\\, USA\\nDuration: 1 h',
    '\tour\\nLink: https://link.teamsnapone.com/j8yu/lti6qv3a',
    'LOCATION:Kawai Nui Neighborhood Park\\nKaha St\\, Kailua\\, HI 96734\\, USA',
    'STATUS:CONFIRMED',
    'DURATION:PT1H',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:event-1200100@teamsnapone.com',
    'SUMMARY:Game: U10B-02 Williams vs U10B-07 Shaffer',
    'DTSTART:20260830T000000Z',
    'DESCRIPTION:Game: U10B-02 Williams vs U10B-07 Shaffer\\nLocation: Kailua Dis',
    '\ttrict Park - Pavilion - PAV Field 1\\nKailua District Park\\, South Kainalu ',
    '\tDrive\\, Kailua\\, HI\\nDuration: 1 hour 15 minutes\\nLink: https://link.teams',
    '\tnapone.com/j8yu/lti6qv3a',
    'LOCATION:Kailua District Park - Pavilion - PAV Field 1\\nKailua District Par',
    '\tk\\, South Kainalu Drive\\, Kailua\\, HI',
    'STATUS:CONFIRMED',
    'DURATION:PT1H15M',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  test('imports the games and leaves the practices behind', () => {
    const { fixtures, skipped } = parseIcsCalendar(
      teamsnapIcs,
      'U10B-02 Williams',
      'Pacific/Honolulu'
    );

    expect(skipped).toBe(1);
    expect(fixtures).toHaveLength(1);

    const [game] = fixtures;
    expect(game.gameDate).toBe('2026-08-29');
    expect(game.gameTime).toBe('2:00 PM');
    expect(game.opponent).toBe('U10B-07 Shaffer');
    expect(game.location).toBe(
      'Kailua District Park - Pavilion - PAV Field 1, Kailua District Park, South Kainalu Drive, Kailua, HI'
    );
    expect(game.notes).toBe('');
    expect(game.status).toBe('upcoming');
  });

  test('reports the platform and the skipped count to the import preview', async () => {
    const res = await extractFixturesFromFile(
      { name: 'user.ics', text: async () => teamsnapIcs },
      'U10B-02 Williams',
      'Pacific/Honolulu'
    );

    expect(res.platform).toBe('TeamSnap Calendar');
    expect(res.count).toBe(1);
    expect(res.skipped).toBe(1);
  });

  test('a calendar that labels nothing is imported whole', () => {
    const unlabelled = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:a',
      'SUMMARY:Kickoff BBQ',
      'DTSTART:20260912T190000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const { fixtures, skipped } = parseIcsCalendar(unlabelled, 'Thunder', 'UTC');
    expect(fixtures).toHaveLength(1);
    expect(skipped).toBe(0);
  });
});
