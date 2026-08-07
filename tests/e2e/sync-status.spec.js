// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The cloud sync indicator. It lives inside the account dropdown rather than
 * the header: sync state is only interesting when a coach goes looking for it,
 * and a permanent header badge cost space on every screen.
 *
 * Sign-in needs real Google credentials, so these drive the app object directly
 * rather than going through OAuth: reveal the menu, then open the panel.
 */
test.describe('Sync status indicator', () => {
    const STATES = [
        { status: 'syncing', className: 'syncing', label: 'Syncing...' },
        { status: 'synced', className: 'synced', label: 'Synced' },
        { status: 'error', className: 'error', label: 'Sync Error' },
        { status: 'offline', className: 'offline', label: 'Offline' }
    ];

    /** Fakes a signed-in user and opens the account dropdown. */
    async function openAccountPanel(page, status) {
        await page.evaluate(s => {
            document.getElementById('userMenu').classList.remove('hidden');
            document.getElementById('syncStatus').classList.remove('hidden');
            if (s) window.lineupGenerator.updateSyncStatusUI(s);
        }, status || null);
        await page.click('#accountTrigger');
        await expect(page.locator('#accountPanel')).toBeVisible();
    }

    test('lives in the account panel, not the header', async ({ page }) => {
        await page.goto('/');

        const indicator = page.locator('#syncStatus');
        await expect(indicator).toHaveCount(1);
        await expect(page.locator('#accountPanel #syncStatus')).toHaveCount(1);
        await expect(page.locator('.header-controls > #syncStatus')).toHaveCount(0);

        // Signed out, and the panel is closed, so nothing shows
        await expect(indicator).toBeHidden();

        // The parts updateSyncStatusUI() writes into
        await expect(page.locator('#syncStatus .sync-icon')).toHaveCount(1);
        await expect(page.locator('#syncStatus .sync-text')).toHaveCount(1);
    });

    test('is a polite live region, so status changes are announced', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('#syncStatus')).toHaveAttribute('role', 'status');
        await expect(page.locator('#syncStatus')).toHaveAttribute('aria-live', 'polite');
    });

    for (const { status, className, label } of STATES) {
        test(`renders the ${status} state`, async ({ page }) => {
            await page.goto('/');
            await openAccountPanel(page, status);

            const indicator = page.locator('#syncStatus');
            await expect(indicator).toBeVisible();
            await expect(indicator).toHaveClass(new RegExp(`\\b${className}\\b`));
            await expect(page.locator('#syncStatus .sync-text')).toHaveText(label);

            // The icon resolves to a symbol in the sprite rather than rendering blank
            const href = await page.locator('#syncStatus .sync-icon use').getAttribute('href');
            expect(href).toMatch(/^\/assets\/icons\.svg#icon-sync-/);
        });
    }

    test('switching state does not leave the previous state class behind', async ({ page }) => {
        await page.goto('/');
        await openAccountPanel(page, 'syncing');
        await expect(page.locator('#syncStatus')).toHaveClass(/\bsyncing\b/);

        await page.evaluate(() => window.lineupGenerator.updateSyncStatusUI('error'));

        const classes = await page.locator('#syncStatus').getAttribute('class');
        expect(classes).toContain('error');
        expect(classes).not.toContain('syncing');
        expect(classes).not.toContain('synced');
    });

    test('an unknown status falls back to offline rather than rendering blank', async ({ page }) => {
        await page.goto('/');
        await openAccountPanel(page, 'something-unexpected');

        await expect(page.locator('#syncStatus')).toHaveClass(/\boffline\b/);
        await expect(page.locator('#syncStatus .sync-text')).toHaveText('Offline');
    });

    test('the spinning icon is not an inline box, so the animation applies', async ({ page }) => {
        await page.goto('/');
        await openAccountPanel(page, 'syncing');

        const { display, animationName } = await page.evaluate(() => {
            const style = getComputedStyle(document.querySelector('#syncStatus .sync-icon'));
            return { display: style.display, animationName: style.animationName };
        });

        // transform, and so the spin keyframes, do not apply to inline elements
        expect(display).not.toBe('inline');
        expect(animationName).toBe('spin');
    });

    test('the label is readable on phones, where the dropdown has room for it', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await page.goto('/');
        await openAccountPanel(page, 'error');

        // No longer visually collapsed the way the header badge had to be
        const box = await page.locator('#syncStatus .sync-text').boundingBox();
        expect(box.width).toBeGreaterThan(20);
        await expect(page.locator('#syncStatus .sync-text')).toHaveText('Sync Error');
    });
});
