// @ts-check
import { test, expect } from '@playwright/test';

/**
 * A label must not render outside the control it names.
 *
 * "Generate Lineup" did. Its CardHeader was a plain `flex justify-between`, so
 * the title block kept its natural width and the Button — a shrinkable flex
 * item — was squeezed below the width of its own text. The label is `nowrap`
 * with visible overflow, so it did not clip: it drew *outside* the blue
 * background, by 21px at 320, 13px at 375, 10px at 390 and 4px at 430. The app's
 * primary action, on every phone a coach owns.
 *
 * `mobile-tap-targets.spec.js` could not see it. That spec measures the box a
 * finger meets and whether the page scrolls sideways, and both were fine here —
 * the button's box was the right size, the text simply was not inside it.
 *
 * The check is deliberately narrow. Overflow that is `hidden`, `auto` or
 * `scroll` is a decision someone made: Tailwind's `truncate` ends a long player
 * name in an ellipsis, and a wide table is meant to scroll in its own frame.
 * Only `visible` overflow is text escaping a box nobody intended it to leave.
 */

// Text-bearing elements. A grid or flex container reporting a wider scrollWidth
// is a layout question that the sideways-scroll check in mobile-tap-targets
// already answers; this is about a string leaving its own box.
const TEXT_ELEMENTS = 'button, a, h1, h2, h3, h4, label, p, span, td, th';

/** Every visible element whose text is drawn outside its own box. */
async function overflowingText(page) {
    return page.$$eval(
        'button, a, h1, h2, h3, h4, label, p, span, td, th',
        (els) =>
            els
                .filter((el) => el.offsetParent !== null && el.clientWidth > 0)
                .filter((el) => getComputedStyle(el).overflowX === 'visible')
                .map((el) => ({
                    name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
                    overflow: el.scrollWidth - el.clientWidth,
                }))
                // 1px of slack: sub-pixel text metrics round scrollWidth up on
                // some glyph runs, and a 1px difference is not a visible defect.
                .filter((box) => box.overflow > 1)
    );
}

test.describe('Text stays inside its box', () => {
    // The phones coaches actually hold. 320 is the narrowest the app claims to
    // support and the width that fails first; 430 is a Pro Max. The bug was
    // present at all four, so testing only one would have caught it, but a
    // regression that starts at 320 and clears by 390 would not.
    const WIDTHS = [320, 375, 390, 430];

    // One test walking the widths rather than one test each. Four tests meant
    // four parallel workers each loading the app and generating a lineup, and
    // that extra load was enough to tip a timing-sensitive assertion in
    // game-history.spec.js into failing — a suite this spec had no business
    // destabilising to check a layout rule.
    test('no label is drawn outside its control at any phone width', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));

        for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 800 });
            await page.goto('/');
            await page.click('#demoButton');
            await page.click('#generateLineup');

            expect(await overflowingText(page), `text overflows its box at ${width}px`).toEqual([]);
        }

        expect(errors).toEqual([]);
    });

    // The one control this is really about, asserted by name so a failure says
    // which button broke rather than handing back a list to read.
    test('the Generate Lineup label fits its button at every phone width', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');

        for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 800 });

            const overflow = await page.locator('#generateLineup').evaluate(
                (el) => el.scrollWidth - el.clientWidth
            );
            expect(overflow, `Generate Lineup label overflows its button at ${width}px`).toBeLessThanOrEqual(1);
        }
    });
});
