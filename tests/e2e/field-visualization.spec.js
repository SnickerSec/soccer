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

    /*
     * The keeper's shirt number used to be white on #ffcc00 — 1.51:1, where AA
     * asks 4.5:1. At the ~8px a marker renders on a phone that made the one
     * player a coach most needs to pick out the one they could not read.
     *
     * This reads the colours back off the rendered SVG rather than trusting the
     * tokens, so a future palette change that looks fine on a desk monitor still
     * fails here. Both themes, because the pitch tokens are declared once and a
     * later per-theme override must not quietly drop below the line.
     */
    for (const theme of ['dark', 'light']) {
        test(`every marker keeps its label readable in ${theme} mode`, async ({ page }) => {
            await page.goto('/');
            await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
            await page.click('#demoButton');
            await page.click('#generateLineup');
            await expect(page.locator('.field-container').first()).toBeVisible({ timeout: 20000 });

            const measured = await page.evaluate(() => {
                const parse = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
                const lum = ([r, g, b]) => {
                    const s = [r, g, b]
                        .map(v => v / 255)
                        .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
                    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
                };
                const ratio = (a, b) => {
                    const [x, y] = [lum(parse(a)), lum(parse(b))];
                    const [hi, lo] = x > y ? [x, y] : [y, x];
                    return (hi + 0.05) / (lo + 0.05);
                };
                return [...document.querySelectorAll('.field-container g.player-marker')].map(m => ({
                    label: m.querySelector('text').textContent,
                    ratio: ratio(
                        getComputedStyle(m.querySelector('circle')).fill,
                        getComputedStyle(m.querySelector('text')).fill
                    ),
                }));
            });

            expect(measured.length).toBeGreaterThan(0);
            for (const marker of measured) {
                expect(
                    marker.ratio,
                    `marker "${marker.label}" is ${marker.ratio.toFixed(2)}:1 against its own fill`
                ).toBeGreaterThanOrEqual(4.5);
            }
        });
    }
});
