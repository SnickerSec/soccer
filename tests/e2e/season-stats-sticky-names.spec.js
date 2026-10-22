// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The Player Statistics table is ten columns wide, about twice a phone's
 * width. Its name column scrolled away with the rest, so a coach who swiped
 * across to GK or Sit was reading a column of numbers that belonged to nobody.
 */
test.describe('Season stats on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the player names stay in view when the table is scrolled sideways', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await page.locator('button[role="tab"]').filter({ hasText: 'Season' }).click();

        const table = page.locator('#playerStatsTable table');
        await expect(table).toBeVisible();
        const scroller = table.locator('xpath=..');
        const { scrollWidth, clientWidth } = await scroller.evaluate(el => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
        }));
        // If the table ever fits, there is nothing to pin and this test proves nothing.
        expect(scrollWidth).toBeGreaterThan(clientWidth);

        const firstName = table.locator('tbody tr').first().locator('td').first();
        const header = table.locator('thead th').first();
        await firstName.scrollIntoViewIfNeeded();
        const before = await firstName.boundingBox();

        await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth; });

        const scrollerBox = await scroller.boundingBox();
        for (const cell of [firstName, header]) {
            const box = await cell.boundingBox();
            expect(box.x).toBeCloseTo(before.x, 0);
            expect(box.x).toBeGreaterThanOrEqual(scrollerBox.x);
        }

        // Pinned is not enough if the numbers show through it.
        const bg = await firstName.evaluate(el => getComputedStyle(el).backgroundColor);
        expect(bg).not.toBe('rgba(0, 0, 0, 0)');
        // And the name is the thing on top at that spot, not the cell sliding under it.
        const after = await firstName.boundingBox();
        const topmost = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('td')?.textContent,
            { x: after.x + 4, y: after.y + after.height / 2 });
        expect(topmost).toBe(await firstName.textContent());
    });
});
