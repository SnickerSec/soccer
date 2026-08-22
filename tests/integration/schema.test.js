/**
 * db/schema.sql against a real PostgreSQL server.
 *
 * This file exists because of a specific failure: the schema never gained the
 * player ratings columns the players route writes, so initializing a fresh
 * database produced an app that 500'd on every roster save. Nothing caught it,
 * because every other test mocks the pool and a mock accepts any column name.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

import { hasDb, pool, applySchema } from './helpers/db.js';

const describeDb = hasDb ? describe : describe.skip;

/** The columns each route reads or writes by name. */
const REQUIRED_COLUMNS = {
    profiles: ['id', 'google_id', 'email', 'display_name', 'avatar_url'],
    teams: ['id', 'name', 'age_division', 'created_by', 'created_at'],
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

describeDb('db/schema.sql', () => {
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

    test('is safe to apply twice', async () => {
        // db/init.js is the only way schema changes reach a deployment, so it
        // has to be re-runnable — CREATE TABLE IF NOT EXISTS alone is not
        // enough, since it skips an existing table columns and all.
        await expect(applySchema()).resolves.not.toThrow();
    });

    test('adds a column to a database that predates it', async () => {
        // Exactly the drift that shipped: a database created before the ratings
        // feature would never gain those columns, however often init.js ran.
        await pool.query(`
            ALTER TABLE players
                DROP CONSTRAINT IF EXISTS players_overall_rating_range,
                DROP COLUMN IF EXISTS overall_rating,
                DROP COLUMN IF EXISTS positional_ratings
        `);
        expect(await columnsOf('players')).not.toContain('overall_rating');

        await applySchema();

        const columns = await columnsOf('players');
        expect(columns).toContain('overall_rating');
        expect(columns).toContain('positional_ratings');
    });

    test('re-adding a column does not duplicate its constraint', async () => {
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
