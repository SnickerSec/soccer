// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Custom Formation Builder', () => {
    test('creates and applies a custom formation to generated lineups', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');

        // Open Tactical Formation Builder modal
        const openBtn = page.locator('#openCustomFormation');
        await expect(openBtn).toBeVisible();
        await openBtn.click();

        // Verify Modal is open
        const modal = page.locator('#customFormationModal');
        await expect(modal).toBeVisible();
        await expect(modal.getByText('Tactical Formation Builder')).toBeVisible();

        // Fill Name
        await modal.locator('#customFormName').fill('3-1-2 Diamond');

        // Save & Apply
        const saveBtn = modal.locator('#saveCustomFormation');
        await expect(saveBtn).toBeEnabled();
        await saveBtn.click();

        await expect(modal).not.toBeVisible();

        // Verify Formation select now has the custom formation selected
        const formSelect = page.locator('#formation');
        await expect(formSelect).toHaveValue('3-1-2 Diamond');

        // Load demo roster & generate lineup
        await page.click('#demoButton');
        await page.click('#generateLineup');

        // Verify lineup is visible and formation description mentions the custom formation
        await expect(page.locator('#lineupDisplay')).toBeVisible();
        await expect(page.locator('#formationDescription')).toContainText('3-1-2 Diamond');

        expect(errors).toEqual([]);
    });
});
