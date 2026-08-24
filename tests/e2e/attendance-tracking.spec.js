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
