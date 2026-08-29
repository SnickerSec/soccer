/**
 * The text in the player summary table.
 *
 * This is the table a coach reads to check the rotation was fair, so every
 * cell has an empty case that has to say something. A blank cell reads as
 * missing data rather than as a zero.
 */

import { describe, test, expect } from '@jest/globals';
import {
    SUMMARY_HEADERS, summaryCells, playerLabel, captainLabel,
    balanceLabel, positionsLabel
} from '../src/modules/player-summary.js';

const player = (overrides = {}) => ({
    name: 'Ana',
    number: null,
    isCaptain: false,
    quartersPlayed: [1, 2],
    quartersSitting: [3],
    defensiveQuarters: 1,
    offensiveQuarters: 1,
    positionsPlayed: [{ quarter: 1, position: 'Keeper' }],
    ...overrides
});

describe('playerLabel', () => {
    test('is the name alone when there is no number', () => {
        expect(playerLabel(player())).toBe('Ana');
    });

    test('appends the shirt number', () => {
        expect(playerLabel(player({ number: 7 }))).toBe('Ana #7');
    });

    test('never renders a null number', () => {
        expect(playerLabel(player({ number: null }))).not.toMatch(/null/);
    });

    test('leaves punctuation in a name alone', () => {
        expect(playerLabel(player({ name: "O'Brien" }))).toBe("O'Brien");
    });
});

describe('captainLabel', () => {
    test('marks a captain', () => {
        expect(captainLabel(player({ isCaptain: true }))).toBe('⭐ Yes');
    });

    test('says No rather than leaving it blank', () => {
        expect(captainLabel(player())).toBe('No');
    });
});

describe('balanceLabel', () => {
    test('shows both halves of the pitch', () => {
        expect(balanceLabel(player({ defensiveQuarters: 2, offensiveQuarters: 1 })))
            .toBe('D: 2 / O: 1');
    });

    test('counts an unset side as zero, not undefined', () => {
        expect(balanceLabel({ name: 'Ana' })).toBe('D: 0 / O: 0');
    });
});

describe('positionsLabel', () => {
    test('lists each quarter and position', () => {
        expect(positionsLabel(player({
            positionsPlayed: [
                { quarter: 1, position: 'Keeper' },
                { quarter: 2, position: 'Striker' }
            ]
        }))).toBe('Q1: Keeper, Q2: Striker');
    });

    test('says None for a player who never took the field', () => {
        expect(positionsLabel(player({ positionsPlayed: [] }))).toBe('None');
    });

    test('survives the field being absent', () => {
        expect(positionsLabel({ name: 'Ana' })).toBe('None');
    });
});

describe('summaryCells', () => {
    test('fills one cell per read-only column', () => {
        // Two of the eight columns are the checkboxes, which are not text
        expect(summaryCells(player())).toHaveLength(SUMMARY_HEADERS.length - 2);
    });

    test('reads in column order', () => {
        expect(summaryCells(player({ number: 7, isCaptain: true }))).toEqual([
            'Ana #7', '⭐ Yes', '1, 2', '3', 'D: 1 / O: 1', 'Q1: Keeper'
        ]);
    });

    test('says None rather than leaving quarters blank', () => {
        const benched = player({ quartersPlayed: [], quartersSitting: [1, 2, 3, 4] });
        expect(summaryCells(benched)[2]).toBe('None');
    });

    test('never leaves a cell empty', () => {
        const sparse = { name: 'Ana' };
        for (const cell of summaryCells(sparse)) {
            expect(cell).not.toBe('');
        }
    });

    test('survives a player recorded before a lineup was generated', () => {
        // quartersPlayed and the rest are written by updatePlayerTracking, so a
        // player added between generations has none of them yet
        expect(() => summaryCells({ name: 'Ana' })).not.toThrow();
    });
});
