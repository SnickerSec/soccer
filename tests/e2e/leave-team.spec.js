// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Leaving a team.
 *
 * Membership used to be one-way: an invite could be accepted but not undone,
 * and only an owner could remove anyone, so a coach who joined the wrong team
 * was on it for good. leaveTeam existed in team-manager.js but was never wired
 * to anything, and went through the owner-only removal route — so it would have
 * been refused for exactly the people who needed it.
 *
 * Signing in needs real Google credentials, so these drive the app object
 * directly, the same approach the account menu tests use.
 */
test.describe('Leave team', () => {
    const USER = { id: 'user-1', email: 'coach@example.com', displayName: 'Coach', avatarUrl: '' };

    /**
     * Opens the details view for a team, with `members` as what the server
     * would return for it.
     */
    async function openTeamDetails(page, { role, members }) {
        // The members list comes from the server, which is not signed in here
        await page.route('**/api/teams/team-1/members', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: members })
            }));

        await page.goto('/');
        await page.evaluate(async ({ user, role }) => {
            const app = window.lineupGenerator;
            app.currentUser = user;
            app.teams = [{ id: 'team-1', name: 'Tigers', role }];
            app.currentTeamId = 'team-1';
            app.updateAuthUI(user);
            // The details view lives inside the team dialog, which has to be
            // showing before anything in it can be visible
            app.showTeamModal();
            await app.showTeamDetails('team-1');
        }, { user: USER, role });

        await expect(page.locator('#teamDetailsView')).toBeVisible();
    }

    const leaveButton = (page) => page.locator('#leaveTeamBtn');

    test('is offered to a coach', async ({ page }) => {
        await openTeamDetails(page, {
            role: 'coach',
            members: [
                { id: 'm1', role: 'owner', userId: 'user-2', displayName: 'Owner' },
                { id: 'm2', role: 'coach', userId: 'user-1', displayName: 'Coach' }
            ]
        });

        await expect(leaveButton(page)).toBeVisible();
    });

    test('is offered to a viewer', async ({ page }) => {
        await openTeamDetails(page, {
            role: 'viewer',
            members: [
                { id: 'm1', role: 'owner', userId: 'user-2', displayName: 'Owner' },
                { id: 'm2', role: 'viewer', userId: 'user-1', displayName: 'Viewer' }
            ]
        });

        await expect(leaveButton(page)).toBeVisible();
    });

    test('is not offered to the only owner', async ({ page }) => {
        await openTeamDetails(page, {
            role: 'owner',
            members: [{ id: 'm1', role: 'owner', userId: 'user-1', displayName: 'Owner' }]
        });

        // Nobody to hand the team to; the server refuses this too
        await expect(leaveButton(page)).toBeHidden();
    });

    test('is offered to an owner once there is a second one', async ({ page }) => {
        await openTeamDetails(page, {
            role: 'owner',
            members: [
                { id: 'm1', role: 'owner', userId: 'user-1', displayName: 'Owner' },
                { id: 'm2', role: 'owner', userId: 'user-2', displayName: 'Other Owner' }
            ]
        });

        await expect(leaveButton(page)).toBeVisible();
    });

    test('sits alongside the other team actions, not in place of them', async ({ page }) => {
        await openTeamDetails(page, {
            role: 'owner',
            members: [
                { id: 'm1', role: 'owner', userId: 'user-1', displayName: 'Owner' },
                { id: 'm2', role: 'owner', userId: 'user-2', displayName: 'Other' }
            ]
        });

        await expect(page.locator('#deleteTeamBtn')).toBeVisible();
        await expect(page.locator('#editTeamBtn')).toBeVisible();
        await expect(leaveButton(page)).toBeVisible();
    });
});
