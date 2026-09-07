// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The masthead: brand, section nav, controls.
 *
 * The tablist lives in the header rather than inside the first panel, so these
 * confirm it stays there and keeps working from that position -- switchTab()
 * queries the document rather than a container, which is what makes the move
 * safe.
 */
test.describe('Site header', () => {
    test('lays out brand, nav and controls in one row', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        const boxes = await page.evaluate(() => {
            const rect = sel => {
                const el = document.querySelector(sel);
                const r = el.getBoundingClientRect();
                return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
            };
            return {
                brand: rect('.site-header .brand'),
                nav: rect('.site-header .site-nav'),
                controls: rect('.site-header .header-controls'),
                header: rect('.site-header')
            };
        });

        // Left to right, in that order
        expect(boxes.brand.right).toBeLessThanOrEqual(boxes.nav.left + 1);
        expect(boxes.nav.right).toBeLessThanOrEqual(boxes.controls.left + 1);

        // All on the same row
        expect(boxes.nav.top).toBeGreaterThanOrEqual(boxes.header.top - 1);
        expect(boxes.nav.bottom).toBeLessThanOrEqual(boxes.header.bottom + 1);

        // A masthead, not the old full-height banner
        expect(boxes.header.bottom - boxes.header.top).toBeLessThan(100);
    });

    test('the tablist is in the header, not the panel', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('.site-header .tab-navigation')).toHaveCount(1);
        await expect(page.locator('.player-section .tab-navigation')).toHaveCount(0);
        await expect(page.locator('.tab-navigation')).toHaveCount(1);

        // Still a proper tablist wired to the panels below
        await expect(page.locator('.site-header [role="tablist"]')).toHaveCount(1);
        for (const [id, panel] of [
            ['roster-tab-btn', 'roster-tab'],
            ['season-tab-btn', 'season-tab'],
            ['evaluation-tab-btn', 'evaluation-tab']
        ]) {
            await expect(page.locator(`#${id}`)).toHaveAttribute('aria-controls', panel);
            await expect(page.locator(`#${panel}`)).toHaveCount(1);
        }
    });

    test('switching sections still works from the header', async ({ page }) => {
        await page.goto('/');

        await page.click('#season-tab-btn');
        await expect(page.locator('#season-tab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#roster-tab')).not.toHaveClass(/\bactive\b/);
        await expect(page.locator('#season-tab-btn')).toHaveClass(/\bactive\b/);

        await page.click('#evaluation-tab-btn');
        await expect(page.locator('#evaluation-tab')).toHaveClass(/\bactive\b/);
        // Game settings are hidden on the evaluation section
        await expect(page.locator('.settings-section')).toBeHidden();

        await page.click('#roster-tab-btn');
        await expect(page.locator('#roster-tab')).toHaveClass(/\bactive\b/);
        await expect(page.locator('.settings-section')).toBeVisible();
    });

    test('stacks the nav onto its own line when the row runs out of space', async ({ page }) => {
        await page.setViewportSize({ width: 900, height: 800 });
        await page.goto('/');

        const { navTop, brandBottom } = await page.evaluate(() => ({
            navTop: document.querySelector('.site-nav').getBoundingClientRect().top,
            brandBottom: document.querySelector('.brand').getBoundingClientRect().bottom
        }));

        expect(navTop).toBeGreaterThanOrEqual(brandBottom - 1);
    });

    test('keeps the brand on one line on a phone', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await page.goto('/');

        const height = await page.evaluate(() =>
            document.querySelector('.brand-text h1').getBoundingClientRect().height
        );

        // A wrapped name would be two or three times this
        expect(height).toBeLessThan(30);
    });

    /*
     * The touch minimum raises every button to 44px on a phone, and the
     * tablist holding these was a fixed 36px -- so the active tab drew above
     * and below the bar it sits in, and the bar's 360px floor pushed the whole
     * page sideways on a 360px screen.
     */
    test('the tab bar contains its tabs on a phone', async ({ page }) => {
        for (const width of [360, 390]) {
            await page.setViewportSize({ width, height: 800 });
            await page.goto('/');

            const { list, tab, scrollWidth, clientWidth } = await page.evaluate(() => {
                const rect = el => {
                    const r = el.getBoundingClientRect();
                    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
                };
                return {
                    list: rect(document.querySelector('.site-header [role="tablist"]')),
                    tab: rect(document.querySelector('#season-tab-btn')),
                    scrollWidth: document.documentElement.scrollWidth,
                    clientWidth: document.documentElement.clientWidth
                };
            });

            expect(tab.top).toBeGreaterThanOrEqual(list.top - 0.5);
            expect(tab.bottom).toBeLessThanOrEqual(list.bottom + 0.5);
            expect(tab.left).toBeGreaterThanOrEqual(list.left - 0.5);
            expect(tab.right).toBeLessThanOrEqual(list.right + 0.5);
            expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
        }
    });

    /*
     * The controls at the right end change width the moment a coach signs in:
     * a "Sign in with Google" button is replaced by a 32px avatar. A flex row
     * gave the tabs whatever space those two left over, so the tablist slid
     * right by half that difference on sign-in. The columns are what hold it.
     */
    test('the tabs stay centred when signing in changes the controls', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        const offsetFromCentre = () => page.evaluate(() => {
            const tabs = document.querySelector('.site-nav [role="tablist"]').getBoundingClientRect();
            const row = document.querySelector('.site-header-inner').getBoundingClientRect();
            return (tabs.left + tabs.right) / 2 - (row.left + row.right) / 2;
        });

        expect(Math.abs(await offsetFromCentre())).toBeLessThan(1);

        await page.evaluate(() => {
            window.lineupGenerator.updateAuthUI({
                id: 'user-1',
                email: 'coach@example.com',
                displayName: 'Coach Taylor',
                avatarUrl: ''
            });
        });
        await expect(page.locator('#accountTrigger')).toBeVisible();

        expect(Math.abs(await offsetFromCentre())).toBeLessThan(1);
    });

    test('exactly one h1 per page', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('h1')).toHaveText('Shinguard');

        await page.goto('/privacy.html');
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('h1')).toHaveText('Privacy & Safety');
    });
});
