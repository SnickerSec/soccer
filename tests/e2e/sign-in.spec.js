// @ts-check
import { test, expect } from '@playwright/test';

/**
 * The sign-in button hands the browser to the server-side Google OAuth flow.
 *
 * The handler used to read `.success` off what signInWithGoogle() returns,
 * which is nothing — it assigns to location and returns undefined. That threw a
 * TypeError on every click, invisible only because the page was already
 * leaving. An unhandled rejection in a click handler is exactly the kind of
 * thing that stays hidden until the navigation it hides behind changes.
 */
test.describe('Sign in', () => {
    /** Collects anything the page throws or logs as an error. */
    function watchForErrors(page) {
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text());
        });
        return errors;
    }

    test('the button is offered when signed out', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#signInBtn')).toBeVisible();
    });

    test('clicking it goes to the server-side Google flow', async ({ page }) => {
        // Intercepted rather than followed: without OAuth credentials the route
        // answers 500, and what matters here is where the browser was sent.
        let requested = null;
        await page.route('**/auth/google', (route) => {
            requested = route.request().url();
            return route.abort();
        });

        await page.goto('/');
        await page.locator('#signInBtn').click();

        await expect.poll(() => requested).toContain('/auth/google');
    });

    test('clicking it throws nothing', async ({ page }) => {
        const errors = watchForErrors(page);
        await page.route('**/auth/google', (route) => route.abort());

        await page.goto('/');
        await page.locator('#signInBtn').click();

        // Long enough for a rejected promise to surface
        await page.waitForTimeout(500);

        // net::ERR_FAILED is this test aborting its own navigation
        const real = errors.filter(e => !/ERR_FAILED|ERR_ABORTED|Failed to load resource/.test(e));
        expect(real).toEqual([]);
    });
});
