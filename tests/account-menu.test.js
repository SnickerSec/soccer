/**
 * The decision the sync pill makes.
 *
 * There is one branch here that matters and it is the default: the sync engine
 * reports 'idle' before it has done anything, and a status the header does not
 * recognise used to fall through to a pill with no state class and no label —
 * an empty box that reads as a layout bug rather than as a status.
 *
 * tests/e2e/sync-status.spec.js covers the rendering; this covers the mapping,
 * which is where a new status would go wrong.
 */

import { describe, test, expect } from '@jest/globals';
import { syncStatusPresentation } from '../public/modules/account-menu.js';

describe('syncStatusPresentation', () => {
    test.each([
        ['syncing', 'Syncing...'],
        ['synced', 'Synced'],
        ['error', 'Sync Error'],
        ['offline', 'Offline']
    ])('%s is labelled "%s"', (status, label) => {
        expect(syncStatusPresentation(status).label).toBe(label);
    });

    test.each(['syncing', 'synced', 'error', 'offline'])(
        '%s carries a state class matching its name', (status) => {
            expect(syncStatusPresentation(status).state).toBe(status);
        });

    test.each(['syncing', 'synced', 'error', 'offline'])(
        '%s names an icon', (status) => {
            expect(syncStatusPresentation(status).icon).toMatch(/^icon-sync-/);
        });

    test('idle reads as offline, since nothing has synced yet', () => {
        expect(syncStatusPresentation('idle')).toEqual(syncStatusPresentation('offline'));
    });

    test.each([
        ['an unknown status', 'reticulating'],
        ['undefined', undefined],
        ['null', null],
        ['empty', '']
    ])('%s falls back to offline rather than blank', (_label, status) => {
        const presentation = syncStatusPresentation(status);
        expect(presentation.state).toBe('offline');
        expect(presentation.label).toBeTruthy();
    });

    test('never returns a presentation without a label or icon', () => {
        for (const status of ['syncing', 'synced', 'error', 'offline', 'idle', 'nonsense']) {
            const { state, icon, label } = syncStatusPresentation(status);
            expect(Boolean(state && icon && label)).toBe(true);
        }
    });
});
