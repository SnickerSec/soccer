// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Field visualization', () => {
    test('draws a pitch per quarter with a marker for every position', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.field-container').first()).toBeVisible({ timeout: 20000 });

        // Four AYSO quarters, each with its own pitch
        await expect(page.locator('.field-container')).toHaveCount(4);

        const summary = await page.evaluate(() => {
            const fields = [...document.querySelectorAll('.field-container')];
            return fields.map(field => ({
                markers: field.querySelectorAll('g.player-marker').length,
                labelled: field.getAttribute('aria-label'),
                role: field.getAttribute('role'),
                legend: field.querySelectorAll('.field-legend .legend-item').length,
                // Every marker should carry a number or initials
                emptyLabels: [...field.querySelectorAll('g.player-marker text')]
                    .filter(t => !t.textContent?.trim()).length
            }));
        });

        for (const field of summary) {
            // 7v7 default: one marker per player on the field
            expect(field.markers).toBe(7);
            expect(field.emptyLabels).toBe(0);
            expect(field.role).toBe('img');
            expect(field.labelled).toMatch(/Quarter \d/);
            expect(field.legend).toBe(3);
        }

        expect(errors).toEqual([]);
    });

    test('prefers shirt numbers over initials when a player has one', async ({ page }) => {
        await page.goto('/');

        await page.fill('#playerName', 'Ada Lovelace');
        await page.fill('#playerNumber', '10');
        await page.click('#addPlayer');

        // Enough players to fill a 7v7 lineup
        for (let i = 0; i < 8; i++) {
            await page.fill('#playerName', `Player ${i}`);
            await page.click('#addPlayer');
        }

        await page.click('#generateLineup');
        await expect(page.locator('.field-container').first()).toBeVisible({ timeout: 20000 });

        const labels = await page.evaluate(() =>
            [...document.querySelectorAll('.field-container g.player-marker text')]
                .map(t => t.textContent)
        );

        // Ada is numbered, so "10" appears; the unnumbered players show initials
        expect(labels).toContain('10');
        expect(labels).not.toContain('AL');
    });
});
