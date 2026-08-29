/**
 * Schedule & Volunteer Duty Module
 * Handles date formatting, parent reminder memos, iCal (.ics) generation,
 * volunteer duty matrix stats, and schedule CSV export.
 */

import { csvRow } from './export.js';

/**
 * Parses YYYY-MM-DD string into a local Date object without timezone offset shift.
 *
 * Only the calendar date at the front is read, so an ISO timestamp parses as
 * the day it names rather than shifting across midnight — or, when the split
 * here took 'T00:00:00.000Z' for a day number, as an Invalid Date. The server
 * no longer sends one, but saves made before it stopped are still in local
 * storage.
 */
export function parseLocalDate(dateStr) {
    if (!dateStr) return new Date();
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(dateStr));
    if (match) {
        const [, y, m, d] = match.map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(dateStr);
}

/**
 * Format a match date and optional time into a friendly display string.
 * e.g., "Sat, Sep 12, 2026" or "Sat, Sep 12 • 9:00 AM"
 */
export function formatMatchDate(dateStr, timeStr = '', format = 'short') {
    if (!dateStr) return 'TBD';
    const date = parseLocalDate(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;

    const weekday = date.toLocaleDateString('en-US', { weekday: format === 'long' ? 'long' : 'short' });
    const month = date.toLocaleDateString('en-US', { month: format === 'long' ? 'long' : 'short' });
    const day = date.getDate();
    const year = date.getFullYear();

    let result = format === 'long' ? `${weekday}, ${month} ${day}, ${year}` : `${weekday}, ${month} ${day}`;

    if (timeStr && timeStr.trim()) {
        result += ` • ${formatTimeString(timeStr)}`;
    }

    return result;
}

/**
 * Formats time string (e.g. "09:00", "14:30", "9:00 AM") into clean AM/PM format.
 */
export function formatTimeString(timeStr) {
    if (!timeStr) return '';
    const trimmed = timeStr.trim();
    if (trimmed.toLowerCase().includes('am') || trimmed.toLowerCase().includes('pm')) {
        return trimmed;
    }

    const parts = trimmed.split(':');
    if (parts.length >= 2) {
        let hours = parseInt(parts[0], 10);
        const mins = parts[1].padStart(2, '0');
        if (Number.isNaN(hours)) return timeStr;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if (hours === 0) hours = 12;
        return `${hours}:${mins} ${ampm}`;
    }

    return timeStr;
}

/**
 * Generates formatted match reminder announcement for SMS, WhatsApp, Email, or TeamSnap.
 */
export function formatParentMemo(fixture, teamName = 'Our Team') {
    if (!fixture) return '';

    const dateFormatted = formatMatchDate(fixture.gameDate, fixture.gameTime, 'long');
    const homeAwayText = fixture.homeAway === 'away' ? 'Away' : 'Home';
    const opponent = fixture.opponent || 'Opponent';

    const lines = [
        `⚽ AYSO Match Day: ${teamName}`,
        `🆚 vs ${opponent} (${homeAwayText})`,
        `📅 ${dateFormatted}`,
    ];

    if (fixture.location && fixture.location.trim()) {
        lines.push(`📍 Field / Location: ${fixture.location.trim()}`);
    }

    if (fixture.jerseyColor && fixture.jerseyColor.trim()) {
        lines.push(`👕 Jersey Color: ${fixture.jerseyColor.trim()}`);
    }

    const volunteers = [];
    if (fixture.fruitParent && fixture.fruitParent.trim()) {
        volunteers.push(`🍊 Halftime Fruit: ${fixture.fruitParent.trim()}`);
    }
    if (fixture.snackParent && fixture.snackParent.trim()) {
        volunteers.push(`🍪 Post-Game Snack: ${fixture.snackParent.trim()}`);
    }
    if (fixture.refereeDuty && fixture.refereeDuty.trim()) {
        volunteers.push(`🚩 Referee / Lines: ${fixture.refereeDuty.trim()}`);
    }
    if (fixture.fieldSetup && fixture.fieldSetup.trim()) {
        volunteers.push(`⛳ Field Setup / Flags: ${fixture.fieldSetup.trim()}`);
    }

    if (volunteers.length > 0) {
        lines.push('');
        lines.push('📋 Family Volunteer Duties:');
        volunteers.forEach((v) => lines.push(`  ${v}`));
    }

    if (fixture.notes && fixture.notes.trim()) {
        lines.push('');
        lines.push(`📝 Coach Note: ${fixture.notes.trim()}`);
    }

    return lines.join('\n');
}

/**
 * Format a Date to UTC ISO format for iCalendar creation stamp (YYYYMMDDTHHMMSSZ).
 */
function toIcsTimestamp(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Format a Date to local floating timestamp for iCalendar (YYYYMMDDTHHMMSS).
 * This ensures calendar apps display the kickoff at the intended local hour.
 */
function toIcsLocalTimestamp(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}T${hh}${mm}${ss}`;
}

/**
 * Generate iCalendar (RFC 5545) event block for a single fixture.
 */
export function generateIcsEvent(fixture, teamName = 'AYSO Soccer', ageDivision = '10U') {
    if (!fixture || !fixture.gameDate) return '';

    const durationMinutes = ageDivision === '12U' ? 75 : ageDivision === '14U' || ageDivision === '16U' ? 90 : 60;
    const date = parseLocalDate(fixture.gameDate);

    if (fixture.gameTime && fixture.gameTime.trim()) {
        const parts = fixture.gameTime.trim().split(':');
        if (parts.length >= 2) {
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (!Number.isNaN(h) && !Number.isNaN(m)) {
                date.setHours(h, m, 0, 0);
            }
        }
    } else {
        // Default to 9:00 AM if no time provided
        date.setHours(9, 0, 0, 0);
    }

    const startDate = new Date(date);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

    const uid = `ayso-${fixture.id || Date.now()}-${startDate.getTime()}@rosterpro.app`;
    const dtStamp = toIcsTimestamp(new Date());
    const dtStart = toIcsLocalTimestamp(startDate);
    const dtEnd = toIcsLocalTimestamp(endDate);

    const homeAwayText = fixture.homeAway === 'away' ? 'Away' : 'Home';
    const summary = `${teamName} vs ${fixture.opponent || 'Opponent'} (${homeAwayText})`;
    const location = (fixture.location || '').replace(/,/g, '\\,');

    const descLines = [
        `AYSO Match: ${teamName} vs ${fixture.opponent || 'Opponent'} (${homeAwayText})`,
        fixture.jerseyColor ? `Jersey: ${fixture.jerseyColor}` : '',
        fixture.snackParent ? `Post-Game Snacks: ${fixture.snackParent}` : '',
        fixture.fruitParent ? `Halftime Fruit: ${fixture.fruitParent}` : '',
        fixture.refereeDuty ? `Referee Duty: ${fixture.refereeDuty}` : '',
        fixture.notes ? `Coach Notes: ${fixture.notes}` : ''
    ].filter(Boolean);

    const description = descLines.join('\\n');

    return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        location ? `LOCATION:${location}` : '',
        `DESCRIPTION:${description}`,
        'STATUS:CONFIRMED',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Soccer Match Reminder',
        'TRIGGER:-PT2H',
        'END:VALARM',
        'END:VEVENT'
    ].filter(Boolean).join('\r\n');
}

/**
 * Generate full season iCalendar (.ics) string.
 */
export function generateSeasonIcs(fixtures = [], teamName = 'AYSO Soccer', ageDivision = '10U') {
    const validFixtures = Array.isArray(fixtures) ? fixtures.filter((f) => f && f.gameDate && f.status !== 'canceled') : [];

    const events = validFixtures.map((f) => generateIcsEvent(f, teamName, ageDivision));

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//AYSO Roster Pro//Match Schedule Calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${teamName} Match Schedule`,
        'X-WR-TIMEZONE:UTC',
        ...events,
        'END:VCALENDAR'
    ].join('\r\n');
}

