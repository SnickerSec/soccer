// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The lineup renders exactly the positions the formation calls for.
 *
 * app.js used to carry its own copy of getPositionsForFormation alongside the
 * one in modules/formations.js, and the two had drifted: the copy's 6v6 '3-3'
 * branch returned the 7v7 array. The generator used the module and filled six
 * positions; the UI used the copy and drew seven, so every quarter of every 6v6
 * lineup ended in a "Right Mid — TBD" no player could ever be assigned to, on
 * screen and on the printed sheet.
 *
 * The unit tests cover the formation data. This covers the thing that actually
 * broke — that what is generated and what is drawn are the same list.
 */

/** Field sizes reachable from the UI, with a formation for each. */
const SETUPS = [
    { age: '10U', field: '7', formation: '2-3-1' },
    { age: '10U', field: '7', formation: '3-3' },
    { age: '10U', field: '6', formation: '3-3' },
    { age: '10U', field: '6', formation: '2-3-1' },
    { age: '12U', field: '9', formation: '3-3-2' },
    { age: '14U', field: '11', formation: '4-4-2' }
];

async function generate(page, { age, field, formation }) {
    await page.goto('/');
    // Division and field size before the roster: populateDemo sizes the squad
    // to the current field size, so loading it first leaves an 11v11 game with
    // the ten players a 7v7 gets and nothing to generate from.
    await page.selectOption('#ageDivision', age);
    await page.selectOption('#fieldPlayers', field);
    await page.click('#demoButton');
    await page.selectOption('#formation', formation);
    await page.click('#generateLineup');
    await expect(page.locator('.quarter-lineup').first()).toBeVisible({ timeout: 20000 });
}

/** Position -> player for one quarter, as rendered. */
function readQuarter(page, index = 0) {
    return page.evaluate((i) => {
        const card = document.querySelectorAll('.quarter-lineup')[i];
        return [...card.querySelectorAll('tr.draggable-row:not(.sitting-row)')]
            .map(row => ({ position: row.dataset.position, player: row.dataset.player }));
    }, index);
}

test.describe('Formations', () => {
    for (const setup of SETUPS) {
        test(`${setup.field}v${setup.field} ${setup.formation} draws exactly ${setup.field} positions`, async ({ page }) => {
            await generate(page, setup);

            const quarter = await readQuarter(page);
            expect(quarter).toHaveLength(Number(setup.field));
        });

        test(`${setup.field}v${setup.field} ${setup.formation} leaves no position unfilled`, async ({ page }) => {
            await generate(page, setup);

            // "TBD" is what a position nobody was assigned to renders as — the
            // visible symptom of the two lists disagreeing
            const quarter = await readQuarter(page);
            expect(quarter.filter(slot => slot.player === 'TBD')).toEqual([]);
        });
    }

    test('every quarter draws the same positions, not just the first', async ({ page }) => {
        await generate(page, { age: '10U', field: '6', formation: '3-3' });

        const quarters = await Promise.all([0, 1, 2, 3].map(i => readQuarter(page, i)));
        const shape = quarters.map(q => q.map(slot => slot.position).join(','));

        expect(new Set(shape).size).toBe(1);
        expect(quarters[0]).toHaveLength(6);
    });
});
