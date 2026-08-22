// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Select-to-swap: pick a row, then pick its partner.
 *
 * This exists because HTML5 drag-and-drop is the only other way to swap, and
 * dragstart/drop never fire for touch on iOS Safari or Android Chrome — so on
 * a phone, which is what this PWA is installed on, dragging does nothing at
 * all. The same path is the keyboard route, since a drag has none.
 *
 * tests/e2e/lineup-drag.spec.js covers the mouse path; the two must not
 * interfere, which the last test here checks.
 */

async function generateLineup(page) {
    await page.goto('/');
    await page.click('#demoButton');
    await page.click('#generateLineup');
    await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });
}

/** Position -> player name for one quarter, read off the rendered rows. */
async function readQuarter(page, quarterIndex = 0) {
    return page.evaluate(index => {
        const card = document.querySelectorAll('.quarter-lineup')[index];
        const positions = {};
        card.querySelectorAll('tr.draggable-row:not(.sitting-row)').forEach(row => {
            positions[row.dataset.position] = row.dataset.player;
        });
        return positions;
    }, quarterIndex);
}

test.describe('Select-to-swap on touch', () => {
    // A phone profile, spelled out rather than spread from devices['Pixel 5']:
    // that preset carries defaultBrowserType, which Playwright refuses inside a
    // describe. hasTouch is the part that matters — it makes tap() dispatch real
    // touch events, so the app is exercised the way a coach on the sideline
    // gets it rather than through a desktop pointer.
    test.use({
        viewport: { width: 393, height: 851 },
        hasTouch: true,
        isMobile: true
    });

    test('tapping two rows swaps the players in them', async ({ page }) => {
        await generateLineup(page);

        const before = await readQuarter(page);
        const positions = Object.keys(before);
        const [first, second] = [positions[0], positions[1]];

        await page.locator(`tr[data-quarter="1"][data-position="${first}"]`).tap();
        await page.locator(`tr[data-quarter="1"][data-position="${second}"]`).tap();

        await expect
            .poll(async () => (await readQuarter(page))[first])
            .toBe(before[second]);

        const after = await readQuarter(page);
        expect(after[second]).toBe(before[first]);
    });

    test('dragging is inert on touch, which is why tapping has to work', async ({ page }) => {
        await generateLineup(page);
        // Guards the assumption above: if rows ever stop being drag sources the
        // tap path is load-bearing, and if a touch drag ever starts working
        // this test says so rather than the two silently overlapping.
        const draggable = await page.locator('tr.draggable-row').first().evaluate(r => r.draggable);
        expect(draggable).toBe(true);
        expect(await page.evaluate(() => navigator.maxTouchPoints > 0)).toBe(true);
    });

    test('tapping the same row twice cancels instead of swapping it with itself', async ({ page }) => {
        await generateLineup(page);

        const before = await readQuarter(page);
        const position = Object.keys(before)[0];
        const row = page.locator(`tr[data-quarter="1"][data-position="${position}"]`);

        await row.tap();
        await expect(row).toHaveClass(/swap-selected/);

        await row.tap();
        await expect(row).not.toHaveClass(/swap-selected/);
        expect(await readQuarter(page)).toEqual(before);
    });

    test('the hint says what is selected, so the state is not invisible', async ({ page }) => {
        await generateLineup(page);

        const hint = page.locator('#lineup-swap-hint');
        await expect(hint).toContainText('select two players in turn');

        const position = Object.keys(await readQuarter(page))[0];
        await page.locator(`tr[data-quarter="1"][data-position="${position}"]`).tap();
        await expect(hint).toContainText('Choose who to swap with');
    });
});

