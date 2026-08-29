/**
 * Building the CSV and text exports.
 *
 * The CSV quoting is the part worth pinning down: both exporters used to wrap
 * every cell in quotes and stop there, which is right until a value contains a
 * quote of its own. Nothing caught it, because the files still opened — the
 * columns were just wrong from that cell onward.
 */

import { describe, test, expect } from '@jest/globals';
import {
    csvField, csvRow, lineupCsv, lineupClipboardText, lineupText, rosterText,
    downloadTextFile, seasonStatsCsv
} from '../src/modules/export.js';

const player = (name, extra = {}) => ({
    name,
    number: null,
    isCaptain: false,
    quartersPlayed: [1, 2, 3, 4],
    quartersSitting: [],
    positionsPlayed: [],
    ...extra
});

const quarter = (n, positions) => ({ quarter: n, positions });

describe('csvField', () => {
    test('wraps a plain value in quotes', () => {
        expect(csvField('Ana')).toBe('"Ana"');
    });

    test('doubles a quote inside the value', () => {
        // Otherwise a spreadsheet reads this as three fields and every column
        // after it on the row shifts
        expect(csvField('Bob "Bobby" Smith')).toBe('"Bob ""Bobby"" Smith"');
    });

    test('leaves a comma alone, since the field is already quoted', () => {
        expect(csvField('Smith, Ana')).toBe('"Smith, Ana"');
    });

    test('keeps a newline inside the quoted field', () => {
        expect(csvField('two\nlines')).toBe('"two\nlines"');
    });

    test.each([
        ['null', null],
        ['undefined', undefined]
    ])('renders %s as empty rather than the word', (_label, value) => {
        expect(csvField(value)).toBe('""');
    });

    test('renders a number', () => {
        expect(csvField(7)).toBe('"7"');
    });
});

describe('csvField and spreadsheet formulas', () => {
    test.each([
        ['=', '=HYPERLINK("http://evil.test","click")'],
        ['+', '+1+1'],
        ['-', '-cmd|calc'],
        ['@', '@SUM(A1:A9)']
    ])('a value starting with %s is not left as a formula', (_lead, value) => {
        // Excel and Sheets evaluate these on open, and the names come from
        // whoever shares the team
        expect(csvField(value).startsWith('"\'')).toBe(true);
    });

    test('a plain negative number stays a number', () => {
        expect(csvField('-5')).toBe('"-5"');
        expect(csvField(-5)).toBe('"-5"');
    });

    test('a plain negative decimal stays a number', () => {
        expect(csvField('-2.5')).toBe('"-2.5"');
    });

    test('an ordinary name is untouched', () => {
        expect(csvField('Ana')).toBe('"Ana"');
        expect(csvField("O'Brien")).toBe('"O\'Brien"');
    });

    test('a percentage from the season stats is untouched', () => {
        expect(csvField('85%')).toBe('"85%"');
    });

    test('a name that both starts a formula and contains a quote gets both fixes', () => {
        // Neutralised, then the inner quote doubled
        expect(csvField('=Bob "Bobby"')).toBe('"\'=Bob ""Bobby"""');
    });
});

describe('csvRow', () => {
    test('joins fields with commas', () => {
        expect(csvRow(['Ana', 7])).toBe('"Ana","7"');
    });

    test('a quote in one cell does not break the others', () => {
        const row = csvRow(['Bob "Bobby"', 'Keeper']);
        // Four quote characters in the first cell, two around each value
        expect(row).toBe('"Bob ""Bobby""","Keeper"');
    });
});

describe('lineupCsv', () => {
    const lineup = [
        quarter(1, { Keeper: 'Ana', Striker: 'Ben' }),
        quarter(2, { Keeper: 'Ben', Striker: 'Ana' })
    ];
    const players = [player('Ana', { number: 7 }), player('Ben')];

    test('has a header row and one row per position, plus sitting', () => {
        const lines = lineupCsv(lineup, players).trim().split('\n');
        expect(lines[0]).toBe('"Position","Quarter 1","Quarter 2","Quarter 3","Quarter 4"');
        expect(lines).toHaveLength(4);
    });

    test('shows the shirt number beside the name', () => {
        expect(lineupCsv(lineup, players)).toContain('Ana (#7)');
    });

    test('leaves a quarter with no lineup blank rather than undefined', () => {
        expect(lineupCsv(lineup, players)).not.toContain('undefined');
    });

    test('lists who is resting per quarter', () => {
        const resting = [player('Ana'), player('Cleo', { quartersSitting: [2] })];
        expect(lineupCsv(lineup, resting)).toContain('"Sitting","","Cleo"');
    });

    test('a quote in a name does not shift the columns', () => {
        const odd = [quarter(1, { Keeper: 'Bob "Bobby" Smith' })];
        const line = lineupCsv(odd, [player('Bob "Bobby" Smith')])
            .trim().split('\n')[1];

        // Still exactly five fields: the position and four quarters
        expect(line.match(/","/g) || []).toHaveLength(4);
        expect(line).toContain('""Bobby""');
    });
});

