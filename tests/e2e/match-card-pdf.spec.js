// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Official AYSO Match Card PDF Export', () => {
    test('renders export button and triggers match card PDF download', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');

        const pdfBtn = page.locator('#exportPdf');
        await expect(pdfBtn).toBeVisible();

        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 15000 }),
            pdfBtn.click(),
        ]);

        const filename = download.suggestedFilename();
        expect(filename).toMatch(/Match_Card\.pdf$/i);

        expect(errors).toEqual([]);
    });
});
