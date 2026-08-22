/**
 * Transient feedback: the toast that reports what just happened, and the
 * overlay shown while the lineup worker runs.
 *
 * Both are pure presentation — they read no app state and change none, which is
 * why they can live outside the app class entirely.
 */

/** How long a toast stays up, and how long its fade lasts. */
const VISIBLE_MS = 3000;
const FADE_MS = 300;

/**
 * A live region that appears with its text already in place is commonly not
 * announced, so the node goes in empty and is filled a tick later.
 */
const FILL_DELAY_MS = 10;

/**
 * How a notification should be announced.
 *
 * Errors interrupt whatever the screen reader is saying, because they report
 * something the coach has to act on; everything else waits for a pause.
 *
 * @param {string} type notification type ('error', 'success', 'warning', 'info')
 */
export function announcementFor(type) {
    const isError = type === 'error';
    return {
        role: isError ? 'alert' : 'status',
        ariaLive: isError ? 'assertive' : 'polite'
    };
}

/**
 * Where a notification has to be appended to be seen and heard.
 *
 * Anything outside an open <dialog> opened with showModal() is inert, so a
 * toast appended to body while a dialog is up is neither clickable nor
 * announced.
 */
export function notificationContainer(doc = document) {
    return doc.querySelector('dialog[open]') || doc.body;
}

/**
 * Shows a toast, replacing any toast already up.
 *
 * @param {string} message
 * @param {string} [type] 'info' (default), 'success', 'warning' or 'error'
 */
export function showNotification(message, type = 'info') {
    document.querySelector('.notification')?.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    const { role, ariaLive } = announcementFor(type);
    notification.setAttribute('role', role);
    notification.setAttribute('aria-live', ariaLive);
    notification.setAttribute('aria-atomic', 'true');

    notificationContainer().appendChild(notification);

    setTimeout(() => {
        notification.textContent = message;
        notification.classList.add('show');
    }, FILL_DELAY_MS);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), FADE_MS);
    }, VISIBLE_MS);

    return notification;
}

/** Covers the page while the lineup worker runs. */
export function showLoading(message = 'Generating lineup...') {
    hideLoading();

    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';

    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';

    const text = document.createElement('div');
    text.className = 'loading-text';
    text.textContent = message;

    const progress = document.createElement('div');
    progress.className = 'loading-progress';
    progress.id = 'loadingProgress';

    overlay.append(spinner, text, progress);
    document.body.appendChild(overlay);
    return overlay;
}

/** Updates the line under the spinner, e.g. attempt counts. */
export function updateLoadingProgress(text) {
    const progress = document.getElementById('loadingProgress');
    if (progress) {
        progress.textContent = text;
    }
}

/** Removes the overlay, if one is up. */
export function hideLoading() {
    document.getElementById('loadingOverlay')?.remove();
}
