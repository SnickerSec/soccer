// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The star-rating dialog.
 *
 * Ratings feed the generator's strength balancing, so what is saved here
 * changes who plays where. The dialog is rebuilt from scratch each time it
 * opens, so what it shows has to come from the player rather than from
 * whatever the last open left behind.
 */

async function openRatings(page, name) {
    await page.goto('/');
    await page.fill('#playerName', name);
    await page.click('#addPlayer');
    await page.locator(`#playerList li[aria-label*="${name}"] .player-rating-btn`).click();
    await expect(page.locator('dialog.rating-dialog')).toBeVisible();
}

const stars = (page, category) => page.locator(`.rating-stars[data-category="${category}"] .rating-star`);

const storedPlayer = (page, name) => page.evaluate((n) =>
    JSON.parse(localStorage.getItem('ayso_players') || '[]').find(p => p.name === n), name);

test.describe('Player ratings', () => {
    test('saving an overall rating stores it', async ({ page }) => {
        await openRatings(page, 'Ana');

        await stars(page, 'overall').nth(3).click();   // four stars
        await page.locator('.rating-dialog-buttons button', { hasText: 'Save' }).click();

        expect((await storedPlayer(page, 'Ana')).overallRating).toBe(4);
    });

    test('an unrated position is left out rather than stored as zero', async ({ page }) => {
        await openRatings(page, 'Ana');

        await stars(page, 'keeper').nth(2).click();
        await page.locator('.rating-dialog-buttons button', { hasText: 'Save' }).click();

        const player = await storedPlayer(page, 'Ana');
        expect(player.positionalRatings).toEqual({ keeper: 3 });
    });

    test('an unset overall is stored as null, not zero', async ({ page }) => {
        await openRatings(page, 'Ana');

        await stars(page, 'defense').nth(1).click();
        await page.locator('.rating-dialog-buttons button', { hasText: 'Save' }).click();

        // 0 would read to the generator as the weakest player on the roster
        expect((await storedPlayer(page, 'Ana')).overallRating).toBeNull();
    });

    test('clicking the same star again clears that rating', async ({ page }) => {
        await openRatings(page, 'Ana');

        await stars(page, 'overall').nth(2).click();
        await stars(page, 'overall').nth(2).click();
        await page.locator('.rating-dialog-buttons button', { hasText: 'Save' }).click();

        expect((await storedPlayer(page, 'Ana')).overallRating).toBeNull();
    });

    test('Clear All empties every row', async ({ page }) => {
        await openRatings(page, 'Ana');

        await stars(page, 'overall').nth(4).click();
        await stars(page, 'keeper').nth(4).click();
        await page.locator('.rating-dialog-buttons button', { hasText: 'Clear All' }).click();
        await page.locator('.rating-dialog-buttons button', { hasText: 'Save' }).click();

        const player = await storedPlayer(page, 'Ana');
        expect(player.overallRating).toBeNull();
        expect(player.positionalRatings).toEqual({});
    });

    test('Cancel keeps what was there before', async ({ page }) => {
        await openRatings(page, 'Ana');
        await stars(page, 'overall').nth(3).click();
        await page.locator('.rating-dialog-buttons button', { hasText: 'Save' }).click();

        await page.locator('#playerList li[aria-label*="Ana"] .player-rating-btn').click();
        await stars(page, 'overall').nth(0).click();
        await page.locator('.rating-dialog-buttons button', { hasText: 'Cancel' }).click();

        expect((await storedPlayer(page, 'Ana')).overallRating).toBe(4);
    });

    test('reopening shows what was saved, not a blank form', async ({ page }) => {
        await openRatings(page, 'Ana');
        await stars(page, 'overall').nth(3).click();
        await page.locator('.rating-dialog-buttons button', { hasText: 'Save' }).click();

        await page.locator('#playerList li[aria-label*="Ana"] .player-rating-btn').click();

        await expect(stars(page, 'overall').nth(3)).toHaveClass(/filled/);
        await expect(stars(page, 'overall').nth(4)).not.toHaveClass(/filled/);
    });

    test('each star says which one it is, rather than five identical stars', async ({ page }) => {
        await openRatings(page, 'Ana');

        // Without a name per star a screen reader reads "★" five times a row
        // and gives no way to tell which is being pressed
        await expect(stars(page, 'keeper').nth(0))
            .toHaveAttribute('aria-label', '1 of 5, Goalkeeper');
        await expect(stars(page, 'keeper').nth(4))
            .toHaveAttribute('aria-label', '5 of 5, Goalkeeper');
    });

    test('a star reports whether it is set', async ({ page }) => {
        await openRatings(page, 'Ana');

        await expect(stars(page, 'overall').nth(0)).toHaveAttribute('aria-pressed', 'false');
        await stars(page, 'overall').nth(2).click();
        await expect(stars(page, 'overall').nth(0)).toHaveAttribute('aria-pressed', 'true');
        await expect(stars(page, 'overall').nth(4)).toHaveAttribute('aria-pressed', 'false');
    });

    test('the rating button shows the saved score afterwards', async ({ page }) => {
        await openRatings(page, 'Ana');
        await stars(page, 'overall').nth(3).click();
        await page.locator('.rating-dialog-buttons button', { hasText: 'Save' }).click();

        await expect(page.locator('#playerList li[aria-label*="Ana"] .player-rating-btn'))
            .toHaveText('4');
    });
});
