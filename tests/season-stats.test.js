// Tests for season stats functions
import {
    calculatePlayerStats,
    getLineupRecommendations
} from '../public/modules/season-stats.js';

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
