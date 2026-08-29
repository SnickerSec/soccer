/**
 * The two shapes of a saved game, and the mapping between them.
 *
 * The client holds a game flat — `quarters` for the per-quarter lineup, with
 * the division, formation and field size beside it. The games table has a
 * `lineup` column and a `settings` JSONB, and the route persists exactly those.
 *
 * Nothing mapped between them, so `game.lineup` was undefined on every save and
 * the column stored `[]`. The damage was not visible at save time: season stats
 * read `players`, which survived. It showed on the way back, where a synced
 * game had no quarters to draw and reopened with a default formation — and
 * sooner than that, because pushGame replaces the local entry with the server's
 * reply, so the quarters vanished from local storage the moment a save landed.
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';

/** What the last request carried, so the wire shape can be asserted on. */
let sent = null;
/** What the fake server hands back. */
let reply = null;

jest.unstable_mockModule('../src/modules/api-client.js', () => ({
    api: {
        get: async () => reply,
        post: async (path, body) => {
            sent = { path, body };
            return reply;
        },
        put: async (path, body) => {
            sent = { path, body };
            return reply;
        },
        delete: async () => reply
    },
    getUser: async () => ({ id: 'user-1' })
}));

const { saveGame, getGames } = await import('../src/modules/cloud-storage.js');

/** A game in the shape handleSaveGame builds. */
const localGame = () => ({
    id: 'game-1712345678',
    name: 'vs Rockets',
    date: '2026-04-11',
    ageDivision: '12U',
    division: '12U',
    formation: '3-3-2',
    fieldPlayers: 9,
    quarters: [
        { quarter: 1, positions: { Keeper: 'Alex Kim', 'Left Back': 'Ben Ortiz' } },
        { quarter: 2, positions: { Keeper: 'Ben Ortiz' } }
    ],
    players: [{ name: 'Alex Kim', status: 'available', quartersPlayed: [1] }],
    notes: 'windy'
});

/** The row mapGame hands back for that game once stored. */
const storedGame = (game) => ({
    id: 'b8a1-uuid',
    name: game.name,
    date: game.date,
    notes: game.notes,
    settings: game.settings,
    lineup: game.lineup,
    players: game.players,
    captains: []
});

beforeEach(() => {
    sent = null;
    reply = null;
});

describe('saving a game', () => {
    test('puts the quarters in the column that stores them', async () => {
        const game = localGame();
        reply = { success: true, data: storedGame({ ...game, lineup: game.quarters }) };

        await saveGame('team-1', game);

        expect(sent.body.lineup).toEqual(game.quarters);
        expect(sent.body.lineup).toHaveLength(2);
    });

    /**
     * The settings JSONB exists for exactly these, and they were being dropped
     * alongside the lineup — so a reopened game drew the right players in the
     * wrong formation.
     */
    test('carries the division, formation and field size into settings', async () => {
        const game = localGame();
        reply = { success: true, data: storedGame({ ...game, lineup: game.quarters }) };

        await saveGame('team-1', game);

        expect(sent.body.settings).toEqual({
            ageDivision: '12U',
            formation: '3-3-2',
            fieldPlayers: 9
        });
    });

    test('still sends what the route always read', async () => {
        const game = localGame();
        reply = { success: true, data: storedGame({ ...game, lineup: game.quarters }) };

        await saveGame('team-1', game);

        expect(sent.path).toBe('/api/teams/team-1/games');
        expect(sent.body.name).toBe('vs Rockets');
        expect(sent.body.date).toBe('2026-04-11');
        expect(sent.body.notes).toBe('windy');
        expect(sent.body.players).toEqual(game.players);
    });

    /**
     * pushGame replaces the local entry with this, so a reply left in the wire
     * shape is what emptied local storage on a successful save.
     */
    test('hands the reply back in the shape the app holds', async () => {
        const game = localGame();
        reply = {
            success: true,
            data: storedGame({
                ...game,
                lineup: game.quarters,
                settings: { ageDivision: '12U', formation: '3-3-2', fieldPlayers: 9 }
            })
        };

        const result = await saveGame('team-1', game);

        expect(result.data.quarters).toEqual(game.quarters);
        expect(result.data.formation).toBe('3-3-2');
        expect(result.data.fieldPlayers).toBe(9);
        expect(result.data.ageDivision).toBe('12U');
        expect(result.data.division).toBe('12U');
        expect(result.data.id).toBe('b8a1-uuid');
    });

    test('a failed save is passed through untouched', async () => {
        reply = { success: false, error: 'Internal server error' };

        expect(await saveGame('team-1', localGame())).toEqual(reply);
    });
});

describe('pulling games', () => {
    test('restores the quarters and the settings the app reads', async () => {
        reply = {
            success: true,
            data: [{
                id: 'b8a1-uuid',
                name: 'vs Rockets',
                date: '2026-04-11',
                settings: { ageDivision: '12U', formation: '3-3-2', fieldPlayers: 9 },
                lineup: [{ quarter: 1, positions: { Keeper: 'Alex Kim' } }],
                players: [{ name: 'Alex Kim', status: 'available' }],
                captains: []
            }]
        };

        const result = await getGames('team-1');
        const game = result.data[0];

        expect(game.quarters).toEqual([{ quarter: 1, positions: { Keeper: 'Alex Kim' } }]);
        expect(game.ageDivision).toBe('12U');
        expect(game.division).toBe('12U');
        expect(game.formation).toBe('3-3-2');
        expect(game.fieldPlayers).toBe(9);
        expect(game.players).toEqual([{ name: 'Alex Kim', status: 'available' }]);
    });

    /**
     * Games stored before this fix have an empty lineup and empty settings.
     * There is nothing to restore, so they must come back drawable-as-empty
     * rather than undefined — App reads `game.quarters` directly.
     */
    test('an older row with empty columns comes back empty, not undefined', async () => {
        reply = {
            success: true,
            data: [{
                id: 'old-uuid',
                name: 'vs Comets',
                settings: {},
                lineup: [],
                players: [{ name: 'Alex Kim', status: 'available' }],
                captains: []
            }]
        };

        const game = (await getGames('team-1')).data[0];

        expect(game.quarters).toEqual([]);
        expect(game.formation).toBeUndefined();
        // The season history the old rows did keep is still there
        expect(game.players).toEqual([{ name: 'Alex Kim', status: 'available' }]);
    });

    test('a failed pull is passed through untouched', async () => {
        reply = { success: false, error: 'Internal server error' };

        expect(await getGames('team-1')).toEqual(reply);
    });
});

/**
 * The property that matters: a game that goes to the server and comes back is
 * the game that was saved.
 */
describe('round trip', () => {
    test('survives the server unchanged in everything the app reads', async () => {
        const game = localGame();

        reply = { success: true, data: null };
        await saveGame('team-1', game);
        const stored = sent.body;

        reply = { success: true, data: [storedGame(stored)] };
        const returned = (await getGames('team-1')).data[0];

        expect(returned.quarters).toEqual(game.quarters);
        expect(returned.players).toEqual(game.players);
        expect(returned.name).toBe(game.name);
        expect(returned.date).toBe(game.date);
        expect(returned.notes).toBe(game.notes);
        expect(returned.ageDivision).toBe(game.ageDivision);
        expect(returned.formation).toBe(game.formation);
        expect(returned.fieldPlayers).toBe(game.fieldPlayers);
    });
});
