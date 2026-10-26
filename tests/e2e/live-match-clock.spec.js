// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The Live Match clock keeps time through a locked screen, and the match
 * survives a reload.
 *
 * The clock used to take a second off per setInterval tick. A phone throttles
 * or suspends timers when its screen locks, so a quarter left in a pocket came
 * back paused. Playwright's clock can move the time on without running any
 * timers, which is exactly what a locked phone does to the page.
 *
 * The score, the goals and the subs lived in the dialog's state alone, so a
 * reload — which iOS does to a backgrounded tab on its own — ended the match.
 */

const QUARTER_10U = '12:30';

async function openLiveMatch(page) {
    await page.clock.install();
    await page.goto('/');
    await page.click('#demoButton');
    await page.click('#generateLineup');
    await page.locator('#openMatchday').click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#matchClock')).toHaveText(QUARTER_10U);
    return dialog;
}

test.describe('Live Match clock', () => {
    test('time that passed with the timers frozen is not lost', async ({ page }) => {
        const dialog = await openLiveMatch(page);
        await dialog.getByRole('button', { name: /Start/ }).click();

        // Five minutes in a pocket: the time moves, no timer fires
        const started = await page.evaluate(() => Date.now());
        await page.clock.setSystemTime(started + 5 * 60_000);
        // The first tick after the screen comes back
        await page.clock.runFor(300);

        await expect(page.locator('#matchClock')).toHaveText('07:30');
    });

    test('a quarter that ran out while locked shows as over, and stops', async ({ page }) => {
        const dialog = await openLiveMatch(page);
        await dialog.getByRole('button', { name: /Start/ }).click();

        const started = await page.evaluate(() => Date.now());
        await page.clock.setSystemTime(started + 13 * 60_000);
        await page.clock.runFor(300);

        await expect(page.locator('#matchClock')).toHaveText('00:00');
        await expect(dialog.getByRole('button', { name: /Start/ })).toBeVisible();
    });

    test('pausing holds the time however long the pause', async ({ page }) => {
        const dialog = await openLiveMatch(page);
        await dialog.getByRole('button', { name: /Start/ }).click();
        await page.clock.runFor(60_000);
        await dialog.getByRole('button', { name: /Pause/ }).click();
        await expect(page.locator('#matchClock')).toHaveText('11:30');

        await page.clock.runFor(10 * 60_000);
        await expect(page.locator('#matchClock')).toHaveText('11:30');
    });
});

test('the screen is kept on while the clock runs, and let go when it stops', async ({ page }) => {
    // A phone that locks after thirty seconds takes the clock out of sight
    await page.addInitScript(() => {
        window.__wakeLocks = { requested: 0, released: 0 };
        Object.defineProperty(navigator, 'wakeLock', {
            configurable: true,
            value: {
                request: async () => {
                    window.__wakeLocks.requested += 1;
                    return { release: async () => { window.__wakeLocks.released += 1; } };
                },
            },
        });
    });
    const dialog = await openLiveMatch(page);
    expect(await page.evaluate(() => window.__wakeLocks.requested)).toBe(0);

    await dialog.getByRole('button', { name: /Start/ }).click();
    await expect.poll(() => page.evaluate(() => window.__wakeLocks.requested)).toBe(1);

    await dialog.getByRole('button', { name: /Pause/ }).click();
    await expect.poll(() => page.evaluate(() => window.__wakeLocks.released)).toBe(1);
});

test.describe('Live Match across a reload', () => {
    test('the score, the quarter and the clock come back', async ({ page }) => {
        const dialog = await openLiveMatch(page);
        await dialog.getByRole('button', { name: /Start/ }).click();
        await page.clock.runFor(2 * 60_000);

        // A goal for us, one for them
        await dialog.locator('.max-h-44 [role="button"]').first().click();
        await dialog.getByRole('button', { name: /Goal/i }).click();
        await dialog.getByRole('button', { name: 'Increase Opponent score' }).click();
        await expect(page.locator('#matchHomeScore')).toHaveText('1');
        await expect(page.locator('#matchAwayScore')).toHaveText('1');

        await page.reload();

        // The coach is offered the match back, and the button says so too
        await expect(page.getByText('A match is in progress')).toBeVisible();
        await expect(page.locator('#openMatchday')).toHaveText(/Resume Match/);
        await page.getByRole('button', { name: 'Resume', exact: true }).click();

        await expect(page.locator('#liveMatchResumed')).toBeVisible();
        await expect(page.locator('#matchHomeScore')).toHaveText('1');
        await expect(page.locator('#matchAwayScore')).toHaveText('1');
        // Still running, two minutes down, less the seconds the reload itself
        // took: the clock kept going through it rather than starting over
        await expect(page.locator('#matchClock')).toHaveText(/^10:[0-3]\d$/);
        await expect(page.locator('[role="dialog"]').getByRole('button', { name: /Pause/ })).toBeVisible();
    });

    test('a sub made before the reload is still made', async ({ page }) => {
        const dialog = await openLiveMatch(page);
        const fieldRow = dialog.locator('.max-h-44 [role="button"]').first();
        const position = (await fieldRow.locator('span').first().textContent()).replace(':', '').trim();
        await fieldRow.click();
        const subButton = dialog.getByText('Sub for:').locator('..').getByRole('button').first();
        const benchName = (await subButton.textContent()).trim();
        await subButton.click();

        await page.reload();
        await page.locator('#openMatchday').click();
        await dialog.getByRole('button', { name: /Save Game Record/i }).click();

        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ayso_lineup_history'))[0]);
        const firstQuarter = saved.quarters.find((q) => q.quarter === 1) || saved.quarters[0];
        expect(firstQuarter.positions[position]).toBe(benchName);
    });

    test('opening the dialog only to look leaves no match behind', async ({ page }) => {
        const dialog = await openLiveMatch(page);
        await dialog.getByRole('button', { name: /Close Match Mode/i }).click();

        await page.reload();
        await expect(page.locator('#openMatchday')).toHaveText(/Live Match/);
        await expect(page.getByText('A match is in progress')).toHaveCount(0);
    });

    test('a finished match is not offered again', async ({ page }) => {
        const dialog = await openLiveMatch(page);
        await dialog.getByRole('button', { name: /Start/ }).click();
        await dialog.getByRole('button', { name: /Save Game Record/i }).click();
        await expect(dialog).not.toBeVisible();

        await page.reload();
        await expect(page.locator('#openMatchday')).toHaveText(/Live Match/);
        await expect(page.getByText('A match is in progress')).toHaveCount(0);
    });

    test('discarding takes a second tap', async ({ page }) => {
        const dialog = await openLiveMatch(page);
        await dialog.getByRole('button', { name: /Start/ }).click();
        await dialog.getByRole('button', { name: /Close Match Mode/i }).click();
        await page.locator('#openMatchday').click();

        await page.click('#discardLiveMatch');
        await expect(page.locator('#discardLiveMatch')).toHaveText('Tap again to discard');
        await expect(page.locator('#liveMatchResumed')).toBeVisible();

        await page.click('#discardLiveMatch');
        await expect(page.locator('#liveMatchResumed')).toHaveCount(0);
        await expect(page.locator('#matchClock')).toHaveText(QUARTER_10U);
    });
});
