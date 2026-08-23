/**
 * The roster row's shape, and the status vocabulary it shares with
 * constants.js.
 *
 * The list is handled by delegation — every handler reads dataset.player,
 * dataset.pref or dataset.index off the element that was clicked — so those
 * attributes are the contract between rendering and behaviour, and dropping one
 * makes a control silently stop working rather than throw.
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { STATUSES, statusClassFor, playerAriaLabel } from '../public/modules/roster-render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('status vocabulary', () => {
    /**
     * constants.js is a plain script, not a module, so it cannot be imported.
     * Read as text instead, the way tests/service-worker.test.js reads sw.js.
     */
    function playerStatusValues() {
        const source = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'constants.js'), 'utf8');
        const block = source.match(/PLAYER_STATUS:\s*\{([\s\S]*?)\}/);
        expect(block).not.toBeNull();
        return [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
    }

    test('matches CONSTANTS.PLAYER_STATUS', () => {
        // These end up as <option> values and as CSS class suffixes, so a new
        // status added in one place and not the other renders an unselectable
        // option or an unstyled row
        expect(STATUSES.map(s => s.value).sort()).toEqual(playerStatusValues());
    });

    test('every status has a symbol and a class', () => {
        for (const status of STATUSES) {
            expect(Boolean(status.symbol && status.className)).toBe(true);
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

describe('playerAriaLabel', () => {
    test('names the player', () => {
        expect(playerAriaLabel({ name: 'Ana' })).toBe('Player Ana');
    });

    test('includes the shirt number when there is one', () => {
        expect(playerAriaLabel({ name: 'Ana', number: 7 })).toBe('Player Ana number 7');
    });

    test('omits the number rather than saying null', () => {
        expect(playerAriaLabel({ name: 'Ana', number: null })).not.toMatch(/null/);
    });

    test('reads a name with punctuation as typed', () => {
        expect(playerAriaLabel({ name: "O'Brien" })).toBe("Player O'Brien");
    });
});
