/**
 * How the header shows sync state.
 *
 * The part worth being sure about is the decision — which state an unknown
 * status falls back to — so it lives here, apart from the JSX that draws it,
 * where a unit test can reach it.
 */

/**
 * How each sync state is shown.
 *
 * Keyed by the string values of SYNC_STATUS rather than importing it, so the
 * header does not pull in the whole sync engine to render a label.
 */
const SYNC_PRESENTATION = {
    syncing: { state: 'syncing', icon: 'icon-sync-syncing', label: 'Syncing...' },
    synced: { state: 'synced', icon: 'icon-sync-synced', label: 'Synced' },
    error: { state: 'error', icon: 'icon-sync-error', label: 'Sync Error' },
    offline: { state: 'offline', icon: 'icon-sync-offline', label: 'Offline' }
};

/**
 * What to draw for a sync status.
 *
 * Anything unrecognised — including 'idle', which the engine reports before it
 * has done anything — reads as offline. Falling back to a real state rather
 * than nothing matters: the alternative renders an empty pill that looks like a
 * layout bug rather than a status.
 */
export function syncStatusPresentation(status) {
    return SYNC_PRESENTATION[status] || SYNC_PRESENTATION.offline;
}
