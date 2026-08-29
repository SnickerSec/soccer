// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Live Matchday Mode', () => {
    test('opens matchday modal, controls quarter clock, and logs goals', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');

        // Verify Live Match button exists in the sticky action bar
        const matchdayBtn = page.locator('#openMatchday');
        await expect(matchdayBtn).toBeVisible();
        await matchdayBtn.click();

        // Verify Matchday Dialog opened
        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText(/Live Matchday:/i)).toBeVisible();

        // Verify Quarter timer and controls
        await expect(dialog.getByRole('button', { name: 'Q1', exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Q2', exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Q3', exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Q4', exact: true })).toBeVisible();

        // Start clock
        const startBtn = dialog.getByRole('button', { name: /Start/i });
        await expect(startBtn).toBeVisible();
        await startBtn.click();
        await expect(dialog.getByRole('button', { name: /Pause/i })).toBeVisible();

        // Switch to Quarter 2
        await dialog.getByRole('button', { name: 'Q2', exact: true }).click();

        // Tap a player in the active roster to record a goal
        const firstPlayer = dialog.locator('.max-h-44 > div').first();
        await expect(firstPlayer).toBeVisible();
        await firstPlayer.click();

        const goalBtn = dialog.getByRole('button', { name: /Goal/i });
        await expect(goalBtn).toBeVisible();
        await goalBtn.click();

        // Verify score incremented to 1
        await expect(dialog.getByText('1', { exact: true }).first()).toBeVisible();

        // Close match mode
        await dialog.getByRole('button', { name: /Close Match Mode/i }).click();
        await expect(dialog).not.toBeVisible();

        expect(errors).toEqual([]);
    });
});

/**
 * Launching matchday from a fixture, before any lineup exists.
 *
 * The schedule's Live button used to call the generator with the wrong
 * arguments, so this path threw instead of opening the dialog.
 */
test.describe('Live Matchday from the schedule', () => {
    test('generates the lineup it needs instead of throwing', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await page.click('#demoButton');

        await page.locator('button[role="tab"]').filter({ hasText: 'Schedule' }).click();
        await page.getByRole('button', { name: /Add Match/i }).first().click();

        await page.fill('#opponentName', 'Rovers');
        await page.fill('#gameDate', '2026-09-05');
        await page.getByRole('button', { name: /Save Match/i }).click();

        // No lineup has been generated at this point
        await page.getByRole('button', { name: /Live/i }).first().click();

        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText(/Live Matchday:/i)).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Q1', exact: true })).toBeVisible();

        expect(errors).toEqual([]);
    });
});
