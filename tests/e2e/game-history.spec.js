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

        // Re-open the saved game from history, then put it back on the field
        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="view-game"]').first().click();
        await expect(page.locator('#editGameModal')).toBeVisible();
        await page.click('#openGameOnField');
        await expect(page.locator('#editGameModal')).toBeHidden();

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

    test('edit game modal opens with prefilled name, date, and notes', async ({ page }) => {
        await saveGameAt(page, { division: '10U', name: 'vs Lions', date: '2026-03-21' });

        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="view-game"]').first().click();

        await expect(page.locator('#editGameModal')).toBeVisible();
        await expect(page.locator('#editGameName')).toHaveValue('vs Lions');
        await expect(page.locator('#editGameDate')).toHaveValue('2026-03-21');
        await expect(page.locator('#editGameNotes')).toHaveValue('');
    });

    test('saving edited game updates name, date, and notes in the UI and storage', async ({ page }) => {
        await saveGameAt(page, { division: '10U', name: 'vs Lions', date: '2026-03-21' });

        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="view-game"]').first().click();

        await page.fill('#editGameName', 'vs Tigers (3-1)');
        await page.fill('#editGameDate', '2026-03-28');
        await page.fill('#editGameNotes', 'Great second half comeback');
        await page.click('#confirmEditGame');

        await expect(page.locator('#editGameModal')).toBeHidden();
        await expect(page.locator('.game-history-item .game-name')).toHaveText('vs Tigers (3-1)');
        await expect(page.locator('.game-history-item .game-date')).toContainText('Mar 28, 2026');
        await expect(page.locator('.game-history-item .game-notes')).toHaveText('Great second half comeback');

        // Check local storage persistence
        const historyJson = await page.evaluate(() => localStorage.getItem('ayso_lineup_history'));
        expect(historyJson).toBeTruthy();
        const history = JSON.parse(historyJson || '[]');
        expect(history[0].name).toBe('vs Tigers (3-1)');
        expect(history[0].date).toBe('2026-03-28');
        expect(history[0].notes).toBe('Great second half comeback');
    });

    test('cancelling edit game leaves the game untouched', async ({ page }) => {
        await saveGameAt(page, { division: '10U', name: 'vs Lions', date: '2026-03-21' });

        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="view-game"]').first().click();

        await page.fill('#editGameName', 'Discarded Name Change');
        await page.click('#cancelEditGame');

        await expect(page.locator('#editGameModal')).toBeHidden();
        await expect(page.locator('.game-history-item .game-name')).toHaveText('vs Lions');
    });
});

/**
 * What happened is not what was planned.
 *
 * A saved game records who played which position in which quarter, who wore
 * the armband, and who was there at all — and every per-player figure the
 * Season tab shows is derived from those, never recounted from the quarters.
 * So an edit has to move the record and the derived rows together.
 */
