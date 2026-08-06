// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The account menu: identity, team switching and team management, all hanging
 * off the avatar.
 *
 * Signing in needs real Google credentials, so these drive the app object
 * directly to put it in a signed-in state, the same approach the sync status
 * tests use.
 */
test.describe('Account menu', () => {
    const USER = {
        id: 'user-1',
        email: 'coach@example.com',
        displayName: 'Coach Taylor',
        avatarUrl: ''
    };

    const TEAMS = [
        { id: 'team-1', name: 'Tigers', role: 'owner' },
        { id: 'team-2', name: 'Lions', role: 'coach' },
        { id: 'team-3', name: 'Bears', role: 'viewer' }
    ];

    /** Puts the app in a signed-in state with a few teams. */
    async function signIn(page, { teams = TEAMS, currentTeamId = 'team-2' } = {}) {
        await page.evaluate(({ user, teams, currentTeamId }) => {
            const app = window.lineupGenerator;
            app.teams = teams;
            app.currentTeamId = currentTeamId;
            app.updateAuthUI(user);
            app.updateTeamSelector();
        }, { user: USER, teams, currentTeamId });
    }

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await signIn(page);
    });

    test('there is no separate team selector left in the header', async ({ page }) => {
        await expect(page.locator('#teamSelector')).toHaveCount(0);
        await expect(page.locator('#currentTeam')).toHaveCount(0);

        // One control for the account, and it is the avatar trigger
        await expect(page.locator('#accountTrigger')).toBeVisible();
    });

    test('the panel stays shut until the trigger is used', async ({ page }) => {
        await expect(page.locator('#accountPanel')).toBeHidden();
        await expect(page.locator('#accountTrigger')).toHaveAttribute('aria-expanded', 'false');

        await page.click('#accountTrigger');

        await expect(page.locator('#accountPanel')).toBeVisible();
        await expect(page.locator('#accountTrigger')).toHaveAttribute('aria-expanded', 'true');
    });

    test('the trigger is just the avatar; the name lives in the panel', async ({ page }) => {
        // The name was duplicated on the trigger, where it only cost width
        const triggerText = await page.locator('#accountTrigger').innerText();
        expect(triggerText.trim()).toBe('');

        const width = await page.evaluate(() =>
            document.getElementById('accountTrigger').getBoundingClientRect().width
        );
        expect(width).toBeLessThan(70);

        await page.click('#accountTrigger');
        await expect(page.locator('#accountName')).toHaveText('Coach Taylor');
    });

    test('shows who is signed in', async ({ page }) => {
        await page.click('#accountTrigger');

        await expect(page.locator('#accountName')).toHaveText('Coach Taylor');
        await expect(page.locator('#accountEmail')).toHaveText('coach@example.com');
    });

    test('lists every team and marks the current one', async ({ page }) => {
        await page.click('#accountTrigger');

        const items = page.locator('#accountTeamList .account-team');
        await expect(items).toHaveCount(3);

        await expect(items.nth(0)).toHaveAttribute('aria-checked', 'false');
        await expect(items.nth(1)).toHaveAttribute('aria-checked', 'true');
        await expect(items.nth(2)).toHaveAttribute('aria-checked', 'false');

        // Roles are visible, so a viewer knows why editing is unavailable
        await expect(items.nth(0)).toContainText('Tigers');
        await expect(items.nth(0)).toContainText('owner');
        await expect(items.nth(2)).toContainText('viewer');
    });

    test('choosing another team switches to it and closes the menu', async ({ page }) => {
        // Record the call rather than hitting the network
        await page.evaluate(() => {
            window.__switched = [];
            window.lineupGenerator.switchTeam = (id) => { window.__switched.push(id); };
        });

        await page.click('#accountTrigger');
        await page.locator('#accountTeamList .account-team', { hasText: 'Tigers' }).click();

        expect(await page.evaluate(() => window.__switched)).toEqual(['team-1']);
        await expect(page.locator('#accountPanel')).toBeHidden();
    });

    test('choosing the team already in use does nothing', async ({ page }) => {
        await page.evaluate(() => {
            window.__switched = [];
            window.lineupGenerator.switchTeam = (id) => { window.__switched.push(id); };
        });

        await page.click('#accountTrigger');
        await page.locator('#accountTeamList .account-team', { hasText: 'Lions' }).click();

        expect(await page.evaluate(() => window.__switched)).toEqual([]);
        await expect(page.locator('#accountPanel')).toBeHidden();
    });

    test('manage teams opens the team dialog from inside the menu', async ({ page }) => {
        await page.click('#accountTrigger');
        await page.click('#manageTeams');

        await expect(page.locator('#teamModal')).toBeVisible();
        await expect(page.locator('#accountPanel')).toBeHidden();
    });

    test('closes on a click elsewhere', async ({ page }) => {
        await page.click('#accountTrigger');
        await expect(page.locator('#accountPanel')).toBeVisible();

        await page.click('h1');
        await expect(page.locator('#accountPanel')).toBeHidden();
    });

    test('closes on Escape and returns focus to the trigger', async ({ page }) => {
        await page.click('#accountTrigger');
        await expect(page.locator('#accountPanel')).toBeVisible();

        await page.keyboard.press('Escape');

        await expect(page.locator('#accountPanel')).toBeHidden();
        await expect(page.locator('#accountTrigger')).toBeFocused();
    });

    test('opening moves focus into the menu', async ({ page }) => {
        await page.click('#accountTrigger');

        const focused = await page.evaluate(() => document.activeElement?.className);
        expect(focused).toContain('account-item');
    });

    test('says so when there are no teams yet', async ({ page }) => {
        await signIn(page, { teams: [], currentTeamId: null });
        await page.click('#accountTrigger');

        await expect(page.locator('.account-empty')).toHaveText('No teams yet');
        // Manage teams is still reachable, so a first team can be created
        await expect(page.locator('#manageTeams')).toBeVisible();
    });

    test('is not shown at all when signed out', async ({ page }) => {
        await page.evaluate(() => window.lineupGenerator.updateAuthUI(null));

        await expect(page.locator('#userMenu')).toBeHidden();
        await expect(page.locator('#accountPanel')).toBeHidden();
    });
});
