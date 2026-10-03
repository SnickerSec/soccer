/**
 * One integration run per database at a time.
 *
 * Every test truncates every table, so two runs against the same database wipe
 * each other's rows mid-test. That is not hypothetical: two checkouts of this
 * repo ran `npm run test:db` against soccer_test within seconds of each other,
 * and one of them failed eight invite tests on a team that "is not present in
 * table teams" and a user whose seed collided with the other run's. Nothing was
 * wrong with the invite route; the suite had been run twice at once.
 *
 * So the run holds a session-level advisory lock for its whole length, on a
 * connection of its own. A second run waits for the first rather than
 * interleaving with it. A run that crashes drops its connection, and the lock
 * goes with it. Advisory locks are per database, so runs against different
 * test databases do not wait on each other.
 */

import pg from 'pg';

// Any fixed value will do; it only has to be the same for every run.
const LOCK_KEY = 'soccer integration suite';

export async function acquireRunLock() {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) return;

    const client = new pg.Client({ connectionString: url });
    await client.connect();

    const { rows } = await client.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
        [LOCK_KEY]
    );
    if (!rows[0].acquired) {
        console.log('\nAnother integration run is using this database; waiting for it to finish...');
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_KEY]);
    }

    globalThis.__integrationRunLock = client;
}

export async function releaseRunLock() {
    const client = globalThis.__integrationRunLock;
    if (!client) return;
    globalThis.__integrationRunLock = null;
    // Closing the session releases the lock with it
    await client.end();
}

export default acquireRunLock;