describe('lineupClipboardText', () => {
    const lineup = [quarter(1, { Keeper: 'Ana' })];

    test('names the formation', () => {
        expect(lineupClipboardText(lineup, [player('Ana')], '2-3-1'))
            .toContain('2-3-1 Formation');
    });

    test('lists each position and player', () => {
        expect(lineupClipboardText(lineup, [player('Ana')], '2-3-1'))
            .toContain('Keeper: Ana');
    });

    test('mentions resting players only when there are some', () => {
        expect(lineupClipboardText(lineup, [player('Ana')], '2-3-1'))
            .not.toContain('Sitting:');

        const withRest = [player('Ana'), player('Ben', { quartersSitting: [1] })];
        expect(lineupClipboardText(lineup, withRest, '2-3-1')).toContain('Sitting: Ben');
    });
});

describe('lineupText', () => {
    const lineup = [quarter(1, { Keeper: 'Ana', Striker: 'Ben' })];
    const players = [
        player('Ana', { number: 7, isCaptain: true, positionsPlayed: [{ quarter: 1, position: 'Keeper' }] }),
        player('Ben')
    ];

    test('marks the captain', () => {
        expect(lineupText(lineup, ['Keeper', 'Striker'], players)).toContain('⭐ Ana');
    });

    test('shows TBD for a position nobody holds', () => {
        expect(lineupText(lineup, ['Keeper', 'Striker', 'Left Back'], players))
            .toContain('Left Back: TBD');
    });

    test('summarises each player', () => {
        const text = lineupText(lineup, ['Keeper'], players);
        expect(text).toContain('Played: Quarters 1, 2, 3, 4');
        expect(text).toContain('Positions: Q1-Keeper');
    });

    test('says None rather than leaving a blank', () => {
        const bench = [player('Cleo', { quartersPlayed: [], positionsPlayed: [] })];
        const text = lineupText(lineup, ['Keeper'], bench);
        expect(text).toContain('Played: Quarters None');
        expect(text).toContain('Positions: None');
    });
});

describe('rosterText', () => {
    test('writes the form the importer reads back', () => {
        const text = rosterText([player('Ana', { number: 7 }), player('Ben')]);
        expect(text).toBe('Ana #7\nBen\n');
    });

    test('a name with punctuation goes out as typed', () => {
        expect(rosterText([player("O'Brien")])).toBe("O'Brien\n");
    });
});

/**
 * Handing the browser a file to save.
 *
 * Untested until now, which is how all four callers came to pass their
 * arguments the other way round — the export downloaded a file named after its
 * own contents. Nothing threw, and nobody reads a download's filename closely
 * enough to notice until they go looking for the file.
 */
describe('downloadTextFile', () => {
    /** Runs a download against stub DOM, returning what it did. */
    function captureDownload(run) {
        const link = { href: '', download: '', clicked: false, click() { this.clicked = true; } };
        const revoked = [];
        const realDocument = globalThis.document;
        const realURL = globalThis.URL;
        let blob = null;
        let type = null;

        globalThis.document = { createElement: () => link };
        globalThis.URL = {
            createObjectURL: (b) => { blob = b; type = b.type; return 'blob:stub'; },
            revokeObjectURL: (url) => revoked.push(url)
        };

        try {
            run();
        } finally {
            globalThis.document = realDocument;
            globalThis.URL = realURL;
        }

        return { link, blob, type, revoked };
    }

    test('names the file, and puts the text inside it', async () => {
        const { link, blob } = captureDownload(() =>
            downloadTextFile('Tigers-Roster.csv', 'Player,Number\nAna,7\n')
        );

        expect(link.download).toBe('Tigers-Roster.csv');
        expect(await blob.text()).toBe('Player,Number\nAna,7\n');
    });

    test('dispatches the click that actually saves it', () => {
        const { link } = captureDownload(() => downloadTextFile('a.txt', 'body'));

        expect(link.clicked).toBe(true);
        expect(link.href).toBe('blob:stub');
    });

    test('defaults to plain text, and takes a type when given one', () => {
        expect(captureDownload(() => downloadTextFile('a.txt', 'body')).type)
            .toBe('text/plain');
        expect(captureDownload(() => downloadTextFile('a.csv', 'body', 'text/csv')).type)
            .toBe('text/csv');
    });

    /** One object URL per export leaked for the life of the page before this. */
    test('revokes the object URL once the click has gone out', () => {
        const { revoked } = captureDownload(() => downloadTextFile('a.txt', 'body'));

        expect(revoked).toEqual(['blob:stub']);
    });
});

