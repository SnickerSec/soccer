// @ts-check
import { test, expect } from '@playwright/test';

test.describe('PDF library loading', () => {
    test('initial page load does not fetch the PDF libraries', async ({ page }) => {
        const requested = [];
        page.on('request', req => requested.push(req.url()));

        await page.goto('/');
        await expect(page.locator('#playerCount')).toBeVisible();

        const vendorRequests = requested.filter(u => u.includes('/vendor/'));
        expect(vendorRequests).toEqual([]);

        // And nothing is pulled from the old CDN
        expect(requested.filter(u => u.includes('unpkg.com'))).toEqual([]);

        // Globals are absent until something needs them
        expect(await page.evaluate(() => typeof window.PDFLib)).toBe('undefined');
    });

    test('generating an evaluation form loads the libraries and downloads a PDF', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await page.click('#demoButton');
        await expect(page.locator('#playerCount')).not.toHaveText('0');

        await page.click('#evaluation-tab-btn');
        await page.fill('#coachName', 'Test Coach');

        const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
        await page.click('#generateEvaluation');
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

        // Both libraries registered their globals
        expect(await page.evaluate(() => typeof window.PDFLib)).toBe('object');
        expect(await page.evaluate(() => typeof window.fontkit)).toBe('object');

        expect(errors).toEqual([]);
    });
});
