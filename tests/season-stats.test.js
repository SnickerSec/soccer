// Tests for season stats functions
import {
    calculatePlayerStats,
    getLineupRecommendations,
    currentPositionName,
    currentQuarters,
    currentPlayerPositions
} from '../src/modules/season-stats.js';

// Test data
const mockPlayers = [
    { name: 'Alice', status: 'available', noKeeper: false },
    { name: 'Bob', status: 'available', noKeeper: false },
    { name: 'Charlie', status: 'available', noKeeper: true }
];

const mockSavedGames = [
    {
        id: 1,
        name: 'Game 1',
        captains: ['Alice'],
        players: [
            {
                name: 'Alice',
                status: 'available',
                isCaptain: true,
                quartersPlayed: [1, 2, 3],
                quartersSitting: [4],
                goalieQuarter: 1,
                positionsPlayed: [
                    { quarter: 1, position: 'Keeper' },
                    { quarter: 2, position: 'Striker' },
                    { quarter: 3, position: 'Left Mid' }
                ],
                offensiveQuarters: 2,
                defensiveQuarters: 1
            },
            {
                name: 'Bob',
                status: 'available',
                quartersPlayed: [1, 2, 3, 4],
                quartersSitting: [],
                goalieQuarter: null,
                positionsPlayed: [
                    { quarter: 1, position: 'Left Back' },
                    { quarter: 2, position: 'Left Back' },
                    { quarter: 3, position: 'Left Back' },
                    { quarter: 4, position: 'Left Back' }
                ],
                offensiveQuarters: 0,
                defensiveQuarters: 4
            },
            {
                name: 'Charlie',
                status: 'absent',
                quartersPlayed: [],
                quartersSitting: []
            }
        ]
    }
];