/**
 * The season totals as a CSV.
 *
 * The inline version this replaced read fields calculatePlayerStats has never
 * returned — quartersPlayed, keeperQuarters, sittingQuarters — so every column
 * but "Games Played" was 0 no matter what the season held.
 */
describe('seasonStatsCsv', () => {
    const stats = {
        'Ana Ruiz': {
            gamesPlayed: 3,
            totalQuarters: 9,
            totalSitting: 3,
            positions: { Keeper: 2, 'Left Back': 3, 'Center Mid': 2, Striker: 2 }
        }
    };

    /** Every cell is quoted, as csvField does throughout this module. */
    const cells = (csv, row) =>
        csv.split('\n')[row].split(',').map(cell => cell.replace(/^"|"$/g, ''));

    test('heads the columns it fills', () => {
        expect(cells(seasonStatsCsv(stats), 0)).toEqual([
            'Player', 'Games Played', 'Quarters Played',
            'Keeper', 'Defense', 'Midfield', 'Offense', 'Sitting'
        ]);
    });

    test('reads the fields calculatePlayerStats actually returns', () => {
        const [name, games, quarters, , , , , sitting] = cells(seasonStatsCsv(stats), 1);

        expect(name).toBe('Ana Ruiz');
        expect(games).toBe('3');
        expect(quarters).toBe('9');
        expect(sitting).toBe('3');
    });

    /** Bucketed the way the lineup engine classifies a position. */
    test('splits the positions played into keeper, defence, midfield and attack', () => {
        const [, , , keeper, defense, midfield, offense] = cells(seasonStatsCsv(stats), 1);

        expect(keeper).toBe('2');
        expect(defense).toBe('3');
        expect(midfield).toBe('2');
        expect(offense).toBe('2');
    });

    test('a player who has played nothing reports zeros, not blanks', () => {
        const [name, ...rest] = cells(seasonStatsCsv({ 'Bo Nkemi': {} }), 1);

        expect(name).toBe('Bo Nkemi');
        expect(rest).toEqual(['0', '0', '0', '0', '0', '0', '0']);
    });

    test('counts an unfamiliar position as attacking rather than dropping it', () => {
        const [, , , keeper, defense, midfield, offense] =
            cells(seasonStatsCsv({ Ana: { positions: { Sweeper: 1, Winger: 2 } } }), 1);

        expect([keeper, defense, midfield]).toEqual(['0', '0', '0']);
        expect(offense).toBe('3');
    });

    test('quotes a name that would otherwise break the columns', () => {
        const csv = seasonStatsCsv({ 'Ruiz, Ana': { gamesPlayed: 1, positions: {} } });

        expect(csv.split('\n')[1]).toBe('"Ruiz, Ana","1","0","0","0","0","0","0"');
    });

    test('doubles a quote inside a name, so the row keeps its columns', () => {
        const csv = seasonStatsCsv({ 'Bob "Bobby" Smith': { positions: {} } });

        expect(csv.split('\n')[1]).toContain('"Bob ""Bobby"" Smith"');
    });

    test('an empty season is a header and nothing else', () => {
        expect(seasonStatsCsv({}).split('\n')).toHaveLength(1);
        expect(seasonStatsCsv(null).split('\n')).toHaveLength(1);
    });

    test('one row per player', () => {
        const csv = seasonStatsCsv({
            'Ana Ruiz': { gamesPlayed: 2, positions: {} },
            'Bo Nkemi': { gamesPlayed: 1, positions: {} }
        });

        expect(csv.split('\n')).toHaveLength(3);
    });
});
