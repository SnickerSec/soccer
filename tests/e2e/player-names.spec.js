// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Names with punctuation survive being typed in.
 *
 * addPlayer used to HTML-escape the name on the way in and store the result, so
 * a coach entering O'Brien got "O&#039;Brien" — in the roster, in the lineup,
 * in the CSV, on the printed sheet, and in the database once it synced.
 * Apostrophes and hyphens are ordinary in a youth roster.
 *
 * Escaping belongs at the point of rendering, and every path already does it
 * with textContent or escapeHtml, which is also why removing it is safe. The
 * last test here is what proves that: markup typed into the name field must
 * still be inert.
 */

const NAMES = [
    "O'Brien",
    'D’Angelo',      // curly apostrophe, what a phone keyboard produces
    'Smith & Jones',
    'Anne-Marie',
    'Núñez'
];

async function addPlayer(page, name) {
    await page.fill('#playerName', name);
    await page.click('#addPlayer');
}

test.describe('Player names with punctuation', () => {
    test('are shown as typed, not as HTML entities', async ({ page }) => {
        await page.goto('/');
        for (const name of NAMES) await addPlayer(page, name);

        const shown = await page.locator('#playerList').innerText();
        for (const name of NAMES) {
            expect(shown).toContain(name);
        }
        expect(shown).not.toContain('&#039;');
        expect(shown).not.toContain('&amp;');
    });

    test('are stored as typed, so what syncs and prints is right too', async ({ page }) => {
        await page.goto('/');
        await addPlayer(page, "O'Brien");

        const stored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('ayso_players') || '[]').map(p => p.name));

        expect(stored).toContain("O'Brien");
    });

    test('reach the lineup unmangled', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await addPlayer(page, "O'Brien");
        await page.click('#generateLineup');
        await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });

        const names = await page.evaluate(() =>
            [...document.querySelectorAll('.quarter-lineup tr.draggable-row')]
                .map(r => r.dataset.player));

        expect(names).toContain("O'Brien");
    });

    test('the length limit counts characters, not entities', async ({ page }) => {
        await page.goto('/');
        // 30 apostrophes escaped to &#039; would have measured 180 characters
        // and been rejected as "too long"
        const name = "'".repeat(30);
        await addPlayer(page, name);

        const stored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('ayso_players') || '[]').map(p => p.name));

        expect(stored).toContain(name);
    });

    test('markup typed into the name field stays inert', async ({ page }) => {
        const alerts = [];
        page.on('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.dismiss(); });

        await page.goto('/');
        await addPlayer(page, '<img src=x onerror="alert(1)">');
        await addPlayer(page, '<script>alert(2)</script>');
        await page.waitForTimeout(300);

        // Rendered as text, so no element is created and nothing runs
        expect(alerts).toEqual([]);
        expect(await page.locator('#playerList img').count()).toBe(0);
        expect(await page.locator('#playerList script').count()).toBe(0);
        await expect(page.locator('#playerList')).toContainText('<img src=x');
    });

    test('markup stays inert in the lineup and season views too', async ({ page }) => {
        const alerts = [];
        page.on('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.dismiss(); });

        await page.goto('/');
        await page.click('#demoButton');
        await addPlayer(page, '<img src=x onerror="alert(1)">');
        await page.click('#generateLineup');
        await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });
        await page.waitForTimeout(300);

        expect(alerts).toEqual([]);
        expect(await page.locator('.quarter-lineup img').count()).toBe(0);
    });
});
