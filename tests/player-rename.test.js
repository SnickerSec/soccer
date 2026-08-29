/**
 * Renaming a player without splitting them in two.
 *
 * Season stats key on name (see calculatePlayerStats), and a saved game records
 * the name rather than an id. So a rename that touched only the roster would
 * produce a renamed player with no history sitting beside an orphan holding all
 * of it. These tests are about the name moving everywhere it is stored, and
 * about nothing else moving with it.
 *
 * A saved game reaches this code in two shapes: saved on this device it keys
 * its per-quarter lineup as `quarters`, pulled from the cloud it arrives as
 * `lineup`. Both are covered.
 */

import { describe, test, expect } from '@jest/globals';
import {
    validateRename,
    renameInGame,
    renameInGames,
    renameInLineup,
    surviveMerge
} from '../src/modules/player-rename.js';
import { calculatePlayerStats } from '../src/modules/season-stats.js';

const ROSTER = [
    { name: 'Alex Kim', number: 7 },
    { name: 'Ben Ortiz', number: 3 }
];

describe('validateRename', () => {
    test('accepts a genuine new name', () => {
        expect(validateRename(ROSTER, 'Alex Kim', 'Alexander Kim')).toBeNull();
    });

    test('accepts a name that only changes case for the same player', () => {
        expect(validateRename(ROSTER, 'Alex Kim', 'alex kim')).toBeNull();
    });

    test('refuses an empty name', () => {
        expect(validateRename(ROSTER, 'Alex Kim', '   ')).toMatch(/cannot be empty/);
        expect(validateRename(ROSTER, 'Alex Kim', null)).toMatch(/cannot be empty/);
    });

    test('refuses a name longer than the column allows', () => {
        expect(validateRename(ROSTER, 'Alex Kim', 'x'.repeat(256))).toMatch(/under 255/);
    });

    /**
     * Case-insensitively, to match handleAddPlayer. Two entries differing only
     * in case are two players to every season total, which is never what a
     * coach typing a name meant.
     */
    test('refuses a name another player already holds, whatever its case', () => {
        expect(validateRename(ROSTER, 'Alex Kim', 'Ben Ortiz')).toMatch(/already exists/);
        expect(validateRename(ROSTER, 'Alex Kim', 'ben ortiz')).toMatch(/already exists/);
    });
});

describe('renameInGame', () => {
    const cloudGame = {
        id: 'g1',
        name: 'vs Rockets',
        players: [
            { name: 'Alex Kim', status: 'available', quartersPlayed: [1, 2], isCaptain: true },
            { name: 'Ben Ortiz', status: 'absent' }
        ],
        lineup: [{ quarter: 1, positions: { Keeper: 'Alex Kim', 'Left Back': 'Ben Ortiz' } }],
        captains: ['Alex Kim']
    };

    const localGame = {
        id: 'g2',
        name: 'vs Comets',
        players: [{ name: 'Alex Kim', status: 'available', quartersSitting: [3] }],
        quarters: [{ quarter: 1, positions: { Keeper: 'Alex Kim' } }]
    };

    test('moves the name through a cloud game', () => {
        const renamed = renameInGame(cloudGame, 'Alex Kim', 'Alexander Kim');

        expect(renamed.players[0].name).toBe('Alexander Kim');
        expect(renamed.players[1].name).toBe('Ben Ortiz');
        expect(renamed.lineup[0].positions).toEqual({
            Keeper: 'Alexander Kim',
            'Left Back': 'Ben Ortiz'
        });
        expect(renamed.captains).toEqual(['Alexander Kim']);
    });

    test('moves the name through a game saved on this device', () => {
        const renamed = renameInGame(localGame, 'Alex Kim', 'Alexander Kim');

        expect(renamed.players[0].name).toBe('Alexander Kim');
        expect(renamed.quarters[0].positions).toEqual({ Keeper: 'Alexander Kim' });
    });

    test('carries the rest of the record across untouched', () => {
        const renamed = renameInGame(cloudGame, 'Alex Kim', 'Alexander Kim');

        expect(renamed.name).toBe('vs Rockets');
        expect(renamed.players[0]).toEqual({
            name: 'Alexander Kim',
            status: 'available',
            quartersPlayed: [1, 2],
            isCaptain: true
        });
    });

    /** Identity is the signal React uses to decide what to re-render. */
    test('returns the same object for a game the player never appeared in', () => {
        const other = {
            id: 'g3',
            players: [{ name: 'Ben Ortiz' }],
            quarters: [{ quarter: 1, positions: { Keeper: 'Ben Ortiz' } }],
            captains: ['Ben Ortiz']
        };

        expect(renameInGame(other, 'Alex Kim', 'Alexander Kim')).toBe(other);
    });

    test('survives games missing the fields it rewrites', () => {
        expect(renameInGame({ id: 'g4' }, 'Alex Kim', 'Alexander Kim')).toEqual({ id: 'g4' });
        expect(renameInGame(null, 'Alex Kim', 'Alexander Kim')).toBeNull();
        expect(renameInGames(null, 'Alex Kim', 'Alexander Kim')).toBeNull();
    });
});

