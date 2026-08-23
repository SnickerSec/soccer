// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The evaluation form and the player summary table.
 *
 * Both are rebuilt from the roster every time anything changes, so what they
 * show has to come from the players rather than from whatever the previous
 * render left in the inputs.
 */

async function rosterWith(page, names) {
    await page.goto('/');
    for (const name of names) {
        await page.fill('#playerName', name);
        await page.click('#addPlayer');
    }
}

test.describe('Evaluation form', () => {
    const openTab = (page) => page.click('#evaluation-tab-btn');

    test('says so when there are no players', async ({ page }) => {
        await page.goto('/');
        await openTab(page);

        await expect(page.locator('.evaluation-empty')).toContainText('No players added yet');
    });

    test('lists a row per player', async ({ page }) => {
        await rosterWith(page, ['Ana', 'Ben']);
        await openTab(page);

        await expect(page.locator('.evaluation-player-item')).toHaveCount(2);
    });

    test('shows "-" for an unrated player', async ({ page }) => {
        await rosterWith(page, ['Ana']);
        await openTab(page);

        // NaN matched no option, so this relied on '-' happening to be first
        await expect(page.locator('#rating-0')).toHaveValue('');
    });

    test('a saved rating comes back on re-render', async ({ page }) => {
        await rosterWith(page, ['Ana', 'Ben']);
        await openTab(page);

        await page.locator('#rating-0').selectOption('4');
        // Adding a player rebuilds the list
        await page.click('#roster-tab-btn');
        await page.fill('#playerName', 'Cleo');
        await page.click('#addPlayer');
        await openTab(page);

        await expect(page.locator('#rating-0')).toHaveValue('4');
    });

    test('a comment survives a re-render', async ({ page }) => {
        await rosterWith(page, ['Ana']);
        await openTab(page);

        await page.locator('#comment-0').fill('Strong in midfield');
        await page.locator('#comment-0').blur();
        await page.click('#roster-tab-btn');
        await openTab(page);

        await expect(page.locator('#comment-0')).toHaveValue('Strong in midfield');
    });

    test('each field names its player, not just "Rating"', async ({ page }) => {
        await rosterWith(page, ['Ana', 'Ben']);
        await openTab(page);

        await expect(page.locator('#rating-1')).toHaveAttribute('aria-label', 'Rating for Ben');
        await expect(page.locator('#comment-1')).toHaveAttribute('aria-label', 'Comments for Ben');
    });
});

test.describe('Player summary table', () => {
    async function generate(page) {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });
    }

    test('has a row per player under the lineup', async ({ page }) => {
        await generate(page);

        const rows = page.locator('.player-summary tbody tr');
        expect(await rows.count()).toBeGreaterThan(0);
    });

    test('never leaves a cell blank', async ({ page }) => {
        await generate(page);

        const empties = await page.evaluate(() =>
            [...document.querySelectorAll('.player-summary tbody td')]
                .filter(td => !td.querySelector('input') && td.textContent.trim() === '')
                .length);
        // A blank cell reads as missing data rather than as a zero
        expect(empties).toBe(0);
    });

    test('the rest toggle changes the player it names', async ({ page }) => {
        await generate(page);

        const firstRow = page.locator('.player-summary tbody tr').first();
        const name = await firstRow.locator('td').nth(2).innerText();
        await firstRow.locator('.rest-checkbox').check();

        const stored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('ayso_players') || '[]'));
        const player = stored.find(p => name.startsWith(p.name));
        expect(player.mustRest).toBe(true);
    });

    test('the checkboxes name their player as well as their setting', async ({ page }) => {
        await generate(page);

        const label = await page.locator('.player-summary .rest-checkbox').first()
            .getAttribute('aria-label');
        expect(label).toMatch(/^Must rest at least one quarter for .+/);
    });

    test('the column headers are scoped, so a row reads correctly', async ({ page }) => {
        await generate(page);

        const scoped = await page.evaluate(() =>
            [...document.querySelectorAll('.player-summary thead th')]
                .every(th => th.getAttribute('scope') === 'col'));
        expect(scoped).toBe(true);
    });
});
