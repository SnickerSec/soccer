// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The Evaluation tab says whether the coach's work is saved, and it is.
 *
 * Comments used to live on the device only: a signed-in coach's were wiped at
 * the next pull, since the server's roster replaces the local one, and the tab
 * gave no sign either way. They are sent with the roster now, once per field
 * rather than once per letter, and the status line follows the write.
 */

const USER = { id: 'user-1', email: 'coach@example.com', displayName: 'Coach', avatarUrl: '' };
const TEAM = { id: 'team-1', name: 'Tigers', role: 'owner', ageDivision: '10U' };
const SERVER_ROSTER = [
    { id: 'p1', name: 'Brady', number: 9, status: 'available', sortOrder: 0, comments: 'Strong left foot' },
    { id: 'p2', name: 'Henry', number: 2, status: 'available', sortOrder: 1, comments: '' }
];

/** As in roster-not-wiped-on-signin: a stale service worker would test the last build. */
async function freshOrigin(page) {
    await page.goto('/');
    await page.evaluate(async () => {
        if (navigator.serviceWorker) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
        }
        if (window.caches) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
        }
        window.localStorage.clear();
    });
    await page.reload();
}

/** A signed-in backend. Returns the roster writes it sees; `release` lets a held PUT finish. */
async function serveSignedIn(page, { holdWrites = false } = {}) {
    const writes = [];
    let release = () => {};
    const held = new Promise((resolve) => { release = resolve; });
    const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    await page.route('**/api/auth/me', (r) => r.fulfill(json({ success: true, data: USER })));
    await page.route('**/api/csrf-token', (r) => r.fulfill(json({ token: 'test-token' })));
    await page.route('**/api/teams', (r) => r.fulfill(json({ success: true, data: [TEAM] })));
    await page.route('**/api/settings', (r) => r.fulfill(json({ success: true, data: { default_team_id: TEAM.id } })));
    await page.route('**/api/teams/*/settings', (r) => r.fulfill(json({ success: true, data: {} })));
    await page.route('**/api/teams/*/games', (r) => r.fulfill(json({ success: true, data: [] })));
    await page.route('**/api/teams/*/fixtures', (r) => r.fulfill(json({ success: true, data: [] })));
    await page.route('**/api/teams/*/players', async (route) => {
        const req = route.request();
        if (req.method() === 'PUT') {
            const body = JSON.parse(req.postData() || 'null');
            writes.push(body);
            if (holdWrites) await held;
            return route.fulfill(json({ success: true, data: body?.players ?? [], version: 1 + writes.length }));
        }
        return route.fulfill(json({ success: true, data: SERVER_ROSTER, version: 1 }));
    });

    return { writes, release: () => release() };
}

test.describe('Evaluation save status, signed out', () => {
    test('says the work is on this device, and shows a comment being typed as unsaved', async ({ page }) => {
        await page.goto('/');
        await page.fill('#playerName', 'Ana');
        await page.click('#addPlayer');
        await page.click('#evaluation-tab-btn');

        const status = page.locator('#evaluationSaveStatus');
        await expect(status).toHaveText('Saved on this device');

        await page.locator('#comment-0').fill('Great first touch');
        await expect(status).toContainText('Editing');

        await page.locator('#comment-0').press('Enter');
        await expect(status).toHaveText('Saved on this device');

        await page.reload();
        await page.click('#evaluation-tab-btn');
        await expect(page.locator('#comment-0')).toHaveValue('Great first touch');
    });

    test('a coach name being typed is unsaved until the field is left', async ({ page }) => {
        await page.goto('/');
        await page.click('#evaluation-tab-btn');

        await page.fill('#coachName', 'Pat');
        await expect(page.locator('#evaluationSaveStatus')).toContainText('Editing');
        await page.locator('#coachName').blur();
        await expect(page.locator('#evaluationSaveStatus')).toHaveText('Saved on this device');
    });
});

test.describe('Evaluation save status, signed in', () => {
    test('comments come from the server', async ({ page }) => {
        await serveSignedIn(page);
        await freshOrigin(page);
        await page.click('#evaluation-tab-btn');

        await expect(page.locator('[aria-label="Comments for Brady"]')).toHaveValue('Strong left foot');
        await expect(page.locator('#evaluationSaveStatus')).toHaveText('All changes saved');
    });

    test('a comment is sent once when the field is left, and the status follows the write', async ({ page }) => {
        const backend = await serveSignedIn(page, { holdWrites: true });
        await freshOrigin(page);
        await page.click('#evaluation-tab-btn');
        const henry = page.locator('[aria-label="Comments for Henry"]');
        await expect(henry).toHaveValue('');

        await henry.pressSequentially('Works hard');
        // Nothing goes to the server while the coach is still typing. The wait
        // is what lets a per-keystroke push land if there were one.
        await page.waitForTimeout(500);
        expect(backend.writes).toHaveLength(0);

        await henry.blur();
        await expect(page.locator('#evaluationSaveStatus')).toHaveText('Saving…');
        expect(backend.writes).toHaveLength(1);
        const sent = backend.writes[0].players.find((p) => p.name === 'Henry');
        expect(sent.comments).toBe('Works hard');

        backend.release();
        await expect(page.locator('#evaluationSaveStatus')).toHaveText('All changes saved');
    });
});
