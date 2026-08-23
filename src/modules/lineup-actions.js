/**
 * The action bar shown above the player summary once a lineup exists.
 *
 * The buttons are cloned from the static markup in index.html rather than built
 * here, so their labels, icons and styling stay defined in one place. The
 * originals stay hidden; these clones are what coaches actually click, and
 * cloneNode does not copy listeners, so each clone is wired up below.
 */

import { iconMarkup } from './icons.js';

/**
 * Clones a button from the page and gives it a fresh click handler.
 *
 * Returns null when the source button is missing, so a markup change degrades
 * to a missing button rather than a thrown error that breaks the whole lineup.
 *
 * The id is stripped from the clone. cloneNode copies it, which left two
 * elements answering to #shareLineup and #saveGame — and getElementById returns
 * whichever comes first in the document, which is the clone, since the action
 * bar is inserted above the static markup it was cloned from. The startup
 * wiring in app.js runs before any lineup exists so it always found the
 * original, but that is timing rather than design.
 *
 * data-action replaces it: a stable hook for tests and styling that does not
 * have to be unique.
 */
function cloneAction(sourceId, onClick) {
    const source = document.getElementById(sourceId);
    if (!source) {
        console.warn(`lineup-actions: #${sourceId} not found in the page`);
        return null;
    }

    const clone = source.cloneNode(true);
    clone.removeAttribute('id');
    clone.dataset.action = sourceId;
    // Icons and spans inside carry ids of their own in some of these buttons
    clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));

    clone.addEventListener('click', onClick);
    return clone;
}

/** A trigger button that reveals `items` in a menu. */
function buildDropdown(label, iconId, items) {
    const dropdown = document.createElement('div');
    dropdown.className = 'action-dropdown';

    const trigger = document.createElement('button');
    trigger.className = 'dropdown-trigger';

    const icon = document.createElement('span');
    icon.innerHTML = iconMarkup(iconId);

    const arrow = document.createElement('span');
    arrow.className = 'dropdown-arrow';
    arrow.innerHTML = iconMarkup('icon-chevron-down');

    trigger.append(icon, ` ${label} `, arrow);
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
        // Only one menu open at a time
        document.querySelectorAll('.action-dropdown.open').forEach(other => {
            if (other !== dropdown) other.classList.remove('open');
        });
    });

    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    items.forEach(item => menu.appendChild(item));

    dropdown.append(trigger, menu);
    return dropdown;
}

/** The standalone Regenerate button, which has no counterpart in index.html. */
function buildRegenerateButton(onRegenerate) {
    const button = document.createElement('button');
    // data-action rather than an id, to match the cloned buttons beside it:
    // the bar is rebuilt on every render and an id here would be one more
    // thing that has to stay unique across that.
    button.dataset.action = 'regenerateLineup';
    button.className = 'btn-export';
    button.style.background = '#3498db';
    button.setAttribute('aria-label', 'Regenerate a new lineup with different positions');
    button.textContent = 'Regenerate';
    button.addEventListener('click', onRegenerate);
    return button;
}

/**
 * Builds the action bar.
 *
 * @param handlers  one callback per action: onRegenerate, onCopy, onShare,
 *                  onExportCsv, onExportText, onPrint, onSaveGame
 */
export function buildActionBar(handlers) {
    const container = document.createElement('div');
    container.className = 'action-buttons-inline';

    const copy = cloneAction('copyLineup', handlers.onCopy);
    const share = cloneAction('shareLineup', handlers.onShare);
    const csv = cloneAction('exportCSV', handlers.onExportCsv);
    const text = cloneAction('exportLineup', handlers.onExportText);
    const print = cloneAction('printLineup', handlers.onPrint);
    const saveGame = cloneAction('saveGame', handlers.onSaveGame);

    container.appendChild(buildRegenerateButton(handlers.onRegenerate));
    container.appendChild(buildDropdown('Share', 'icon-share-menu', [copy, share].filter(Boolean)));
    container.appendChild(buildDropdown('Export', 'icon-export-menu', [csv, text, print].filter(Boolean)));
    if (saveGame) container.appendChild(saveGame);

    return container;
}