describe('calculatePlayerStats', () => {
    test('should return stats for all current players', () => {
        const stats = calculatePlayerStats(mockPlayers, []);
        expect(stats).toHaveProperty('Alice');
        expect(stats).toHaveProperty('Bob');
        expect(stats).toHaveProperty('Charlie');
    });

    test('should initialize with zero values for new players', () => {
        const stats = calculatePlayerStats(mockPlayers, []);
        expect(stats['Alice'].gamesPlayed).toBe(0);
        expect(stats['Alice'].totalQuarters).toBe(0);
        expect(stats['Alice'].goalkeeperQuarters).toBe(0);
    });

    test('should count games played correctly', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        expect(stats['Alice'].gamesPlayed).toBe(1);
        expect(stats['Bob'].gamesPlayed).toBe(1);
    });

    test('should count total quarters played', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        expect(stats['Alice'].totalQuarters).toBe(3);
        expect(stats['Bob'].totalQuarters).toBe(4);
    });

    test('should count sitting quarters', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        expect(stats['Alice'].totalSitting).toBe(1);
        expect(stats['Bob'].totalSitting).toBe(0);
    });

    test('should count goalkeeper quarters', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        expect(stats['Alice'].goalkeeperQuarters).toBe(1);
        expect(stats['Bob'].goalkeeperQuarters).toBe(0);
    });

    test('should count captain games', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        expect(stats['Alice'].captainGames).toBe(1);
        expect(stats['Bob'].captainGames).toBe(0);
    });

    test('should track positions played', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        expect(stats['Alice'].positions['Keeper']).toBe(1);
        expect(stats['Alice'].positions['Striker']).toBe(1);
        expect(stats['Bob'].positions['Left Back']).toBe(4);
    });

    test('should handle players not in current roster', () => {
        const savedGamesWithExtra = [{
            ...mockSavedGames[0],
            players: [
                ...mockSavedGames[0].players,
                {
                    name: 'OldPlayer',
                    status: 'available',
                    quartersPlayed: [1, 2],
                    quartersSitting: [3, 4]
                }
            ]
        }];
        const stats = calculatePlayerStats(mockPlayers, savedGamesWithExtra);
        expect(stats['OldPlayer']).toBeDefined();
        expect(stats['OldPlayer'].gamesPlayed).toBe(1);
        expect(stats['OldPlayer'].gamesAttended).toBe(1);
    });

    test('should track attendance correctly', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        // Alice and Bob attended, Charlie was absent
        expect(stats['Alice'].gamesAttended).toBe(1);
        expect(stats['Alice'].gamesAbsent).toBe(0);
        expect(stats['Bob'].gamesAttended).toBe(1);
        expect(stats['Charlie'].gamesAttended).toBe(0);
        expect(stats['Charlie'].gamesAbsent).toBe(1);
        expect(stats['Charlie'].gamesOnRoster).toBe(1);
    });

    test('should calculate offensive, defensive and midfield quarters', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        // Alice kept goal, played Striker and played Left Mid. She never
        // played a back, so her defensive count is 0: the 1 this asserted
        // before was her keeper quarter being counted a second time.
        expect(stats['Alice'].offensiveQuarters).toBe(1);
        expect(stats['Alice'].midfieldQuarters).toBe(1);
        expect(stats['Alice'].defensiveQuarters).toBe(0);
        expect(stats['Alice'].offenseQuarters).toBe(1);
        expect(stats['Alice'].defenseQuarters).toBe(0);
        expect(stats['Alice'].goalkeeperQuarters).toBe(1);

        expect(stats['Bob'].offensiveQuarters).toBe(0);
        expect(stats['Bob'].midfieldQuarters).toBe(0);
        expect(stats['Bob'].defensiveQuarters).toBe(4);
        expect(stats['Bob'].defenseQuarters).toBe(4);
    });

    test('should calculate 3-3 formation (3 backs, 3 forwards, no midfield) stats properly', () => {
        const team33 = [
            { id: '1', name: 'Defender Dan', status: 'available' },
            { id: '2', name: 'Forward Fran', status: 'available' },
            { id: '3', name: 'Balanced Ben', status: 'available' }
        ];

        const games33 = [
            {
                id: 'game-33-1',
                name: 'Game vs Tigers',
                formation: '3-3',
                players: [
                    {
                        name: 'Defender Dan',
                        status: 'available',
                        quartersPlayed: [1, 2, 3, 4],
                        quartersSitting: [],
                        positionsPlayed: [
                            { quarter: 1, position: 'Left Back' },
                            { quarter: 2, position: 'Center Back' },
                            { quarter: 3, position: 'Right Back' },
                            { quarter: 4, position: 'Left Back' }
                        ]
                    },
                    {
                        name: 'Forward Fran',
                        status: 'available',
                        quartersPlayed: [1, 2, 3, 4],
                        quartersSitting: [],
                        positionsPlayed: [
                            { quarter: 1, position: 'Left Forward' },
                            { quarter: 2, position: 'Striker' },
                            { quarter: 3, position: 'Right Forward' },
                            { quarter: 4, position: 'Striker' }
                        ]
                    },
                    {
                        name: 'Balanced Ben',
                        status: 'available',
                        quartersPlayed: [1, 2, 3, 4],
                        quartersSitting: [],
                        positionsPlayed: [
                            { quarter: 1, position: 'Left Back' },
                            { quarter: 2, position: 'Right Back' },
                            { quarter: 3, position: 'Left Forward' },
                            { quarter: 4, position: 'Right Forward' }
                        ]
                    }
                ]
            }
        ];

        const stats = calculatePlayerStats(team33, games33);

        // Defender Dan: 4 defense, 0 offense, 0 midfield
        expect(stats['Defender Dan'].defensiveQuarters).toBe(4);
        expect(stats['Defender Dan'].offensiveQuarters).toBe(0);
        expect(stats['Defender Dan'].midfieldQuarters).toBe(0);

        // Forward Fran: 0 defense, 4 offense, 0 midfield
        expect(stats['Forward Fran'].defensiveQuarters).toBe(0);
        expect(stats['Forward Fran'].offensiveQuarters).toBe(4);
        expect(stats['Forward Fran'].midfieldQuarters).toBe(0);

        // Balanced Ben: 2 defense, 2 offense, 0 midfield
        expect(stats['Balanced Ben'].defensiveQuarters).toBe(2);
        expect(stats['Balanced Ben'].offensiveQuarters).toBe(2);
        expect(stats['Balanced Ben'].midfieldQuarters).toBe(0);

        // Recommendations
        const recs = getLineupRecommendations(team33, games33, stats);
        expect(recs.needsOffense.map(p => p.name)).toContain('Defender Dan');
        expect(recs.needsDefense.map(p => p.name)).toContain('Forward Fran');
    });

    test('should track recent game status for cross-game rotation', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        // Alice sat Q4 in mockSavedGames[0] and was keeper
        expect(stats['Alice'].lastGameSatQ4).toBe(true);
        expect(stats['Alice'].lastGameKeeper).toBe(true);
        expect(stats['Alice'].lastGamePlayed).toBeDefined();

        // Bob played all 4 quarters as Left Back
        expect(stats['Bob'].lastGameSatQ4).toBe(false);
        expect(stats['Bob'].lastGameKeeper).toBe(false);
    });
});

