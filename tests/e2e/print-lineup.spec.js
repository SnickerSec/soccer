// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Printing used to hand the browser the whole app — dark theme, navigation and
 * all — over several pages. What goes on paper now is one sheet of quarter
 * cards: position, jersey number, player.
 */
test.describe('Printing the lineup', () => {
    /** Generates a lineup, then looks at the page the way a printer does. */
    async function printPreview(page) {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });
        await page.emulateMedia({ media: 'print' });
    }

    test('prints the quarter cards and nothing else', async ({ page }) => {
        await printPreview(page);

        const sheet = page.locator('#printSheet');
        await expect(sheet).toBeVisible();

        for (const quarter of ['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4']) {
            await expect(sheet.getByText(quarter, { exact: false })).toBeVisible();
        }

        // The app around it stays off the page
        await expect(page.locator('#main-content')).toBeHidden();
        await expect(page.locator('.site-header, header').first()).toBeHidden();
    });

    test('every position on the sheet names a player', async ({ page }) => {
        await printPreview(page);

        const firstQuarter = page.locator('#printSheet .print-quarter').first();
        const positions = await firstQuarter.locator('.print-position').allTextContents();
        const players = await firstQuarter.locator('.print-player').allTextContents();

        expect(positions[0]).toBe('Keeper');
        expect(positions.length).toBeGreaterThanOrEqual(7);
        expect(players).toHaveLength(positions.length);
        players.forEach(name => expect(name.trim().length).toBeGreaterThan(0));
    });

    test('carries the jersey numbers the roster has', async ({ page }) => {
        await printPreview(page);

        const numbers = await page.locator('#printSheet .print-number').allTextContents();
        const printed = numbers.filter(n => n.trim().length > 0);

        expect(printed.length).toBeGreaterThan(0);
        printed.forEach(n => expect(n.trim()).toMatch(/^#\d+$/));
    });

    test('fits on a single page', async ({ page }) => {
        await printPreview(page);

        // Letter portrait at 0.45in margins leaves 10.1in of height; the sheet
        // is measured in CSS pixels, 96 to the inch.
        const height = await page.locator('#printSheet').evaluate(el => el.getBoundingClientRect().height);

        expect(height).toBeLessThan(10.1 * 96);
    });
});
