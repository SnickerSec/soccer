// @ts-check
import { test, expect, devices } from '@playwright/test';

/*
 * A dialog whose content overflows has to be scrollable to the bottom.
 *
 * Every dialog here is `max-h-[90vh]` with no height of its own, so nothing in
 * the chain down to the scroll viewport has a *definite* height — and the
 * viewport's `h-full` was a percentage, which silently fell back to `auto`. It
 * grew to its full content height inside an `overflow-hidden` Root, so
 * scrollHeight equalled clientHeight and the content below the fold could not
 * be reached at all. In the edit-game dialog that was a 1434px viewport in a
 * 576px box, with the squad, the per-quarter lineup and the save button all
 * under it.
 *
 * The class-name check is not the test — the measurement is. This asserts the
 * box actually moves, so a future change to the primitive that looks right in
 * the source still fails here.
 */

async function saveAGame(page, name = 'vs Lions') {
    await page.click('#demoButton');
    await page.click('#generateLineup');
    await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });
    await page.locator('.action-buttons-inline [data-action="saveGame"]').click();
    await page.fill('#saveGameName', name);
    await page.fill('#saveGameDate', '2026-09-01');
    await page.click('#confirmSaveGame');
    await expect(page.locator('#saveGameModal')).toBeHidden();
}

/** Every scroll viewport on the page that is visible and actually overflows. */
function measureViewports(page) {
    return page.evaluate(() => {
        const out = [];
        for (const vp of document.querySelectorAll('[data-radix-scroll-area-viewport]')) {
            const box = vp.getBoundingClientRect();
            if (box.height === 0 && box.width === 0) continue;
            if (vp.scrollHeight <= vp.clientHeight + 1) continue;

            const start = vp.scrollTop;
            vp.scrollTop = 99999;
            const reached = vp.scrollTop;
            vp.scrollTop = start;

            out.push({
                height: Math.round(box.height),
                content: vp.scrollHeight,
                reached,
            });
        }
        return out;
    });
}

test.describe('Dialogs scroll to the bottom of their content', () => {
    test('the edit-game dialog scrolls on a phone', async ({ browser }) => {
        const context = await browser.newContext({ ...devices['iPhone 13'] });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await saveAGame(page);

        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="view-game"]').first().click();
        await expect(page.locator('#editGameModal')).toBeVisible();

        const viewports = await measureViewports(page);
        expect(viewports.length, 'the dialog should have an overflowing scroll area').toBeGreaterThan(0);

        for (const vp of viewports) {
            expect(
                vp.reached,
                `a ${vp.height}px viewport over ${vp.content}px of content did not scroll`
            ).toBeGreaterThan(0);
        }

        expect(errors).toEqual([]);
        await context.close();
    });

    /*
     * Overflow alone is not enough to test on. When the bug is present the
     * viewport *grows* instead of clipping, so it reports no overflow at all
     * and a search for overflowing containers comes back empty — which a loop
     * would pass trivially. What actually went wrong is containment: the
     * viewport escaped the dialog. So assert that directly.
     */
    test('a dialog never lets its scroll area grow past the dialog', async ({ page }) => {
        await page.goto('/');
        await saveAGame(page);

        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="view-game"]').first().click();
        await expect(page.locator('#editGameModal')).toBeVisible();

        const measured = await page.evaluate(() => {
            const dialog = document.querySelector('#editGameModal');
            const dialogHeight = dialog.getBoundingClientRect().height;
            return [...dialog.querySelectorAll('[data-radix-scroll-area-viewport]')]
                .map(vp => ({
                    dialogHeight: Math.round(dialogHeight),
                    viewportHeight: Math.round(vp.getBoundingClientRect().height),
                    content: vp.scrollHeight,
                }))
                .filter(m => m.viewportHeight > 0);
        });

        expect(measured.length, 'the dialog should contain a scroll area').toBeGreaterThan(0);

        for (const m of measured) {
            expect(
                m.viewportHeight,
                `a scroll area is ${m.viewportHeight}px inside a ${m.dialogHeight}px dialog `
                + `(${m.content}px of content) — it grew instead of scrolling`
            ).toBeLessThanOrEqual(m.dialogHeight);
        }
    });
});
