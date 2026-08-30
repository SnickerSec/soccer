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
 * Parses opponent and home/away status from an event summary/title.
 * e.g., "AYSO 10U: Thunder vs Sharks", "vs. Dragons", "@ Earthquakes"
 */
export function parseSummaryDetails(summary = '', teamName = '') {
  let opponent = summary.trim();
  let homeAway = 'home';

  // Check for @ (away) pattern
  if (/@\s*([^,;()]+)/i.test(summary)) {
    const match = /@\s*([^,;()]+)/i.exec(summary);
    if (match) {
      opponent = match[1].trim();
      homeAway = 'away';
    }
  } else if (/vs\.?\s*([^,;()]+)/i.test(summary)) {
    const match = /vs\.?\s*([^,;()]+)/i.exec(summary);
    if (match) {
      opponent = match[1].trim();
      homeAway = 'home';
    }
  } else if (teamName && summary.toLowerCase().includes(teamName.toLowerCase())) {
    // e.g. "Team A - Team B" or "Team A / Team B"
    const cleaned = summary.replace(new RegExp(teamName, 'gi'), '').replace(/^[\s\-–—/vs.@:]+|[\s\-–—/vs.@:]+$/gi, '').trim();
    if (cleaned) opponent = cleaned;
  }

  // Clean remaining prefix tags like "AYSO Match:", "Game 1:", etc.
  opponent = opponent.replace(/^(?:AYSO|Game|Match|Soccer)[\s\w\-#]*:\s*/i, '').trim();

  // Check if summary explicitly mentions (Away) or (Home)
  if (/\b(?:away|visitor)\b/i.test(summary)) {
    homeAway = 'away';
  } else if (/\bhome\b/i.test(summary)) {
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

/**
 * Parses iCalendar (.ics) text into an array of fixture objects
 */
export function parseIcsSchedule(rawIcs, currentTeamName = '') {
  if (!rawIcs || typeof rawIcs !== 'string') return [];

  const unfolded = unfoldIcsLines(rawIcs);
  const lines = unfolded.split(/\r?\n/);

  const fixtures = [];
  let inEvent = false;
  let currentEvent = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent && currentEvent.gameDate) {
        fixtures.push({
          id: currentEvent.uid || `fixture_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          gameDate: currentEvent.gameDate,
          gameTime: currentEvent.gameTime || '',
          opponent: currentEvent.opponent || 'Opponent',
          homeAway: currentEvent.homeAway || 'home',
          location: currentEvent.location || '',
          jerseyColor: currentEvent.jerseyColor || '',
          snackParent: currentEvent.snackParent || '',
          fruitParent: currentEvent.fruitParent || '',
          refereeDuty: currentEvent.refereeDuty || '',
          fieldSetup: currentEvent.fieldSetup || '',
          status: currentEvent.status || 'upcoming',
          notes: currentEvent.notes || '',
        });
      }
      inEvent = false;
      currentEvent = {};
      continue;
    }

    if (!inEvent) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const rawKey = line.slice(0, colonIndex);
    const rawVal = line.slice(colonIndex + 1);
    const key = rawKey.split(';')[0].toUpperCase();
    const val = unescapeIcsValue(rawVal);

    if (key === 'SUMMARY') {
      const { opponent, homeAway } = parseSummaryDetails(val, currentTeamName);
      currentEvent.opponent = opponent;
      currentEvent.homeAway = homeAway;
      currentEvent.summary = val;
    } else if (key === 'DTSTART') {
      // e.g. "20260912T090000Z", "20260912T090000", "20260912"
      if (val.includes('T')) {
        const [dPart, tPart] = val.split('T');
        currentEvent.gameDate = normalizeDateString(dPart);
        currentEvent.gameTime = normalizeTimeString(tPart);
      } else {
        currentEvent.gameDate = normalizeDateString(val);
        currentEvent.gameTime = '';
      }
    } else if (key === 'LOCATION') {
      currentEvent.location = val;
    } else if (key === 'DESCRIPTION') {
      currentEvent.notes = val;

      // Check description for duty / volunteer tags
      const snackMatch = /(?:snack|post-game snack):\s*([^\n\r,]+)/i.exec(val);
      if (snackMatch) currentEvent.snackParent = snackMatch[1].trim();

      const fruitMatch = /(?:fruit|halftime fruit):\s*([^\n\r,]+)/i.exec(val);
      if (fruitMatch) currentEvent.fruitParent = fruitMatch[1].trim();

      const refMatch = /(?:referee|ref duty):\s*([^\n\r,]+)/i.exec(val);
      if (refMatch) currentEvent.refereeDuty = refMatch[1].trim();

      const setupMatch = /(?:field setup|setup):\s*([^\n\r,]+)/i.exec(val);
      if (setupMatch) currentEvent.fieldSetup = setupMatch[1].trim();

      const jerseyMatch = /(?:jersey|uniform|color):\s*([^\n\r,]+)/i.exec(val);
      if (jerseyMatch) currentEvent.jerseyColor = jerseyMatch[1].trim();
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

  return fixtures;
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
 * Extracts fixtures from a File object (.ics, .ical, .csv, .tsv, .txt)
 */
export async function extractFixturesFromFile(file, currentTeamName = '') {
  if (!file) throw new Error('No file provided');

  const text = await file.text();
  const name = (file.name || '').toLowerCase();

  let fixtures = [];
  let platform = 'File Import';

  if (name.endsWith('.ics') || name.endsWith('.ical') || text.includes('BEGIN:VCALENDAR')) {
    platform = 'iCalendar (.ics)';
    fixtures = parseIcsSchedule(text, currentTeamName);
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
    filename: file.name,
  };
}
