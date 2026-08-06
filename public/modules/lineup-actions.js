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
 */
function cloneAction(sourceId, onClick) {
    const source = document.getElementById(sourceId);
    if (!source) {
        console.warn(`lineup-actions: #${sourceId} not found in the page`);
        return null;
    }

    const clone = source.cloneNode(true);
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
    button.id = 'regenerateLineup';
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
