import { describe, test, expect } from '@jest/globals';
import {
  editableQuarters,
  assignToSlot,
  removePlayerFromQuarters,
  recalculateGamePlayers,
  unfilledSlots,
  captainsPresent,
} from '../src/modules/game-edit.js';
import { calculatePlayerStats } from '../src/modules/season-stats.js';

const POSITIONS = ['Keeper', 'Left Back', 'Right Back', 'Striker'];

/** A saved game in the shape App writes, four quarters of a 4v4-ish side. */
function savedGame(overrides = {}) {
  const squad = ['Ana', 'Ben', 'Cara', 'Dev', 'Eli'];

  return {
    id: 'game-1',
    name: 'vs Lions',
    date: '2026-03-21',
    formation: '2-1',
    fieldPlayers: 4,
    quarters: [1, 2, 3, 4].map((quarter) => ({
      quarter,
      positions: {
        Keeper: 'Ana',
        'Left Back': 'Ben',
        'Right Back': 'Cara',
        Striker: 'Dev',
      },
    })),
    players: squad.map((name) => ({
      name,
      number: squad.indexOf(name) + 1,
      status: 'available',
      isCaptain: name === 'Ana',
      quartersPlayed: [],
      quartersSitting: [],
      positionsPlayed: [],
      offensiveQuarters: 0,
      defensiveQuarters: 0,
      goalieQuarter: null,
    })),
    captains: ['Ana'],
    ...overrides,
  };
}

describe('editableQuarters', () => {
  test('brings every position of the formation, empty where nobody played', () => {
    const game = savedGame({
      quarters: [{ quarter: 1, positions: { Keeper: 'Ana' } }],
    });

    expect(editableQuarters(game, POSITIONS)).toEqual([
      {
        quarter: 1,
        positions: { Keeper: 'Ana', 'Left Back': '', 'Right Back': '', Striker: '' },
      },
    ]);
  });

  test('a game with no quarters still opens as four to fill in', () => {
    const quarters = editableQuarters(savedGame({ quarters: [] }), POSITIONS);
    expect(quarters).toHaveLength(4);
    expect(quarters.map((q) => q.quarter)).toEqual([1, 2, 3, 4]);
    expect(quarters[0].positions.Keeper).toBe('');
  });

  test('an old 3-3 opens under the names its middle line has now', () => {
    const game = {
      formation: '3-3',
      fieldPlayers: 7,
      quarters: [{ quarter: 1, positions: { 'Center Mid': 'Ana', 'Left Mid': 'Ben' } }],
    };

    const quarters = editableQuarters(game, ['Striker', 'Left Forward']);
    expect(quarters[0].positions).toEqual({ Striker: 'Ana', 'Left Forward': 'Ben' });
  });
});

describe('assignToSlot', () => {
  test('puts a player in a slot', () => {
    const quarters = editableQuarters(savedGame(), POSITIONS);
    const updated = assignToSlot(quarters, 2, 'Striker', 'Eli');

    expect(updated[1].positions.Striker).toBe('Eli');
    // Other quarters are untouched
    expect(updated[0].positions.Striker).toBe('Dev');
  });

  test('nobody plays two positions at once', () => {
    const quarters = editableQuarters(savedGame(), POSITIONS);
    // Ana was in goal; putting her up front has to take her out of it, or the
    // quarter counts her twice.
    const updated = assignToSlot(quarters, 1, 'Striker', 'Ana');

    expect(updated[0].positions.Striker).toBe('Ana');
    expect(updated[0].positions.Keeper).toBe('');
  });

  test('clearing a slot leaves it empty', () => {
    const quarters = editableQuarters(savedGame(), POSITIONS);
    const updated = assignToSlot(quarters, 1, 'Striker', '');

    expect(updated[0].positions.Striker).toBe('');
    expect(updated[0].positions.Keeper).toBe('Ana');
  });
});

describe('removePlayerFromQuarters', () => {
  test('takes a player off the field for the whole match', () => {
    const quarters = editableQuarters(savedGame(), POSITIONS);
    const updated = removePlayerFromQuarters(quarters, 'Ana');

    updated.forEach((q) => expect(q.positions.Keeper).toBe(''));
    updated.forEach((q) => expect(q.positions['Left Back']).toBe('Ben'));
  });
});

