// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Mobile Sideline Quarter Navigation', () => {
    // hasTouch, because the quarter chips are now the only buttons here: the
    // prev/next chevrons that used to bracket them pushed the row 8px past a
    // 390px screen, and swiping the grid is what stepping one at a time is
    // for. A test named for touch gestures should perform one.
    test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

    test('renders mobile quarter switcher, switches active quarters and responds to touch gestures', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');

        // On mobile, the mobile quarter toolbar should be visible
        const q1Btn = page.getByRole('button', { name: 'Q1', exact: true }).first();
        await expect(q1Btn).toBeVisible();

        // Tap Q1 to filter to Quarter 1
        await q1Btn.click();

        // Verify Quarter 1 card is visible
        await expect(page.getByRole('heading', { name: 'Quarter 1', exact: true })).toBeVisible();

        // Swipe left across the grid to step to the next quarter. The handler
        // wants more than 45px of travel, and more horizontal than vertical.
        await page.locator('#lineupGrid').evaluate((grid) => {
            const box = grid.getBoundingClientRect();
            const y = box.top + Math.min(box.height, 400) / 2;
            const touch = (x) => new Touch({
                identifier: 1, target: grid, clientX: x, clientY: y,
            });
            const from = touch(box.right - 40);
            const to = touch(box.left + 20);
            grid.dispatchEvent(new TouchEvent('touchstart', {
                bubbles: true, touches: [from], changedTouches: [from],
            }));
            grid.dispatchEvent(new TouchEvent('touchend', {
                bubbles: true, touches: [], changedTouches: [to],
            }));
        });

        // Verify Quarter 2 card is now visible
        await expect(page.getByRole('heading', { name: 'Quarter 2', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Quarter 1', exact: true })).toBeHidden();

        // And the chips themselves pick a quarter in one tap from anywhere
        await page.getByRole('button', { name: 'Q4', exact: true }).first().click();
        await expect(page.getByRole('heading', { name: 'Quarter 4', exact: true })).toBeVisible();

        // Tap All to restore all quarters
        const allBtn = page.getByRole('button', { name: 'All', exact: true }).first();
        await allBtn.click();
        await expect(page.getByRole('heading', { name: 'Quarter 1', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Quarter 2', exact: true })).toBeVisible();

        expect(errors).toEqual([]);
    });
});