/**
 * Calculates volunteer duties per player/family across the season.
 */
export function calculateVolunteerStats(fixtures = [], players = []) {
    const playerNames = new Set((players || []).map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean));
    const stats = {};

    // Initialize stats for known players
    playerNames.forEach((name) => {
        stats[name] = {
            name,
            snackCount: 0,
            fruitCount: 0,
            refereeCount: 0,
            fieldSetupCount: 0,
            totalDuties: 0,
            assignments: []
        };
    });

    let totalSnackAssigned = 0;
    let totalFruitAssigned = 0;
    let unassignedSnackFixtures = 0;
    let unassignedFruitFixtures = 0;

    const validFixtures = (fixtures || []).filter((f) => f && f.status !== 'canceled');

    validFixtures.forEach((fix) => {
        const dateStr = formatMatchDate(fix.gameDate, fix.gameTime);
        const opponent = fix.opponent || 'Opponent';

        // Snacks
        if (fix.snackParent && fix.snackParent.trim()) {
            const parent = fix.snackParent.trim();
            totalSnackAssigned++;
            if (!stats[parent]) {
                stats[parent] = { name: parent, snackCount: 0, fruitCount: 0, refereeCount: 0, fieldSetupCount: 0, totalDuties: 0, assignments: [] };
            }
            stats[parent].snackCount++;
            stats[parent].totalDuties++;
            stats[parent].assignments.push({ date: dateStr, duty: 'Snack', opponent });
        } else {
            unassignedSnackFixtures++;
        }

        // Fruit
        if (fix.fruitParent && fix.fruitParent.trim()) {
            const parent = fix.fruitParent.trim();
            totalFruitAssigned++;
            if (!stats[parent]) {
                stats[parent] = { name: parent, snackCount: 0, fruitCount: 0, refereeCount: 0, fieldSetupCount: 0, totalDuties: 0, assignments: [] };
            }
            stats[parent].fruitCount++;
            stats[parent].totalDuties++;
            stats[parent].assignments.push({ date: dateStr, duty: 'Fruit', opponent });
        } else {
            unassignedFruitFixtures++;
        }

        // Referee
        if (fix.refereeDuty && fix.refereeDuty.trim()) {
            const parent = fix.refereeDuty.trim();
            if (!stats[parent]) {
                stats[parent] = { name: parent, snackCount: 0, fruitCount: 0, refereeCount: 0, fieldSetupCount: 0, totalDuties: 0, assignments: [] };
            }
            stats[parent].refereeCount++;
            stats[parent].totalDuties++;
            stats[parent].assignments.push({ date: dateStr, duty: 'Referee', opponent });
        }

        // Field Setup
        if (fix.fieldSetup && fix.fieldSetup.trim()) {
            const parent = fix.fieldSetup.trim();
            if (!stats[parent]) {
                stats[parent] = { name: parent, snackCount: 0, fruitCount: 0, refereeCount: 0, fieldSetupCount: 0, totalDuties: 0, assignments: [] };
            }
            stats[parent].fieldSetupCount++;
            stats[parent].totalDuties++;
            stats[parent].assignments.push({ date: dateStr, duty: 'Field Setup', opponent });
        }
    });

    const activeList = Object.values(stats);
    const assignedPlayers = activeList.filter((s) => s.totalDuties > 0);
    const unassignedPlayers = activeList.filter((s) => s.totalDuties === 0);

    const totalGames = validFixtures.length;
    const snackCoveragePct = totalGames > 0 ? Math.round(((totalGames - unassignedSnackFixtures) / totalGames) * 100) : 100;
    const fruitCoveragePct = totalGames > 0 ? Math.round(((totalGames - unassignedFruitFixtures) / totalGames) * 100) : 100;

    return {
        statsByPlayer: stats,
        playerList: activeList,
        assignedPlayers,
        unassignedPlayers,
        totalGames,
        snackCoveragePct,
        fruitCoveragePct,
        unassignedSnackFixtures,
        unassignedFruitFixtures
    };
}

/**
 * Generate CSV export of the match schedule.
 */
export function exportScheduleCsv(fixtures = [], teamName = 'AYSO Soccer') {
    const headers = [
        'Date',
        'Time',
        'Opponent',
        'Home/Away',
        'Location / Field',
        'Jersey Color',
        'Post-Game Snack',
        'Halftime Fruit',
        'Referee Duty',
        'Field Setup',
        'Status',
        'Notes'
    ];

    const rows = [csvRow(headers)];

    (fixtures || []).forEach((fix) => {
        rows.push(
            csvRow([
                fix.gameDate || '',
                fix.gameTime || '',
                fix.opponent || '',
                fix.homeAway === 'away' ? 'Away' : 'Home',
                fix.location || '',
                fix.jerseyColor || '',
                fix.snackParent || '',
                fix.fruitParent || '',
                fix.refereeDuty || '',
                fix.fieldSetup || '',
                fix.status || 'upcoming',
                fix.notes || ''
            ])
        );
    });

    return rows.join('\r\n');
}
