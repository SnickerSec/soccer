// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Player Development & Position Heatmaps', () => {
    test('renders position heatmap on Season tab and toggles between players', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');

        // Save a game
        await page.click('#saveGame');
        await page.locator('#saveGameName').fill('Championship Match');
        await page.locator('#confirmSaveGame').click();

        // Switch to Season tab
        await page.click('button[role="tab"]:has-text("Season")');

        // Verify Player Development Heatmap Card
        const heatmapCard = page.locator('#playerDevelopmentHeatmap');
        await expect(heatmapCard).toBeVisible();
        await expect(heatmapCard.getByText('Player Development & Position Heatmap')).toBeVisible();

        // Verify zones
        await expect(heatmapCard.getByText('Forward & Attack Zone')).toBeVisible();
        await expect(heatmapCard.getByText('Midfield Zone')).toBeVisible();
        await expect(heatmapCard.getByText('Defense Zone')).toBeVisible();
        await expect(heatmapCard.getByText('Goalkeeper')).toBeVisible();

        // Select a different player
        const playerButtons = heatmapCard.locator('button');
        const count = await playerButtons.count();
        expect(count).toBeGreaterThan(1);
        await playerButtons.nth(1).click();

        // Verify Position Distribution bar is visible
        await expect(heatmapCard.getByText('Position Distribution')).toBeVisible();

        expect(errors).toEqual([]);
    });
});