describe('recalculateGamePlayers', () => {
  test('derives the per-player record from the quarters', () => {
    const game = savedGame();
    const players = recalculateGamePlayers(game.players, game.quarters, {
      captains: ['Ana'],
      statuses: {},
    });

    const ana = players.find((p) => p.name === 'Ana');
    expect(ana.quartersPlayed).toEqual([1, 2, 3, 4]);
    expect(ana.quartersSitting).toEqual([]);
    expect(ana.positionsPlayed).toEqual([
      { quarter: 1, position: 'Keeper' },
      { quarter: 2, position: 'Keeper' },
      { quarter: 3, position: 'Keeper' },
      { quarter: 4, position: 'Keeper' },
    ]);
    // Keeper is a defensive quarter to the engine, and records the quarter it
    // fell in; season stats pull it back out as its own zone.
    expect(ana.defensiveQuarters).toBe(4);
    expect(ana.offensiveQuarters).toBe(0);
    expect(ana.goalieQuarter).toBe(4);
    expect(ana.isCaptain).toBe(true);

    const dev = players.find((p) => p.name === 'Dev');
    expect(dev.offensiveQuarters).toBe(4);
    expect(dev.defensiveQuarters).toBe(0);
    expect(dev.goalieQuarter).toBeNull();

    // Eli was available and never got on
    const eli = players.find((p) => p.name === 'Eli');
    expect(eli.quartersPlayed).toEqual([]);
    expect(eli.quartersSitting).toEqual([1, 2, 3, 4]);
  });

  test('a player who was not there records nothing', () => {
    const game = savedGame();
    const quarters = removePlayerFromQuarters(game.quarters, 'Ana');
    const players = recalculateGamePlayers(game.players, quarters, {
      captains: [],
      statuses: { Ana: 'absent' },
    });

    const ana = players.find((p) => p.name === 'Ana');
    expect(ana.status).toBe('absent');
    expect(ana.quartersPlayed).toEqual([]);
    // Not "sat every quarter" — she was not at the match to sit it.
    expect(ana.quartersSitting).toEqual([]);
    expect(ana.isCaptain).toBe(false);
  });

  test('an edited lineup is what the season then counts', () => {
    const game = savedGame();

    // Dev did not turn up; Eli took the striker's shirt for the whole game.
    let quarters = removePlayerFromQuarters(game.quarters, 'Dev');
    [1, 2, 3, 4].forEach((q) => {
      quarters = assignToSlot(quarters, q, 'Striker', 'Eli');
    });
    const statuses = { Dev: 'absent' };
    const players = recalculateGamePlayers(game.players, quarters, {
      captains: ['Eli'],
      statuses,
    });

    const roster = game.players.map(({ name }) => ({ name }));
    const stats = calculatePlayerStats(roster, [{ ...game, quarters, players }]);

    expect(stats.Dev.gamesAbsent).toBe(1);
    expect(stats.Dev.gamesPlayed).toBe(0);
    expect(stats.Dev.totalQuarters).toBe(0);

    expect(stats.Eli.gamesPlayed).toBe(1);
    expect(stats.Eli.totalQuarters).toBe(4);
    expect(stats.Eli.offensiveQuarters).toBe(4);
    expect(stats.Eli.captainGames).toBe(1);
    expect(stats.Ana.captainGames).toBe(0);
  });

  test('an unfilled slot is a short-handed quarter, not a crash', () => {
    const game = savedGame();
    const quarters = assignToSlot(game.quarters, 1, 'Striker', '');
    const players = recalculateGamePlayers(game.players, quarters, { captains: [] });

    const dev = players.find((p) => p.name === 'Dev');
    expect(dev.quartersPlayed).toEqual([2, 3, 4]);
    expect(dev.quartersSitting).toEqual([1]);
  });
});

describe('unfilledSlots', () => {
  test('names the quarters and positions nobody played', () => {
    const game = savedGame();
    const quarters = assignToSlot(game.quarters, 3, 'Keeper', '');

    expect(unfilledSlots(quarters)).toEqual([{ quarter: 3, position: 'Keeper' }]);
  });
});

describe('captainsPresent', () => {
  test('drops a captain who turned out not to be there', () => {
    expect(captainsPresent(['Ana', 'Ben'], { Ana: 'absent' })).toEqual(['Ben']);
  });

  test('keeps captains with no status recorded', () => {
    expect(captainsPresent(['Ana', 'Ben'], {})).toEqual(['Ana', 'Ben']);
  });
});
