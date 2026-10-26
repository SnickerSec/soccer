/**
 * The data migration that removes evaluation comments copied into saved games.
 *
 * As with the 3-3 rename, the harness applies migrations to an empty database,
 * so this seeds the old shape and runs the migration file's own SQL over it.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hasDb, pool, applySchema, truncateAll, seedUser, seedTeam } from './helpers/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(
    __dirname, '..', '..', 'migrations', '20261026120000_strip_comments_from_game_snapshots.sql'
);

function upMigrationSql() {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    return sql.split('-- Down Migration')[0].replace('-- Up Migration', '');
}

const describeDb = hasDb ? describe : describe.skip;

describeDb('stripping evaluation comments from saved games', () => {
    let team;

    beforeAll(async () => {
        await applySchema();
    });

    beforeEach(async () => {
        await truncateAll();
        const user = await seedUser('coach@example.com');
        team = await seedTeam(user, 'Tigers');
    });

    afterAll(async () => {
        await pool.end();
    });

    async function insertGame(snapshot) {
        const res = await pool.query(
            `INSERT INTO games (team_id, name, player_snapshot) VALUES ($1, 'vs Shaffer', $2) RETURNING id`,
            [team.id, JSON.stringify(snapshot)]
        );
        return res.rows[0].id;
    }

    const snapshotOf = async (id) =>
        (await pool.query('SELECT player_snapshot FROM games WHERE id = $1', [id])).rows[0].player_snapshot;

    test('the comment goes and everything else about the player stays, in order', async () => {
        const id = await insertGame([
            { name: 'Kamu', number: 4, comments: 'Needs to work on his weak foot', quartersPlayed: [1, 2, 3] },
            { name: 'Jordan', number: 7, comments: '', quartersPlayed: [1, 3] },
            { name: 'Amos', number: 9, quartersPlayed: [2, 4] },
        ]);

        await pool.query(upMigrationSql());

        expect(await snapshotOf(id)).toEqual([
            { name: 'Kamu', number: 4, quartersPlayed: [1, 2, 3] },
            { name: 'Jordan', number: 7, quartersPlayed: [1, 3] },
            { name: 'Amos', number: 9, quartersPlayed: [2, 4] },
        ]);
    });

    test('a game with no comments in it is not touched', async () => {
        const snapshot = [{ name: 'Amos', number: 9 }];
        const id = await insertGame(snapshot);

        const result = await pool.query(upMigrationSql());

        expect(result.rowCount).toBe(0);
        expect(await snapshotOf(id)).toEqual(snapshot);
    });

    test('an empty snapshot survives', async () => {
        const id = await insertGame([]);
        await pool.query(upMigrationSql());
        expect(await snapshotOf(id)).toEqual([]);
    });
});
