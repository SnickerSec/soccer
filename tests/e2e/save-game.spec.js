// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The Save Game button coaches see is a clone built by displayLineup(); the
 * original in index.html is hidden. The clone used to call prompt() directly,
 * bypassing the modal and its date field, so every saved game was dated today.
 */
test.describe('Save Game', () => {
    /** Generates a lineup so the action buttons are on screen. */
    async function generateLineup(page) {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });
    }

    test('the visible button opens the modal rather than a browser prompt', async ({ page }) => {
        let promptShown = false;
        page.on('dialog', async dialog => {
            promptShown = true;
            await dialog.dismiss();
        });

        await generateLineup(page);
        await page.locator('.action-buttons-inline #saveGame').click();

        await expect(page.locator('#saveGameModal')).toBeVisible();
        expect(promptShown).toBe(false);

        // The modal defaults the date to today
        const today = new Date().toISOString().split('T')[0];
        await expect(page.locator('#saveGameDate')).toHaveValue(today);
    });

    test('saves the name and date entered in the modal', async ({ page }) => {
        await generateLineup(page);
        await page.locator('.action-buttons-inline #saveGame').click();

        await page.fill('#saveGameName', 'vs Tigers');
        await page.fill('#saveGameDate', '2026-03-14');
        await page.click('#confirmSaveGame');

        await expect(page.locator('#saveGameModal')).toBeHidden();

        // The game reaches the season tracker with the date that was chosen,
        // not today's
        await page.click('#season-tab-btn');
        const historyText = await page.locator('#gameHistoryList').textContent();
        expect(historyText).toContain('vs Tigers');
        expect(historyText).toContain('Mar 14, 2026');

        await expect(page.locator('#totalGames')).toHaveText('1');
    });

    test('cancelling the modal saves nothing', async ({ page }) => {
        await generateLineup(page);
        await page.locator('.action-buttons-inline #saveGame').click();

        await page.fill('#saveGameName', 'Discarded');
        await page.click('#cancelSaveGame');

        await expect(page.locator('#saveGameModal')).toBeHidden();
        await page.click('#season-tab-btn');
        await expect(page.locator('#totalGames')).toHaveText('0');
    });

    test('refuses to save when no lineup has been generated', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');

        // Wait out the welcome toast first: showNotification() removes any
        // existing toast, so an earlier one arriving late would clobber the
        // error we are asserting on.
        await expect(page.locator('.notification')).toHaveCount(0, { timeout: 10000 });

        // The static button is the only one present before a lineup exists
        await page.evaluate(() => document.getElementById('saveGame')?.click());

        await expect(page.locator('#saveGameModal')).toBeHidden();
        await expect(page.locator('.notification-error')).toContainText('Generate a lineup first');
        await expect(page.locator('#totalGames')).toHaveText('0');
    });
});
