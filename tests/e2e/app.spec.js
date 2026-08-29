// @ts-check
import { test, expect } from '@playwright/test';

// Run tests serially to avoid conflicts
test.describe.configure({ mode: 'serial' });

test.describe('AYSO Roster Pro', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate and wait for complete load
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
    });

    test('displays the main page with correct title', async ({ page }) => {
        await expect(page).toHaveTitle('AYSO Roster Pro');
        await expect(page.locator('h1')).toContainText('AYSO Roster Pro');
    });

    test('shows roster management section', async ({ page }) => {
        const playerInput = page.locator('#playerName');
        await expect(playerInput).toBeVisible();
    });

    test('can add a player manually', async ({ page }) => {
        await page.fill('#playerName', 'Test Player');
        await page.fill('#playerNumber', '10');
        await page.click('#addPlayer');

        await expect(page.locator('#playerList')).toContainText('Test Player');
        await expect(page.locator('#presentPlayerCount')).toHaveText('1 Present');
    });

    test('can load demo players', async ({ page }) => {
        await page.click('#demoButton');

        // Wait for player count to be at least 7
        await page.waitForFunction(() => {
            const el = document.querySelector('#presentPlayerCount');
            return el && parseInt(el.textContent || '0') >= 7;
        }, { timeout: 10000 });

        const presentCount = await page.locator('#presentPlayerCount').textContent();
        expect(parseInt(presentCount || '0')).toBeGreaterThanOrEqual(7);
    });

    test('can generate lineup with demo players', async ({ page }) => {
        // Load demo players
        await page.click('#demoButton');
        await page.waitForFunction(() => {
            const el = document.querySelector('#presentPlayerCount');
            return el && parseInt(el.textContent || '0') >= 7;
        }, { timeout: 10000 });

        // Generate lineup
        await page.click('#generateLineup');

        // Wait for lineup to appear
        await expect(page.locator('#lineupDisplay')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#lineupGrid')).toBeVisible();
    });

    test('game settings are visible', async ({ page }) => {
        await expect(page.locator('#ageDivision')).toBeVisible();
        await expect(page.locator('#fieldPlayers')).toBeVisible();
        await expect(page.locator('#formation')).toBeVisible();
    });

    test('header controls exist', async ({ page }) => {
        await expect(page.locator('#themeToggle')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#undoBtn')).toBeVisible();
        await expect(page.locator('#redoBtn')).toBeVisible();
    });

    test('can clear all players', async ({ page }) => {
        // Load demo players first
        await page.click('#demoButton');
        await page.waitForFunction(() => {
            const el = document.querySelector('#presentPlayerCount');
            return el && parseInt(el.textContent || '0') >= 7;
        }, { timeout: 10000 });

        // Set up dialog handler before clicking
        page.on('dialog', dialog => dialog.accept());

        // Clear all
        await page.click('#clearAll');

        // Wait for player count to be 0
        await page.waitForFunction(() => {
            const el = document.querySelector('#presentPlayerCount');
            return el && parseInt(el.textContent || '-1') === 0;
        }, { timeout: 5000 });

        await expect(page.locator('#presentPlayerCount')).toHaveText('0 Present');
    });
});
