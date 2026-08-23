// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Saved game history: loading a game back, and editing its notes.
 *
 * Loading has to restore the settings a game was saved with, not just its
 * roster and lineup — displayLineup() renders rows from this.positions, which
 * comes from the formation, so a game saved at one field size opened at another
 * would be drawn against the wrong position list.
 */
test.describe('Game history', () => {
    /** Saves a game at the given division, returning to a clean state after. */
    async function saveGameAt(page, { division, name, date }) {
        await page.selectOption('#ageDivision', division);
        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });

        await page.locator('.action-buttons-inline [data-action="saveGame"]').click();
        await page.fill('#saveGameName', name);
        await page.fill('#saveGameDate', date);
        await page.click('#confirmSaveGame');
        await expect(page.locator('#saveGameModal')).toBeHidden();
    }

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.click('#demoButton');
    });

    test('loading a game restores the settings it was saved with', async ({ page }) => {
        // Save at 12U, which is 9v9 and has its own formation list
        await saveGameAt(page, { division: '12U', name: 'vs Tigers', date: '2026-03-14' });

        const saved = await page.evaluate(() => ({
            division: document.getElementById('ageDivision').value,
            field: document.getElementById('fieldPlayers').value,
            formation: document.getElementById('formation').value,
            // One quarter card's position rows -- the grid renders four cards
            rows: document.querySelector('.quarter-lineup').querySelectorAll('tr.draggable-row:not(.sitting-row)').length
        }));
        expect(saved.field).toBe('9');

        // Switch the app to a different division entirely
        await page.selectOption('#ageDivision', '10U');
        await expect(page.locator('#fieldPlayers')).toHaveValue('7');

        // Re-open the saved game from history
        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="view-game"]').first().click();

        const restored = await page.evaluate(() => ({
            division: document.getElementById('ageDivision').value,
            field: document.getElementById('fieldPlayers').value,
            formation: document.getElementById('formation').value,
            // One quarter card's position rows -- the grid renders four cards
            rows: document.querySelector('.quarter-lineup').querySelectorAll('tr.draggable-row:not(.sitting-row)').length
        }));

        expect(restored.division).toBe('12U');
        expect(restored.field).toBe('9');
        expect(restored.formation).toBe(saved.formation);
        // The grid is drawn against the saved formation's positions, not 7v7's
        expect(restored.rows).toBe(saved.rows);
        expect(restored.rows).toBe(9);
    });

    test('notes open in a dialog rather than a browser prompt', async ({ page }) => {
        await saveGameAt(page, { division: '10U', name: 'vs Lions', date: '2026-03-21' });

        let promptShown = false;
        page.on('dialog', async d => { promptShown = true; await d.dismiss(); });

        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="notes-game"]').first().click();

        await expect(page.locator('#notesModal')).toBeVisible();
        await expect(page.locator('#notesGameName')).toHaveText('vs Lions');
        expect(promptShown).toBe(false);
    });

    test('saving notes puts them on the game', async ({ page }) => {
        await saveGameAt(page, { division: '10U', name: 'vs Lions', date: '2026-03-21' });

        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="notes-game"]').first().click();
        await page.fill('#gameNotesInput', 'Won 3-1, strong second half');
        await page.click('#confirmGameNotes');

        await expect(page.locator('#notesModal')).toBeHidden();
        await expect(page.locator('.game-history-item .game-notes')).toHaveText('Won 3-1, strong second half');
    });

    test('existing notes are prefilled for editing', async ({ page }) => {
        await saveGameAt(page, { division: '10U', name: 'vs Lions', date: '2026-03-21' });

        await page.click('#season-tab-btn');
        const notesButton = page.locator('.game-history-item button[data-action="notes-game"]').first();

        await notesButton.click();
        await page.fill('#gameNotesInput', 'First pass');
        await page.click('#confirmGameNotes');

        await notesButton.click();
        await expect(page.locator('#gameNotesInput')).toHaveValue('First pass');
    });

    test('cancelling notes leaves the game untouched', async ({ page }) => {
        await saveGameAt(page, { division: '10U', name: 'vs Lions', date: '2026-03-21' });

        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="notes-game"]').first().click();
        await page.fill('#gameNotesInput', 'Discarded');
        await page.click('#cancelGameNotes');

        await expect(page.locator('#notesModal')).toBeHidden();
        await expect(page.locator('.game-history-item .game-notes')).toHaveCount(0);
    });
});
