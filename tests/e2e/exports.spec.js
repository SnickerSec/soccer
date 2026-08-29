// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The files the export buttons hand the browser.
 *
 * downloadTextFile takes (filename, text). All four callers passed
 * (text, filename), so every export downloaded a file named after its own
 * contents, containing the filename. Nothing threw and no unit test covered
 * the call sites, so it survived the React migration untouched — this is the
 * level it shows up at, because the filename only exists once a real browser
 * has been handed the blob.
 */

/** Generates a lineup so the export buttons are on screen. */
async function withLineup(page) {
    await page.goto('/');
    await page.click('#demoButton');
    await page.click('#generateLineup');
    await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });
}

/** Clicks something that downloads, and reads back what arrived. */
async function download(page, click) {
    const started = page.waitForEvent('download');
    await click();
    const file = await started;
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return { name: file.suggestedFilename(), body: Buffer.concat(chunks).toString('utf8') };
}

test.describe('Exports', () => {
    /**
     * Copy shares the same defect and the same fix: it called
     * lineupClipboardText(lineup, {teamName, captains}) where the helper takes
     * (quarters, players, formation), so it threw on lineup.quarters being
     * undefined and nothing reached the clipboard.
     */
    test('copy puts the lineup on the clipboard', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await withLineup(page);

        await page.locator('.action-buttons-inline [data-action="copyLineup"]').click();
        const copied = await page.evaluate(() => navigator.clipboard.readText());

        expect(copied).toContain('AYSO Lineup');
        expect(copied).toMatch(/Quarter 1/);
        expect(copied).toContain('Keeper:');
    });

    test('the roster downloads as a named text file holding the roster', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');

        const file = await download(page, () => page.click('#exportPlayers'));

        expect(file.name).toMatch(/\.txt$/);
        expect(file.name).not.toContain('\n');
        expect(file.body).not.toMatch(/\.txt$/);
        expect(file.body.length).toBeGreaterThan(file.name.length);
    });

    test('the lineup CSV is named .csv and contains the quarters', async ({ page }) => {
        await withLineup(page);

        const file = await download(page, () =>
            page.locator('.action-buttons-inline [data-action="exportCSV"]').click()
        );

        expect(file.name).toMatch(/\.csv$/);
        expect(file.body).toContain('Quarter 1');
        expect(file.body).toContain('Position');
    });

    test('the lineup text export is named .txt and contains the lineup', async ({ page }) => {
        await withLineup(page);

        const file = await download(page, () =>
            page.locator('.action-buttons-inline [data-action="exportLineup"]').click()
        );

        expect(file.name).toMatch(/\.txt$/);
        expect(file.body).toMatch(/Quarter 1/i);
    });

    /**
     * The season CSV was doubly broken: the arguments were swapped like the
     * rest, and it built its rows from the game history passed where the roster
     * belonged, so every row named a game and held zeros.
     */
    test('the season stats CSV names players and carries their totals', async ({ page }) => {
        await withLineup(page);
        await page.locator('.action-buttons-inline [data-action="saveGame"]').click();
        await page.fill('#saveGameName', 'vs Tigers');
        await page.click('#confirmSaveGame');
        await expect(page.locator('#saveGameModal')).toBeHidden();

        await page.click('#roster-tab-btn');
        const first = (await page.locator('#playerList li').first().getAttribute('aria-label')) || '';
        const player = first.replace(/^.*?for /, '').split(',')[0].trim();

        await page.click('#season-tab-btn');
        const file = await download(page, () => page.click('#exportSeasonStats'));

        expect(file.name).toMatch(/\.csv$/);
        expect(file.body).toContain('Player');
        // A player, not the game they played in
        expect(file.body).not.toContain('vs Tigers');
        const row = file.body.split('\n').find((line) => line.includes(player));
        expect(row).toBeTruthy();

        // ...and their games actually counted, rather than the zeros the
        // mismatched field names used to produce
        const [, gamesPlayed, quartersPlayed] = row.split(',').map((c) => c.replace(/"/g, ''));
        expect(gamesPlayed).toBe('1');
        expect(Number(quartersPlayed)).toBeGreaterThan(0);
    });
});
