/**
 * Harness for the tests that run against a real PostgreSQL server.
 *
 * Most of this repo's server tests mock the pool, which proves the routes call
 * the right SQL with the right parameters but not that PostgreSQL accepts it.
 * These tests execute the statements for real, so they catch the things a mock
 * cannot: a column the schema never gained, a multi-row INSERT whose parameter
 * types will not resolve, a constraint violation surfacing as a 500, a
 * transaction that half-applies.
 *
 * They are opt-in. Set TEST_DATABASE_URL and they run; leave it unset and every
 * one is skipped, so `npm test` still works with no database installed.
 *
 *   createdb soccer_test
 *   TEST_DATABASE_URL=postgres://localhost/soccer_test npm run test:db
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { runner as migrate } from 'node-pg-migrate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..', '..');

const TEST_URL = process.env.TEST_DATABASE_URL;

/** Whether a test database was configured. */
export const hasDb = Boolean(TEST_URL);

/**
 * These tests truncate every table, so pointing them at the wrong database
 * destroys it. Two things stand in the way: they read TEST_DATABASE_URL rather
 * than the DATABASE_URL a deployment already has set, and the name has to look
 * like a test database.
 */
function assertSafeTarget(url) {
    const name = new URL(url).pathname.replace(/^\//, '');

    if (!/test/i.test(name)) {
        throw new Error(
            `Refusing to run destructive tests against database "${name}". ` +
            'TEST_DATABASE_URL must name a database with "test" in it.'
        );
    }

    return name;
}

if (hasDb) {
    assertSafeTarget(TEST_URL);
    // server/db.js builds its pool from DATABASE_URL, so point it at the test
    // database before anything imports it.
    process.env.DATABASE_URL = TEST_URL;
}

// Imported through this module rather than directly by each test, so the
// environment above is always set before the pool is constructed.
export const pool = hasDb ? (await import('../../../server/db.js')).default : null;
export const playerRoutes = hasDb ? (await import('../../../server/routes/players.js')).default : null;
export const gameRoutes = hasDb ? (await import('../../../server/routes/games.js')).default : null;
export const teamRoutes = hasDb ? (await import('../../../server/routes/teams.js')).default : null;
export const inviteRoutes = hasDb ? (await import('../../../server/routes/invites.js')).default : null;

/**
 * Brings the test database up to date by running the migrations — the same
 * ones Railway's preDeployCommand runs against production.
 *
 * Running the real migrations rather than a schema dump is the point: a
 * migration that works on the author's machine but not on a database built by
 * its predecessors would otherwise reach production unexercised. Every suite
 * calls this against a database a previous suite has already migrated, so
 * re-running is covered too.
 */
export async function applySchema() {
    await migrate({
        dbClient: pool,
        dir: path.join(projectRoot, 'migrations'),
        direction: 'up',
        migrationsTable: 'pgmigrations',
        // The suites are noisy enough; failures still throw
        log: () => {}
    });
}

/**
 * Empties every table so each test starts from a known state.
 *
 * Named explicitly rather than truncating everything: pgmigrations is the
 * ledger of which migrations have run, and clearing it would make the next
 * applySchema() replay them against a database that already has the schema.
 */
export async function truncateAll() {
    await pool.query(`
        TRUNCATE players, games, team_members, teams, user_settings, profiles
        RESTART IDENTITY CASCADE
    `);
}

/** Creates a signed-in user. */
export async function seedUser(email = 'coach@example.com') {
    const { rows } = await pool.query(
        `INSERT INTO profiles (google_id, email, display_name)
         VALUES ($1, $2, $3) RETURNING *`,
        [`google-${email}`, email, email.split('@')[0]]
    );
    return rows[0];
}

/**
 * Creates a team owned by `user`. The on_team_created trigger adds the owner's
 * membership row, which is what the authorization middleware reads.
 */
export async function seedTeam(user, name = 'Tigers') {
    const { rows } = await pool.query(
        `INSERT INTO teams (name, created_by) VALUES ($1, $2) RETURNING *`,
        [name, user.id]
    );
    return rows[0];
}

/** Adds `user` to `team` with a role, for testing the permission boundaries. */
export async function addMember(team, user, role) {
    await pool.query(
        `INSERT INTO team_members (team_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, NOW())`,
        [team.id, user.id, role]
    );
}

/** The roster as stored, in sort order. */
export async function readRoster(team) {
    const { rows } = await pool.query(
        'SELECT * FROM players WHERE team_id = $1 ORDER BY sort_order ASC',
        [team.id]
    );
    return rows;
}

/**
 * How many backends are sitting in an open transaction.
 *
 * A route that returns without committing or rolling back releases its client
 * to the pool mid-transaction, and the next request to pick it up inherits it.
 * That is invisible to a mocked pool and shows up here.
 */
export async function idleInTransactionCount() {
    const { rows } = await pool.query(
        `SELECT count(*)::int AS count FROM pg_stat_activity
         WHERE datname = current_database() AND state = 'idle in transaction'`
    );
    return rows[0].count;
}
