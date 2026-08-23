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

test.describe('Evaluation PDF and player names', () => {
    /**
     * The form used to be drawn with a PDF standard font, which is WinAnsi —
     * so one player named Łukasz threw and nobody on the team got a form. An
     * embedded Unicode font replaced it.
     */
    async function generateFor(page, names) {
        await page.goto('/');
        for (const name of names) {
            await page.fill('#playerName', name);
            await page.click('#addPlayer');
        }
        await page.click('#evaluation-tab-btn');
        await page.fill('#coachName', 'Coach Taylor');

        const download = page.waitForEvent('download', { timeout: 20000 });
        await page.click('#generateEvaluation');
        return download;
    }

    test('a Central European name no longer stops the whole form', async ({ page }) => {
        const download = await generateFor(page, ['Ana Smith', 'Łukasz Ştefan']);

        expect(await download).toBeTruthy();
        await expect(page.locator('.notification')).toContainText(/successfully/i);
    });

    test('a Cyrillic name is printed too', async ({ page }) => {
        const download = await generateFor(page, ['Ana Smith', 'Анна Иванова']);

        expect(await download).toBeTruthy();
        await expect(page.locator('.notification')).toContainText(/successfully/i);
    });

    test('a name the font cannot draw is named, not silently blank', async ({ page }) => {
        // The form is still produced — one such name must not cost the rest of
        // the team theirs — but a form that looks finished with a name missing
        // from it is worse than one that says so.
        const download = await generateFor(page, ['Ana Smith', '田中 さくら']);

        expect(await download).toBeTruthy();
        await expect(page.locator('.notification')).toContainText('田中 さくら');
        await expect(page.locator('.notification')).toContainText(/could not be printed/i);
    });

    test('an all-Latin roster says nothing about missing names', async ({ page }) => {
        const download = await generateFor(page, ['Ana Smith', "O'Brien", 'Núñez']);

        expect(await download).toBeTruthy();
        await expect(page.locator('.notification')).not.toContainText(/could not be printed/i);
    });
});