describe('getLineupRecommendations', () => {
    test('should return null if no saved games', () => {
        const recommendations = getLineupRecommendations(mockPlayers, [], {});
        expect(recommendations).toBeNull();
    });

    test('should return null if no available players', () => {
        const unavailablePlayers = mockPlayers.map(p => ({ ...p, status: 'absent' }));
        const recommendations = getLineupRecommendations(unavailablePlayers, mockSavedGames, {});
        expect(recommendations).toBeNull();
    });

    test('should return recommendations object with all categories', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        const recommendations = getLineupRecommendations(mockPlayers, mockSavedGames, stats);

        expect(recommendations).toHaveProperty('shouldSit');
        expect(recommendations).toHaveProperty('shouldKeep');
        expect(recommendations).toHaveProperty('shouldCaptain');
        expect(recommendations).toHaveProperty('needsOffense');
        expect(recommendations).toHaveProperty('needsDefense');
        expect(recommendations).toHaveProperty('positionVariety');
    });

    test('should recommend players with lowest sitting to sit more', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        const recommendations = getLineupRecommendations(mockPlayers, mockSavedGames, stats);

        // Bob has 0 sitting, should be recommended to sit
        const bobRec = recommendations.shouldSit.find(r => r.name === 'Bob');
        expect(bobRec).toBeDefined();
    });

    test('should recommend players with lowest GK count for goalkeeper', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        const recommendations = getLineupRecommendations(mockPlayers, mockSavedGames, stats);

        // Bob has 0 GK games and is not noKeeper, should be recommended
        const bobRec = recommendations.shouldKeep.find(r => r.name === 'Bob');
        expect(bobRec).toBeDefined();
    });

    test('should not recommend noKeeper players for goalkeeper', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        const recommendations = getLineupRecommendations(mockPlayers, mockSavedGames, stats);

        // Charlie is noKeeper, should not be recommended
        const charlieRec = recommendations.shouldKeep.find(r => r.name === 'Charlie');
        expect(charlieRec).toBeUndefined();
    });

    test('should recommend players with most defense for more offense', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        const recommendations = getLineupRecommendations(mockPlayers, mockSavedGames, stats);

        // Bob has 4 defense, 0 offense - should need offense
        const bobRec = recommendations.needsOffense.find(r => r.name === 'Bob');
        expect(bobRec).toBeDefined();
    });

    test('should limit recommendations to 3 per category', () => {
        const stats = calculatePlayerStats(mockPlayers, mockSavedGames);
        const recommendations = getLineupRecommendations(mockPlayers, mockSavedGames, stats);

        expect(recommendations.shouldSit.length).toBeLessThanOrEqual(3);
        expect(recommendations.shouldKeep.length).toBeLessThanOrEqual(3);
        expect(recommendations.shouldCaptain.length).toBeLessThanOrEqual(3);
    });
});

