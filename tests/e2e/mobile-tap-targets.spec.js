// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The app is used one-handed, outdoors, during a game. Before the touch
 * ergonomics block in index.css, every interactive control on the two screens
 * a coach uses at the touchline was under the 44px minimum — 0 of 141 on the
 * lineup screen, 0 of 158 on Live Matchday, with the rotation-rule checkboxes
 * at 14x14. This is what stops that coming back.
 *
 * Inline links are deliberately not covered: a link inside a sentence is not a
 * tap target, and padding one to 44px breaks the prose around it.
 */

const MIN_TAP = 44;
const CONTROLS = 'button, [role="button"], select, textarea, input:not([type="checkbox"]):not([type="radio"])';

/** Every visible control that is shorter than the minimum, with a name to identify it. */
async function undersized(page) {
    return page.$$eval(
        'button, [role="button"], select, textarea, input:not([type="checkbox"]):not([type="radio"])',
        (els, min) =>
            els
                .filter((el) => el.offsetParent !== null)
                // offsetHeight rather than a bounding rect: a dialog animates
                // in with zoom-in-95, and a transformed rect reports 95% of the
                // real size, so the check would flake on whatever it caught
                // mid-animation. Layout size is what the finger meets at rest.
                .map((el) => ({
                    height: el.offsetHeight,
                    width: el.offsetWidth,
                    name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
                }))
                .filter((box) => box.height > 0 && box.height < min),
        MIN_TAP
    );
}

test.describe('Mobile tap targets', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('every control on the lineup and matchday screens is at least 44px tall', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));

        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');

        expect(await undersized(page)).toEqual([]);

        // The rotation-rule checkboxes stay visually small; the label around
        // each one is what the coach actually taps.
        const restBox = await page.locator('label:has(.rest-checkbox)').first().boundingBox();
        expect(restBox?.height).toBeGreaterThanOrEqual(MIN_TAP);
        expect(restBox?.width).toBeGreaterThanOrEqual(MIN_TAP);

        const keeperBox = await page.locator('label:has(.no-keeper-checkbox)').first().boundingBox();
        expect(keeperBox?.height).toBeGreaterThanOrEqual(MIN_TAP);
        expect(keeperBox?.width).toBeGreaterThanOrEqual(MIN_TAP);

        // Live Matchday — the screen open while a game is actually running.
        await page.click('#openMatchday');
        await expect(page.locator('[role="dialog"]')).toBeVisible();
        expect(await undersized(page)).toEqual([]);

        expect(errors).toEqual([]);
    });

    test('the page never scrolls sideways', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');

        const overflows = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        expect(overflows).toBe(false);
    });

    test('inputs are at least 16px so mobile Safari does not zoom on focus', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');

        const tooSmall = await page.$$eval('input, select, textarea', (els) =>
            els
                .filter((el) => el.offsetParent !== null)
                .map((el) => ({
                    size: parseFloat(getComputedStyle(el).fontSize),
                    name: (el.getAttribute('aria-label') || el.id || el.tagName).slice(0, 40),
                }))
                .filter((f) => f.size < 16)
        );
        expect(tooSmall).toEqual([]);
    });
});
