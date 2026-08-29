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

    test('undo and redo track roster changes', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('#undoBtn')).toBeDisabled();
        await expect(page.locator('#redoBtn')).toBeDisabled();

        await page.fill('#playerName', 'Test Player');
        await page.click('#addPlayer');
        await expect(page.locator('#presentPlayerCount')).toHaveText('1 Present');
        await expect(page.locator('#undoBtn')).toBeEnabled();

        await page.click('#undoBtn');
        await expect(page.locator('#presentPlayerCount')).toHaveText('0 Present');
        await expect(page.locator('#redoBtn')).toBeEnabled();

        await page.click('#redoBtn');
        await expect(page.locator('#presentPlayerCount')).toHaveText('1 Present');
    });
});
