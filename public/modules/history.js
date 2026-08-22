/**
 * Undo/redo for the roster and lineup.
 *
 * A pair of stacks holding snapshots, and nothing else: no DOM, no knowledge of
 * what a snapshot contains. The caller decides what to capture and what to do
 * with what comes back, which is what makes the ordering rules — the part that
 * is actually easy to get wrong — testable on their own.
 */

/** Snapshots are stored detached, so a later edit cannot reach back into one. */
function clone(state) {
    return JSON.parse(JSON.stringify(state));
}

export class UndoHistory {
    /**
     * @param {object} [options]
     * @param {number} [options.limit] snapshots to keep before dropping the oldest
     */
    constructor({ limit = 20 } = {}) {
        this.limit = limit;
        this.undoStack = [];
        this.redoStack = [];
    }

    get canUndo() {
        return this.undoStack.length > 0;
    }

    get canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Records the state as it was before a change.
     *
     * Clears the redo stack: once a new edit lands, the states that used to
     * come after are no longer reachable from here, and offering to "redo"
     * into them would jump to a version of the roster nobody edited from.
     */
    record(state) {
        this.undoStack.push(clone(state));
        if (this.undoStack.length > this.limit) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    /**
     * Steps back one snapshot, given the state to return to on redo.
     * @returns the state to restore, or null if there is nothing to undo
     */
    undo(currentState) {
        if (!this.canUndo) return null;
        this.redoStack.push(clone(currentState));
        return this.undoStack.pop();
    }

    /**
     * Steps forward one snapshot, given the state to return to on undo.
     * @returns the state to restore, or null if there is nothing to redo
     */
    redo(currentState) {
        if (!this.canRedo) return null;
        this.undoStack.push(clone(currentState));
        return this.redoStack.pop();
    }

    /** Forgets everything, for a sign-out or a team switch. */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
}
