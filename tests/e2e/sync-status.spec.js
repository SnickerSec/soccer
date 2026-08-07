// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The cloud sync indicator. updateSyncStatusUI() has always targeted
 * #syncStatus, but the element was never in index.html, so every call bailed at
 * the first line and coaches got no feedback on whether a sync worked.
 *
 * Sign-in needs real Google credentials, so these drive the app object directly
 * rather than going through OAuth.
 */
test.describe('Sync status indicator', () => {
    const STATES = [
        { status: 'syncing', className: 'syncing', label: 'Syncing...' },
        { status: 'synced', className: 'synced', label: 'Synced' },
        { status: 'error', className: 'error', label: 'Sync Error' },
        { status: 'offline', className: 'offline', label: 'Offline' }
    ];

    test('exists, and is hidden until the user signs in', async ({ page }) => {
        await page.goto('/');

        const indicator = page.locator('#syncStatus');
        await expect(indicator).toHaveCount(1);
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

            await page.evaluate(s => {
                const app = window.lineupGenerator;
                document.getElementById('syncStatus').classList.remove('hidden');
                app.updateSyncStatusUI(s);
            }, status);

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

        await page.evaluate(() => {
            document.getElementById('syncStatus').classList.remove('hidden');
            window.lineupGenerator.updateSyncStatusUI('syncing');
        });
        await expect(page.locator('#syncStatus')).toHaveClass(/\bsyncing\b/);

        await page.evaluate(() => window.lineupGenerator.updateSyncStatusUI('error'));

        const classes = await page.locator('#syncStatus').getAttribute('class');
        expect(classes).toContain('error');
        expect(classes).not.toContain('syncing');
        expect(classes).not.toContain('synced');
    });

    test('an unknown status falls back to offline rather than rendering blank', async ({ page }) => {
        await page.goto('/');

        await page.evaluate(() => {
            document.getElementById('syncStatus').classList.remove('hidden');
            window.lineupGenerator.updateSyncStatusUI('something-unexpected');
        });

        await expect(page.locator('#syncStatus')).toHaveClass(/\boffline\b/);
        await expect(page.locator('#syncStatus .sync-text')).toHaveText('Offline');
    });

    test('"Synced" fades away on its own, and comes back on the next sync', async ({ page }) => {
        await page.goto('/');

        await page.evaluate(() => {
            document.getElementById('syncStatus').classList.remove('hidden');
            window.lineupGenerator.updateSyncStatusUI('synced');
        });

        const indicator = page.locator('#syncStatus');
        await expect(indicator).toBeVisible();
        await expect(indicator).toBeHidden({ timeout: 10000 });

        await page.evaluate(() => window.lineupGenerator.updateSyncStatusUI('syncing'));
        await expect(indicator).toBeVisible();
    });

    for (const status of ['syncing', 'error', 'offline']) {
        test(`the ${status} state stays on screen rather than fading`, async ({ page }) => {
            await page.goto('/');

            await page.evaluate(s => {
                document.getElementById('syncStatus').classList.remove('hidden');
                window.lineupGenerator.updateSyncStatusUI(s);
            }, status);

            // Comfortably past the fade delay the synced state uses
            await page.waitForTimeout(5000);
            await expect(page.locator('#syncStatus')).toBeVisible();
        });
    }

    test('the spinning icon is not an inline box, so the animation applies', async ({ page }) => {
        await page.goto('/');

        await page.evaluate(() => {
            document.getElementById('syncStatus').classList.remove('hidden');
            window.lineupGenerator.updateSyncStatusUI('syncing');
        });

        const { display, animationName } = await page.evaluate(() => {
            const style = getComputedStyle(document.querySelector('#syncStatus .sync-icon'));
            return { display: style.display, animationName: style.animationName };
        });

        // transform, and so the spin keyframes, do not apply to inline elements
        expect(display).not.toBe('inline');
        expect(animationName).toBe('spin');
    });

    test('the label stays readable to assistive tech on phones', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await page.goto('/');

        await page.evaluate(() => {
            document.getElementById('syncStatus').classList.remove('hidden');
            window.lineupGenerator.updateSyncStatusUI('error');
        });

        // Visually collapsed to keep the header compact...
        const box = await page.locator('#syncStatus .sync-text').boundingBox();
        expect(box.width).toBeLessThan(5);

        // ...but still in the accessibility tree, unlike display:none
        const display = await page.evaluate(() =>
            getComputedStyle(document.querySelector('#syncStatus .sync-text')).display
        );
        expect(display).not.toBe('none');
        await expect(page.locator('#syncStatus .sync-text')).toHaveText('Sync Error');
    });
});
