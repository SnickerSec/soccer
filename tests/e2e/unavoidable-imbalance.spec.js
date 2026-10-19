// @ts-check
import { test, expect } from '@playwright/test';

/**
 * With exactly as many available players as positions nobody sits, and the
 * formation's spots at the back decide the defense/attack split: 3-3 has
 * sixteen quarters there to share where seven even splits use fourteen, so two
 * players must play three. Listed bare, those notices read as a generator that
 * could not do its job.
 */

async function rosterOf(page, available) {
    await page.goto('/');
    await page.click('#demoButton');
    const selects = page.locator('#playerList .player-status-select');
    await expect(selects.first()).toBeVisible();
    const total = await selects.count();
    for (let i = available; i < total; i++) {
        await selects.nth(i).selectOption('absent');
    }
    await expect(page.locator('#presentPlayerCount')).toContainText(String(available));
}

test.describe('Unavoidable imbalance note', () => {
    test('explains the two imbalances seven players on a 3-3 cannot avoid', async ({ page }) => {
        await rosterOf(page, 7);
        await page.selectOption('#formation', '3-3');
        await page.click('#generateLineup');

        const note = page.locator('#unavoidableImbalanceNote');
        await expect(note).toContainText("These 2 imbalances can't be avoided.");
        await expect(note).toContainText('16 quarters at the back');
        await expect(note).toContainText('2 players have to play 3 quarters at the back');
    });

    test('is not shown once somebody sits', async ({ page }) => {
        await rosterOf(page, 8);
        await page.selectOption('#formation', '3-3');
        await page.click('#generateLineup');

        await expect(page.locator('#lineupDisplay')).toBeVisible();
        await expect(page.locator('#unavoidableImbalanceNote')).toHaveCount(0);
    });
});
