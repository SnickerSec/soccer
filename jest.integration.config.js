/**
 * Config for the tests that need a real PostgreSQL server.
 *
 * These are kept out of the default `npm test` run — that one mocks the pool
 * and needs nothing installed. Run them with `npm run test:db` and a
 * TEST_DATABASE_URL; without one they report as skipped.
 */
export default {
    transform: {},
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'mjs'],
    testMatch: ['**/tests/integration/**/*.test.js'],
    // These share one database and truncate between tests, so running two files
    // at once would have them wipe each other's rows.
    maxWorkers: 1,
    // The same goes for two whole runs, from two checkouts or two terminals:
    // each waits for the other rather than truncating under it.
    globalSetup: './tests/integration/helpers/run-lock.js',
    globalTeardown: './tests/integration/helpers/global-teardown.js'
};
