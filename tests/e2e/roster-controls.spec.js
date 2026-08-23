// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The controls on a roster row.
 *
 * Every one of them works by delegation: the handler reads dataset.player,
 * dataset.pref or dataset.index off whatever was clicked. That makes the
 * dataset the contract between drawing a row and it doing anything, and a
 * dropped attribute does not throw — the control just stops working.
 */

async function rosterWith(page, names) {
    await page.goto('/');
    for (const name of names) {
        await page.fill('#playerName', name);
        await page.click('#addPlayer');
    }
}

const row = (page, name) => page.locator(`#playerList li[aria-label*="${name}"]`);

test.describe('Roster row controls', () => {
    test('a row carries the dataset every handler reads', async ({ page }) => {
        await rosterWith(page, ['Ana']);

        const dataset = await page.evaluate(() => {
            const item = document.querySelector('#playerList li');
            return {
                captain: item.querySelector('.captain-checkbox')?.dataset.player,
                number: item.querySelector('.player-number-edit')?.dataset.index,
                noKeeper: item.querySelector('.no-keeper')?.dataset.pref,
                mustRest: item.querySelector('.must-rest')?.dataset.pref,
                rating: item.querySelector('.player-rating-btn')?.dataset.pref,
                status: item.querySelector('.player-status-select')?.dataset.player,
                remove: item.querySelector('.remove-btn')?.dataset.player
            };
        });

        expect(dataset).toEqual({
            captain: 'Ana', number: '0', noKeeper: 'noKeeper', mustRest: 'mustRest',
            rating: 'rating', status: 'Ana', remove: 'Ana'
        });
    });

    test('the no-keeper toggle sticks', async ({ page }) => {
        await rosterWith(page, ['Ana']);
        const button = row(page, 'Ana').locator('.no-keeper');

        await button.click();
        await expect(button).toHaveClass(/active/);
        await expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    test('the must-rest toggle sticks', async ({ page }) => {
        await rosterWith(page, ['Ana']);
        const button = row(page, 'Ana').locator('.must-rest');

        await button.click();
        await expect(button).toHaveClass(/active/);
        await expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    test('a toggle reports false rather than undefined before it is used', async ({ page }) => {
        await rosterWith(page, ['Ana']);

        await expect(row(page, 'Ana').locator('.no-keeper'))
            .toHaveAttribute('aria-pressed', 'false');
    });

    test('the rating button announces the dialog it opens, not a pressed state', async ({ page }) => {
        await rosterWith(page, ['Ana']);
        const button = row(page, 'Ana').locator('.player-rating-btn');

        await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
        expect(await button.getAttribute('aria-pressed')).toBeNull();

        await button.click();
        await expect(page.locator('dialog[open]')).toBeVisible();
    });

    test('changing status recolours the row', async ({ page }) => {
        await rosterWith(page, ['Ana']);
        const select = row(page, 'Ana').locator('.player-status-select');

        await select.selectOption('injured');
        await expect(select).toHaveClass(/status-injured/);
    });

    test('marking a captain shows the star', async ({ page }) => {
        await rosterWith(page, ['Ana']);

        await row(page, 'Ana').locator('.captain-checkbox').check();

        await expect(row(page, 'Ana').locator('.captain-star')).toBeVisible();
    });

    test('the shirt number saves against the right player', async ({ page }) => {
        await rosterWith(page, ['Ana', 'Ben']);

        await row(page, 'Ben').locator('.player-number-edit').fill('7');
        await row(page, 'Ben').locator('.player-number-edit').blur();

        const stored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('ayso_players') || '[]'));
        expect(stored.find(p => p.name === 'Ben').number).toBe(7);
        expect(stored.find(p => p.name === 'Ana').number).toBeFalsy();
    });

    test('remove takes out the player it names', async ({ page }) => {
        await rosterWith(page, ['Ana', 'Ben']);

        await row(page, 'Ana').locator('.remove-btn').click();

        await expect(row(page, 'Ana')).toHaveCount(0);
        await expect(row(page, 'Ben')).toHaveCount(1);
    });
});
