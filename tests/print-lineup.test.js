/**
 * The printed sheet's contents.
 *
 * The engine records only names in a quarter's positions, so the jersey number
 * a coach reads across the field has to be found on the roster. Nothing else
 * carries it onto the page.
 */

import { describe, test, expect } from '@jest/globals';
import { printableQuarters } from '../src/modules/print-lineup.js';

const roster = [
    { name: 'Ana', number: 7 },
    { name: 'Bo', number: 12 },
    { name: 'Cy' }
];

const lineup = (overrides = {}) => ({
    fieldPlayers: 7,
    formation: '2-3-1',
    quarters: [
        {
            quarter: 1,
            positions: {
                Keeper: 'Ana',
                'Left Back': 'Bo',
                'Right Back': 'Cy'
            },
            sitting: ['Bo']
        }
    ],
    ...overrides
});

describe('printableQuarters', () => {
    test('puts the roster number beside the name', () => {
        const [first] = printableQuarters(lineup(), roster);

        expect(first.rows[0]).toMatchObject({ position: 'Keeper', name: 'Ana', number: 7 });
    });

    test('leaves the number null for a player who has none', () => {
        const rows = printableQuarters(lineup(), roster)[0].rows;

        expect(rows.find(r => r.name === 'Cy').number).toBeNull();
    });

    test('lists the positions in formation order, not the order they were filled', () => {
        const positions = printableQuarters(lineup(), roster)[0].rows.map(r => r.position);

        expect(positions[0]).toBe('Keeper');
        expect(positions).toEqual([
            'Keeper', 'Left Back', 'Right Back',
            'Left Wing', 'Right Wing', 'Center Mid', 'Striker'
        ]);
    });

    test('an unfilled position reads TBD rather than printing a blank', () => {
        const rows = printableQuarters(lineup(), roster)[0].rows;

        expect(rows.find(r => r.position === 'Striker')).toMatchObject({ name: 'TBD', number: null });
    });

    test('marks the captains', () => {
        const rows = printableQuarters(lineup(), roster, ['Ana'])[0].rows;

        expect(rows.find(r => r.name === 'Ana').isCaptain).toBe(true);
        expect(rows.find(r => r.name === 'Bo').isCaptain).toBe(false);
    });

    test('numbers the players sitting the quarter too', () => {
        const [first] = printableQuarters(lineup(), roster);

        expect(first.sitting).toEqual([{ name: 'Bo', number: 12, isCaptain: false }]);
    });

    test('works out who is resting when the quarter does not say', () => {
        // A generated quarter records only who took the field
        const generated = lineup({
            quarters: [{ quarter: 1, positions: { Keeper: 'Ana', 'Left Back': 'Cy' } }]
        });

        expect(printableQuarters(generated, roster)[0].sitting)
            .toEqual([{ name: 'Bo', number: 12, isCaptain: false }]);
    });

    test('numbers the quarters a lineup left unnumbered', () => {
        const two = lineup({ quarters: [{ positions: {} }, { positions: {} }] });

        expect(printableQuarters(two, roster).map(q => q.quarter)).toEqual([1, 2]);
    });

    test('keeps a number already carried on the position itself', () => {
        // A game saved by an older build stored the player object in the slot
        const withObject = lineup({
            quarters: [{ quarter: 1, positions: { Keeper: { name: 'Dee', number: 3 } } }]
        });

        expect(printableQuarters(withObject, roster)[0].rows[0]).toMatchObject({ name: 'Dee', number: 3 });
    });

    test('prints nothing at all without a lineup', () => {
        expect(printableQuarters(null, roster)).toEqual([]);
        expect(printableQuarters({ quarters: [] }, roster)).toEqual([]);
    });

    test('survives a roster that was never passed', () => {
        expect(printableQuarters(lineup())[0].rows[0]).toMatchObject({ name: 'Ana', number: null });
    });
});
