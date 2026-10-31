// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Printing used to hand the browser the whole app — dark theme, navigation and
 * all — over several pages. What goes on paper now is one sheet of quarter
 * cards: position, jersey number, player.
 */
test.describe('Printing the lineup', () => {
    /** Generates a lineup, then looks at the page the way a printer does. */
    async function printPreview(page) {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });
        await page.emulateMedia({ media: 'print' });
    }

    test('prints the quarter cards and nothing else', async ({ page }) => {
        await printPreview(page);

        const sheet = page.locator('#printSheet');
        await expect(sheet).toBeVisible();

        for (const quarter of ['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4']) {
            await expect(sheet.getByText(quarter, { exact: false })).toBeVisible();
        }

        // The app around it stays off the page
        await expect(page.locator('#main-content')).toBeHidden();
        await expect(page.locator('.site-header, header').first()).toBeHidden();
    });

    test('every position on the sheet names a player', async ({ page }) => {
        await printPreview(page);

        const firstQuarter = page.locator('#printSheet .print-quarter').first();
        const positions = await firstQuarter.locator('.print-position').allTextContents();
        const players = await firstQuarter.locator('.print-player').allTextContents();

        expect(positions[0]).toBe('Keeper');
        expect(positions.length).toBeGreaterThanOrEqual(7);
        expect(players).toHaveLength(positions.length);
        players.forEach(name => expect(name.trim().length).toBeGreaterThan(0));
    });

    test('carries the jersey numbers the roster has', async ({ page }) => {
        await printPreview(page);

        const numbers = await page.locator('#printSheet .print-number').allTextContents();
        const printed = numbers.filter(n => n.trim().length > 0);

        expect(printed.length).toBeGreaterThan(0);
        printed.forEach(n => expect(n.trim()).toMatch(/^#\d+$/));
    });

    test('fits above the fold at 11v11 with a full squad', async ({ page }) => {
        // The coach folds the sheet in half to carry it, so the cards must end
        // above the crease. 11v11 with eighteen on the roster is the tallest
        // sheet the app prints: eleven rows a card and seven names sitting.
        await page.addInitScript(() => {
            if (sessionStorage.getItem('seeded')) return;
            sessionStorage.setItem('seeded', '1');
            const names = ['Isabella Thompson', 'Sophia Rodriguez', 'Alexander Allen', 'Charlotte Moore',
                'Benjamin Taylor', 'Quinn Rodriguez', 'Emery Williams', 'Avery Thompson', 'Cameron Wilson',
                'Justice Turner', 'Harley Cooper', 'Amelia Jackson', 'Ethan Williams', 'Liam Anderson',
                'Noah Martinez', 'William Brown', 'Evelyn Hall', 'Abigail Young'];
            localStorage.setItem('ayso_players', JSON.stringify(
                names.map((name, i) => ({ name, number: 10 + i, status: 'available' }))));
            localStorage.setItem('ayso_settings', JSON.stringify(
                { ageDivision: '14U', fieldPlayers: 11, formation: '4-2-3-1', quarters: 4 }));
        });
        // Letter less the 0.35in side margins, in CSS pixels (96 to the inch),
        // so names wrap where they would on paper.
        await page.setViewportSize({ width: Math.round(7.8 * 96), height: 1000 });
        await page.goto('/');
        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });
        await page.emulateMedia({ media: 'print' });

        await expect(page.locator('#printSheet .print-quarter')).toHaveCount(4);
        await expect(page.locator('#printSheet .print-quarter').first().locator('.print-position')).toHaveCount(11);

        // The fold is 5.5in down; the page's top margin is 0.25in of that,
        // and a quarter inch is kept clear of the crease.
        const height = await page.locator('#printSheet').evaluate(el => el.getBoundingClientRect().height);
        expect(height).toBeLessThan((5.5 - 0.25 - 0.25) * 96);
    });

    test('lists who is absent or injured', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        const statuses = page.locator('#playerList .player-status-select');
        const absent = await statuses.nth(0).getAttribute('data-player');
        const injured = await statuses.nth(1).getAttribute('data-player');
        await statuses.nth(0).selectOption('absent');
        await statuses.nth(1).selectOption('injured');

        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });
        await page.emulateMedia({ media: 'print' });

        const line = page.locator('#printUnavailable');
        await expect(line).toBeVisible();
        await expect(line).toContainText(`Absent — `);
        await expect(line).toContainText(absent || '');
        await expect(line).toContainText(`Injured — `);
        await expect(line).toContainText(injured || '');
    });

    test('says nothing about absences when everyone is there', async ({ page }) => {
        await printPreview(page);
        await expect(page.locator('#printUnavailable')).toHaveCount(0);
    });
});