describe('renameInLineup', () => {
    test('rewrites the lineup currently on screen, stats and all', () => {
        const renamed = renameInLineup({
            formation: '2-3-1',
            quarters: [{ quarter: 1, positions: { Keeper: 'Alex Kim' } }],
            playerStats: [{ name: 'Alex Kim', quartersPlayed: [1] }]
        }, 'Alex Kim', 'Alexander Kim');

        expect(renamed.formation).toBe('2-3-1');
        expect(renamed.quarters[0].positions).toEqual({ Keeper: 'Alexander Kim' });
        expect(renamed.playerStats[0].name).toBe('Alexander Kim');
    });

    test('leaves a null lineup alone — there may be none generated yet', () => {
        expect(renameInLineup(null, 'Alex Kim', 'Alexander Kim')).toBeNull();
    });
});

/**
 * The point of the whole exercise: after a rename the player is still one
 * player in the season totals, holding everything they held before.
 */
describe('season stats after a rename', () => {
    const games = [
        {
            players: [
                { name: 'Alex Kim', status: 'available', quartersPlayed: [1, 2, 3], quartersSitting: [4], isCaptain: true },
                { name: 'Ben Ortiz', status: 'available', quartersPlayed: [1, 2], quartersSitting: [3, 4] }
            ]
        },
        {
            players: [
                { name: 'Alex Kim', status: 'absent', quartersPlayed: [], quartersSitting: [] }
            ]
        }
    ];

    test('the renamed player keeps their history, and gains no twin', () => {
        const before = calculatePlayerStats(ROSTER, games);

        const renamedRoster = ROSTER.map(p =>
            p.name === 'Alex Kim' ? { ...p, name: 'Alexander Kim' } : p
        );
        const after = calculatePlayerStats(
            renamedRoster,
            renameInGames(games, 'Alex Kim', 'Alexander Kim')
        );

        // Keyed by name, so a stranded old entry would show up as a third key
        expect(Object.keys(after).sort()).toEqual(['Alexander Kim', 'Ben Ortiz']);
        expect(after['Alexander Kim']).toEqual(before['Alex Kim']);
        expect(after['Ben Ortiz']).toEqual(before['Ben Ortiz']);
    });

    /** What the rename exists to prevent, kept here as the thing being avoided. */
    test('renaming the roster alone would split them in two', () => {
        const renamedRoster = ROSTER.map(p =>
            p.name === 'Alex Kim' ? { ...p, name: 'Alexander Kim' } : p
        );
        const split = calculatePlayerStats(renamedRoster, games);

        expect(Object.keys(split).sort())
            .toEqual(['Alex Kim', 'Alexander Kim', 'Ben Ortiz']);
        expect(split['Alexander Kim'].gamesOnRoster).toBe(0);
        expect(split['Alex Kim'].gamesOnRoster).toBe(2);
    });
});

describe('surviveMerge', () => {
    const rename = { from: 'Alex Kim', to: 'Alexander Kim' };

    test('keeps a rename the merge carried through', () => {
        const merged = [{ name: 'Alexander Kim' }, { name: 'Ben Ortiz' }];
        const result = surviveMerge(merged, [rename]);

        expect(result.renames).toEqual([rename]);
        expect(result.roster).toBe(merged);
        expect(result.dropped).toEqual([]);
    });

    /**
     * The merge keeps the other coach's version of a player they edited, so the
     * old name comes back and the merged roster holds both. Saving that would
     * enter the player twice and rename a history the old entry still owns.
     */
    test('abandons a rename the other coach overrode, and drops the duplicate', () => {
        const merged = [
            { name: 'Alex Kim', number: 9, sortOrder: 0 },
            { name: 'Ben Ortiz', sortOrder: 1 },
            { name: 'Alexander Kim', number: 7, sortOrder: 2 }
        ];
        const result = surviveMerge(merged, [rename]);

        expect(result.renames).toEqual([]);
        expect(result.dropped).toEqual(['Alex Kim']);
        expect(result.roster.map(p => p.name)).toEqual(['Alex Kim', 'Ben Ortiz']);
        // Renumbered, so the gap the dropped entry left does not reorder the roster
        expect(result.roster.map(p => p.sortOrder)).toEqual([0, 1]);
    });

    test('settles each rename on its own', () => {
        const second = { from: 'Ben Ortiz', to: 'Benjamin Ortiz' };
        const merged = [
            { name: 'Alex Kim' },
            { name: 'Alexander Kim' },
            { name: 'Benjamin Ortiz' }
        ];
        const result = surviveMerge(merged, [rename, second]);

        expect(result.renames).toEqual([second]);
        expect(result.dropped).toEqual(['Alex Kim']);
        expect(result.roster.map(p => p.name)).toEqual(['Alex Kim', 'Benjamin Ortiz']);
    });

    test('a save with no renames is handed straight back', () => {
        const merged = [{ name: 'Ana' }];

        expect(surviveMerge(merged, []).roster).toBe(merged);
        expect(surviveMerge(merged, undefined).roster).toBe(merged);
    });
});