describe('recommendations do not fall back on roster order', () => {
    // Two even games leave a squad tied almost everywhere. What separated the
    // players named from the ones left out used to be nothing but their place
    // in the roster, so the same three were recommended for everything.
    const squad = ['Brady', 'Henry', 'Ephraim', 'Kamu', 'Jordan']
        .map(name => ({ name, status: 'available', noKeeper: false }));

    /** One game, with each named player sitting the quarters given. */
    const game = (id, sitting) => ({
        id,
        name: `Game ${id}`,
        players: squad.map(p => {
            const sat = sitting[p.name] || [];
            const played = [1, 2, 3, 4].filter(q => !sat.includes(q));
            return {
                name: p.name,
                status: 'available',
                quartersPlayed: played,
                quartersSitting: sat,
                positionsPlayed: played.map(q => ({ quarter: q, position: 'Left Back' })),
            };
        }),
    });

    const games = [
        game(1, { Brady: [], Henry: [2], Ephraim: [], Kamu: [3], Jordan: [4] }),
        game(2, { Brady: [3], Henry: [1], Ephraim: [2], Kamu: [4], Jordan: [1] }),
    ];

    test('rest priority names only the players who have sat least', () => {
        const stats = calculatePlayerStats(squad, games);
        const rest = getLineupRecommendations(squad, games, stats).shouldSit;

        // Brady and Ephraim sat once across two games; everyone else sat twice.
        expect(rest.map(r => r.name).sort()).toEqual(['Brady', 'Ephraim']);
    });

    test('a player who has sat more than the minimum is not a rest priority', () => {
        const stats = calculatePlayerStats(squad, games);
        const rest = getLineupRecommendations(squad, games, stats).shouldSit;

        expect(rest.find(r => r.name === 'Henry')).toBeUndefined();
    });

    test('players tied on everything are ordered by name, not by the roster', () => {
        // Every one of these sat exactly once, so only the tie-break separates
        // them. Reversing the roster must not reverse the answer.
        const even = ['Zoe', 'Ana', 'Mo'].map(name => ({ name, status: 'available' }));
        const evenGame = {
            id: 9,
            name: 'Even',
            players: even.map(p => ({
                name: p.name,
                status: 'available',
                quartersPlayed: [1, 2, 3],
                quartersSitting: [4],
                positionsPlayed: [1, 2, 3].map(q => ({ quarter: q, position: 'Striker' })),
            })),
        };

        const forward = getLineupRecommendations(even, [evenGame]);
        const reversed = getLineupRecommendations([...even].reverse(), [evenGame]);

        expect(forward.shouldSit.map(r => r.name)).toEqual(['Ana', 'Mo', 'Zoe']);
        expect(reversed.shouldSit.map(r => r.name)).toEqual(forward.shouldSit.map(r => r.name));
        expect(reversed.shouldCaptain.map(r => r.name)).toEqual(forward.shouldCaptain.map(r => r.name));
    });
});

