// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The privacy page.
 *
 * The footer used to link to docs/PRIVACY_AND_SAFETY.md, which Express never
 * served -- only public/ is static -- so it returned "Cannot GET". These check
 * the link resolves and that the page carries the disclosures the app now needs.
 */
test.describe('Privacy page', () => {
    test('is reachable from the footer', async ({ page }) => {
        await page.goto('/');

        const link = page.locator('footer a[href="/privacy.html"]');
        await expect(link).toBeVisible();

        await link.click();
        await expect(page).toHaveURL(/privacy\.html$/);
        await expect(page.locator('h1')).toHaveText('Privacy & Safety');
    });

    test('every footer link resolves', async ({ page, request }) => {
        await page.goto('/');

        const hrefs = await page.evaluate(() =>
            [...document.querySelectorAll('footer a')].map(a => a.getAttribute('href'))
        );
        const internal = hrefs.filter(h => h && !h.startsWith('http'));
        expect(internal.length).toBeGreaterThan(0);

        for (const href of internal) {
            const res = await request.get(href);
            expect(res.status(), `${href} should be served`).toBe(200);
        }
    });

    test('discloses what cloud sync stores, rather than claiming nothing is stored', async ({ page }) => {
        await page.goto('/privacy.html');

        const text = await page.locator('#main-content').innerText();

        // The disclosures the current app requires
        expect(text).toMatch(/email address/i);
        expect(text).toMatch(/Google/);
        expect(text).toMatch(/local storage/i);

        // Claims the old document made that are no longer true of this app
        expect(text).not.toMatch(/no database/i);
        expect(text).not.toMatch(/never sent to/i);
        expect(text).not.toMatch(/no accounts? (or|are) /i);
    });

    test('follows the theme chosen in the app', async ({ page }) => {
        await page.goto('/');
        await page.click('#themeToggle');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

        await page.goto('/privacy.html');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });

    test('offers a way back to the app', async ({ page }) => {
        await page.goto('/privacy.html');
        await page.locator('.doc-back').click();
        await expect(page.locator('h1')).toHaveText('AYSO Roster Pro');
    });
});
