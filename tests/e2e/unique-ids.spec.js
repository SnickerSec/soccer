// @ts-check
import { test, expect } from '@playwright/test';

/**
 * No two elements share an id.
 *
 * The action bar above the lineup is cloned from the static markup in
 * index.html, and cloneNode copies the id — so #shareLineup and #saveGame each
 * matched two elements. getElementById returns whichever comes first, and the
 * clone comes first, since the bar is inserted above the markup it was cloned
 * from. The startup wiring happened to run before any lineup existed and so
 * always found the original, but nothing enforced that.
 *
 * A duplicate id does not throw. It picks the wrong element, and only
 * sometimes.
 */

/** Every id in the document that more than one element claims. */
function duplicateIds(page) {
    return page.evaluate(() => {
        const seen = new Map();
        for (const element of document.querySelectorAll('[id]')) {
            seen.set(element.id, (seen.get(element.id) || 0) + 1);
        }
        return [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    });
}

test.describe('Element ids', () => {
    test('are unique on a fresh page', async ({ page }) => {
        await page.goto('/');
        expect(await duplicateIds(page)).toEqual([]);
    });

    test('are unique once a lineup is on screen', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });

        expect(await duplicateIds(page)).toEqual([]);
    });

    test('stay unique after the lineup is regenerated', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });

        // The bar is rebuilt each time; a clone left behind would accumulate
        await page.locator('[data-action="regenerateLineup"]').click();
        await expect(page.locator('.quarter-lineup').first()).toBeVisible();

        expect(await duplicateIds(page)).toEqual([]);
    });

    test('the cloned buttons are still reachable, by data-action', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });

        for (const action of ['copyLineup', 'shareLineup', 'exportCSV', 'exportLineup', 'printLineup', 'saveGame']) {
            await expect(page.locator(`.action-buttons-inline [data-action="${action}"]`))
                .toHaveCount(1);
        }
    });
});
