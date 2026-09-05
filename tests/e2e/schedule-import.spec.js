// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Schedule & Calendar Importer', () => {
  const sampleIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Shinguard//Schedule Importer Test//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:event-1@ayso.test
DTSTART:20260912T090000Z
SUMMARY:Thunder vs Lightning
LOCATION:Kapiolani Park Field 1
DESCRIPTION:Jersey: Blue\\nSnack: Alice\\nFruit: Bob
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:event-2@ayso.test
DTSTART:20260919T103000Z
SUMMARY:Thunder @ Sharks (Away)
LOCATION:Waipio Soccer Complex Field 5
DESCRIPTION:Away game vs Sharks
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

  test('uploads .ics calendar file, previews in modal, and imports matches', async ({ page }) => {
    await page.goto('/');

    // Navigate to Schedule Tab
    await page.click('#schedule-tab-btn');
    await expect(page.locator('#schedule-tab')).toBeVisible();

    // Set input file on scheduleFileInput
    const fileInput = page.locator('#scheduleFileInput');
    await fileInput.setInputFiles({
      name: 'season-schedule.ics',
      mimeType: 'text/calendar',
      buffer: Buffer.from(sampleIcsContent, 'utf-8'),
    });

    // Schedule Import Modal should open
    const modal = page.locator('#scheduleImportModal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Import Schedule Preview');
    await expect(modal).toContainText('Lightning');
    await expect(modal).toContainText('Sharks');
    await expect(modal).toContainText('Kapiolani Park Field 1');

    // Confirm import
    const confirmBtn = page.locator('#confirmScheduleImportBtn');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Modal should close and schedule tab should show the imported fixtures
    await expect(modal).not.toBeVisible();

    // Check that matches render in the schedule cards
    await expect(page.locator('#schedule-tab')).toContainText('Lightning');
    await expect(page.locator('#schedule-tab')).toContainText('Sharks');
    await expect(page.locator('#schedule-tab')).toContainText('Kapiolani Park Field 1');
  });

  test('uploads CSV schedule, previews, and replaces schedule', async ({ page }) => {
    const csvContent = `Date,Time,Opponent,Home/Away,Location / Field,Jersey Color,Post-Game Snack,Halftime Fruit
2026-10-03,08:30,Firebirds,Home,Ala Wai Field 2,Red,Sarah,Tom
2026-10-10,11:00,Cobras,Away,Kapiolani Field 4,White,David,Lisa`;

    await page.goto('/');
    await page.click('#schedule-tab-btn');

    const fileInput = page.locator('#scheduleFileInput');
    await fileInput.setInputFiles({
      name: 'matches.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf-8'),
    });

    const modal = page.locator('#scheduleImportModal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Firebirds');
    await expect(modal).toContainText('Cobras');

    // Select replace mode
    await page.click('input[name="scheduleImportMode"][value="replace"]');

    // Confirm
    await page.click('#confirmScheduleImportBtn');
    await expect(modal).not.toBeVisible();

    // Check that schedule displays Firebirds and Cobras
    await expect(page.locator('#schedule-tab')).toContainText('Firebirds');
    await expect(page.locator('#schedule-tab')).toContainText('Cobras');
  });
});
