/**
 * How the team plays, normalized.
 *
 * These settings arrive from the cloud now, which means from another coach's
 * device and from builds that are not this one. Everything that reads them
 * goes through normalizeSettings, so what reaches the lineup engine and the
 * dropdowns is always something this device can actually field.
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';

let store = {};

jest.unstable_mockModule('../src/modules/storage.js', () => ({
    safeGetFromStorage: (key) => (key in store ? store[key] : null),
    safeSetToStorage: (key, value) => { store[key] = value; },
    safeParseJSON: (raw, fallback) => {
        try {
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    },
    clearTeamScopedData: () => {}
}));

const { normalizeSettings, sameSettings, DEFAULT_SETTINGS } =
    await import('../src/modules/team-settings.js');

/** A custom formation as this device would have stored it. */
function deviceHasCustomFormation(name, fieldSize) {
    store['ayso_custom_formations'] = JSON.stringify([
        { name, fieldSize, positions: Array.from({ length: fieldSize }, (_, i) => `P${i}`) }
    ]);
}

beforeEach(() => {
    store = {};
});

describe('normalizeSettings', () => {
    test('a complete, valid set is left as it is', () => {
        expect(normalizeSettings({
            ageDivision: '12U', fieldPlayers: 9, formation: '3-2-3', quarters: 4
        })).toEqual({ ageDivision: '12U', fieldPlayers: 9, formation: '3-2-3', quarters: 4 });
    });

    test('nothing at all gives the defaults', () => {
        expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
        expect(normalizeSettings('9v9')).toEqual(DEFAULT_SETTINGS);
    });

    test('only the four settings come back, whatever else was stored', () => {
        const result = normalizeSettings({ ageDivision: '10U', teamName: 'Sharks' });

        expect(Object.keys(result).sort()).toEqual(
            ['ageDivision', 'fieldPlayers', 'formation', 'quarters']
        );
    });

    test('an unknown division falls back without taking the rest with it', () => {
        expect(normalizeSettings({ ageDivision: '21U', fieldPlayers: 9, formation: '3-3-2' }))
            .toMatchObject({ ageDivision: '10U', fieldPlayers: 9, formation: '3-3-2' });
    });

    test('a field size nothing can be fielded with falls back to the division\'s', () => {
        expect(normalizeSettings({ ageDivision: '12U', fieldPlayers: 40 }))
            .toMatchObject({ fieldPlayers: 9 });
    });

    test('10U may play 6 as well as 7, so the division does not overrule the field size', () => {
        expect(normalizeSettings({ ageDivision: '10U', fieldPlayers: 6, formation: '3-3' }))
            .toMatchObject({ fieldPlayers: 6, formation: '3-3' });
    });

    test('a formation for the wrong field size falls back to that size\'s default', () => {
        // 4-4-2 is an 11v11 formation; nine players cannot line up in it.
        expect(normalizeSettings({ ageDivision: '12U', fieldPlayers: 9, formation: '4-4-2' }))
            .toMatchObject({ formation: '3-3-2' });
    });

    test('a custom formation this device knows is kept', () => {
        deviceHasCustomFormation('Maya\'s Diamond', 7);

        expect(normalizeSettings({ fieldPlayers: 7, formation: 'Maya\'s Diamond' }))
            .toMatchObject({ formation: 'Maya\'s Diamond' });
    });

    test('a custom formation only the other coach has degrades to a playable one', () => {
        // Custom formations live in the device that made them, so the name can
        // arrive here naming nothing. A dropdown showing a blank is worse than
        // the default for the field size.
        expect(normalizeSettings({ fieldPlayers: 7, formation: 'Their Diamond' }))
            .toMatchObject({ fieldPlayers: 7, formation: '2-3-1' });
    });

    test('a field size only a custom formation uses is still a real field size', () => {
        deviceHasCustomFormation('Eight A Side', 8);

        expect(normalizeSettings({ fieldPlayers: 8, formation: 'Eight A Side' }))
            .toMatchObject({ fieldPlayers: 8, formation: 'Eight A Side' });
    });

    test('numbers that arrived as strings are read as numbers', () => {
        expect(normalizeSettings({ fieldPlayers: '9', quarters: '2' }))
            .toMatchObject({ fieldPlayers: 9, quarters: 2 });
    });

    test('quarters outside a game fall back to four', () => {
        expect(normalizeSettings({ quarters: 0 })).toMatchObject({ quarters: 4 });
        expect(normalizeSettings({ quarters: 99 })).toMatchObject({ quarters: 4 });
        expect(normalizeSettings({ quarters: 2.5 })).toMatchObject({ quarters: 4 });
    });
});

describe('sameSettings', () => {
    test('two ways of saying the same thing are the same settings', () => {
        expect(sameSettings(
            { ageDivision: '12U', fieldPlayers: 9, formation: '3-3-2', quarters: 4 },
            { ageDivision: '12U', fieldPlayers: '9', formation: '3-3-2', quarters: 4, extra: 1 }
        )).toBe(true);
    });

    test('a moved formation is a change worth pushing', () => {
        expect(sameSettings(
            { ageDivision: '12U', fieldPlayers: 9, formation: '3-3-2' },
            { ageDivision: '12U', fieldPlayers: 9, formation: '3-2-3' }
        )).toBe(false);
    });

    test('what a fresh device holds matches the defaults, so nothing is migrated for it', () => {
        expect(sameSettings({}, DEFAULT_SETTINGS)).toBe(true);
    });
});