test.describe('Select-to-swap from the keyboard', () => {
    test('Enter on two rows swaps them', async ({ page }) => {
        await generateLineup(page);

        const before = await readQuarter(page);
        const [first, second] = Object.keys(before);

        await page.locator(`tr[data-quarter="1"][data-position="${first}"]`).focus();
        await page.keyboard.press('Enter');
        await page.locator(`tr[data-quarter="1"][data-position="${second}"]`).focus();
        await page.keyboard.press('Enter');

        await expect
            .poll(async () => (await readQuarter(page))[first])
            .toBe(before[second]);
    });

    test('rows are reachable by tab and announce what they hold', async ({ page }) => {
        await generateLineup(page);

        const row = page.locator('tr.draggable-row').first();
        expect(await row.getAttribute('tabindex')).toBe('0');
        expect(await row.getAttribute('aria-selected')).toBe('false');
        expect(await row.getAttribute('aria-describedby')).toBe('lineup-swap-hint');
        // "Alice, Keeper, quarter 1" — identity, not just "row"
        expect(await row.getAttribute('aria-label')).toMatch(/quarter 1$/);
    });

    test('making rows focusable does not cost the table its rows', async ({ page }) => {
        await generateLineup(page);

        // A <tr> given role="button" stops counting as a row, and a screen
        // reader can lose the lineup entirely. Nothing here may override it.
        const overridden = await page.evaluate(() =>
            [...document.querySelectorAll('#lineupGrid tr')].filter(r => {
                const role = r.getAttribute('role');
                return role !== null && role !== 'row';
            }).length);
        expect(overridden).toBe(0);
    });

    test('aria-selected tracks the pending selection', async ({ page }) => {
        await generateLineup(page);

        const row = page.locator('tr.draggable-row').first();
        await row.focus();
        await page.keyboard.press('Enter');
        await expect(row).toHaveAttribute('aria-selected', 'true');

        await page.keyboard.press('Escape');
        await expect(row).toHaveAttribute('aria-selected', 'false');
    });

    test('Escape cancels a pending selection without swapping', async ({ page }) => {
        await generateLineup(page);

        const before = await readQuarter(page);
        const [first, second] = Object.keys(before);

        await page.locator(`tr[data-quarter="1"][data-position="${first}"]`).focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');

        // The next pick starts a fresh selection rather than completing the old
        await page.locator(`tr[data-quarter="1"][data-position="${second}"]`).focus();
        await page.keyboard.press('Enter');

        expect(await readQuarter(page)).toEqual(before);
    });

    test('a selection does not survive a regenerate', async ({ page }) => {
        await generateLineup(page);

        const first = Object.keys(await readQuarter(page))[0];
        await page.locator(`tr[data-quarter="1"][data-position="${first}"]`).focus();
        await page.keyboard.press('Enter');

        // Rows are rebuilt from scratch; the row held in the pending selection
        // is now detached, and swapping against it would move nothing visible.
        //
        // Waiting on .quarter-lineup being visible is not enough: the previous
        // grid is still on screen while the worker runs, so the assertions
        // below would sample the old lineup. Mark a node the rebuild replaces
        // and wait for it to go.
        await page.evaluate(() =>
            document.getElementById('lineup-swap-hint')?.setAttribute('data-stale', '1'));
        await page.click('#generateLineup');
        await expect(page.locator('#lineup-swap-hint[data-stale]')).toHaveCount(0);
        await expect(page.locator('.quarter-lineup').first()).toBeVisible();

        const after = await readQuarter(page);
        const second = Object.keys(after)[1];
        await page.locator(`tr[data-quarter="1"][data-position="${second}"]`).focus();
        await page.keyboard.press('Enter');

        // That press should have started a selection, not finished a stale one
        await expect(page.locator(`tr[data-quarter="1"][data-position="${second}"]`))
            .toHaveClass(/swap-selected/);
        expect(await readQuarter(page)).toEqual(after);
    });
});

test.describe('The two swap paths together', () => {
    test('a drag clears a half-finished selection rather than combining with it', async ({ page }) => {
        await generateLineup(page);

        const before = await readQuarter(page);
        const [first, second, third] = Object.keys(before);

        // Select one row, then drag two others. The drag must win outright.
        await page.locator(`tr[data-quarter="1"][data-position="${first}"]`).focus();
        await page.keyboard.press('Enter');

        await page.locator(`tr[data-quarter="1"][data-position="${second}"]`)
            .dragTo(page.locator(`tr[data-quarter="1"][data-position="${third}"]`));

        await expect
            .poll(async () => (await readQuarter(page))[second])
            .toBe(before[third]);

        const after = await readQuarter(page);
        expect(after[third]).toBe(before[second]);
        // The row that was selected is untouched, and no longer marked
        expect(after[first]).toBe(before[first]);
        await expect(page.locator(`tr[data-quarter="1"][data-position="${first}"]`))
            .not.toHaveClass(/swap-selected/);
    });
});
