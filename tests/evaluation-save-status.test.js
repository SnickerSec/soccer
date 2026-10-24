/**
 * What the Evaluation tab says about whether the coach's work is saved.
 *
 * The rule is that it never says "saved" about something that is not on the
 * server yet: comments once lived on the device only and were wiped at the
 * next sync, under a tab that gave no sign either way.
 */

import { describe, test, expect } from '@jest/globals';
import { evaluationSaveStatus } from '../src/modules/evaluation-save-status.js';

const signedIn = { editing: false, signedIn: true, canWrite: true };

describe('evaluationSaveStatus', () => {
    test('a field being typed in is not saved yet, whatever the engine says', () => {
        expect(evaluationSaveStatus({ ...signedIn, editing: true, syncStatus: 'synced' }))
            .toMatchObject({ tone: 'editing' });
    });

    test('signed out, the work is on this device and nowhere else', () => {
        expect(evaluationSaveStatus({ editing: false, signedIn: false, canWrite: true, syncStatus: 'synced' }))
            .toEqual({ tone: 'local', label: 'Saved on this device' });
    });

    test('a viewer is told their changes are not shared', () => {
        expect(evaluationSaveStatus({ ...signedIn, canWrite: false, syncStatus: 'synced' }).label)
            .toMatch(/View only/);
    });

    test('a write in flight is saving, and a finished one is saved', () => {
        expect(evaluationSaveStatus({ ...signedIn, syncStatus: 'syncing' }).label).toBe('Saving…');
        expect(evaluationSaveStatus({ ...signedIn, syncStatus: 'synced' }).label).toBe('All changes saved');
    });

    test('offline or failed, it says the work is only on this device', () => {
        expect(evaluationSaveStatus({ ...signedIn, syncStatus: 'offline' }))
            .toMatchObject({ tone: 'local', label: expect.stringMatching(/this device.*back online/) });
        expect(evaluationSaveStatus({ ...signedIn, syncStatus: 'error' }))
            .toMatchObject({ tone: 'error', label: expect.stringMatching(/not synced/) });
    });
});
