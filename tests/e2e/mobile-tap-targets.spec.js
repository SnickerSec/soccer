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

/** Every visible control smaller than the minimum, with a name to identify it. */
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
                // Both axes. Height alone passed the "GK" and "R" rotation
                // toggles beside every player at 37px and 27px wide — 44 tall
                // and a third of a target across. A button is only tappable
                // when both sides clear the minimum. Width is ignored for a
                // zero-height element, which is one mid-animation rather than
                // one too small.
                .filter((box) => box.height > 0 && (box.height < min || box.width < min)),
        MIN_TAP
    );
}

/**
 * A checkbox stays visually small; the label around it is what the coach taps.
 * Every one of them, so that fixing two and missing the third cannot happen
 * twice — .captain-checkbox sat at a bare 16px square on the Roster tab while
 * these other two were 44px.
 */
const WRAPPED_CHECKBOXES = ['.rest-checkbox', '.no-keeper-checkbox', '.captain-checkbox'];

async function expectLabelIsTappable(page, checkbox) {
    const label = page.locator(`label:has(${checkbox})`).first();

    // Counted before it is measured. boundingBox() on a locator that matches
    // nothing waits out the timeout and then reports a null box, so an
    // unwrapped checkbox failed as a 30-second hang rather than as the one
    // sentence that says what is wrong.
    expect(await label.count(), `${checkbox} has no wrapping label to tap`).toBeGreaterThan(0);

    const box = await label.boundingBox();
    expect(box?.height, `${checkbox} label height`).toBeGreaterThanOrEqual(MIN_TAP);
    expect(box?.width, `${checkbox} label width`).toBeGreaterThanOrEqual(MIN_TAP);
}

test.describe('Mobile tap targets', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('every control on the lineup and matchday screens is at least 44px on both axes', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));

        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');

        expect(await undersized(page)).toEqual([]);

        for (const checkbox of WRAPPED_CHECKBOXES) {
            await expectLabelIsTappable(page, checkbox);
        }

        // Live Matchday — the screen open while a game is actually running.
        await page.click('#openMatchday');
        await expect(page.locator('[role="dialog"]')).toBeVisible();
        expect(await undersized(page)).toEqual([]);

        expect(errors).toEqual([]);
    });

    // Every tab, not just the one the app opens on. The Schedule tab pushed the
    // page to 396px against a 390px viewport — its filter row and the Volunteer
    // Duty Matrix button did not fit on one line and did not wrap — and a check
    // that never left the roster could not see it.
    const TABS = [
        ['roster', '#roster-tab-btn'],
        ['schedule', '#schedule-tab-btn'],
        ['season', '#season-tab-btn'],
        ['evaluation', '#evaluation-tab-btn'],
    ];

    for (const [name, tabButton] of TABS) {
        test(`the ${name} tab never scrolls sideways`, async ({ page }) => {
            await page.goto('/');
            await page.click('#demoButton');
            await page.click('#generateLineup');
            await page.click(tabButton);

            const width = await page.evaluate(() => ({
                content: document.documentElement.scrollWidth,
                viewport: document.documentElement.clientWidth,
            }));
            expect(width.content).toBeLessThanOrEqual(width.viewport);
        });
    }

    /**
     * Nine buttons, each clamped to a 44px tap target by the touch rule in
     * index.css, wrapped into a 174px sticky block — a fifth of an iPhone
     * viewport, held there for all 7,296px of the lineup page, and at the foot
     * of it covering the Player Summary's own header row. Only Live Match and
     * Save Game are things a coach does with a game running; the rest collapse
     * behind More.
     */
    test('the sticky lineup bar leaves the phone its screen', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');

        const bar = await page.locator('.action-buttons-inline').boundingBox();
        expect(bar.height).toBeLessThan(150);

        // Collapsed: the export and print actions are behind More
        await expect(page.locator('#exportPdf')).toBeHidden();
        await expect(page.locator('#printLineup')).toBeHidden();
        // The two matchday actions are not
        await expect(page.locator('#openMatchday')).toBeVisible();
        await expect(page.locator('#saveGame')).toBeVisible();

        await page.getByRole('button', { name: /Show export and print actions/ }).click();
        await expect(page.locator('#exportPdf')).toBeVisible();
        await page.getByRole('button', { name: /Hide export and print actions/ }).click();
        await expect(page.locator('#exportPdf')).toBeHidden();
    });

    /**
     * The quarter selector is what collapses the lineup page from four stacked
     * quarters to one. It used to sit above a 7,296px scroll, so by the time a
     * coach could see the quarter they wanted, the control for picking it was
     * several screens behind them.
     */
    test('the quarter selector stays reachable from the foot of the lineup', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');

        const full = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

        const q2 = page.getByRole('button', { name: 'Q2', exact: true }).first();
        await expect(q2).toBeInViewport();
        await q2.click();

        const oneQuarter = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(oneQuarter).toBeLessThan(full);
    });

    /**
     * 1,113px of table in a 356px window. Scrolling it right used to take the
     * name column with it, leaving the coach reading a row of quarters with
     * nothing saying whose row it was.
     */
    test('the player summary keeps the name column in view while it scrolls', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');

        const nameCell = page.locator('.player-summary tbody tr td').first();
        await nameCell.scrollIntoViewIfNeeded();
        const before = (await nameCell.boundingBox()).x;

        await page.locator('.player-summary table').evaluate((table) => {
            const viewport = table.closest('[data-radix-scroll-area-viewport]') || table.parentElement;
            viewport.scrollLeft = viewport.scrollWidth;
        });

        const after = await nameCell.boundingBox();
        expect(Math.round(after.x)).toBe(Math.round(before));
        await expect(nameCell).toBeInViewport();
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
