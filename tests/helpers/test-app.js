/**
 * Builds a minimal Express app around a route module for testing.
 *
 * The real server wires in sessions, Passport, CSRF and rate limiting. None of
 * that is under test here, so instead the signed-in user is injected directly —
 * which is what Passport would have populated — letting the tests focus on what
 * the routes and the authorization middleware actually do.
 */

import express from 'express';

/**
 * @param routes  the router under test
 * @param user    the signed-in user, or null/undefined for an anonymous request
 */
export function buildApp(routes, user = null) {
    const app = express();
    app.use(express.json());

    app.use((req, res, next) => {
        if (user) req.user = user;
        next();
    });

    app.use(routes);
    return app;
}

/** A pg result shape, so mocks read the way pool.query() responses do. */
export function rows(...values) {
    return { rows: values, rowCount: values.length };
}

/**
 * Silences the console.error the routes emit on their failure paths.
 *
 * Those paths are deliberately exercised here and every one is asserted on via
 * the HTTP response, so the logging is noise that hides real output.
 */
export function silenceRouteErrorLogging(jest, beforeEach, afterEach) {
    let spy;
    beforeEach(() => { spy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { spy?.mockRestore(); });
}

/** A pool client for transaction paths, recording the statements it ran. */
export function fakeClient(queryImpl) {
    const statements = [];
    const query = async (sql, params) => {
        statements.push(String(sql).trim().split('\n')[0].trim());
        return queryImpl ? queryImpl(sql, params) : rows();
    };
    return {
        query,
        release: () => {},
        statements
    };
}
