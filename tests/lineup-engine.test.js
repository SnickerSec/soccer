/**
 * The AYSO rotation rules, tested against the engine that actually ships.
 *
 * The invariants below are checked independently rather than by asserting
 * `result.validation` is empty -- that would only prove the engine agrees with
 * its own validator. These re-derive each rule from the produced lineup.
 *
 * Generation is randomised and retries up to maxAttempts, so the rule tests run
 * many rosters: a rule that holds only sometimes shows up as a flaky failure,
 * which is exactly what we want to catch.
 */

import { describe, test, expect } from '@jest/globals';
import { generateLineup, validateLineup, determineSittingSchedule } from '../public/modules/lineup-engine.js';
import { getPositionsForFormation, isDefensivePosition } from '../public/modules/formations.js';

const QUARTERS = 4;
const MAX_ATTEMPTS = 500;

function makePlayer(name, options = {}) {
    return {
        name,
        number: options.number ?? null,
        isCaptain: false,
        mustRest: options.mustRest ?? false,
        noKeeper: options.noKeeper ?? false,
        status: 'available',
        overallRating: options.overallRating ?? null,
        positionalRatings: options.positionalRatings ?? null,
        quartersPlayed: [],
        quartersSitting: [],
        positionsPlayed: [],
        goalieQuarter: null,
        defensiveQuarters: 0,
        offensiveQuarters: 0
    };
}

function makeRoster(size, options = {}) {
    return Array.from({ length: size }, (_, i) => makePlayer(`Player ${i + 1}`, {
        ...options,
        // Spread of ability, which is what turns on balanceSittingByRating
        overallRating: options.rated ? 1 + (i % 5) : options.overallRating ?? null
    }));
}

/** Runs the real generator for a roster size and formation. */
function generate(rosterSize, { playersOnField = 7, formation = '2-3-1', players, seasonStats = {}, rated = false } = {}) {
    const roster = players ?? makeRoster(rosterSize, { rated });
    return generateLineup({
        players: roster,
        positions: getPositionsForFormation(playersOnField, formation),
        playersOnField,
        quarters: QUARTERS,
        maxAttempts: MAX_ATTEMPTS,
        seasonStats
    });
}

/** Per-player facts re-derived from the returned lineup, not from the engine. */
function tally(result, playersOnField) {
    const byPlayer = new Map();

    const ensure = name => {
        if (!byPlayer.has(name)) {
            byPlayer.set(name, { played: [], positions: [], keeper: 0, defense: 0, offense: 0 });
        }
        return byPlayer.get(name);
    };

    result.players.forEach(p => ensure(p.name));

    result.lineup.forEach(quarter => {
        const onField = Object.entries(quarter.positions);
        expect(onField).toHaveLength(playersOnField);

        onField.forEach(([position, name]) => {
            const entry = ensure(name);
            entry.played.push(quarter.quarter);
            entry.positions.push(position);
            // Keeper counts as a defensive quarter, matching isDefensivePosition
            // and the counters the engine keeps
            if (isDefensivePosition(position)) entry.defense++;
            else entry.offense++;
            if (position === 'Keeper') entry.keeper++;
        });
    });

    // Quarters a player was not on the field
    for (const [, entry] of byPlayer) {
        entry.sat = [1, 2, 3, 4].filter(q => !entry.played.includes(q));
    }

    return byPlayer;
}

function hasConsecutive(quarters) {
    const sorted = [...quarters].sort((a, b) => a - b);
    return sorted.some((q, i) => i > 0 && q - sorted[i - 1] === 1);
}

