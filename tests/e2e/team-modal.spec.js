// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The team dialog's create and edit form.
 *
 * There was no coverage of it, which is how 719dde2 shipped: it split the one
 * submit handler into handleCreateTeam and handleUpdateTeam and left the form's
 * onSubmit pointing at the name it had deleted. Every route into the form threw
 * a ReferenceError during render, and with nothing catching it React unmounted
 * the whole app — the coach got a blank white page, not an error.
 *
 * So these tests assert two things at once: that the form works, and that the
 * app is still there afterwards.
 */
test.describe('Team dialog: create and edit', () => {
    const USER = { id: 'user-1', email: 'coach@example.com', displayName: 'Coach', avatarUrl: '' };

    /** The header survives only if the React tree is still mounted. */
    async function expectAppStillMounted(page) {
        await expect(page.locator('#schedule-tab-btn')).toBeVisible();
        await expect(page.locator('#errorBoundary')).toHaveCount(0);
    }

    async function signIn(page, teams = []) {
        await page.goto('/');
        await page.evaluate(({ user, teams }) => {
            const app = window.lineupGenerator;
            app.teams = teams;
            app.updateAuthUI(user);
        }, { user: USER, teams });
    }

    test('Create Team from the roster opens the create form', async ({ page }) => {
        await signIn(page, [{ id: 'team-1', name: 'Tigers', role: 'owner' }]);

        await page.click('#createTeamFromRoster');

        await expect(page.locator('#teamModal')).toBeVisible();
        await expect(page.locator('#teamModalTitle')).toHaveText('Create New Team');
        await expect(page.locator('#teamEditView')).toBeVisible();
        await expect(page.locator('#teamNameInput')).toHaveValue('');
        // Straight to the form, not via the list
        await expect(page.locator('#teamListView')).toHaveCount(0);
        await expectAppStillMounted(page);
    });

    test('Create Team from the team list opens the same form', async ({ page }) => {
        await signIn(page, [{ id: 'team-1', name: 'Tigers', role: 'owner' }]);

        await page.evaluate(() => window.lineupGenerator.showTeamModal());
        await expect(page.locator('#teamListView')).toBeVisible();

        await page.click('#createTeamBtn');

        await expect(page.locator('#teamEditView')).toBeVisible();
        await expect(page.locator('#teamModalTitle')).toHaveText('Create New Team');
        await expectAppStillMounted(page);
    });

    test('submitting the create form POSTs the new team', async ({ page }) => {
        /** @type {any} */
        let posted = null;
        await page.route('**/api/teams', async (route) => {
            if (route.request().method() !== 'POST') return route.fallback();
            posted = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: { id: 'team-new', name: posted.name } }),
            });
        });

        await signIn(page, []);
        await page.click('#createTeamFromRoster');
        await expect(page.locator('#teamEditView')).toBeVisible();

        await page.fill('#teamNameInput', 'Strikers FC');
        await page.click('#saveTeamBtn');

        await expect(page.locator('#teamModal')).toHaveCount(0);
        expect(posted).toBeTruthy();
        expect(posted.name).toBe('Strikers FC');
        await expectAppStillMounted(page);
    });

    test('Edit opens the form prefilled and PUTs the change', async ({ page }) => {
        await page.route('**/api/teams/team-1/members', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: [{ id: 'm1', role: 'owner', userId: 'user-1', displayName: 'Coach' }],
                }),
            }));

        /** @type {any} */
        let put = null;
        await page.route('**/api/teams/team-1', async (route) => {
            if (route.request().method() !== 'PUT') return route.fallback();
            put = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: { id: 'team-1', name: put.name, ageDivision: put.ageDivision, role: 'owner' },
                }),
            });
        });

        await signIn(page, [{ id: 'team-1', name: 'Tigers', role: 'owner', ageDivision: '10U' }]);
        await page.evaluate(async () => {
            await window.lineupGenerator.showTeamDetails('team-1');
        });
        await expect(page.locator('#teamDetailsView')).toBeVisible();

        await page.click('#editTeamBtn');

        // The edit form is the create form, reached with a team selected: it
        // must fill in rather than come up blank, and must save rather than
        // create a second team.
        await expect(page.locator('#teamEditView')).toBeVisible();
        await expect(page.locator('#teamModalTitle')).toHaveText('Edit Team');
        await expect(page.locator('#teamNameInput')).toHaveValue('Tigers');

        await page.fill('#teamNameInput', 'Tigers United');
        await page.click('#saveTeamBtn');

        await expect(page.locator('#teamDetailsView')).toBeVisible();
        expect(put).toBeTruthy();
        expect(put.name).toBe('Tigers United');
        await expectAppStillMounted(page);
    });
});

/**
 * What the coach sees when a component does throw anyway.
 */
test.describe('Error boundary', () => {
    test('shows a way back instead of a blank page', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#schedule-tab-btn')).toBeVisible();

        // A team list that is not a list: TeamModal renders teams.map, which
        // throws. Before the boundary this unmounted the whole app.
        await page.evaluate(() => {
            const app = window.lineupGenerator;
            // @ts-expect-error deliberately the wrong shape
            app.teams = 'not a list';
            app.showTeamModal();
        });

        await expect(page.locator('#errorBoundary')).toBeVisible();
        await expect(page.locator('#errorBoundary')).toContainText('Something went wrong');
        // The roster is in local storage, and the coach is told so
        await expect(page.locator('#errorBoundary')).toContainText('saved on this device');
        await expect(page.locator('#errorBoundaryReload')).toBeVisible();
    });
});
