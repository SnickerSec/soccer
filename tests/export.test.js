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
    csvField, csvRow, lineupCsv, lineupClipboardText, lineupText, rosterText
} from '../public/modules/export.js';

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
