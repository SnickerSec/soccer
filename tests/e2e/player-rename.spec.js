// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Renaming a player from the roster row.
 *
 * A player is identified by name throughout the app — the season table keys on
 * it, and a saved game records the name rather than an id. So the thing worth
 * checking through the browser is not that the roster label changed, but that
 * the player is still one player afterwards: renaming the roster alone would
 * leave a renamed entry with no games beside an orphan holding all of them.
 */

const row = (page, name) => page.locator(`#playerList li[aria-label*="${name}"]`);

async function rosterWith(page, names) {
    await page.goto('/');
    for (const name of names) {
        await page.fill('#playerName', name);
        await page.click('#addPlayer');
    }
}

/** Renames through the row's pencil button and the input it opens. */
async function renameTo(page, from, to) {
    await row(page, from).locator('.player-rename').click();
    const input = row(page, from).locator('.player-name-edit');
    await expect(input).toBeVisible();
    await input.fill(to);
    await input.press('Enter');
}

test.describe('Renaming a player', () => {
    test('the row offers a rename that names the player it belongs to', async ({ page }) => {
        await rosterWith(page, ['Ana', 'Bo']);

        await expect(row(page, 'Ana').locator('.player-rename'))
            .toHaveAttribute('aria-label', 'Rename Ana');
        await expect(row(page, 'Bo').locator('.player-rename'))
            .toHaveAttribute('aria-label', 'Rename Bo');
    });

    test('the new name replaces the old one on the roster', async ({ page }) => {
        await rosterWith(page, ['Ana', 'Bo']);

        await renameTo(page, 'Ana', 'Anastasia');

        // Compared exactly: 'Ana' is a substring of 'Anastasia', so a text
        // check would pass whether the old name went away or not
        const labels = await page.locator('#playerList .player-rename').evaluateAll(
            (els) => els.map((el) => el.getAttribute('aria-label'))
        );
        expect(labels).toEqual(['Rename Anastasia', 'Rename Bo']);
    });

    test('Escape leaves the name as it was', async ({ page }) => {
        await rosterWith(page, ['Ana']);

        await row(page, 'Ana').locator('.player-rename').click();
        const input = row(page, 'Ana').locator('.player-name-edit');
        await input.fill('Anastasia');
        await input.press('Escape');

        await expect(page.locator('#playerList')).toContainText('Ana');
        await expect(page.locator('#playerList')).not.toContainText('Anastasia');
    });

    test('refuses a name another player already holds', async ({ page }) => {
        await rosterWith(page, ['Ana', 'Bo']);

        await renameTo(page, 'Ana', 'Bo');

        // Both keep their names, and the coach is told why
        await expect(page.locator('#playerList li')).toHaveCount(2);
        await expect(page.locator('#playerList')).toContainText('Ana');
        await expect(page.getByText(/already exists/i)).toBeVisible();
    });

    test('an empty name is not a rename', async ({ page }) => {
        await rosterWith(page, ['Ana']);

        await row(page, 'Ana').locator('.player-rename').click();
        const input = row(page, 'Ana').locator('.player-name-edit');
        await input.fill('   ');
        await input.press('Enter');

        await expect(page.locator('#playerList')).toContainText('Ana');
    });

    test('the renamed player keeps their season history and gains no twin', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });

        await page.locator('.action-buttons-inline [data-action="saveGame"]').click();
        await page.fill('#saveGameName', 'vs Tigers');
        await page.click('#confirmSaveGame');
        await expect(page.locator('#saveGameModal')).toBeHidden();

        // Whoever the demo roster put first — the rename has to work on a real
        // saved game, not on a name chosen to be easy
        await page.click('#roster-tab-btn');
        const original = (await page.locator('#playerList li').first().getAttribute('aria-label')) || '';
        const name = original.replace(/^.*?for /, '').split(',')[0].trim() || original.trim();

        await page.click('#season-tab-btn');
        const rowsBefore = await page.locator('#playerStatsTable tbody tr').count();

        await page.click('#roster-tab-btn');
        await renameTo(page, name, 'Renamed Player');

        await page.click('#season-tab-btn');
        const table = page.locator('#playerStatsTable');
        await expect(table).toContainText('Renamed Player');
        await expect(table).not.toContainText(name);
        // No orphan row left behind holding the old name's games
        await expect(page.locator('#playerStatsTable tbody tr')).toHaveCount(rowsBefore);
        await expect(page.locator('#totalGames')).toHaveText('1');
    });

    test('the rename survives a reload', async ({ page }) => {
        await rosterWith(page, ['Ana', 'Bo']);
        await renameTo(page, 'Ana', 'Anastasia');

        await page.reload();

        await expect(page.locator('#playerList')).toContainText('Anastasia');
        await expect(page.locator('#playerList li')).toHaveCount(2);
    });
});