describe('AYSO rotation rules', () => {
    // Roster sizes either side of the field size, including the exact-fit case
    const SCENARIOS = [
        { size: 9, playersOnField: 7, formation: '2-3-1' },
        { size: 10, playersOnField: 7, formation: '3-2-1' },
        { size: 11, playersOnField: 7, formation: '2-2-2' },
        { size: 12, playersOnField: 9, formation: '3-3-2' },
        { size: 14, playersOnField: 11, formation: '4-4-2' }
    ];

    for (const scenario of SCENARIOS) {
        describe(`${scenario.size} players, ${scenario.playersOnField}v${scenario.playersOnField} ${scenario.formation}`, () => {
            test('nobody sits more than two quarters', () => {
                for (let run = 0; run < 20; run++) {
                    const result = generate(scenario.size, scenario);
                    for (const [name, entry] of tally(result, scenario.playersOnField)) {
                        expect(`${name} sat ${entry.sat.length}`).toBe(`${name} sat ${Math.min(entry.sat.length, 2)}`);
                    }
                }
            });

            test('nobody sits two quarters in a row', () => {
                for (let run = 0; run < 20; run++) {
                    const result = generate(scenario.size, scenario);
                    for (const [name, entry] of tally(result, scenario.playersOnField)) {
                        expect(`${name}: ${hasConsecutive(entry.sat)}`).toBe(`${name}: false`);
                    }
                }
            });

            test('nobody keeps goal more than one quarter', () => {
                for (let run = 0; run < 20; run++) {
                    const result = generate(scenario.size, scenario);
                    for (const [name, entry] of tally(result, scenario.playersOnField)) {
                        expect(`${name} in goal ${entry.keeper}`).toBe(`${name} in goal ${Math.min(entry.keeper, 1)}`);
                    }
                }
            });

            test('everyone plays at least half the game', () => {
                for (let run = 0; run < 20; run++) {
                    const result = generate(scenario.size, scenario);
                    for (const [name, entry] of tally(result, scenario.playersOnField)) {
                        // AYSO "Everyone Plays": at least two of four quarters
                        expect(`${name} played ${entry.played.length}`)
                            .toBe(`${name} played ${Math.max(entry.played.length, 2)}`);
                    }
                }
            });

            test('nobody repeats a position', () => {
                for (let run = 0; run < 20; run++) {
                    const result = generate(scenario.size, scenario);
                    for (const [name, entry] of tally(result, scenario.playersOnField)) {
                        const unique = new Set(entry.positions);
                        expect(`${name}: ${unique.size}/${entry.positions.length}`)
                            .toBe(`${name}: ${entry.positions.length}/${entry.positions.length}`);
                    }
                }
            });

            test('everyone who plays sees both defense and offense, within one quarter', () => {
                for (let run = 0; run < 20; run++) {
                    const result = generate(scenario.size, scenario);
                    for (const [name, entry] of tally(result, scenario.playersOnField)) {
                        if (entry.played.length === 0) continue;
                        expect(`${name} D${entry.defense} O${entry.offense}`)
                            .toBe(`${name} D${Math.max(entry.defense, 1)} O${Math.max(entry.offense, 1)}`);
                        expect(Math.abs(entry.defense - entry.offense)).toBeLessThanOrEqual(1);
                    }
                }
            });

            test('reports no outstanding issues', () => {
                for (let run = 0; run < 10; run++) {
                    expect(generate(scenario.size, scenario).validation).toEqual([]);
                }
            });
        });
    }
});

describe('player preferences', () => {
    test('a player marked noKeeper never keeps goal', () => {
        for (let run = 0; run < 30; run++) {
            const players = makeRoster(10);
            players[0].noKeeper = true;
            players[3].noKeeper = true;

            const result = generate(10, { players });
            const entries = tally(result, 7);

            expect(entries.get('Player 1').keeper).toBe(0);
            expect(entries.get('Player 4').keeper).toBe(0);
        }
    });

    test('a player marked mustRest gets a quarter off', () => {
        for (let run = 0; run < 30; run++) {
            const players = makeRoster(10);
            players[2].mustRest = true;

            const result = generate(10, { players });
            expect(tally(result, 7).get('Player 3').sat.length).toBeGreaterThanOrEqual(1);
        }
    });
});

describe('exact-fit rosters', () => {
    test('with no substitutes, everyone plays every quarter and nobody sits', () => {
        const result = generate(7, { playersOnField: 7 });
        for (const [name, entry] of tally(result, 7)) {
            expect(`${name} played ${entry.played.length}`).toBe(`${name} played 4`);
            expect(entry.sat).toEqual([]);
        }
    });

    test('determineSittingSchedule leaves every quarter empty', () => {
        const schedule = determineSittingSchedule(makeRoster(7), 7, QUARTERS, {});
        expect(Object.values(schedule).flat()).toEqual([]);
    });
});

