/**
 * The two decisions the notification toast makes beyond drawing itself.
 *
 * Both encode accessibility behaviour that is invisible on screen and easy to
 * undo by accident, which is why they are named functions rather than inline
 * ternaries: how urgently a message interrupts, and where it has to be
 * attached to be heard at all.
 */

import { describe, test, expect } from '@jest/globals';
import { announcementFor, notificationContainer } from '../src/modules/notifications.js';

describe('announcementFor', () => {
    test('an error interrupts, because it needs acting on', () => {
        expect(announcementFor('error')).toEqual({ role: 'alert', ariaLive: 'assertive' });
    });

    test.each(['info', 'success', 'warning'])('a %s message waits for a pause', (type) => {
        expect(announcementFor(type)).toEqual({ role: 'status', ariaLive: 'polite' });
    });

    test('an unknown type is treated as routine rather than urgent', () => {
        // Interrupting for something we cannot classify is the worse guess
        expect(announcementFor('something-new').ariaLive).toBe('polite');
    });
});

describe('notificationContainer', () => {
    /** A stand-in document whose querySelector answers for one selector. */
    const fakeDoc = (openDialog) => ({
        body: 'body',
        querySelector: (selector) =>
            (selector === 'dialog[open]' ? openDialog : null)
    });

    test('goes to the body when no dialog is open', () => {
        expect(notificationContainer(fakeDoc(null))).toBe('body');
    });

    test('goes inside an open dialog instead', () => {
        // Anything outside a modal <dialog> is inert: not clickable, and not
        // announced, so a toast on the body while a dialog is up is invisible
        // in both senses
        expect(notificationContainer(fakeDoc('the-dialog'))).toBe('the-dialog');
    });
});
