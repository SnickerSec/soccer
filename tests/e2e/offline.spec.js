// @ts-check
import { test, expect } from '@playwright/test';

// These share one browser context so the service worker installed by the first
// test is still there for the ones that follow.
test.describe.configure({ mode: 'serial' });

/** Waits until a service worker is installed and controlling the page. */
async function waitForServiceWorker(page) {
    await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
        null,
        { timeout: 20000 }
    );
}

test.describe('Offline support', () => {
    test('app shell loads with no network', async ({ page, context }) => {
        await page.goto('/');
        await waitForServiceWorker(page);

        await context.setOffline(true);
        await page.reload();

        // The page renders and the app boots
        await expect(page.locator('h1')).toHaveText('AYSO Roster Pro');
        await expect(page.locator('#presentPlayerCount')).toBeVisible();

        // Core interaction still works
        await page.fill('#playerName', 'Offline Player');
        await page.click('#addPlayer');
        await expect(page.locator('#presentPlayerCount')).toHaveText('1 Present');

        await context.setOffline(false);
    });

    test('lineup generation works offline', async ({ page, context }) => {
        await page.goto('/');
        await waitForServiceWorker(page);
        await page.click('#demoButton');

        await context.setOffline(true);
        await page.reload();

        await page.click('#generateLineup');
        await expect(page.locator('#lineupDisplay')).toBeVisible({ timeout: 15000 });

        await context.setOffline(false);
    });

    test('PDF export works offline once the libraries have been cached', async ({ page, context }) => {
        await page.goto('/');
        await waitForServiceWorker(page);
        await page.click('#demoButton');

        // First run while online populates the runtime cache
        await page.click('#evaluation-tab-btn');
        await page.fill('#coachName', 'Test Coach');
        const firstDownload = page.waitForEvent('download', { timeout: 30000 });
        await page.click('#generateEvaluation');
        await firstDownload;

        // Now do it again with no network at all
        await context.setOffline(true);
        await page.reload();
        await page.click('#evaluation-tab-btn');
        await page.fill('#coachName', 'Test Coach');

        const offlineDownload = page.waitForEvent('download', { timeout: 30000 });
        await page.click('#generateEvaluation');
        const download = await offlineDownload;
        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

        await context.setOffline(false);
    });
});
