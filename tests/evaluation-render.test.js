/**
 * Which evaluation rating shows as selected.
 *
 * The unrated case is the one worth pinning: parseInt('') is NaN and NaN
 * matches nothing, so the old comparison left every option unselected for a
 * player with no rating and relied on the browser falling back to the first.
 * That worked only because '-' happens to be first.
 */

import { describe, test, expect } from '@jest/globals';
import { EVALUATION_RATINGS, isSelectedRating } from '../public/modules/evaluation-render.js';

describe('EVALUATION_RATINGS', () => {
    test('opens with the unrated option', () => {
        expect(EVALUATION_RATINGS[0]).toEqual({ value: '', label: '-' });
    });

    test('runs 1 to 5, the AYSO scale', () => {
        expect(EVALUATION_RATINGS.slice(1).map(r => r.value))
            .toEqual(['1', '2', '3', '4', '5']);
    });

    test('every option is worded, not just numbered', () => {
        for (const rating of EVALUATION_RATINGS.slice(1)) {
            expect(rating.label).toMatch(/^\d - \w/);
        }
    });
});

describe('isSelectedRating', () => {
    test('picks the option matching the rating', () => {
        expect(isSelectedRating({ rating: 3 }, '3')).toBe(true);
    });

    test('leaves the others unpicked', () => {
        expect(isSelectedRating({ rating: 3 }, '4')).toBe(false);
    });

    test('picks the blank option when there is no rating', () => {
        // Rather than selecting nothing and hoping '-' is rendered first
        expect(isSelectedRating({}, '')).toBe(true);
    });

    test.each([
        ['undefined', undefined],
        ['null', null]
    ])('treats a %s rating as unrated', (_label, rating) => {
        expect(isSelectedRating({ rating }, '')).toBe(true);
    });

    test('a rated player does not also select the blank option', () => {
        expect(isSelectedRating({ rating: 2 }, '')).toBe(false);
    });

    test('exactly one option is selected, whatever the rating', () => {
        for (const rating of [undefined, null, 1, 2, 3, 4, 5]) {
            const selected = EVALUATION_RATINGS
                .filter(option => isSelectedRating({ rating }, option.value));
            expect(`${rating}: ${selected.length}`).toBe(`${rating}: 1`);
        }
    });
});
