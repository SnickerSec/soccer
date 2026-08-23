/**
 * The account menu in the header: who is signed in, which team is active, and
 * how sync is going.
 *
 * Everything here takes what it needs as an argument and reports what happened
 * through a callback, so none of it reaches into app state. The parts that
 * decide something — which sync state an unknown status falls back to, whether
 * a team reads as current — are separated from the parts that draw, because
 * those are the ones worth being sure about.
 */

import { iconMarkup } from './icons.js';

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

const SYNC_STATES = Object.keys(SYNC_PRESENTATION);

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

/** Writes a sync status into the pill in the account panel. */
export function renderSyncStatus(element, status) {
    if (!element) return;

    const { state, icon, label } = syncStatusPresentation(status);

    // Every state class comes off first: leaving the previous one behind gave
    // an element claiming to be both syncing and offline.
    element.classList.remove(...SYNC_STATES);
    element.classList.add(state);

    const iconEl = element.querySelector('.sync-icon');
    const textEl = element.querySelector('.sync-text');
    if (iconEl) iconEl.innerHTML = iconMarkup(icon);
    if (textEl) textEl.textContent = label;
}

/**
 * Shows the signed-in identity, or the sign-in button.
 *
 * @param {object|null} user the signed-in user, or null
 * @param {object} [options]
 * @param {Function} [options.onSignedOut] run after the signed-out state is drawn
 */
export function renderAuthState(user, { onSignedOut } = {}) {
    const signInBtn = document.getElementById('signInBtn');
    const userMenu = document.getElementById('userMenu');
    const syncStatus = document.getElementById('syncStatus');

    signInBtn?.classList.toggle('hidden', Boolean(user));
    userMenu?.classList.toggle('hidden', !user);
    syncStatus?.classList.toggle('hidden', !user);

    if (!user) {
        onSignedOut?.();
        return;
    }

    const avatar = document.getElementById('userAvatar');
    if (avatar && user.avatarUrl) {
        avatar.src = user.avatarUrl;
        avatar.alt = user.displayName;
    }

    const name = document.getElementById('accountName');
    const email = document.getElementById('accountEmail');
    if (name) name.textContent = user.displayName || '';
    if (email) email.textContent = user.email || '';
}

/**
 * Renders the team list inside the account menu.
 *
 * Each team is a menuitemradio: the current one is checked, so the menu both
 * shows which team is active and switches between them.
 *
 * @param {HTMLElement} list
 * @param {object} options
 * @param {Array} options.teams
 * @param {string} options.currentTeamId
 * @param {Function} options.onSelect called with the id of a team that is not current
 */
export function renderTeamList(list, { teams, currentTeamId, onSelect }) {
    if (!list) return;

    list.textContent = '';

    if (teams.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'account-empty';
        empty.textContent = 'No teams yet';
        list.appendChild(empty);
        return;
    }

    for (const team of teams) {
        list.appendChild(buildTeamItem(team, team.id === currentTeamId, onSelect));
    }
}

function buildTeamItem(team, isCurrent, onSelect) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `account-item account-team${isCurrent ? ' is-current' : ''}`;
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(isCurrent));
    item.dataset.teamId = team.id;

    const check = document.createElement('span');
    check.className = 'account-team-check';
    check.setAttribute('aria-hidden', 'true');
    check.innerHTML = isCurrent ? iconMarkup('icon-sync-synced') : '';

    const name = document.createElement('span');
    name.className = 'account-team-name';
    name.textContent = team.name;

    const role = document.createElement('span');
    role.className = 'account-team-role';
    role.textContent = team.role;

    item.append(check, name, role);
    item.addEventListener('click', () => {
        setAccountMenuOpen(false);
        if (!isCurrent) onSelect(team.id);
    });

    return item;
}

/**
 * Opens or closes the account menu.
 * @param {boolean} [force] open state to set; toggles when omitted
 */
export function setAccountMenuOpen(force) {
    const trigger = document.getElementById('accountTrigger');
    const panel = document.getElementById('accountPanel');
    if (!trigger || !panel) return;

    const open = force ?? panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden', !open);
    trigger.setAttribute('aria-expanded', String(open));

    if (open) {
        // Focus the first item so the menu is usable from the keyboard
        panel.querySelector('.account-item')?.focus();
    }
}
