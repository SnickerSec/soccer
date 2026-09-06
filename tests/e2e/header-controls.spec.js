// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Header controls', () => {
    test('theme toggle switches themes and persists', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('/');

        // Starts dark: moon shown, sun hidden
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect(page.locator('#themeToggle .theme-icon-dark')).toBeVisible();
        await expect(page.locator('#themeToggle .theme-icon-light')).toBeHidden();

        await page.click('#themeToggle');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
        await expect(page.locator('#themeToggle .theme-icon-light')).toBeVisible();
        await expect(page.locator('#themeToggle .theme-icon-dark')).toBeHidden();

        // Survives a reload
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

        await page.click('#themeToggle');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

        expect(errors).toEqual([]);
    });

    test('undo and redo buttons are removed and keyboard shortcuts work', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('#undoBtn')).toHaveCount(0);
        await expect(page.locator('#redoBtn')).toHaveCount(0);

        await page.fill('#playerName', 'Test Player');
        await page.click('#addPlayer');
        await expect(page.locator('#presentPlayerCount')).toHaveText('1 Present');

        await page.keyboard.press('Control+z');
        await expect(page.locator('#presentPlayerCount')).toHaveText('0 Present');

        await page.keyboard.press('Control+y');
        await expect(page.locator('#presentPlayerCount')).toHaveText('1 Present');
    });
});
