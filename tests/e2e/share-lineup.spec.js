// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Sharing a lineup by link.
 *
 * The payload used to be btoa(JSON.stringify(...)), which throws on any code
 * point above U+00FF. The throw escaped uncaught out of the click handler, so
 * pressing Share with a name like "D’Angelo" on the roster did nothing at all
 * and reported nothing — and an iPhone types that apostrophe by default.
 */

/**
 * The share link the app puts on the clipboard.
 *
 * The action bar is cloned above the lineup once one exists. The clones carry
 * data-action rather than the id they were cloned from, so that two elements
 * do not answer to the same id.
 */
async function shareAndReadLink(page) {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('.dropdown-trigger', { hasText: 'Share' }).first().click();
    await page.locator('[data-action="shareLineup"]').click();
    return page.evaluate(() => navigator.clipboard.readText());
}

async function generateWith(page, extraNames = []) {
    await page.goto('/');
    await page.click('#demoButton');
    for (const name of extraNames) {
        await page.fill('#playerName', name);
        await page.click('#addPlayer');
    }
    await page.click('#generateLineup');
    await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });
}

test.describe('Sharing a lineup', () => {
    test('produces a link for an ordinary roster', async ({ page }) => {
        await generateWith(page);

        const link = await shareAndReadLink(page);
        expect(link).toContain('?lineup=');
    });

    test('produces a link when a name is outside Latin-1', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));

        await generateWith(page, ['D’Angelo', 'Łukasz']);
        const link = await shareAndReadLink(page);

        expect(errors).toEqual([]);
        expect(link).toContain('?lineup=');
    });

    test('the link reopens the lineup, names intact', async ({ page }) => {
        await generateWith(page, ['D’Angelo']);
        const link = await shareAndReadLink(page);

        // A fresh visit, as the person receiving the link gets it
        await page.evaluate(() => localStorage.clear());
        await page.goto(link);
        await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });

        const roster = await page.locator('#playerList').innerText();
        expect(roster).toContain('D’Angelo');
    });

    test('the link carries no ratings or evaluation comments', async ({ page }) => {
        // It goes into the team chat, and is encoded rather than encrypted.
        // The demo roster is rated, so there is something to leak.
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#evaluation-tab-btn');
        await page.locator('#comment-0').fill('Needs work on his weak foot');
        await page.locator('#comment-0').press('Enter');
        await page.click('#roster-tab-btn');
        await page.click('#generateLineup');
        await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });

        const link = await shareAndReadLink(page);
        const payload = await page.evaluate((href) => {
            const value = new URL(href).searchParams.get('lineup');
            const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
            const bytes = Uint8Array.from(atob(base64 + '='.repeat((4 - base64.length % 4) % 4)), (c) => c.charCodeAt(0));
            return new TextDecoder().decode(bytes);
        }, link);

        expect(payload).not.toContain('weak foot');
        expect(payload).not.toMatch(/overallRating|positionalRatings|mustRest|noKeeper|comments/);
        expect(JSON.parse(payload).players.length).toBeGreaterThan(0);
    });

    test('the link carries no characters a query string would mangle', async ({ page }) => {
        await generateWith(page, ['D’Angelo']);

        const value = new URL(await shareAndReadLink(page)).searchParams.get('lineup');
        // '+' would arrive as a space and the payload would not parse
        expect(value).not.toMatch(/[+/]/);
    });
});