describe('the 3-3 that used to have a midfield', () => {
    // Left/Center/Right Mid were the 3-3's middle line before it was redefined
    // as Left Forward / Striker / Right Forward. The same three slots.
    const oldStyleGame = {
        name: 'vs Shaffer',
        formation: '3-3',
        fieldPlayers: 7,
        players: [{
            name: 'Ana Ruiz',
            status: 'available',
            quartersPlayed: [1, 2, 3],
            quartersSitting: [4],
            positionsPlayed: [
                { quarter: 1, position: 'Left Mid' },
                { quarter: 2, position: 'Center Mid' },
                { quarter: 3, position: 'Left Back' },
            ],
        }],
    };

    test('renames the middle line to what those slots became', () => {
        expect(currentPositionName('Left Mid', { formation: '3-3', fieldPlayers: 7 })).toBe('Left Forward');
        expect(currentPositionName('Center Mid', { formation: '3-3', fieldPlayers: 7 })).toBe('Striker');
        expect(currentPositionName('Right Mid', { formation: '3-3', fieldPlayers: 7 })).toBe('Right Forward');
    });

    test('the 6v6 3-3 had no Right Mid, so its Center Mid became the Right Forward', () => {
        expect(currentPositionName('Center Mid', { formation: '3-3', fieldPlayers: 6 })).toBe('Right Forward');
    });

    test('a midfielder in a formation that has a midfield is left alone', () => {
        expect(currentPositionName('Center Mid', { formation: '2-3-1', fieldPlayers: 7 })).toBe('Center Mid');
        expect(currentPositionName('Left Mid', { formation: '4-3-3', fieldPlayers: 11 })).toBe('Left Mid');
    });

    test('positions that were never renamed pass through', () => {
        expect(currentPositionName('Left Back', { formation: '3-3', fieldPlayers: 7 })).toBe('Left Back');
        expect(currentPositionName('Keeper', { formation: '3-3', fieldPlayers: 7 })).toBe('Keeper');
    });

    test('those quarters count as attack, not as a midfield the formation lacks', () => {
        const stats = calculatePlayerStats([{ name: 'Ana Ruiz' }], [oldStyleGame]);
        const ana = stats['Ana Ruiz'];

        expect(ana.midfieldQuarters).toBe(0);
        expect(ana.offensiveQuarters).toBe(2);
        expect(ana.defensiveQuarters).toBe(1);
    });

    test('and are filed under their current names in the position breakdown', () => {
        const stats = calculatePlayerStats([{ name: 'Ana Ruiz' }], [oldStyleGame]);

        expect(stats['Ana Ruiz'].positions).toEqual({
            'Left Forward': 1,
            Striker: 1,
            'Left Back': 1,
        });
    });
});

describe('a keeper quarter is counted once', () => {
    // One keeper, one back, one forward across three played quarters.
    const game = {
        formation: '3-3',
        fieldPlayers: 7,
        players: [{
            name: 'Ana Ruiz',
            status: 'available',
            quartersPlayed: [1, 2, 3],
            quartersSitting: [4],
            positionsPlayed: [
                { quarter: 1, position: 'Keeper' },
                { quarter: 2, position: 'Left Back' },
                { quarter: 3, position: 'Striker' },
            ],
        }],
    };

    test('the keeper quarter does not also count as a back', () => {
        const ana = calculatePlayerStats([{ name: 'Ana Ruiz' }], [game])['Ana Ruiz'];

        expect(ana.goalkeeperQuarters).toBe(1);
        expect(ana.defensiveQuarters).toBe(1);
        expect(ana.offensiveQuarters).toBe(1);
    });

    test('the zones add up to the quarters actually played', () => {
        const ana = calculatePlayerStats([{ name: 'Ana Ruiz' }], [game])['Ana Ruiz'];
        const zones = ana.goalkeeperQuarters + ana.defensiveQuarters
            + ana.midfieldQuarters + ana.offensiveQuarters;

        expect(zones).toBe(ana.totalQuarters);
        expect(zones).toBe(3);
    });

    test('a keeper-only game adds nothing to the defensive count', () => {
        // AYSO caps keeper at one quarter a game and the engine enforces it,
        // so goalkeeperQuarters counts the games a player kept goal in.
        const keeperGame = {
            formation: '2-3-1',
            fieldPlayers: 7,
            players: [{
                name: 'Ben Cole', status: 'available',
                quartersPlayed: [1, 2], quartersSitting: [],
                positionsPlayed: [
                    { quarter: 1, position: 'Keeper' },
                    { quarter: 2, position: 'Right Wing' },
                ],
            }],
        };
        const ben = calculatePlayerStats([{ name: 'Ben Cole' }], [keeperGame])['Ben Cole'];

        expect(ben.goalkeeperQuarters).toBe(1);
        expect(ben.defensiveQuarters).toBe(0);
        expect(ben.offensiveQuarters).toBe(1);
    });
});

