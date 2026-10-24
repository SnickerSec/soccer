/**
 * What the Evaluation tab says about whether the coach's work is saved.
 *
 * Kept apart from the JSX so the decision can be tested: the one thing this
 * must never do is say "saved" about something that is not — comments were
 * once kept on the device only and wiped at the next sync, under a tab that
 * gave no sign either way.
 *
 * `syncStatus` is the engine's, so it covers every write in flight rather
 * than only this tab's; for "is my work on the server yet" that is the right
 * question anyway.
 */
export function evaluationSaveStatus({ editing, signedIn, canWrite, syncStatus }) {
    if (editing) {
        return { tone: 'editing', label: 'Editing — saves when you leave the field' };
    }
    if (!signedIn) {
        return { tone: 'local', label: 'Saved on this device' };
    }
    if (!canWrite) {
        return { tone: 'local', label: 'View only — changes stay on this device' };
    }
    switch (syncStatus) {
        case 'syncing':
            return { tone: 'pending', label: 'Saving…' };
        case 'offline':
            return { tone: 'local', label: 'Saved on this device — will sync when back online' };
        case 'error':
            return { tone: 'error', label: 'Saved on this device — not synced yet' };
        default:
            return { tone: 'saved', label: 'All changes saved' };
    }
}
