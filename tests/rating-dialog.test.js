/**
 * Turning star counts into the fields stored on a player.
 *
 * These ratings feed the lineup generator's strength balancing, so the
 * difference between "unrated" and "rated zero" is not cosmetic: the generator
 * reads a missing overall as no opinion and splits evenly, where a 0 would read
 * as the weakest player on the roster and bench them accordingly.
 */

import { describe, test, expect } from '@jest/globals';
import {
    ratingsOf, ratingsToPlayerFields, RATING_CATEGORIES, MAX_STARS
} from '../public/modules/rating-dialog.js';

describe('ratingsOf', () => {
    test('reads what a player has set', () => {
        expect(ratingsOf({
            overallRating: 4,
            positionalRatings: { keeper: 5, defense: 2 }
        })).toEqual({ overall: 4, keeper: 5, defense: 2, midfield: 0, offense: 0 });
    });

    test('an unrated player is all zeros rather than undefined', () => {
        expect(ratingsOf({})).toEqual({
            overall: 0, keeper: 0, defense: 0, midfield: 0, offense: 0
        });
    });

    test('survives positionalRatings being absent', () => {
        expect(ratingsOf({ overallRating: 3 }).keeper).toBe(0);
    });
});

describe('ratingsToPlayerFields', () => {
    const values = (overrides = {}) => ({
        overall: 0, keeper: 0, defense: 0, midfield: 0, offense: 0, ...overrides
    });

    test('an unset overall is null, not 0', () => {
        // 0 would make the generator treat them as the worst player available
        expect(ratingsToPlayerFields(values()).overallRating).toBeNull();
    });

    test('a set overall is kept', () => {
        expect(ratingsToPlayerFields(values({ overall: 4 })).overallRating).toBe(4);
    });

    test('an unrated position is absent rather than 0', () => {
        const { positionalRatings } = ratingsToPlayerFields(values({ keeper: 3 }));
        expect(positionalRatings).toEqual({ keeper: 3 });
        expect('defense' in positionalRatings).toBe(false);
    });

    test('every rated position is kept', () => {
        const { positionalRatings } = ratingsToPlayerFields(
            values({ keeper: 1, defense: 2, midfield: 3, offense: 4 }));
        expect(positionalRatings).toEqual({ keeper: 1, defense: 2, midfield: 3, offense: 4 });
    });

    test('clearing everything leaves no ratings behind', () => {
        expect(ratingsToPlayerFields(values())).toEqual({
            overallRating: null, positionalRatings: {}
        });
    });

    test('overall never leaks into positionalRatings', () => {
        const { positionalRatings } = ratingsToPlayerFields(values({ overall: 5 }));
        expect('overall' in positionalRatings).toBe(false);
    });

    test('round-trips through ratingsOf', () => {
        const player = ratingsToPlayerFields(values({ overall: 4, midfield: 2 }));
        expect(ratingsOf(player)).toEqual(values({ overall: 4, midfield: 2 }));
    });
});

describe('the dialog rows', () => {
    test('lead with overall, then the positions the generator reads', () => {
        expect(RATING_CATEGORIES.map(c => c.key))
            .toEqual(['overall', 'keeper', 'defense', 'midfield', 'offense']);
    });

    test('every row has a label', () => {
        for (const category of RATING_CATEGORIES) {
            expect(Boolean(category.label)).toBe(true);
        }
    });

    test('are rated out of five, matching the schema constraint', () => {
        // db/schema.sql: CHECK (overall_rating >= 1 AND overall_rating <= 5)
        expect(MAX_STARS).toBe(5);
    });
});