describe('currentQuarters', () => {
    const oldThreeThree = {
        formation: '3-3',
        fieldPlayers: 7,
        quarters: [{
            quarter: 1,
            positions: {
                Keeper: 'Elias', 'Left Back': 'Brady', 'Center Back': 'Henry',
                'Right Back': 'Ephraim', 'Left Mid': 'Kamu', 'Center Mid': 'Amos',
                'Right Mid': 'Brees',
            },
            sitting: ['Jordan'],
        }],
    };

    test('reopening an old 3-3 fills the forward rows instead of showing TBD', () => {
        const [q] = currentQuarters(oldThreeThree);

        expect(q.positions['Left Forward']).toBe('Kamu');
        expect(q.positions['Striker']).toBe('Amos');
        expect(q.positions['Right Forward']).toBe('Brees');
        expect(q.positions['Left Mid']).toBeUndefined();
    });

    test('the backs, the keeper and who was sitting are untouched', () => {
        const [q] = currentQuarters(oldThreeThree);

        expect(q.positions['Keeper']).toBe('Elias');
        expect(q.positions['Left Back']).toBe('Brady');
        expect(q.sitting).toEqual(['Jordan']);
        expect(q.quarter).toBe(1);
    });

    test('a formation that was never renamed is returned as it was stored', () => {
        const game = {
            formation: '2-3-1',
            quarters: [{ quarter: 1, positions: { 'Center Mid': 'Kamu' }, sitting: [] }],
        };

        expect(currentQuarters(game)[0].positions).toEqual({ 'Center Mid': 'Kamu' });
    });

    test('a game with no quarters gives an empty list rather than throwing', () => {
        expect(currentQuarters({ formation: '3-3' })).toEqual([]);
        expect(currentQuarters(undefined)).toEqual([]);
    });
});

describe('currentPlayerPositions', () => {
    const game = {
        formation: '3-3',
        fieldPlayers: 7,
        players: [{
            name: 'Brady',
            status: 'available',
            quartersPlayed: [1, 2],
            positionsPlayed: [
                { quarter: 1, position: 'Left Back' },
                { quarter: 2, position: 'Left Mid' },
            ],
        }],
    };

    test('the summary lists the positions the quarter cards show', () => {
        const [brady] = currentPlayerPositions(game);

        expect(brady.positionsPlayed).toEqual([
            { quarter: 1, position: 'Left Back' },
            { quarter: 2, position: 'Left Forward' },
        ]);
    });

    test('everything else about the player is carried through', () => {
        const [brady] = currentPlayerPositions(game);

        expect(brady.name).toBe('Brady');
        expect(brady.quartersPlayed).toEqual([1, 2]);
    });

    test('a game with no players, or another formation, is left as it is', () => {
        expect(currentPlayerPositions({ formation: '3-3' })).toEqual([]);
        const midfielders = { formation: '2-3-1', players: game.players };
        expect(currentPlayerPositions(midfielders)).toBe(game.players);
    });
});

