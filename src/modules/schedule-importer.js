/**
 * Smart Schedule & Calendar Importer
 * Parses iCalendar (.ics / .ical) and CSV / TSV match schedules with support for
 * TeamSnap, SportsEngine, Google Calendar, Apple Calendar, and AYSO exports.
 */

import { parseDelimitedText } from './roster-importer.js';
import { formatTimeString } from './schedule.js';

/**
 * Normalizes date strings of various formats into YYYY-MM-DD.
 * Supports ISO (2026-09-12), US format (09/12/2026, 9/12/26), and text (Sep 12, 2026).
 */
export function normalizeDateString(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // YYYYMMDD (from ICS)
  if (/^\d{8}$/.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const m = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    return `${y}-${m}-${d}`;
  }

  // MM/DD/YYYY or M/D/YY
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (slashMatch) {
    let [, m, d, y] = slashMatch;
    if (y.length === 2) {
      y = Number(y) < 50 ? `20${y}` : `19${y}`;
    }
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // MM-DD-YYYY
  const dashMatch = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(trimmed);
  if (dashMatch) {
    const [, m, d, y] = dashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try Date.parse as fallback
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return trimmed;
}

/**
 * Normalizes time string into 24hr or 12hr HH:MM string.
 */
export function normalizeTimeString(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();

  // HHMMSS or HHMM from ICS (e.g. 090000 or 090000Z or 153000)
  const icsMatch = /^(\d{2})(\d{2})(?:\d{2})?/.exec(trimmed);
  if (icsMatch && !trimmed.includes(':')) {
    return formatTimeString(`${icsMatch[1]}:${icsMatch[2]}`);
  }

  return formatTimeString(trimmed);
}

/**
 * True when two team names in a calendar entry name the same side.
 *
 * Exports spell a team differently on either side of a separator ("U10B-02
 * Williams" against "Williams"), so an exact match is not enough to recognise
 * the coach's own team — but a substring test alone makes "Williamson" the
 * same side as "Williams", so the shorter name has to be long enough to mean
 * something.
 */
function sameTeam(a, b) {
  const norm = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return shorter.length >= 5 && longer.includes(shorter);
}

/**
 * Parses opponent and home/away status from an event summary/title.
 * e.g., "AYSO 10U: Thunder vs Sharks", "vs. Dragons", "@ Earthquakes",
 * "Game: U10B-02 Williams vs U10B-07 Shaffer" (TeamSnap)
 */
export function parseSummaryDetails(summary = '', teamName = '') {
  const raw = String(summary || '').trim();

  // The label the export puts in front of the fixture: "Game: ", "AYSO Match 1: "
  const body = raw
    .replace(/^\s*(?:ayso\s+)?(?:game|match|scrimmage|friendly|tournament|soccer)[\s\w\-#]*:\s*/i, '')
    .trim();

  let opponent = body;
  let homeAway = 'home';

  const between = /\s+(vs\.?|versus|@|at)\s+/i.exec(body);
  const leading = /^(?:vs\.?|versus|@|at)\s+(.*)$/i.exec(body);

  if (between) {
    const left = body.slice(0, between.index).trim();
    let right = body.slice(between.index + between[0].length).trim();
    const atSeparator = /^(?:@|at)$/i.test(between[1]);

    // "Thunder vs Sharks at Kailua Field" — the venue is not part of the name.
    if (!atSeparator) right = right.split(/\s+at\s+/i)[0].trim();

    if (teamName && left && sameTeam(right, teamName)) {
      // The coach's team is named second: "A vs us" is our away game, and
      // "A at us" is our home one.
      opponent = left;
      homeAway = atSeparator ? 'home' : 'away';
    } else {
      opponent = right || left;
      homeAway = atSeparator ? 'away' : 'home';
    }
  } else if (leading) {
    opponent = leading[1].trim();
    homeAway = /^(?:@|at)\s/i.test(body) ? 'away' : 'home';
  } else if (teamName && body.toLowerCase().includes(teamName.toLowerCase())) {
    // e.g. "Team A - Team B" or "Team A / Team B"
    const cleaned = body
      .replace(new RegExp(teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
      .replace(/^[\s\-–—/vs.@:]+|[\s\-–—/vs.@:]+$/gi, '')
      .trim();
    if (cleaned) opponent = cleaned;
  }

  // Trailing venue markers the name does not include: "Dragons (Away)"
  opponent = opponent.replace(/[\s\-–—]*[([](?:home|away|h|a|visitor|neutral)[)\]]\s*$/i, '').trim();

  // Clean remaining prefix tags like "AYSO Match:", "Game 1:", etc.
  opponent = opponent.replace(/^(?:AYSO|Game|Match|Soccer)[\s\w\-#]*:\s*/i, '').trim();

  // An explicit marker anywhere in the title beats what the separator implied.
  if (/\b(?:away|visitor)\b/i.test(raw)) {
    homeAway = 'away';
  } else if (/\bhome\b/i.test(raw)) {
    homeAway = 'home';
  }

  return {
    opponent: opponent || 'Opponent',
    homeAway,
  };
}

/**
 * Unfolds folded iCalendar lines (RFC 5545 specifies that lines starting with space or tab are continuations)
 */
function unfoldIcsLines(rawIcs) {
  return rawIcs.replace(/\r?\n[ \t]/g, '');
}

/**
 * Decodes escaped characters in iCalendar property values
 */
function unescapeIcsValue(val = '') {
  return val
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * How far a named IANA zone was from UTC at a given instant.
 */
function zoneOffsetMs(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) parts[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcMs;
}

/**
 * The instant a wall-clock time in a named zone refers to. Two passes, because
 * the offset that converts the time depends on the instant it converts to.
 * Returns null for a zone this runtime does not know — an Outlook-style
 * "Pacific Standard Time", say — so the caller can fall back to the digits.
 */
function zonedWallTimeToUtcMs(y, mo, d, h, mi, s, timeZone) {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    let utc = naive;
    for (let i = 0; i < 2; i += 1) utc = naive - zoneOffsetMs(utc, timeZone);
    return utc;
  } catch {
    return null;
  }
}

/**
 * The calendar date and clock reading an instant has in a zone — the device's
 * own unless one is named. Tests name one, so that what an export in UTC comes
 * out as does not depend on where the machine running them happens to be.
 */
function readInZone(instantMs, timeZone) {
  if (timeZone) {
    try {
      const shifted = new Date(instantMs + zoneOffsetMs(instantMs, timeZone));
      return {
        y: shifted.getUTCFullYear(),
        mo: shifted.getUTCMonth() + 1,
        d: shifted.getUTCDate(),
        h: shifted.getUTCHours(),
        mi: shifted.getUTCMinutes(),
      };
    } catch {
      /* unknown zone: fall through to the device's own */
    }
  }
  const local = new Date(instantMs);
  return {
    y: local.getFullYear(),
    mo: local.getMonth() + 1,
    d: local.getDate(),
    h: local.getHours(),
    mi: local.getMinutes(),
  };
}

const ICS_STAMP = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/;

/**
 * Reads a DTSTART into the calendar date and wall-clock time the coach keeps.
 *
 * TeamSnap and most other exports stamp DTSTART in UTC. A 2pm Saturday kickoff
 * in Hawaii is `20260830T000000Z` — the *next* day, at midnight, if the digits
 * are read as written, which is where every game in an imported season landed.
 * A `TZID=` parameter names the zone the wall time belongs to; without either,
 * the time is floating and means the same clock reading everywhere, so it is
 * taken as it stands.
 *
 * The app deals in plain calendar dates and 12-hour times the whole way
 * through, which is what comes back here.
 */
export function parseIcsDateTime(rawValue, params = '', timeZone = '') {
  const value = String(rawValue || '').trim();
  const match = ICS_STAMP.exec(value);

  if (!match) {
    const [datePart, timePart] = value.split('T');
    return {
      gameDate: normalizeDateString(datePart || value),
      gameTime: timePart ? normalizeTimeString(timePart) : '',
    };
  }

  const [, y, mo, d, h, mi, s, zulu] = match;
  if (h === undefined) {
    return { gameDate: `${y}-${mo}-${d}`, gameTime: '' };
  }

  const tzid = /(?:^|;)TZID=([^;:]+)/i.exec(params || '');
  let instantMs = null;
  if (zulu) {
    instantMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0));
  } else if (tzid) {
    instantMs = zonedWallTimeToUtcMs(
      Number(y),
      Number(mo),
      Number(d),
      Number(h),
      Number(mi),
      Number(s || 0),
      tzid[1].trim()
    );
  }

  if (instantMs === null || Number.isNaN(instantMs)) {
    return { gameDate: `${y}-${mo}-${d}`, gameTime: formatTimeString(`${h}:${mi}`) };
  }

  const local = readInZone(instantMs, timeZone);
  return {
    gameDate: `${local.y}-${pad2(local.mo)}-${pad2(local.d)}`,
    gameTime: formatTimeString(`${pad2(local.h)}:${pad2(local.mi)}`),
  };
}

const NON_GAME_SUMMARY = /^\s*(?:team\s+)?(?:practice|training|meeting|event|other|photos?|picture\s+day|social|party|tryouts?|clinic|camp|fundraiser|volunteer|banquet|registration)\b/i;
const GAME_SUMMARY = /^\s*(?:game|match|scrimmage|friendly|tournament|playoffs?|jamboree)\b/i;

/**
 * What kind of event a VEVENT is.
 *
 * A TeamSnap export is the whole calendar, not the match list: the season this
 * was written against holds ten games and forty practices, and importing all
 * fifty filled the schedule with matches against "Practice at Kaha Park".
 * 'unknown' is for a calendar that labels nothing — a bare "vs Sharks" is a
 * game, but so, as far as anything here can tell, is "Kickoff BBQ".
 */
export function classifyIcsEvent(summary = '', categories = '') {
  const text = String(summary || '');
  const cats = String(categories || '');

  if (NON_GAME_SUMMARY.test(text)) return 'other';
  if (/\b(?:practice|training)\b/i.test(cats)) return 'other';
  if (GAME_SUMMARY.test(text)) return 'game';
  if (/(?:^|\s)(?:vs\.?|versus|@)\s/i.test(text)) return 'game';
  if (/\b(?:game|match)\b/i.test(cats)) return 'game';
  return 'unknown';
}

/**
 * Flattens a multi-line LOCATION into the single line the schedule shows.
 * TeamSnap puts the venue on the first line and the street address below it.
 */
export function normalizeIcsLocation(val = '') {
  return String(val)
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s*,(\s*,)+/g, ',')
    .trim();
}

const DESCRIPTION_NOISE_KEYS = new Set([
  'link',
  'url',
  'more info',
  'duration',
  'location',
  'address',
  'where',
  'when',
  'time',
  'date',
]);

const DUTY_PATTERNS = [
  ['jerseyColor', /^(?:jersey|uniform|colou?r)$/i],
  ['snackParent', /^(?:snack|snacks|post-?game snack)$/i],
  ['fruitParent', /^(?:fruit|halftime fruit)$/i],
  ['refereeDuty', /^(?:referee|ref|ref duty)$/i],
  ['fieldSetup', /^(?:field setup|setup|breakdown)$/i],
];

/**
 * Pulls the volunteer duties out of a DESCRIPTION and leaves the rest as notes.
 *
 * Most of a TeamSnap description is the summary and the location again, the
 * duration, and a deep link a hundred characters long — none of which the
 * coach needs in the notes field of a match they already have in front of them.
 */
export function parseIcsDescription(description = '', { summary = '', location = '' } = {}) {
  const norm = (str) => String(str || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const summaryText = norm(summary);
  const locationLines = new Set(
    String(location || '')
      .split(/\r?\n/)
      .map(norm)
      .filter(Boolean)
  );

  const result = {
    notes: '',
    jerseyColor: '',
    snackParent: '',
    fruitParent: '',
    refereeDuty: '',
    fieldSetup: '',
  };
  const kept = [];

  for (const rawLine of String(description || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const labelled = /^([A-Za-z][A-Za-z -]{0,20}):\s*(.*)$/.exec(line);
    const key = labelled ? labelled[1].toLowerCase().trim() : '';
    const value = labelled ? labelled[2].trim() : line;

    const duty = labelled && DUTY_PATTERNS.find(([, pattern]) => pattern.test(key));
    if (duty) {
      if (!result[duty[0]] && value) result[duty[0]] = value.replace(/[,;].*$/, '').trim();
      continue;
    }

    if (DESCRIPTION_NOISE_KEYS.has(key)) continue;
    if (/^https?:\/\//i.test(value)) continue;
    if (summaryText && norm(line) === summaryText) continue;
    if (locationLines.has(norm(line))) continue;

    kept.push(line);
  }

  result.notes = kept.join('\n').trim();
  return result;
}

/**
 * Parses iCalendar (.ics) text into every VEVENT it holds, tagged by kind.
 */
function parseIcsEvents(rawIcs, currentTeamName = '', timeZone = '') {
  const unfolded = unfoldIcsLines(rawIcs.replace(/^﻿/, ''));
  const lines = unfolded.split(/\r?\n/);

  const events = [];
  let inEvent = false;
  let currentEvent = null;

  const finish = () => {
    if (!currentEvent || !currentEvent.gameDate) return;
    const { opponent, homeAway } = parseSummaryDetails(currentEvent.summary || '', currentTeamName);
    const duties = parseIcsDescription(currentEvent.description || '', {
      summary: currentEvent.summary || '',
      location: currentEvent.rawLocation || '',
    });

    events.push({
      kind: classifyIcsEvent(currentEvent.summary || '', currentEvent.categories || ''),
      fixture: {
        id: currentEvent.uid || `fixture_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        gameDate: currentEvent.gameDate,
        gameTime: currentEvent.gameTime || '',
        opponent,
        homeAway,
        location: normalizeIcsLocation(currentEvent.rawLocation || ''),
        jerseyColor: duties.jerseyColor,
        snackParent: duties.snackParent,
        fruitParent: duties.fruitParent,
        refereeDuty: duties.refereeDuty,
        fieldSetup: duties.fieldSetup,
        status: currentEvent.status || 'upcoming',
        notes: duties.notes,
      },
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent) finish();
      inEvent = false;
      currentEvent = null;
      continue;
    }

    if (!inEvent) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const rawKey = line.slice(0, colonIndex);
    const rawVal = line.slice(colonIndex + 1);
    const key = rawKey.split(';')[0].toUpperCase();
    const params = rawKey.slice(rawKey.indexOf(';') + 1);
    const val = unescapeIcsValue(rawVal);

    if (key === 'SUMMARY') {
      currentEvent.summary = val;
    } else if (key === 'DTSTART') {
      const { gameDate, gameTime } = parseIcsDateTime(val, rawKey.includes(';') ? params : '', timeZone);
      currentEvent.gameDate = gameDate;
      currentEvent.gameTime = gameTime;
    } else if (key === 'LOCATION') {
      currentEvent.rawLocation = val;
    } else if (key === 'DESCRIPTION') {
      currentEvent.description = val;
    } else if (key === 'CATEGORIES') {
      currentEvent.categories = val;
    } else if (key === 'STATUS') {
      if (val.toUpperCase() === 'CANCELLED') {
        currentEvent.status = 'canceled';
      } else if (val.toUpperCase() === 'CONFIRMED') {
        currentEvent.status = 'upcoming';
      }
    } else if (key === 'UID') {
      currentEvent.uid = val;
    }
  }

  return events;
}

/**
 * Parses iCalendar (.ics) text into the matches it holds, and a count of what
 * was left behind.
 *
 * A calendar that labels its games ("Game: A vs B") is taken at its word and
 * everything else in it is dropped. One that labels nothing is imported whole,
 * so a hand-made calendar of ten untitled fixtures still works.
 */
export function parseIcsCalendar(rawIcs, currentTeamName = '', timeZone = '') {
  if (!rawIcs || typeof rawIcs !== 'string') return { fixtures: [], skipped: 0 };

  const events = parseIcsEvents(rawIcs, currentTeamName, timeZone);
  const games = events.filter((e) => e.kind === 'game');
  const chosen = games.length > 0 ? games : events.filter((e) => e.kind === 'unknown');

  return {
    fixtures: chosen.map((e) => e.fixture),
    skipped: events.length - chosen.length,
  };
}

/**
 * Parses iCalendar (.ics) text into an array of fixture objects
 */
export function parseIcsSchedule(rawIcs, currentTeamName = '', timeZone = '') {
  return parseIcsCalendar(rawIcs, currentTeamName, timeZone).fixtures;
}

/**
 * Detects schedule column indices from CSV headers
 */
export function detectScheduleColumns(headers) {
  const norm = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  let dateIdx = -1;
  let timeIdx = -1;
  let opponentIdx = -1;
  let locationIdx = -1;
  let homeAwayIdx = -1;
  let jerseyIdx = -1;
  let snackIdx = -1;
  let fruitIdx = -1;
  let refIdx = -1;
  let setupIdx = -1;
  let statusIdx = -1;
  let notesIdx = -1;

  headers.forEach((h, idx) => {
    const nh = norm(h);

    if (dateIdx === -1 && (nh.includes('date') || nh === 'day' || nh === 'matchdate' || nh === 'gamedate')) {
      dateIdx = idx;
    } else if (timeIdx === -1 && (nh.includes('time') || nh.includes('kickoff') || nh === 'start')) {
      timeIdx = idx;
    } else if (opponentIdx === -1 && (nh.includes('opponent') || nh.includes('vs') || nh === 'against' || nh.includes('team'))) {
      opponentIdx = idx;
    } else if (locationIdx === -1 && (nh.includes('location') || nh.includes('field') || nh.includes('venue') || nh.includes('park') || nh.includes('ground'))) {
      locationIdx = idx;
    } else if (homeAwayIdx === -1 && (nh.includes('homeaway') || nh === 'ha' || nh === 'type' || nh === 'venue' || nh === 'side')) {
      homeAwayIdx = idx;
    } else if (jerseyIdx === -1 && (nh.includes('jersey') || nh.includes('uniform') || nh.includes('color'))) {
      jerseyIdx = idx;
    } else if (snackIdx === -1 && (nh.includes('snack') || nh.includes('postgame'))) {
      snackIdx = idx;
    } else if (fruitIdx === -1 && (nh.includes('fruit') || nh.includes('halftime'))) {
      fruitIdx = idx;
    } else if (refIdx === -1 && (nh.includes('ref') || nh.includes('referee') || nh.includes('umpire'))) {
      refIdx = idx;
    } else if (setupIdx === -1 && (nh.includes('setup') || nh.includes('fieldsetup') || nh.includes('breakdown'))) {
      setupIdx = idx;
    } else if (statusIdx === -1 && nh.includes('status')) {
      statusIdx = idx;
    } else if (notesIdx === -1 && (nh.includes('note') || nh.includes('memo') || nh.includes('comment') || nh.includes('desc'))) {
      notesIdx = idx;
    }
  });

  return {
    dateIdx,
    timeIdx,
    opponentIdx,
    locationIdx,
    homeAwayIdx,
    jerseyIdx,
    snackIdx,
    fruitIdx,
    refIdx,
    setupIdx,
    statusIdx,
    notesIdx,
  };
}

/**
 * Parses CSV or delimited spreadsheet text into an array of fixture objects
 */
export function parseCsvSchedule(rawCsv) {
  const { headers, rows } = parseDelimitedText(rawCsv);
  if (headers.length === 0 || rows.length === 0) return [];

  const cols = detectScheduleColumns(headers);
  if (cols.dateIdx === -1 && cols.opponentIdx === -1) {
    return [];
  }

  const fixtures = [];

  rows.forEach((row, rIdx) => {
    const rawDate = cols.dateIdx !== -1 ? row[cols.dateIdx] : '';
    const rawTime = cols.timeIdx !== -1 ? row[cols.timeIdx] : '';
    const rawOpponent = cols.opponentIdx !== -1 ? row[cols.opponentIdx] : '';
    const rawLocation = cols.locationIdx !== -1 ? row[cols.locationIdx] : '';
    const rawHomeAway = cols.homeAwayIdx !== -1 ? row[cols.homeAwayIdx] : '';
    const rawJersey = cols.jerseyIdx !== -1 ? row[cols.jerseyIdx] : '';
    const rawSnack = cols.snackIdx !== -1 ? row[cols.snackIdx] : '';
    const rawFruit = cols.fruitIdx !== -1 ? row[cols.fruitIdx] : '';
    const rawRef = cols.refIdx !== -1 ? row[cols.refIdx] : '';
    const rawSetup = cols.setupIdx !== -1 ? row[cols.setupIdx] : '';
    const rawStatus = cols.statusIdx !== -1 ? row[cols.statusIdx] : '';
    const rawNotes = cols.notesIdx !== -1 ? row[cols.notesIdx] : '';

    const gameDate = normalizeDateString(rawDate);
    if (!gameDate) return;

    let homeAway = 'home';
    if (rawHomeAway) {
      homeAway = rawHomeAway.toLowerCase().includes('away') || rawHomeAway.toLowerCase() === 'a' ? 'away' : 'home';
    }

    let status = 'upcoming';
    if (rawStatus) {
      const s = rawStatus.toLowerCase();
      if (s.includes('cancel')) status = 'canceled';
      else if (s.includes('complete') || s.includes('final') || s.includes('done')) status = 'completed';
    }

    fixtures.push({
      id: `fixture_${Date.now()}_${rIdx}_${Math.random().toString(36).slice(2, 7)}`,
      gameDate,
      gameTime: normalizeTimeString(rawTime),
      opponent: rawOpponent || 'Opponent',
      homeAway,
      location: rawLocation || '',
      jerseyColor: rawJersey || '',
      snackParent: rawSnack || '',
      fruitParent: rawFruit || '',
      refereeDuty: rawRef || '',
      fieldSetup: rawSetup || '',
      status,
      notes: rawNotes || '',
    });
  });

  return fixtures;
}

/**
 * Names the service a calendar came from, so the import preview can say what
 * it is looking at. Read from PRODID, which every exporter stamps.
 */
export function detectIcsPlatform(rawIcs = '') {
  const head = String(rawIcs).slice(0, 2000);
  if (/teamsnap/i.test(head)) return 'TeamSnap Calendar';
  if (/sportsengine|sportngin|ngin/i.test(head)) return 'SportsEngine Calendar';
  if (/google/i.test(head)) return 'Google Calendar';
  if (/apple|mac os x/i.test(head)) return 'Apple Calendar';
  if (/stack ?sports|bluesombrero|gotsport|demosphere/i.test(head)) return 'League Calendar';
  return 'iCalendar (.ics)';
}

/**
 * Extracts fixtures from a File object (.ics, .ical, .csv, .tsv, .txt)
 */
export async function extractFixturesFromFile(file, currentTeamName = '', timeZone = '') {
  if (!file) throw new Error('No file provided');

  const text = await file.text();
  const name = (file.name || '').toLowerCase();

  let fixtures = [];
  let platform = 'File Import';
  let skipped = 0;

  if (name.endsWith('.ics') || name.endsWith('.ical') || text.includes('BEGIN:VCALENDAR')) {
    platform = detectIcsPlatform(text);
    const parsed = parseIcsCalendar(text, currentTeamName, timeZone);
    fixtures = parsed.fixtures;
    skipped = parsed.skipped;
  } else {
    platform = name.endsWith('.tsv') ? 'TSV Spreadsheet' : 'CSV Spreadsheet';
    fixtures = parseCsvSchedule(text);
  }

  // Sort chronologically
  fixtures.sort((a, b) => {
    const dA = a.gameDate || '';
    const dB = b.gameDate || '';
    if (dA !== dB) return dA.localeCompare(dB);
    return (a.gameTime || '').localeCompare(b.gameTime || '');
  });

  return {
    platform,
    fixtures,
    count: fixtures.length,
    skipped,
    filename: file.name,
  };
}
