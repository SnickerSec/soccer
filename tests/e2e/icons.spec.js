// @ts-check
import { test, expect } from '@playwright/test';

/**
 * A <use href="...#id"> pointing at an id that is not in the sprite renders
 * nothing at all, with no console error — so these check the references
 * resolve rather than just that the elements exist.
 */
test.describe('Icons', () => {
    /** Collects every symbol id defined in the generated sprite. */
    async function spriteIds(request) {
        const res = await request.get('/assets/icons.svg');
        expect(res.status()).toBe(200);
        const body = await res.text();
        return new Set([...body.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
    }

    test('every icon reference resolves to a symbol in the sprite', async ({ page, request }) => {
        const ids = await spriteIds(request);
        expect(ids.size).toBeGreaterThan(0);

        await page.goto('/');

        // Render the lineup too, so the dynamically built action buttons and
        // dropdowns are in the DOM and get checked as well.
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });

        const refs = await page.evaluate(() =>
            [...document.querySelectorAll('svg.icon use')].map(u => u.getAttribute('href'))
        );

        expect(refs.length).toBeGreaterThan(0);

        const unresolved = refs.filter(href => {
            const id = String(href).split('#')[1];
            return !id || !href.startsWith('/assets/icons.svg#');
        });
        expect(unresolved).toEqual([]);

        const missing = [...new Set(refs.map(h => String(h).split('#')[1]))].filter(id => !ids.has(id));
        expect(missing).toEqual([]);
    });

    test('icons are decorative and do not leak into the accessible name', async ({ page }) => {
        await page.goto('/');

        // Every icon is aria-hidden, so controls are named by their aria-label
        const notHidden = await page.evaluate(() =>
            [...document.querySelectorAll('svg.icon')]
                .filter(el => el.getAttribute('aria-hidden') !== 'true').length
        );
        expect(notHidden).toBe(0);

        await expect(page.locator('#themeToggle')).toHaveAttribute('aria-label', /theme/i);
        await expect(page.locator('#undoBtn')).toHaveAttribute('aria-label', /undo/i);
    });

    test('icons still render with no network', async ({ page, context }) => {
        await page.goto('/');
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });

        await context.setOffline(true);
        await page.reload();

        // The sprite is precached, so a visible icon still has a painted box.
        // The toggle holds both a moon and a sun; only one is shown at a time.
        const box = await page.locator('#undoBtn svg.icon').boundingBox();
        expect(box?.width).toBeGreaterThan(0);
        expect(box?.height).toBeGreaterThan(0);

        await context.setOffline(false);
    });
});
