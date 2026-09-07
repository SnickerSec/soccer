// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The roster, edited from the Season tab.
 *
 * The season is where a wrong name or a departed player is noticed, and the
 * dialog there renders the same RosterEditor the Lineup tab does, writing
 * through the same handlers — so what it changes is the roster itself, not a
 * copy of it.
 *
 * The ids are what keep the two mountings apart: both tab panels sit in the
 * DOM at once, so the dialog's controls are prefixed and the Lineup tab keeps
 * the bare ids the rest of the suite selects on.
 */

async function rosterWith(page, names) {
    await page.goto('/');
    for (const name of names) {
        await page.fill('#playerName', name);
        await page.click('#addPlayer');
    }
}

async function openSeasonRoster(page) {
    await page.click('#season-tab-btn');
    await page.click('#editRosterFromSeason');
    await expect(page.locator('#seasonRosterModal')).toBeVisible();
}

test.describe('Editing the roster from the Season tab', () => {
    test('the dialog opens over the Season tab', async ({ page }) => {
        await rosterWith(page, ['Ana']);
        await openSeasonRoster(page);

        await expect(page.locator('#seasonPlayerList li')).toHaveCount(1);
        // Still the Season tab underneath, not a trip to the Lineup tab.
        await expect(page.locator('#season-tab-btn')).toHaveAttribute('aria-selected', 'true');
    });

    test('a player added there is on the roster the Lineup tab shows', async ({ page }) => {
        await rosterWith(page, ['Ana']);
        await openSeasonRoster(page);

        await page.fill('#seasonPlayerName', 'Ben');
        await page.click('#seasonAddPlayer');
        await page.click('#seasonRosterDone');

        await page.click('#roster-tab-btn');
        await expect(page.locator('#playerList li')).toHaveCount(2);
        await expect(page.locator('#playerList li[aria-label*="Ben"]')).toHaveCount(1);
    });

    test('a player removed there is gone from the roster', async ({ page }) => {
        await rosterWith(page, ['Ana', 'Ben']);
        await openSeasonRoster(page);

        await page.locator('#seasonPlayerList li[aria-label*="Ben"] .remove-btn').click();
        await page.click('#seasonRosterDone');

        await page.click('#roster-tab-btn');
        await expect(page.locator('#playerList li')).toHaveCount(1);
        await expect(page.locator('#playerList li[aria-label*="Ben"]')).toHaveCount(0);
    });

    test('a rename there moves the name on the roster', async ({ page }) => {
        await rosterWith(page, ['Ana']);
        await openSeasonRoster(page);

        await page.locator('#seasonPlayerList li[aria-label*="Ana"] .player-rename').click();
        await page.locator('#seasonPlayerList .player-name-edit').fill('Anastasia');
        await page.locator('#seasonPlayerList .player-name-edit').press('Enter');
        await page.click('#seasonRosterDone');

        await page.click('#roster-tab-btn');
        await expect(page.locator('#playerList li[aria-label*="Anastasia"]')).toHaveCount(1);
    });

    test('the dialog does not duplicate the Lineup tab ids', async ({ page }) => {
        await rosterWith(page, ['Ana']);
        await openSeasonRoster(page);

        for (const id of ['#playerName', '#addPlayer', '#playerList']) {
            await expect(page.locator(id)).toHaveCount(1);
        }
    });
});
