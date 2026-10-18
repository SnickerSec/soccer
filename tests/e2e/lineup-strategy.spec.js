// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The lineup strategy: where the player ratings send the stronger players.
 *
 * It is a team setting like the formation, so it has to survive a reload, and
 * a lineup generated with a focus is still a full one.
 */

async function loadDemo(page) {
    await page.goto('/');
    await page.click('#demoButton');
    await page.waitForFunction(() => {
        const el = document.querySelector('#presentPlayerCount');
        return el && parseInt(el.textContent || '0') >= 7;
    }, { timeout: 10000 });
}

test.describe('Lineup strategy', () => {
    test('defaults to balanced and describes each choice', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#lineupStrategy')).toHaveValue('balanced');
        await expect(page.locator('#lineupStrategyDescription')).toContainText('evenly');

        await page.selectOption('#lineupStrategy', 'offense');
        await expect(page.locator('#lineupStrategyDescription')).toContainText('up front');
    });

    test('is kept across a reload', async ({ page }) => {
        await page.goto('/');
        await page.selectOption('#lineupStrategy', 'defense');
        await page.reload();
        await expect(page.locator('#lineupStrategy')).toHaveValue('defense');
    });

    test('a focused lineup still puts everyone in every quarter', async ({ page }) => {
        await loadDemo(page);
        await page.selectOption('#lineupStrategy', 'defense');
        await page.click('#generateLineup');

        await expect(page.locator('#lineupDisplay')).toBeVisible({ timeout: 15000 });
        const present = parseInt(await page.locator('#presentPlayerCount').textContent() || '0');
        for (const q of ['1', '2', '3', '4']) {
            const names = await page.locator(`#lineupGrid tr[data-quarter="${q}"]`)
                .evaluateAll(rows => rows.map(r => r.getAttribute('data-player')));
            expect(new Set(names).size).toBe(present);
        }
    });

    test('says so when nobody is rated, and goes once somebody is', async ({ page }) => {
        await page.goto('/');
        for (const name of ['Ana', 'Ben']) {
            await page.fill('#playerName', name);
            await page.click('#addPlayer');
        }
        await expect(page.locator('#lineupStrategyRatingsHint')).toContainText('No player here is rated yet');

        await page.locator('#playerList li[aria-label*="Ana"] .player-rating-btn').click();
        await page.locator('.rating-stars[data-category="overall"] .rating-star').nth(3).click();
        await page.locator('.rating-dialog-buttons button', { hasText: 'Save' }).click();

        await expect(page.locator('#lineupStrategyRatingsHint')).toHaveText('1 of 2 players are rated; the rest count as 3 stars.');
    });

    test('the demo roster is rated, so there is nothing to say', async ({ page }) => {
        await loadDemo(page);
        await expect(page.locator('#lineupStrategyRatingsHint')).toHaveCount(0);
    });
});
