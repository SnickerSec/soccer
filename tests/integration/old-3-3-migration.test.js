/**
 * The data migration that moves an old 3-3's midfield line to the forward
 * names it was redefined with.
 *
 * The migration transforms rows that already exist, and the harness applies
 * migrations to an empty database — so this seeds the old shape and then runs
 * the migration file's own SQL over it. What is executed here is the text that
 * ships, not a reimplementation of it.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hasDb, pool, applySchema, truncateAll, seedUser, seedTeam } from './helpers/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(
    __dirname, '..', '..', 'migrations', '20260830140000_rename_old_3_3_positions.sql'
);

/** The Up half of the migration, as it will run on deploy. */
function upMigrationSql() {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const up = sql.split('-- Down Migration')[0];
    return up.replace('-- Up Migration', '');
}

const oldQuarter = (n) => ({
    quarter: n,
    positions: {
        Keeper: 'Elias',
        'Left Back': 'Brady',
        'Center Back': 'Henry',
        'Right Back': 'Ephraim',
        'Left Mid': 'Kamu',
        'Center Mid': 'Amos',
        'Right Mid': 'Brees',
    },
    sitting: ['Jordan'],
});

const oldSnapshot = [
    {
        name: 'Kamu',
        status: 'available',
        quartersPlayed: [1, 2],
        positionsPlayed: [
            { quarter: 1, position: 'Left Mid' },
            { quarter: 2, position: 'Left Back' },
        ],
    },
    { name: 'Jordan', status: 'available', quartersPlayed: [], positionsPlayed: [] },
];

const describeDb = hasDb ? describe : describe.skip;

describeDb('renaming an old 3-3 in place', () => {
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

    async function insertGame({ formation, fieldPlayers, quarters = [oldQuarter(1)], snapshot = oldSnapshot }) {
        const res = await pool.query(
            `INSERT INTO games (team_id, name, settings, lineup, player_snapshot)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [team.id, 'vs Shaffer', JSON.stringify({ formation, fieldPlayers }),
             JSON.stringify(quarters), JSON.stringify(snapshot)]
        );
        return res.rows[0].id;
    }

    const readGame = async (id) =>
        (await pool.query('SELECT lineup, player_snapshot FROM games WHERE id = $1', [id])).rows[0];

    test('the 7v7 midfield three becomes the forward three', async () => {
        const id = await insertGame({ formation: '3-3', fieldPlayers: 7 });
        await pool.query(upMigrationSql());

        const { lineup } = await readGame(id);
        expect(lineup[0].positions).toEqual({
            Keeper: 'Elias',
            'Left Back': 'Brady',
            'Center Back': 'Henry',
            'Right Back': 'Ephraim',
            'Left Forward': 'Kamu',
            Striker: 'Amos',
            'Right Forward': 'Brees',
        });
    });

    test('the player snapshot moves with it', async () => {
        const id = await insertGame({ formation: '3-3', fieldPlayers: 7 });
        await pool.query(upMigrationSql());

        const { player_snapshot: snapshot } = await readGame(id);
        expect(snapshot[0].positionsPlayed).toEqual([
            { quarter: 1, position: 'Left Forward' },
            { quarter: 2, position: 'Left Back' },
        ]);
        expect(snapshot[0].name).toBe('Kamu');
        expect(snapshot[0].quartersPlayed).toEqual([1, 2]);
        expect(snapshot[1]).toEqual(oldSnapshot[1]);
    });

    test('the 6v6 3-3 lost its Right Mid, so its Center Mid becomes Right Forward', async () => {
        const id = await insertGame({
            formation: '3-3',
            fieldPlayers: 6,
            quarters: [{
                quarter: 1,
                positions: {
                    Keeper: 'Elias', 'Left Back': 'Brady', 'Center Back': 'Henry',
                    'Right Back': 'Ephraim', 'Left Mid': 'Kamu', 'Center Mid': 'Amos',
                },
                sitting: [],
            }],
        });
        await pool.query(upMigrationSql());

        const { lineup } = await readGame(id);
        expect(lineup[0].positions['Left Forward']).toBe('Kamu');
        expect(lineup[0].positions['Right Forward']).toBe('Amos');
        expect(lineup[0].positions['Striker']).toBeUndefined();
    });

    test('a game with no recorded fieldPlayers is treated as 7v7', async () => {
        const id = await insertGame({ formation: '3-3', fieldPlayers: undefined });
        await pool.query(upMigrationSql());

        const { lineup } = await readGame(id);
        expect(lineup[0].positions['Striker']).toBe('Amos');
    });

    test('a formation that has a midfield is left exactly as it was', async () => {
        const id = await insertGame({ formation: '2-3-1', fieldPlayers: 7 });
        await pool.query(upMigrationSql());

        const { lineup, player_snapshot: snapshot } = await readGame(id);
        expect(lineup[0].positions['Center Mid']).toBe('Amos');
        expect(snapshot[0].positionsPlayed[0].position).toBe('Left Mid');
    });

    test('quarters keep their order and everything else about them', async () => {
        const id = await insertGame({
            formation: '3-3',
            fieldPlayers: 7,
            quarters: [oldQuarter(1), oldQuarter(2), oldQuarter(3), oldQuarter(4)],
        });
        await pool.query(upMigrationSql());

        const { lineup } = await readGame(id);
        expect(lineup.map((q) => q.quarter)).toEqual([1, 2, 3, 4]);
        expect(lineup[3].sitting).toEqual(['Jordan']);
    });

    test('running it twice changes nothing the second time', async () => {
        const id = await insertGame({ formation: '3-3', fieldPlayers: 7 });
        await pool.query(upMigrationSql());
        const once = await readGame(id);
        await pool.query(upMigrationSql());
        const twice = await readGame(id);

        expect(twice).toEqual(once);
    });

    test('a game with an empty lineup and snapshot survives', async () => {
        const id = await insertGame({ formation: '3-3', fieldPlayers: 7, quarters: [], snapshot: [] });
        await pool.query(upMigrationSql());

        const { lineup, player_snapshot: snapshot } = await readGame(id);
        expect(lineup).toEqual([]);
        expect(snapshot).toEqual([]);
    });
});
