// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
    },
    webServer: {
        command: 'npm start',
        url: 'http://localhost:3000',
        // Never adopt a server that happens to be on the port already.
        //
        // This repo is worked on in git worktrees, and `npm start` in any of
        // them serves that checkout's dist/ on 3000. Reusing whichever one got
        // there first silently runs the whole suite against another branch's
        // build: the tests pass, and they are testing code that is not the
        // code under review. That is not hypothetical — it hid a roster bug
        // through several rounds of "verification" against a stale server from
        // a different checkout.
        //
        // Starting a fresh server per run costs a second or two and is the
        // only way the result means what it says.
        reuseExistingServer: false,
        timeout: 30000,
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                headless: true
            },
        },
    ],
});
