// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Mobile Sideline Quarter Navigation', () => {
    test.use({ viewport: { width: 375, height: 667 } });

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

        // Tap Next Quarter button
        const nextBtn = page.getByRole('button', { name: 'Next Quarter' });
        await expect(nextBtn).toBeVisible();
        await nextBtn.click();

        // Verify Quarter 2 card is now visible
        await expect(page.getByRole('heading', { name: 'Quarter 2', exact: true })).toBeVisible();

        // Tap All to restore all quarters
        const allBtn = page.getByRole('button', { name: 'All', exact: true }).first();
        await allBtn.click();
        await expect(page.getByRole('heading', { name: 'Quarter 1', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Quarter 2', exact: true })).toBeVisible();

        expect(errors).toEqual([]);
    });
});
