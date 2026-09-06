// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Season Attendance & Absentee Tracking', () => {
    test('tracks matchday attendance, handles absentee toggles and displays season attendance metrics', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await page.goto('/');

        // Load demo roster
        await page.click('#demoButton');

        // Verify present count badge
        const presentBadge = page.locator('#presentPlayerCount');
        await expect(presentBadge).toBeVisible();
        await expect(presentBadge).toContainText('Present');

        // Mark first player as absent
        const firstStatusSelect = page.locator('.player-status-select').first();
        await firstStatusSelect.selectOption('absent');

        // Verify absent count badge and quick mark all available button
        const absentBadge = page.locator('#absentPlayerCount');
        await expect(absentBadge).toBeVisible();
        await expect(absentBadge).toContainText('1 Absent');

        const markAllBtn = page.locator('#markAllAvailable');
        await expect(markAllBtn).toBeVisible();
        await markAllBtn.click();

        // Verify all are now present
        await expect(absentBadge).not.toBeVisible();

        // Switch to Season tab
        const seasonTab = page.locator('button[role="tab"]').filter({ hasText: 'Season' });
        await seasonTab.click();

        // Verify Squad Attendance Rate summary card
        const attendanceRate = page.locator('#squadAttendanceRate');
        await expect(attendanceRate).toBeVisible();
        await expect(attendanceRate).toContainText('%');

        expect(errors).toEqual([]);
    });
});

/**
 * A saved game used to record only the players the engine was handed, which is
 * the available ones. Anyone marked absent was simply not in it, and
 * calculatePlayerStats counts a game towards a player only when the game names
 * them — so no absence was ever recorded, every row read 100%, and the squad
 * rate could not be anything but 100% however many games a player missed.
 */
test.describe('An absence survives the save', () => {
    test('the player who missed a game is reported as having missed it', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');

        // The absent player is read off the roster rather than assumed: the
        // demo names are shuffled.
        const absentee = await page.locator('.player-status-select').first().getAttribute('data-player');
        expect(absentee).toBeTruthy();
        await page.locator(`.player-status-select[data-player="${absentee}"]`).selectOption('absent');

        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });

        await page.locator('.action-buttons-inline [data-action="saveGame"]').click();
        await page.fill('#saveGameName', 'vs Rovers');
        await page.click('#confirmSaveGame');
        await expect(page.locator('#saveGameModal')).toBeHidden();

        await page.click('#season-tab-btn');
        await expect(page.locator('#totalGames')).toHaveText('1');

        // Their row, and only their row, shows the miss.
        const row = page.locator('#playerStatsTable tbody tr').filter({ hasText: absentee }).first();
        await expect(row).toContainText('0%');
        await expect(row).toContainText('1 missed');

        // And the squad rate is no longer the 100% it always used to report.
        await expect(page.locator('#squadAttendanceRate')).not.toHaveText('100%');
    });

    test('a full turnout still reports everybody present', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });

        await page.locator('.action-buttons-inline [data-action="saveGame"]').click();
        await page.fill('#saveGameName', 'vs Rangers');
        await page.click('#confirmSaveGame');
        await expect(page.locator('#saveGameModal')).toBeHidden();

        await page.click('#season-tab-btn');
        await expect(page.locator('#squadAttendanceRate')).toHaveText('100%');
        await expect(page.locator('#playerStatsTable')).not.toContainText('missed');
    });

    // Captains live in their own state rather than on the roster rows, so the
    // snapshot carried none of them: Captain Matches read 0 for the whole
    // squad forever, and the balancing that picks next week's captains from
    // whoever has worn the armband least was reading that same zero.
    test('the armband is recorded against the players who wore it', async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');

        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });

        // Generating picks the two captains, so who wears the armband is only
        // settled once the lineup exists.
        const captain = await page.locator('.captain-checkbox:checked').first().getAttribute('data-player');
        expect(captain).toBeTruthy();

        await page.locator('.action-buttons-inline [data-action="saveGame"]').click();
        await page.fill('#saveGameName', 'vs Athletic');
        await page.click('#confirmSaveGame');
        await expect(page.locator('#saveGameModal')).toBeHidden();

        await page.click('#season-tab-btn');
        const heatmap = page.locator('#playerDevelopmentHeatmap');
        await heatmap.getByRole('button', { name: captain, exact: true }).click();
        await expect(heatmap).toContainText('⭐ 1');
    });
});
