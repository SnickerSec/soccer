// @ts-check
import { test, expect } from '@playwright/test';

test.describe('SportsEngine & League Roster CSV Importer', () => {
    test('uploads CSV roster, previews in modal, and imports players', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');

        const csvContent = `First Name,Last Name,Jersey Number,Position,Roster Status
Marcus,Rashford,10,Forward,Active
Bruno,Fernandes,8,Midfield,Active
Luke,Shaw,23,Defense,Active`;

        // Upload file
        await page.setInputFiles('#fileInput', {
            name: 'SportsEngine_Roster.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csvContent),
        });

        // Verify Import Preview Modal opens
        const modal = page.locator('#rosterImportModal');
        await expect(modal).toBeVisible();
        await expect(modal.getByText('SportsEngine')).toBeVisible();
        await expect(modal.getByText('Marcus Rashford')).toBeVisible();
        await expect(modal.getByText('Bruno Fernandes')).toBeVisible();
        await expect(modal.getByText('Luke Shaw')).toBeVisible();

        // Confirm Import
        const confirmBtn = modal.locator('#confirmImportPlayers');
        await expect(confirmBtn).toBeVisible();
        await confirmBtn.click();

        await expect(modal).not.toBeVisible();

        // Verify players are now on the active roster
        const roster = page.locator('#playerList');
        await expect(roster.getByText('Marcus Rashford')).toBeVisible();
        await expect(roster.getByText('Bruno Fernandes')).toBeVisible();
        await expect(roster.getByText('Luke Shaw')).toBeVisible();

        expect(errors).toEqual([]);
    });
});