describe('validateLineup', () => {
    /** A player record shaped the way the engine tracks one during generation. */
    function tracked(overrides = {}) {
        return {
            name: 'Ada',
            quartersPlayed: [1, 2, 3, 4],
            quartersSitting: [],
            positionsPlayed: [
                { quarter: 1, position: 'Left Back' },
                { quarter: 2, position: 'Striker' },
                { quarter: 3, position: 'Right Back' },
                { quarter: 4, position: 'Left Wing' }
            ],
            defensiveQuarters: 2,
            offensiveQuarters: 2,
            ...overrides
        };
    }

    test('accepts a clean record', () => {
        expect(validateLineup([tracked()], QUARTERS)).toEqual([]);
    });

    test('flags two quarters in goal', () => {
        const issues = validateLineup([tracked({
            positionsPlayed: [
                { quarter: 1, position: 'Keeper' },
                { quarter: 2, position: 'Keeper' },
                { quarter: 3, position: 'Striker' },
                { quarter: 4, position: 'Left Back' }
            ]
        })], QUARTERS);

        expect(issues.some(i => i.includes('goalie for 2 quarters'))).toBe(true);
    });

    test('flags consecutive sitting', () => {
        const issues = validateLineup([tracked({
            quartersPlayed: [1, 4],
            quartersSitting: [2, 3],
            positionsPlayed: [
                { quarter: 1, position: 'Left Back' },
                { quarter: 4, position: 'Striker' }
            ],
            defensiveQuarters: 1,
            offensiveQuarters: 1
        })], QUARTERS);

        expect(issues.some(i => i.includes('sits consecutively'))).toBe(true);
    });

    test('flags sitting more than twice', () => {
        const issues = validateLineup([tracked({
            quartersPlayed: [2],
            quartersSitting: [1, 3, 4],
            positionsPlayed: [{ quarter: 2, position: 'Left Back' }],
            defensiveQuarters: 1,
            offensiveQuarters: 0
        })], QUARTERS);

        expect(issues.some(i => i.includes('sits for 3 quarters'))).toBe(true);
    });

    test('flags a player kept to one side of the pitch', () => {
        const allDefense = validateLineup([tracked({
            positionsPlayed: [
                { quarter: 1, position: 'Left Back' },
                { quarter: 2, position: 'Right Back' },
                { quarter: 3, position: 'Center Back' },
                { quarter: 4, position: 'Keeper' }
            ],
            defensiveQuarters: 4,
            offensiveQuarters: 0
        })], QUARTERS);

        expect(allDefense.some(i => i.includes('never played offense'))).toBe(true);
        expect(allDefense.some(i => i.includes('D/O imbalance'))).toBe(true);
    });

    test('flags a repeated position', () => {
        const issues = validateLineup([tracked({
            positionsPlayed: [
                { quarter: 1, position: 'Striker' },
                { quarter: 2, position: 'Striker' },
                { quarter: 3, position: 'Left Back' },
                { quarter: 4, position: 'Right Back' }
            ]
        })], QUARTERS);

        expect(issues.some(i => i.includes('plays Striker 2 times'))).toBe(true);
    });

    test('says nothing about a player who never took the field', () => {
        expect(validateLineup([tracked({
            quartersPlayed: [],
            quartersSitting: [1, 3],
            positionsPlayed: [],
            defensiveQuarters: 0,
            offensiveQuarters: 0
        })], QUARTERS)).toEqual([]);
    });
});

describe('resting is recorded from who actually played', () => {
    /**
     * Regression test. Sitting used to be recorded from the schedule rather than
     * from the finished lineup. When the schedule could not place someone it
     * left a quarter under-filled, so more players reached the assignment step
     * than there were positions and the surplus quietly got none -- counted as
     * playing, absent from the coach's resting list, and invisible to
     * validateLineup, which then reported a clean sheet over a real violation.
     */
    test.each([
        { size: 11, playersOnField: 7, formation: '2-2-2' },
        { size: 12, playersOnField: 7, formation: '2-3-1' },
        { size: 13, playersOnField: 7, formation: '2-3-1' },
        { size: 16, playersOnField: 9, formation: '3-3-2' }
    ])('$size players, $formation, keep the books straight', ({ size, playersOnField, formation }) => {
        for (let run = 0; run < 25; run++) {
            const result = generate(size, { playersOnField, formation });

            result.lineup.forEach(quarter => {
                const onField = new Set(Object.values(quarter.positions));
                expect(onField.size).toBe(playersOnField);

                const actuallyResting = result.players
                    .filter(p => !onField.has(p.name)).map(p => p.name).sort();
                const recordedResting = result.players
                    .filter(p => p.quartersSitting.includes(quarter.quarter)).map(p => p.name).sort();

                expect(recordedResting).toEqual(actuallyResting);
            });
        }
    });
});

