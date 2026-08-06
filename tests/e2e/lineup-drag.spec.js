// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Drag-and-drop swapping in the lineup grid.
 *
 * The rows are rebuilt from scratch on every render, so each one has to be
 * re-wired as both a drag source and a drop target every time — a swap that
 * works once but not twice is the failure mode this guards.
 */
test.describe('Lineup drag and drop', () => {
    async function generateLineup(page) {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });
    }

    /** Position -> player name for one quarter, read off the rendered rows. */
    async function readQuarter(page, quarterIndex = 0) {
        return page.evaluate(index => {
            const card = document.querySelectorAll('.quarter-lineup')[index];
            const result = { positions: {}, resting: [] };
            card.querySelectorAll('tr.draggable-row:not(.sitting-row)').forEach(row => {
                result.positions[row.dataset.position] = row.dataset.player;
            });
            card.querySelectorAll('tr.sitting-row').forEach(row => {
                result.resting.push(row.querySelector('.player-name').textContent.trim());
            });
            return result;
        }, quarterIndex);
    }

    test('every row is draggable and carries its slot identity', async ({ page }) => {
        await generateLineup(page);

        const rows = await page.evaluate(() => {
            const card = document.querySelector('.quarter-lineup');
            return {
                positions: [...card.querySelectorAll('tr.draggable-row:not(.sitting-row)')].map(r => ({
                    draggable: r.draggable,
                    quarter: r.dataset.quarter,
                    position: r.dataset.position,
                    player: r.dataset.player
                })),
                sittingDraggable: [...card.querySelectorAll('tr.sitting-row')].every(r => r.draggable)
            };
        });

        expect(rows.positions.length).toBe(7);
        for (const row of rows.positions) {
            expect(row.draggable).toBe(true);
            expect(row.quarter).toBe('1');
            expect(row.position).toBeTruthy();
            expect(row.player).toBeTruthy();
        }
        expect(rows.sittingDraggable).toBe(true);
    });

    test('the keeper row is marked so it can be styled apart', async ({ page }) => {
        await generateLineup(page);

        const keeper = page.locator('.quarter-lineup').first().locator('tr.keeper-row');
        await expect(keeper).toHaveCount(1);
        await expect(keeper).toHaveAttribute('data-position', 'Keeper');
    });

    test('dragging one position onto another swaps the two players', async ({ page }) => {
        await generateLineup(page);

        const before = await readQuarter(page);
        const [first, second] = Object.keys(before.positions);

        await page.locator(`.quarter-lineup >> nth=0 >> tr[data-position="${first}"]`)
            .dragTo(page.locator(`.quarter-lineup >> nth=0 >> tr[data-position="${second}"]`));

        const after = await readQuarter(page);
        expect(after.positions[first]).toBe(before.positions[second]);
        expect(after.positions[second]).toBe(before.positions[first]);
    });

    test('rows stay swappable after a re-render', async ({ page }) => {
        await generateLineup(page);

        const before = await readQuarter(page);
        const [first, second, third] = Object.keys(before.positions);

        // First swap re-renders the whole grid
        await page.locator(`.quarter-lineup >> nth=0 >> tr[data-position="${first}"]`)
            .dragTo(page.locator(`.quarter-lineup >> nth=0 >> tr[data-position="${second}"]`));

        const middle = await readQuarter(page);

        // A second swap on freshly built rows must work the same way
        await page.locator(`.quarter-lineup >> nth=0 >> tr[data-position="${second}"]`)
            .dragTo(page.locator(`.quarter-lineup >> nth=0 >> tr[data-position="${third}"]`));

        const after = await readQuarter(page);
        expect(after.positions[second]).toBe(middle.positions[third]);
        expect(after.positions[third]).toBe(middle.positions[second]);
    });

    test('dragging a resting player onto a position puts them on the field', async ({ page }) => {
        await generateLineup(page);

        const before = await readQuarter(page);
        test.skip(before.resting.length === 0, 'demo roster fields everyone this quarter');

        const target = Object.keys(before.positions)[0];

        await page.locator('.quarter-lineup >> nth=0 >> tr.sitting-row >> nth=0')
            .dragTo(page.locator(`.quarter-lineup >> nth=0 >> tr[data-position="${target}"]`));

        const after = await readQuarter(page);
        // The bench player now holds that position
        expect(after.positions[target]).not.toBe(before.positions[target]);
    });

    test('dropping a row onto itself changes nothing', async ({ page }) => {
        await generateLineup(page);

        const before = await readQuarter(page);
        const [first] = Object.keys(before.positions);
        const row = page.locator(`.quarter-lineup >> nth=0 >> tr[data-position="${first}"]`);

        await row.dragTo(row);

        expect((await readQuarter(page)).positions).toEqual(before.positions);
    });

    test('a swap re-runs validation and leaves the summary intact', async ({ page }) => {
        await generateLineup(page);

        const before = await readQuarter(page);
        const [first, second] = Object.keys(before.positions);

        await page.locator(`.quarter-lineup >> nth=0 >> tr[data-position="${first}"]`)
            .dragTo(page.locator(`.quarter-lineup >> nth=0 >> tr[data-position="${second}"]`));

        // Exactly one summary and one action bar survive the re-render
        await expect(page.locator('.player-summary')).toHaveCount(1);
        await expect(page.locator('.action-buttons-inline')).toHaveCount(1);
        await expect(page.locator('#validationMessages')).not.toBeEmpty();
        await expect(page.locator('.quarter-lineup')).toHaveCount(4);
    });
});
