// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Signing in must never push an empty roster.
 *
 * PUT /api/teams/:id/players replaces a team's whole roster, so an empty list
 * deletes every player for every coach on the team. App pushes the roster from
 * an effect that depends on currentUser and currentTeam, and signing in sets
 * both one render before the pull that fills the roster in. On a browser that
 * has never opened this origin, localStorage is empty and the roster at that
 * moment is [].
 *
 * That is how a real roster was lost when the app moved to a new domain, a new
 * origin having no localStorage to read.
 *
 * This drives the app's own startup path rather than window.lineupGenerator:
 * that harness sets React state without telling the sync module which team is
 * current, so pushPlayers returns early and no request is ever made — a test
 * built on it passes whether the guard is there or not.
 */
test.describe('Roster is not wiped by signing in', () => {
    const USER = { id: 'user-1', email: 'coach@example.com', displayName: 'Coach', avatarUrl: '' };
    const TEAM = { id: 'team-1', name: 'Tigers', role: 'owner', ageDivision: '10U' };
    const SERVER_ROSTER = [
        { id: 'p1', name: 'Brady', number: 9, status: 'available', isCaptain: false, sortOrder: 0 },
        { id: 'p2', name: 'Henry', number: 2, status: 'available', isCaptain: false, sortOrder: 1 }
    ];


    /**
     * A browser with nothing of this origin in it.
     *
     * The service worker precaches the bundle under a cache name that only
     * changes when someone edits sw.js, so between two builds it will happily
     * serve the previous app — which silently turns a test of this build into
     * a test of the last one. Clearing it is what makes a run mean anything.
     */
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

    /** A signed-in backend whose team already has a roster. Returns the writes seen. */
    async function serveSignedIn(page, { rosterDelayMs = 0 } = {}) {
        const rosterWrites = [];
        const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

        await page.route('**/api/auth/me', (r) => r.fulfill(json({ success: true, data: USER })));
        await page.route('**/api/csrf-token', (r) => r.fulfill(json({ token: 'test-token' })));
        await page.route('**/api/teams', (r) => r.fulfill(json({ success: true, data: [TEAM] })));
        // default_team_id is what makes the app open a team on startup, which
        // is the state the incident happened in: a team selected, and no
        // roster in localStorage yet.
        await page.route('**/api/settings', (r) => r.fulfill(json({
            success: true, data: { default_team_id: TEAM.id }
        })));
        await page.route('**/api/teams/*/settings', (r) => r.fulfill(json({ success: true, data: {} })));
        await page.route('**/api/teams/*/games', (r) => r.fulfill(json({ success: true, data: [] })));
        await page.route('**/api/teams/*/fixtures', (r) => r.fulfill(json({ success: true, data: [] })));

        await page.route('**/api/teams/*/players', async (route) => {
            const req = route.request();
            if (req.method() === 'PUT') {
                let body = null;
                try { body = JSON.parse(req.postData() || 'null'); } catch { /* not JSON */ }
                rosterWrites.push(body);
                return route.fulfill(json({ success: true, data: body?.players ?? [], version: 2 }));
            }
            if (rosterDelayMs) await new Promise((r) => setTimeout(r, rosterDelayMs));
            return route.fulfill(json({ success: true, data: SERVER_ROSTER, version: 1 }));
        });

        return rosterWrites;
    }

    test('a sign-in on a fresh origin does not push an empty roster', async ({ page }) => {
        const writes = await serveSignedIn(page);

        // The condition that caused the incident: nothing stored for this origin.
        await freshOrigin(page);

        // Let startup sign in, pull, and settle.
        await page.waitForTimeout(2500);

        const emptied = writes.filter((w) => Array.isArray(w?.players) && w.players.length === 0);
        expect(
            emptied,
            `signing in sent ${emptied.length} empty roster write(s) of ${writes.length} total; ` +
            `each one deletes the team's players for every coach`
        ).toHaveLength(0);
    });

    test('the pulled roster survives the sign-in', async ({ page }) => {
        await serveSignedIn(page);
        await freshOrigin(page);
        await page.waitForTimeout(2500);

        // sync() writes the pulled roster to storage but cannot touch React
        // state. Startup used to adopt only the schedule and settings from it,
        // so `players` stayed [] and the effect wrote that back over the
        // roster: the coach signed in to an empty roster tab.
        const stored = await page.evaluate(() => window.localStorage.getItem('ayso_players'));
        const names = JSON.parse(stored || '[]').map((p) => p.name);
        expect(names).toEqual(['Brady', 'Henry']);

        // And it reached the roster list, not merely storage. Each row carries
        // the player's name as its aria-label.
        await expect(page.locator('[aria-label="Brady"]')).toHaveCount(1);
    });

    test('a slow roster pull does not let the sign-in push an empty roster', async ({ page }) => {
        // The incident's real shape. The team is settled from the stored
        // default before the roster arrives, so there is a window in which the
        // effect holds [] and a team to push it to. Making the pull slow widens
        // that window to something a test can rely on; on a phone at a field it
        // is wide enough on its own.
        const writes = await serveSignedIn(page, { rosterDelayMs: 1200 });

        await freshOrigin(page);
        await page.waitForTimeout(3500);

        const emptied = writes.filter((w) => Array.isArray(w?.players) && w.players.length === 0);
        expect(
            emptied,
            `a slow pull let ${emptied.length} empty roster write(s) through`
        ).toHaveLength(0);
    });
});
