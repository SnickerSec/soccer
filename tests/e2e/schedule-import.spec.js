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

  // A TeamSnap "one calendar" export: CRLF, tab-folded lines, every DTSTART in
  // UTC, and the practices outnumbering the games four to one.
  const teamsnapIcsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TeamSnap//TeamSnap Calendar//EN',
    'BEGIN:VEVENT',
    'UID:event-979924@teamsnapone.com',
    'SUMMARY:Practice: U10B-02 Williams Practice at Kaha Park',
    'DTSTART:20260811T030000Z',
    'LOCATION:Kawai Nui Neighborhood Park\\nKaha St\\, Kailua\\, HI 96734\\, USA',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:event-1200100@teamsnapone.com',
    'SUMMARY:Game: U10B-02 Williams vs U10B-07 Shaffer',
    'DTSTART:20260830T000000Z',
    'DESCRIPTION:Game: U10B-02 Williams vs U10B-07 Shaffer\\nLocation: Kailua Dis',
    '\ttrict Park - PAV Field 1\\nDuration: 1 hour 15 minutes\\nLink: https://link',
    '\t.teamsnapone.com/j8yu/lti6qv3a',
    'LOCATION:Kailua District Park - PAV Field 1',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  test.describe('a TeamSnap calendar dump', () => {
    // The kickoff is 2pm Saturday in Hawaii, which TeamSnap stamps as midnight
    // Sunday UTC. Pin the browser's zone so the assertion means that.
    test.use({ timezoneId: 'Pacific/Honolulu' });

    test('imports the games at the local kickoff and leaves the practices out', async ({ page }) => {
      await page.goto('/');
      await page.click('#schedule-tab-btn');

      await page.locator('#scheduleFileInput').setInputFiles({
        name: 'user.ics',
        mimeType: 'text/calendar',
        buffer: Buffer.from(teamsnapIcsContent, 'utf-8'),
      });

      const modal = page.locator('#scheduleImportModal');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('TeamSnap Calendar');
      await expect(modal).toContainText('U10B-07 Shaffer');
      await expect(modal).toContainText('1 non-match event was skipped');
      await expect(modal).not.toContainText('Kaha Park');
      // Saturday the 29th at 2pm, not Sunday the 30th at midnight.
      await expect(modal).toContainText('Saturday, August 29, 2026 • 2:00 PM');

      await page.click('#confirmScheduleImportBtn');
      await expect(modal).not.toBeVisible();

      const scheduleTab = page.locator('#schedule-tab');
      await expect(scheduleTab).toContainText('U10B-07 Shaffer');
      await expect(scheduleTab).not.toContainText('Kaha Park');
    });
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

/**
 * The volunteer coverage tile. It used to fall back to 100% when there was no
 * match to cover, so a team that had just been created was told its snack rota
 * was complete — under a label that read "0/1 assigned" in the same breath.
 * That is the first screen a new coach sees, and it is the one that decides
 * whether they go and chase parents.
 */
test.describe('Volunteer coverage on an empty schedule', () => {
  test('shows no figure at all rather than claiming full coverage', async ({ page }) => {
    await page.goto('/');
    await page.click('#schedule-tab-btn');
    await expect(page.locator('#schedule-tab')).toBeVisible();

    const panel = page.locator('#schedule-tab');
    await expect(panel).toContainText('Snack Coverage (no matches scheduled)');
    await expect(panel).not.toContainText('100%');
    // The contradiction the fallback produced, gone with the `|| 1` behind it.
    await expect(panel).not.toContainText('0/1 assigned');
  });

  test('reports a real percentage once the season has matches in it', async ({ page }) => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Shinguard//Coverage Test//EN
BEGIN:VEVENT
UID:cov-1@ayso.test
DTSTART:20260912T090000Z
SUMMARY:Thunder vs Lightning
DESCRIPTION:Snack: Alice
END:VEVENT
BEGIN:VEVENT
UID:cov-2@ayso.test
DTSTART:20260919T090000Z
SUMMARY:Thunder vs Sharks
END:VEVENT
END:VCALENDAR`;

    await page.goto('/');
    await page.click('#schedule-tab-btn');
    await page.locator('#scheduleFileInput').setInputFiles({
      name: 'coverage.ics',
      mimeType: 'text/calendar',
      buffer: Buffer.from(ics, 'utf-8'),
    });

    const modal = page.locator('#scheduleImportModal');
    await expect(modal).toBeVisible();
    await page.click('#confirmScheduleImportBtn');
    await expect(modal).not.toBeVisible();

    // One of the two matches has a snack parent, and the label counts the same
    // matches the percentage is taken over.
    const panel = page.locator('#schedule-tab');
    await expect(panel).toContainText('50%');
    await expect(panel).toContainText('Snack Coverage (1/2 assigned)');
  });
});