describe('limits inherent to the format', () => {
    /**
     * These are not defects. They are recorded so the warnings the app produces
     * are not mistaken for bugs later, and so a change that silently stops
     * reporting them gets caught.
     */
    test('a 2-3-1 cannot give everyone defense once the roster passes twelve', () => {
        // Three defensive slots per quarter (Keeper, Left Back, Right Back)
        // across four quarters is twelve, so a thirteenth player cannot fit
        const result = generate(13, { playersOnField: 7, formation: '2-3-1' });

        expect(result.validation.some(issue => issue.includes('never played defense'))).toBe(true);
    });

    test('sitting three of four quarters is reported as consecutive, because it must be', () => {
        // 15 players at 7v7 leaves 32 rest slots over 15 players, so two of them
        // sit three times -- and no three of four quarters avoid being adjacent
        const result = generate(15, { playersOnField: 7, formation: '2-3-1' });

        const restedThrice = result.players.filter(p => p.quartersSitting.length >= 3);
        expect(restedThrice.length).toBeGreaterThan(0);
        expect(result.validation.some(issue => issue.includes('sits consecutively'))).toBe(true);
    });

    test('a best-effort lineup is still returned when the rules cannot all hold', () => {
        const result = generate(13, { playersOnField: 7, formation: '2-3-1' });

        // The coach gets a usable lineup plus the warnings, not an empty result
        expect(result.lineup).toHaveLength(QUARTERS);
        expect(result.validation.length).toBeGreaterThan(0);
        result.lineup.forEach(q => expect(Object.keys(q.positions)).toHaveLength(7));
    });
});

describe('strength balancing (players with ratings)', () => {
    /**
     * Ratings switch on balanceSittingByRating, which swaps who rests between
     * the strongest and weakest quarters to even the sides out. Nothing
     * exercised that path before, and it was moving a player into a quarter
     * they were already resting in -- listing them twice, which shrank that
     * quarter's real rest group and pushed someone else off the field
     * unintentionally.
     */
    test.each([
        { size: 10, playersOnField: 7, formation: '2-3-1' },
        { size: 11, playersOnField: 7, formation: '2-2-2' },
        { size: 12, playersOnField: 7, formation: '2-3-1' },
        { size: 16, playersOnField: 9, formation: '3-3-2' }
    ])('$size players rest exactly once per quarter they sit', ({ size, playersOnField }) => {
        const sittingPerQuarter = size - playersOnField;

        for (let run = 0; run < 40; run++) {
            const schedule = determineSittingSchedule(
                makeRoster(size, { rated: true }), playersOnField, QUARTERS, {}
            );

            for (let quarter = 1; quarter <= QUARTERS; quarter++) {
                const resting = schedule[quarter];
                expect(new Set(resting).size).toBe(resting.length);
                expect(resting).toHaveLength(sittingPerQuarter);
            }
        }
    });

    test.each([
        { size: 10, playersOnField: 7, formation: '2-3-1' },
        { size: 11, playersOnField: 7, formation: '2-2-2' },
        { size: 12, playersOnField: 7, formation: '2-3-1' },
        { size: 16, playersOnField: 9, formation: '3-3-2' }
    ])('$size players, $formation, still satisfy the rotation rules', ({ size, playersOnField, formation }) => {
        for (let run = 0; run < 15; run++) {
            const result = generate(size, { playersOnField, formation, rated: true });

            expect(result.validation).toEqual([]);

            for (const [name, entry] of tally(result, playersOnField)) {
                expect(`${name} sat ${entry.sat.length}`).toBe(`${name} sat ${Math.min(entry.sat.length, 2)}`);
                expect(`${name}: ${hasConsecutive(entry.sat)}`).toBe(`${name}: false`);
                expect(`${name} in goal ${entry.keeper}`).toBe(`${name} in goal ${Math.min(entry.keeper, 1)}`);
            }
        }
    });

    test('a roster of equally rated players is left alone', () => {
        const flat = makeRoster(11).map(p => ({ ...p, overallRating: 3 }));
        const schedule = determineSittingSchedule(flat, 7, QUARTERS, {});

        for (let quarter = 1; quarter <= QUARTERS; quarter++) {
            expect(schedule[quarter]).toHaveLength(4);
            expect(new Set(schedule[quarter]).size).toBe(4);
        }
    });
});
