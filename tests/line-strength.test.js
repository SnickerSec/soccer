import { describe, test, expect } from '@jest/globals';
import { lineOf, strengthIn, ratedForStrategy, quarterLineStrength } from '../src/modules/line-strength.js';

describe('lineOf', () => {
    test('maps every kind of position to its line', () => {
        expect(lineOf('Keeper')).toBe('keeper');
        expect(lineOf('Left Center Back')).toBe('defense');
        expect(lineOf('Right Wing Back')).toBe('defense');
        expect(lineOf('Left Defensive Mid')).toBe('midfield');
        expect(lineOf('Midfield')).toBe('midfield');
        expect(lineOf('Striker')).toBe('offense');
        expect(lineOf('Right Wing')).toBe('offense');
    });
});

describe('strengthIn', () => {
    test('the line rating, then the overall, then a neutral 3', () => {
        expect(strengthIn({ overallRating: 2, positionalRatings: { defense: 5 } }, 'defense')).toBe(5);
        expect(strengthIn({ overallRating: 2, positionalRatings: { defense: 5 } }, 'offense')).toBe(2);
        expect(strengthIn({}, 'offense')).toBe(3);
        expect(strengthIn(undefined, 'offense')).toBe(3);
    });
});

describe('ratedForStrategy', () => {
    test('an overall or an outfield rating counts', () => {
        expect(ratedForStrategy({ overallRating: 4 })).toBe(true);
        expect(ratedForStrategy({ overallRating: null, positionalRatings: { defense: 2 } })).toBe(true);
        expect(ratedForStrategy({ positionalRatings: { offense: 5 } })).toBe(true);
    });

    test('nothing, or a keeper rating alone, does not', () => {
        expect(ratedForStrategy({ overallRating: null, positionalRatings: {} })).toBe(false);
        expect(ratedForStrategy({ positionalRatings: { keeper: 5 } })).toBe(false);
        expect(ratedForStrategy({})).toBe(false);
        expect(ratedForStrategy(null)).toBe(false);
    });
});

describe('quarterLineStrength', () => {
    const players = [
        { name: 'Ann', overallRating: 5 },
        { name: 'Bo', overallRating: 1 },
        { name: 'Cy', overallRating: 4, positionalRatings: { midfield: 2 } },
        { name: 'Di' },
        { name: 'Ed', overallRating: 1 }
    ];

    test('averages each outfield line and leaves the keeper out', () => {
        const quarter = { positions: {
            Keeper: 'Ed', 'Left Back': 'Ann', 'Right Back': 'Bo', 'Center Mid': 'Cy', Striker: 'Di'
        } };
        expect(quarterLineStrength(quarter, players)).toEqual({ defense: 3, midfield: 2, offense: 3 });
    });

    test('a line the formation does not have is null', () => {
        const quarter = { positions: { 'Left Back': 'Ann', Striker: 'Bo' } };
        expect(quarterLineStrength(quarter, players)).toEqual({ defense: 5, midfield: null, offense: 1 });
    });

    test('nothing to say when nobody on the field is rated', () => {
        const quarter = { positions: { 'Left Back': 'Di', Striker: 'Zed' } };
        expect(quarterLineStrength(quarter, players)).toBeNull();
    });

    test('a rated keeper alone is not enough', () => {
        const quarter = { positions: { Keeper: 'Ann', Striker: 'Di' } };
        expect(quarterLineStrength(quarter, players)).toBeNull();
    });

    test('positions stored as player objects are read by name', () => {
        const quarter = { positions: { 'Left Back': { name: 'Ann' } } };
        expect(quarterLineStrength(quarter, players)).toEqual({ defense: 5, midfield: null, offense: null });
    });
});
