// @ts-check
import { test, expect } from '@playwright/test';

/**
 * On a phone the quarters stack, and the Combined view drew each one twice —
 * the list, then a pitch showing the same players by shirt number alone — so
 * Quarter 1 started some 3,000px down the page. A phone starts on the list now,
 * the pitch is one tap away, and the coach's choice is kept.
 */
async function generate(page) {
    await page.goto('/');
    await page.click('#demoButton');
    await page.click('#generateLineup');
    await expect(page.locator('.quarter-lineup').first()).toBeVisible();
}

const viewButton = (page, name) => page.locator('#lineupDisplay').getByRole('button', { name, exact: true });

test.describe('Lineup view on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('starts on the list, without a second copy of each quarter as a pitch', async ({ page }) => {
        await generate(page);
        await expect(viewButton(page, 'Table Only')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.quarter-lineup table').first()).toBeVisible();
        await expect(page.locator('.soccer-field')).toHaveCount(0);
    });

    test('the pitch is one tap away, and the choice survives a reload', async ({ page }) => {
        await generate(page);
        await viewButton(page, 'Combined').click();
        await expect(page.locator('.soccer-field')).toHaveCount(4);

        // The lineup itself is kept across a refresh, so no regenerating here.
        await page.reload();
        await expect(page.locator('.quarter-lineup').first()).toBeVisible();
        await expect(viewButton(page, 'Combined')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.soccer-field')).toHaveCount(4);
    });
});

test.describe('Lineup view on a desktop', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('still starts Combined, where the quarters sit side by side', async ({ page }) => {
        await generate(page);
        await expect(viewButton(page, 'Combined')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.soccer-field')).toHaveCount(4);
    });
});
