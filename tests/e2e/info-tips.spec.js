// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The (i) tooltips beside the Game Settings labels.
 *
 * A Radix tooltip opens on hover and focus only, and a tap closes it — so on
 * a phone, where this app is used, the explanations were unreachable until
 * InfoTip made a tap toggle it. Two separate Radix handlers each undid the
 * toggle (the trigger's own pointerdown/click, and the content's
 * outside-pointerdown, which counts the trigger as outside), and either one
 * alone left a tap that did nothing, so both directions are checked.
 */

const STRATEGY_TIP = { name: 'About lineup strategies' };

test.describe('Info tooltips on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('a tap opens the tooltip and a second tap closes it', async ({ page }) => {
        await page.goto('/');
        const trigger = page.getByRole('button', STRATEGY_TIP);

        await trigger.tap();
        await expect(page.getByRole('tooltip')).toContainText('evenly');

        await trigger.tap();
        await expect(page.getByRole('tooltip')).toHaveCount(0);
    });

    test('a tap elsewhere closes it', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', STRATEGY_TIP).tap();
        await expect(page.getByRole('tooltip')).toHaveCount(1);

        await page.locator('.settings-section legend').first().tap();
        await expect(page.getByRole('tooltip')).toHaveCount(0);
    });

    test('the goalie rule (i) does not toggle the rule', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: 'About the goalie rule' }).tap();
        await expect(page.getByRole('tooltip')).toContainText('3+ quarters');
        await expect(page.locator('#keeperPlaysThree')).not.toBeChecked();
    });
});

test.describe('Info tooltips with a mouse', () => {
    test('hovering opens it, and clicking does not close it again', async ({ page }) => {
        await page.goto('/');
        const trigger = page.getByRole('button', STRATEGY_TIP);

        await trigger.hover();
        await expect(page.getByRole('tooltip')).toHaveCount(1);

        await trigger.click();
        await expect(page.getByRole('tooltip')).toHaveCount(1);

        await page.keyboard.press('Escape');
        await expect(page.getByRole('tooltip')).toHaveCount(0);
    });
});
