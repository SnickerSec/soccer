// Tests for season stats functions
import {
    calculatePlayerStats,
    getLineupRecommendations,
    currentPositionName
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
        expect(stats['Alice'].offensiveQuarters).toBe(1);
        expect(stats['Alice'].midfieldQuarters).toBe(1);
        expect(stats['Alice'].defensiveQuarters).toBe(1);
        expect(stats['Alice'].offenseQuarters).toBe(1);
        expect(stats['Alice'].defenseQuarters).toBe(1);

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
