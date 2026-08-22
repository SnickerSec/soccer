/**
 * The undo/redo stacks.
 *
 * These rules were previously inlined in app.js, where nothing could reach
 * them: the snapshot literal appeared three times, and whether redo survived a
 * new edit was decided by one easily-missed assignment.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { UndoHistory } from '../public/modules/history.js';

/** A stand-in for the roster/lineup triple the app actually stores. */
const state = (label) => ({ players: [{ name: label }], captains: [], lineup: [] });
const labelOf = (snapshot) => snapshot.players[0].name;

describe('UndoHistory', () => {
    let history;

    beforeEach(() => {
        history = new UndoHistory({ limit: 3 });
    });

    test('has nothing to undo or redo when new', () => {
        expect(history.canUndo).toBe(false);
        expect(history.canRedo).toBe(false);
    });

    test('undo returns null rather than throwing on an empty stack', () => {
        expect(history.undo(state('now'))).toBeNull();
    });

    test('redo returns null rather than throwing on an empty stack', () => {
        expect(history.redo(state('now'))).toBeNull();
    });

    test('steps back to the recorded state', () => {
        history.record(state('first'));

        expect(labelOf(history.undo(state('second')))).toBe('first');
    });

    test('steps forward again to where undo was called from', () => {
        history.record(state('first'));
        history.undo(state('second'));

        expect(labelOf(history.redo(state('first')))).toBe('second');
    });

    test('walks back through several steps in order', () => {
        ['a', 'b', 'c'].forEach(label => history.record(state(label)));

        expect(labelOf(history.undo(state('d')))).toBe('c');
        expect(labelOf(history.undo(state('c')))).toBe('b');
        expect(labelOf(history.undo(state('b')))).toBe('a');
        expect(history.canUndo).toBe(false);
    });

    test('a new edit makes redo unreachable', () => {
        history.record(state('first'));
        history.undo(state('second'));
        expect(history.canRedo).toBe(true);

        history.record(state('third'));

        // Redoing here would jump to a roster nobody edited from
        expect(history.canRedo).toBe(false);
    });

    test('drops the oldest snapshot past the limit', () => {
        ['a', 'b', 'c', 'd'].forEach(label => history.record(state(label)));

        expect(labelOf(history.undo(state('e')))).toBe('d');
        expect(labelOf(history.undo(state('d')))).toBe('c');
        expect(labelOf(history.undo(state('c')))).toBe('b');
        // 'a' fell off the bottom
        expect(history.canUndo).toBe(false);
    });

    test('snapshots are detached, so later edits do not rewrite history', () => {
        const live = state('first');
        history.record(live);

        live.players[0].name = 'edited in place';

        expect(labelOf(history.undo(state('second')))).toBe('first');
    });

    test('the state handed to undo is detached too', () => {
        history.record(state('first'));
        const live = state('second');
        history.undo(live);

        live.players[0].name = 'edited in place';

        expect(labelOf(history.redo(state('first')))).toBe('second');
    });

    test('clear forgets both directions', () => {
        history.record(state('first'));
        history.undo(state('second'));

        history.clear();

        expect(history.canUndo).toBe(false);
        expect(history.canRedo).toBe(false);
    });

    test('defaults to a limit rather than growing without bound', () => {
        const unbounded = new UndoHistory();
        for (let i = 0; i < 100; i++) unbounded.record(state(`s${i}`));

        expect(unbounded.undoStack.length).toBeLessThanOrEqual(20);
    });
});
