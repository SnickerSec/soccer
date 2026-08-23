/**
 * Turning a lineup or roster into a file: CSV, plain text, and the download
 * itself.
 *
 * Kept apart from the app class because none of it needs app state — it takes
 * a lineup and some players and returns a string — and because the CSV quoting
 * rule is the kind of thing that is only ever noticed when it is wrong.
 */

/** Leading characters a spreadsheet reads as the start of a formula. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** A value that is just a number, which no spreadsheet treats as a formula. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Stops a spreadsheet from evaluating a value as a formula.
 *
 * Excel and Sheets run a cell beginning = + - or @ on open, so a player named
 * `=HYPERLINK(...)` executes on whoever opens the roster. The names come from
 * whoever shares the team, which is a smaller circle than the internet but not
 * a circle that has to be trusted.
 *
 * A leading apostrophe is the usual fix; spreadsheets read it as "this is
 * text" and do not show it. Plain negative numbers are left alone, so a real
 * -1 stays a number rather than becoming text.
 */
function neutralizeFormula(text) {
    if (!FORMULA_LEAD.test(text) || PLAIN_NUMBER.test(text)) return text;
    return `'${text}`;
}

/**
 * One CSV field, quoted per RFC 4180.
 *
 * A quote inside a quoted field has to be doubled. Both exporters used to wrap
 * every value in quotes and stop there, so a player entered as Bob "Bobby"
 * Smith produced "Bob "Bobby" Smith" — which a spreadsheet reads as three
 * fields, shifting every column after it on that row.
 */
export function csvField(value) {
    const text = neutralizeFormula(String(value ?? ''));
    return `"${text.replace(/"/g, '""')}"`;
}

/** A CSV line from a list of values. */
export function csvRow(values) {
    return values.map(csvField).join(',');
}

/** Today, as the date suffix the export filenames use. */
function today() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Hands the browser a file to save.
 *
 * The object URL is revoked once the click has been dispatched — the four
 * copies of this that used to be inline disagreed about whether to bother, and
 * one of them leaked a URL per export for the life of the page.
 */
export function downloadTextFile(filename, text, type = 'text/plain') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

/** `#7` for a numbered player, empty otherwise. */
const numberSuffix = (player) => (player?.number ? ` #${player.number}` : '');
const captainMark = (player) => (player?.isCaptain ? '⭐ ' : '');

/** Who is resting in a given quarter. */
function restingIn(players, quarter) {
    return players.filter(p => p.quartersSitting?.includes(quarter));
}

/**
 * The lineup as a grid: one row per position, one column per quarter.
 * @returns {string} CSV text
 */
export function lineupCsv(lineup, players) {
    const quarters = [1, 2, 3, 4];
    const positions = [...new Set(lineup.flatMap(q => Object.keys(q.positions)))];

    const lines = [csvRow(['Position', ...quarters.map(q => `Quarter ${q}`)])];

    for (const position of positions) {
        const cells = quarters.map(q => {
            const name = lineup.find(l => l.quarter === q)?.positions[position] || '';
            const player = players.find(p => p.name === name);
            return player?.number ? `${name} (#${player.number})` : name;
        });
        lines.push(csvRow([position, ...cells]));
    }

    lines.push(csvRow([
        'Sitting',
        ...quarters.map(q => restingIn(players, q).map(p => p.name).join('; '))
    ]));

    return lines.join('\n') + '\n';
}

/** The short form put on the clipboard. */
export function lineupClipboardText(lineup, players, formation) {
    let text = `AYSO Lineup - ${formation} Formation\n${'='.repeat(40)}\n\n`;

    for (const quarter of lineup) {
        text += `Quarter ${quarter.quarter}\n${'-'.repeat(20)}\n`;

        for (const [position, name] of Object.entries(quarter.positions)) {
            const player = players.find(p => p.name === name);
            text += `${position}: ${name} ${player?.number ? `#${player.number}` : ''}\n`;
        }

        const resting = restingIn(players, quarter.quarter);
        if (resting.length > 0) {
            text += `Sitting: ${resting.map(p => p.name).join(', ')}\n`;
        }
        text += '\n';
    }

    return text;
}

/** The long form written to a .txt file, with the per-player summary. */
export function lineupText(lineup, positions, players) {
    let text = 'AYSO Roster Pro - Game Lineup\n==============================\n\n';

    for (const quarter of lineup) {
        text += `Quarter ${quarter.quarter}\n---------\n`;

        for (const position of positions) {
            const name = quarter.positions[position] || 'TBD';
            const player = players.find(p => p.name === name);
            text += `${position}: ${captainMark(player)}${name}${numberSuffix(player)}\n`;
        }

        const resting = restingIn(players, quarter.quarter);
        if (resting.length > 0) {
            const list = resting
                .map(p => `${captainMark(p)}${p.name}${numberSuffix(p)}`)
                .join(', ');
            text += `Resting: ${list}\n`;
        }
        text += '\n';
    }

    text += '\nPlayer Summary\n--------------\n';
    for (const player of players) {
        text += `${captainMark(player)}${player.name}${numberSuffix(player)}:\n`;
        text += `  Played: Quarters ${player.quartersPlayed.join(', ') || 'None'}\n`;
        text += `  Resting: Quarters ${player.quartersSitting.join(', ') || 'None'}\n`;
        const played = player.positionsPlayed.map(p => `Q${p.quarter}-${p.position}`).join(', ');
        text += `  Positions: ${played || 'None'}\n`;
        text += `  Captain: ${player.isCaptain ? 'Yes' : 'No'}\n\n`;
    }

    return text;
}

/** The roster in the "Name #Number" form the importer reads back. */
export function rosterText(players) {
    return players.map(p => `${p.name}${numberSuffix(p)}`).join('\n') + '\n';
}

export const exportFilename = (kind, extension) => `${kind}_${today()}.${extension}`;
export const seasonStatsFilename = () => `season-stats-${today()}.csv`;