test.describe('Correcting a played game', () => {
    async function saveDemoGame(page) {
        await page.goto('/');
        await page.click('#demoButton');
        await page.selectOption('#ageDivision', '10U');
        await page.click('#generateLineup');
        await expect(page.locator('.action-buttons-inline')).toBeVisible({ timeout: 20000 });

        await page.locator('.action-buttons-inline [data-action="saveGame"]').click();
        await page.fill('#saveGameName', 'vs Lions');
        await page.fill('#saveGameDate', '2026-03-21');
        await page.click('#confirmSaveGame');
        await expect(page.locator('#saveGameModal')).toBeHidden();

        await page.click('#season-tab-btn');
        await page.locator('.game-history-item button[data-action="view-game"]').first().click();
        await expect(page.locator('#editGameModal')).toBeVisible();
    }

    test('opening a game stays on the Season tab', async ({ page }) => {
        await saveDemoGame(page);

        // The dialog opens over the season history rather than moving the
        // coach to the Roster tab with the team's settings changed.
        await expect(page.locator('#season-tab')).toHaveClass(/active/);
        await expect(page.locator('#editGameSquad')).toBeVisible();
        await expect(page.locator('#editGameLineup')).toBeVisible();
    });

    test('marking a player absent takes them out of every quarter', async ({ page }) => {
        await saveDemoGame(page);

        // Whoever kept goal in Q1 — take them out of the match entirely.
        const keeper = await page
            .locator('.game-quarter-edit[data-quarter="1"] select')
            .first()
            .inputValue();
        expect(keeper).not.toBe('');

        await page
            .locator(`.game-squad-row[data-player="${keeper}"] select[data-action="player-status"]`)
            .selectOption('absent');

        // Gone from the field, and no longer offered for any slot.
        const stillOn = await page
            .locator('.game-quarter-edit select')
            .evaluateAll((selects, name) => selects.some((s) => s.value === name), keeper);
        expect(stillOn).toBe(false);

        await page.click('#confirmEditGame');
        await expect(page.locator('#editGameModal')).toBeHidden();

        const saved = await page.evaluate((name) => {
            const history = JSON.parse(localStorage.getItem('ayso_lineup_history') || '[]');
            const player = history[0].players.find((p) => p.name === name);
            return {
                status: player.status,
                played: player.quartersPlayed.length,
                sat: player.quartersSitting.length,
                onField: history[0].quarters.some((q) => Object.values(q.positions).includes(name)),
            };
        }, keeper);

        expect(saved.status).toBe('absent');
        expect(saved.onField).toBe(false);
        // Not there to play and not there to sit: the season must not count
        // this as a game they attended.
        expect(saved.played).toBe(0);
        expect(saved.sat).toBe(0);
    });

    test('changing who played where is what the season then counts', async ({ page }) => {
        await saveDemoGame(page);

        // Put whoever sat Q1 into the striker's shirt for that quarter.
        const resting = await page
            .locator('.game-quarter-edit[data-quarter="1"] .quarter-resting')
            .textContent();
        const substitute = (resting || '').replace('Resting:', '').split(',')[0].trim();
        expect(substitute).toBeTruthy();

        const slot = page.locator('.game-quarter-edit[data-quarter="1"] select').last();
        await slot.selectOption(substitute);

        await page.click('#confirmEditGame');
        await expect(page.locator('#editGameModal')).toBeHidden();

        const saved = await page.evaluate((name) => {
            const history = JSON.parse(localStorage.getItem('ayso_lineup_history') || '[]');
            const player = history[0].players.find((p) => p.name === name);
            return {
                played: player.quartersPlayed,
                positions: player.positionsPlayed,
                onField: history[0].quarters[0].positions,
            };
        }, substitute);

        expect(saved.played).toContain(1);
        expect(saved.positions.some((p) => p.quarter === 1)).toBe(true);
        expect(Object.values(saved.onField)).toContain(substitute);
    });

    test('the armband can change hands after the match', async ({ page }) => {
        await saveDemoGame(page);

        // The armband is capped, so hand it over rather than adding one more:
        // take it off everyone who has it, then give it to someone who does not.
        const worn = page.locator('.game-squad-row:has(button[aria-pressed="true"])');
        const dropped = await worn.first().getAttribute('data-player');
        while ((await worn.count()) > 0) {
            await worn.first().locator('button[data-action="toggle-captain"]').click();
        }

        const incoming = page.locator('.game-squad-row').first();
        const player = await incoming.getAttribute('data-player');
        await incoming.locator('button[data-action="toggle-captain"]').click();
        await expect(incoming.locator('button[data-action="toggle-captain"]')).toHaveAttribute(
            'aria-pressed',
            'true'
        );

        await page.click('#confirmEditGame');
        await expect(page.locator('#editGameModal')).toBeHidden();

        const saved = await page.evaluate(([name, formerName]) => {
            const history = JSON.parse(localStorage.getItem('ayso_lineup_history') || '[]');
            return {
                captains: history[0].captains,
                isCaptain: history[0].players.find((p) => p.name === name).isCaptain,
                formerIsCaptain: history[0].players.find((p) => p.name === formerName).isCaptain,
            };
        }, [player, dropped]);

        expect(saved.isCaptain).toBe(true);
        expect(saved.captains).toContain(player);
        // And the player it came from no longer counts a captain game for it.
        expect(saved.formerIsCaptain).toBe(false);
        expect(saved.captains).not.toContain(dropped);
    });
});
