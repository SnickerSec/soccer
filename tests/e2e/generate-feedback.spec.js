// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Generate runs the engine on the main thread. It used to run in the same
 * tick as the click, so the "Generating..." state was set and cleared before
 * React could paint it — on a phone the button looked dead for most of a
 * second — and a second tap queued a whole second run, which drew the captains
 * again and replaced the lineup just shown.
 */

async function loadDemo(page) {
    await page.goto('/');
    await page.click('#demoButton');
    await expect(page.locator('#playerList .player-status-select').first()).toBeVisible();
}

test.describe('Generate lineup feedback', () => {
    test('shows that it is generating before the lineup arrives', async ({ page }) => {
        await loadDemo(page);
        await page.evaluate(() => {
            window.__sawGenerating = false;
            const button = document.getElementById('generateLineup');
            new MutationObserver(() => {
                if (button?.textContent?.includes('Generating') && button.disabled) window.__sawGenerating = true;
            }).observe(button, { subtree: true, childList: true, characterData: true, attributes: true });
        });

        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });

        expect(await page.evaluate(() => window.__sawGenerating)).toBe(true);
        await expect(page.locator('#generateLineup')).toBeEnabled();
        await expect(page.locator('#generateLineup')).toContainText('Generate Lineup');
    });

    test('a double tap generates once', async ({ page }) => {
        await loadDemo(page);

        // Both clicks in one task, as a double tap lands before React can
        // re-render the button disabled.
        await page.evaluate(() => {
            const button = document.getElementById('generateLineup');
            button?.click();
            button?.click();
        });
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });

        await expect(page.getByText('Generated lineup!')).toHaveCount(1);
    });
    test('on a phone, Generate brings the lineup into view', async ({ page }) => {
        // The roster and Game Settings sit between the button and the lineup,
        // so a tap that worked used to leave the coach looking at a toast with
        // the lineup two screens further down.
        await page.setViewportSize({ width: 390, height: 844 });
        await loadDemo(page);
        await page.locator('#generateLineup').scrollIntoViewIfNeeded();
        await expect(page.locator('#lineupDisplay h2')).not.toBeInViewport();

        await page.click('#generateLineup');

        await expect(page.locator('#lineupDisplay h2')).toBeInViewport({ timeout: 20000 });
    });

    test('a lineup nobody asked to see does not move the page', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await loadDemo(page);
        await page.click('#generateLineup');
        await expect(page.locator('#lineupDisplay h2')).toBeInViewport({ timeout: 20000 });

        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.locator('body').click({ position: { x: 1, y: 1 } });
        await page.keyboard.press('Control+g');
        await expect(page.getByText('Generated lineup!')).toHaveCount(2, { timeout: 20000 });

        expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
});