describe('legacy games and omitted player stats', () => {
    const fullSquad = [
        'Brady', 'Henry', 'Ephraim', 'Amos', 'Kamu',
        'Jordan', 'Brees', 'Kevin', 'Elias', 'Savior',
    ].map(name => ({ name, status: 'available', noKeeper: false }));

    const legacyGame1 = {
        id: 'game-1',
        name: 'vs Shaffer, Game 1',
        date: '2026-08-29',
        // 8 players recorded; Amos and Savior were missing from the snapshot
        players: [
            'Brady', 'Henry', 'Ephraim', 'Kamu',
            'Jordan', 'Brees', 'Kevin', 'Elias',
        ].map(name => ({
            name,
            status: 'available',
            quartersPlayed: [1, 2, 3],
            quartersSitting: [4],
            positionsPlayed: [{ quarter: 1, position: 'Left Back' }],
        })),
        captains: ['Brady'],
    };

    const modernGame2 = {
        id: 'game-2',
        name: 'Game 2',
        date: '2026-09-05',
        // All 10 players recorded; Amos played, Savior was marked absent
        players: [
            ...['Brady', 'Henry', 'Ephraim', 'Amos', 'Kamu', 'Jordan', 'Brees', 'Kevin', 'Elias'].map(name => ({
                name,
                status: 'available',
                quartersPlayed: [1, 2, 3],
                quartersSitting: [4],
                positionsPlayed: [{ quarter: 1, position: 'Left Back' }],
            })),
            {
                name: 'Savior',
                status: 'absent',
                quartersPlayed: [],
                quartersSitting: [],
                positionsPlayed: [],
            },
        ],
        captains: ['Brees'],
    };

    test('counts unrecorded squad players with history as absent for legacy games', () => {
        const stats = calculatePlayerStats(fullSquad, [legacyGame1, modernGame2]);

        // Amos played Game 2, missing from Game 1 -> 1 attended, 1 absent out of 2
        expect(stats.Amos.gamesOnRoster).toBe(2);
        expect(stats.Amos.gamesAttended).toBe(1);
        expect(stats.Amos.gamesAbsent).toBe(1);

        // Savior absent Game 2, missing from Game 1 -> 0 attended, 2 absent out of 2
        expect(stats.Savior.gamesOnRoster).toBe(2);
        expect(stats.Savior.gamesAttended).toBe(0);
        expect(stats.Savior.gamesAbsent).toBe(2);

        // Brady played both games
        expect(stats.Brady.gamesOnRoster).toBe(2);
        expect(stats.Brady.gamesAttended).toBe(2);
        expect(stats.Brady.gamesAbsent).toBe(0);

        // Overall squad attendance rate: 8 attended in game 1 + 9 attended in game 2 = 17 / (10 players * 2) = 85%
        const totalRosterSpots = Object.values(stats).reduce((sum, s) => sum + s.gamesOnRoster, 0);
        const totalAttended = Object.values(stats).reduce((sum, s) => sum + s.gamesAttended, 0);
        expect(totalRosterSpots).toBe(20);
        expect(totalAttended).toBe(17);
        expect(Math.round((totalAttended / totalRosterSpots) * 100)).toBe(85);
    });

    test('does not assign absences to players who never appeared in any game', () => {
        const withNewKid = [...fullSquad, { name: 'NewKid', status: 'available' }];
        const stats = calculatePlayerStats(withNewKid, [legacyGame1, modernGame2]);

        expect(stats.NewKid.gamesOnRoster).toBe(0);
        expect(stats.NewKid.gamesAbsent).toBe(0);
        expect(stats.NewKid.gamesAttended).toBe(0);
    });

    test('returningFromAbsence sorts players with most absences first', () => {
        const stats = calculatePlayerStats(fullSquad, [legacyGame1, modernGame2]);
        const recs = getLineupRecommendations(fullSquad, [legacyGame1, modernGame2], stats);

        expect(recs.returningFromAbsence).toBeDefined();
        // Savior has 2 missed games, Amos has 1 missed game
        expect(recs.returningFromAbsence[0]).toEqual({ name: 'Savior', gamesAbsent: 2 });
        expect(recs.returningFromAbsence[1]).toEqual({ name: 'Amos', gamesAbsent: 1 });
    });

    test('falls back to game.captains only when player.isCaptain is undefined', () => {
        const legacyGameWithoutPlayerIsCaptain = {
            id: 'legacy-capt',
            name: 'Legacy Captain Game',
            players: [
                { name: 'Brady', status: 'available', quartersPlayed: [1] },
                { name: 'Henry', status: 'available', quartersPlayed: [1] },
            ],
            captains: ['Brady'],
        };
        const stats = calculatePlayerStats(fullSquad, [legacyGameWithoutPlayerIsCaptain]);
        expect(stats.Brady.captainGames).toBe(1);
        expect(stats.Henry.captainGames).toBe(0);
    });
});
