/**
 * The status vocabulary the roster rows are drawn from, and the class each
 * status maps to.
 *
 * RosterTab renders its <option>s and colours its rows from these, so a status
 * that disagrees with CONSTANTS.PLAYER_STATUS is an option the app cannot store
 * or a row that renders unstyled.
 */

import { describe, test, expect } from '@jest/globals';
import { STATUSES, statusClassFor } from '../src/modules/roster-render.js';
import { CONSTANTS } from '../src/constants.js';

describe('status vocabulary', () => {
    function playerStatusValues() {
        return Object.values(CONSTANTS.PLAYER_STATUS).sort();
    }

    test('matches CONSTANTS.PLAYER_STATUS', () => {
        // These end up as <option> values and as CSS class suffixes, so a new
        // status added in one place and not the other renders an unselectable
        // option or an unstyled row
        expect(STATUSES.map(s => s.value).sort()).toEqual(playerStatusValues());
    });

    test('every status has a label and a class', () => {
        for (const status of STATUSES) {
            expect(Boolean(status.label && status.className)).toBe(true);
        }
    });
});

describe('statusClassFor', () => {
    test.each([
        ['available', 'status-available'],
        ['injured', 'status-injured'],
        ['absent', 'status-absent']
    ])('%s maps to %s', (status, className) => {
        expect(statusClassFor(status)).toBe(className);
    });

    test.each([
        ['an unknown status', 'benched'],
        ['undefined', undefined],
        ['empty', '']
    ])('%s falls back to available rather than no class at all', (_label, status) => {
        expect(statusClassFor(status)).toBe('status-available');
    });
});
