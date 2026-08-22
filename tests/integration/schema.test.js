/**
 * The migrations against a real PostgreSQL server.
 *
 * This file exists because of a specific failure: the schema never gained the
 * player ratings columns the players route writes, so initializing a fresh
 * database produced an app that 500'd on every roster save. Nothing caught it,
 * because every other test mocks the pool and a mock accepts any column name.
 *
 * The guard is the same either way — build the database the way a deployment
 * does, then check it has the columns the routes name.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

import { readdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { runner as migrate } from 'node-pg-migrate';

import { hasDb, pool, applySchema } from './helpers/db.js';

const migrationsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations'
);

const describeDb = hasDb ? describe : describe.skip;

/** The columns each route reads or writes by name. */
const REQUIRED_COLUMNS = {
    profiles: ['id', 'google_id', 'email', 'display_name', 'avatar_url'],
    teams: ['id', 'name', 'age_division', 'created_by', 'created_at', 'roster_version'],
    team_members: ['id', 'team_id', 'user_id', 'role', 'invited_by', 'joined_at',
        'invite_token', 'invite_expires_at'],
    players: ['id', 'team_id', 'name', 'number', 'is_captain', 'must_rest', 'no_keeper',
        'status', 'preferred_positions', 'sort_order', 'overall_rating', 'positional_ratings'],
    games: ['id', 'team_id', 'name', 'game_date', 'notes', 'settings', 'lineup',
        'player_snapshot', 'captains', 'created_by', 'created_at'],
    user_settings: ['user_id', 'theme', 'default_team_id', 'default_settings'],
    session: ['sid', 'sess', 'expire']
};

async function columnsOf(table) {
    const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
    );
    return rows.map(r => r.column_name);
}

describeDb('migrations', () => {
    beforeAll(async () => {
        await applySchema();
    });

    afterAll(async () => {
        await pool.end();
    });

    test.each(Object.entries(REQUIRED_COLUMNS))(
        '%s has every column the server references',
        async (table, required) => {
            const actual = await columnsOf(table);
            expect(actual).toEqual(expect.arrayContaining(required));
        }
    );

    test('running again is a no-op', async () => {
        // Every deploy runs `npm run migrate`, so the common case by far is a
        // database that is already up to date.
        await expect(applySchema()).resolves.not.toThrow();
    });

    test('every migration on disk has actually been applied', async () => {
        const onDisk = readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .map(file => file.replace(/\.sql$/, ''))
            .sort();

        const { rows } = await pool.query('SELECT name FROM pgmigrations ORDER BY name');
        const applied = rows.map(r => r.name).sort();

        // A migration that is committed but never runs is the drift this whole
        // file exists to catch, in its new form: the schema the routes were
        // written against and the schema they get would silently diverge.
        expect(applied).toEqual(onDisk);
    });

    test('a migration added later lands on an existing database', async () => {
        // The point of the whole arrangement: a schema change committed today
        // reaches a database built months ago, without anyone running SQL by
        // hand. Run from a scratch directory and ledger so the real ones are
        // untouched.
        const dir = mkdtempSync(path.join(os.tmpdir(), 'migration-test-'));
        try {
            writeFileSync(path.join(dir, '20260901000000_add_probe.sql'), [
                '-- Up Migration',
                'ALTER TABLE teams ADD COLUMN probe_column TEXT;',
                '-- Down Migration',
                'ALTER TABLE teams DROP COLUMN probe_column;'
            ].join('\n'));

            expect(await columnsOf('teams')).not.toContain('probe_column');

            await migrate({
                dbClient: pool, dir, direction: 'up',
                migrationsTable: 'pgmigrations_probe', log: () => {}
            });

            expect(await columnsOf('teams')).toContain('probe_column');

            // And back out again, so the suite leaves the schema as it found it
            await migrate({
                dbClient: pool, dir, direction: 'down', count: 1,
                migrationsTable: 'pgmigrations_probe', log: () => {}
            });

            expect(await columnsOf('teams')).not.toContain('probe_column');
        } finally {
            rmSync(dir, { recursive: true, force: true });
            await pool.query('DROP TABLE IF EXISTS pgmigrations_probe');
        }
    });

    test('the ratings constraint exists exactly once', async () => {
        const { rows } = await pool.query(
            `SELECT count(*)::int AS c FROM pg_constraint WHERE conname = 'players_overall_rating_range'`
        );
        expect(rows[0].c).toBe(1);
    });

    test('creating a team makes its creator an owner', async () => {
        // The routes never insert an owner membership row; the trigger does,
        // and the whole authorization layer reads that row.
        const { rows: [user] } = await pool.query(
            `INSERT INTO profiles (google_id, email) VALUES ('g-trigger', 'trigger@example.com') RETURNING *`);
        const { rows: [team] } = await pool.query(
            `INSERT INTO teams (name, created_by) VALUES ('Trigger FC', $1) RETURNING *`, [user.id]);

        const { rows: members } = await pool.query(
            `SELECT role, joined_at FROM team_members WHERE team_id = $1`, [team.id]);

        expect(members).toHaveLength(1);
        expect(members[0].role).toBe('owner');
        expect(members[0].joined_at).not.toBeNull();

        await pool.query('DELETE FROM profiles WHERE id = $1', [user.id]);
    });

    test('rejects a role outside the three the middleware knows', async () => {
        const { rows: [user] } = await pool.query(
            `INSERT INTO profiles (google_id, email) VALUES ('g-role', 'role@example.com') RETURNING *`);
        const { rows: [team] } = await pool.query(
            `INSERT INTO teams (name, created_by) VALUES ('Role FC', $1) RETURNING *`, [user.id]);

        await expect(pool.query(
            `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'superuser')`,
            [team.id, user.id]
        )).rejects.toThrow(/check constraint/);

        await pool.query('DELETE FROM profiles WHERE id = $1', [user.id]);
    });
});
