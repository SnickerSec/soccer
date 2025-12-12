/**
 * Unit tests for AYSO Roster Pro lineup generation logic
 */

// Mock CONSTANTS for testing
const CONSTANTS = {
    DEFAULT_QUARTERS: 4,
    MAX_PLAYERS: 30,
    MAX_CAPTAINS: 2,
    MAX_SITTING_QUARTERS: 2,
    MAX_GOALIE_QUARTERS: 1,
    MAX_GENERATION_ATTEMPTS: 500,
    PLAYER_STATUS: {
        AVAILABLE: 'available',
        INJURED: 'injured',
        ABSENT: 'absent'
    }
};

// Helper function to create a test player
function createPlayer(name, number = null, options = {}) {
    return {
        name,
        number,
        isCaptain: options.isCaptain || false,
        mustRest: options.mustRest || false,
        noKeeper: options.noKeeper || false,
        status: options.status || CONSTANTS.PLAYER_STATUS.AVAILABLE,
        preferredPositions: options.preferredPositions || [],
        quartersPlayed: [],
        quartersSitting: [],
        positionsPlayed: [],
        goalieQuarter: null,
        defensiveQuarters: 0,
        offensiveQuarters: 0
    };
}

// Helper function to shuffle array (same as in app.js)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Lineup generation helper functions (copied from lineup-worker.js for testing)
function determineSittingSchedule(players, playersOnField, quarters) {
    const totalPlayers = players.length;
    const sittingPerQuarter = totalPlayers - playersOnField;
    const schedule = { 1: [], 2: [], 3: [], 4: [] };

    if (sittingPerQuarter <= 0) {
        return schedule;
    }

    const playersCopy = players.map(p => ({
        name: p.name,
        mustRest: p.mustRest,
        sittingQuarters: []
    }));

    const mustRestPlayers = playersCopy.filter(p => p.mustRest);
    const regularPlayers = playersCopy.filter(p => !p.mustRest);
    shuffleArray(regularPlayers);

    const totalSittingSlots = sittingPerQuarter * quarters;
    const minSitsPerPlayer = Math.floor(totalSittingSlots / totalPlayers);

    function findNonConsecutiveSittingQuarter(currentSittingQuarters, schedule, maxSitting) {
        const quartersToTry = [1, 3, 2, 4];

        for (let q of quartersToTry) {
            if (schedule[q].length >= maxSitting) continue;
            if (currentSittingQuarters.includes(q)) continue;

            let isConsecutive = false;
            for (let sat of currentSittingQuarters) {
                if (Math.abs(sat - q) === 1) {
                    isConsecutive = true;
                    break;
                }
            }

            if (!isConsecutive) return q;
        }

        return -1;
    }

    const maxSitting = totalPlayers - playersOnField;
    const allPlayersCombined = [...mustRestPlayers, ...regularPlayers];

    for (let i = 0; i < minSitsPerPlayer; i++) {
        allPlayersCombined.forEach((player) => {
            if (player.sittingQuarters.length > i) return;

            let assignedQuarter = findNonConsecutiveSittingQuarter(player.sittingQuarters, schedule, maxSitting);
            if (assignedQuarter !== -1) {
                player.sittingQuarters.push(assignedQuarter);
                schedule[assignedQuarter].push(player.name);
            }
        });
    }

    return schedule;
}

// Tests
describe('Player Creation', () => {
    test('creates a player with default values', () => {
        const player = createPlayer('John Doe', 10);
        expect(player.name).toBe('John Doe');
        expect(player.number).toBe(10);
        expect(player.isCaptain).toBe(false);
        expect(player.mustRest).toBe(false);
        expect(player.noKeeper).toBe(false);
        expect(player.status).toBe(CONSTANTS.PLAYER_STATUS.AVAILABLE);
        expect(player.quartersPlayed).toEqual([]);
    });

    test('creates a player with custom options', () => {
        const player = createPlayer('Jane Smith', 7, {
            isCaptain: true,
            mustRest: true,
            noKeeper: true,
            status: CONSTANTS.PLAYER_STATUS.INJURED
        });
        expect(player.isCaptain).toBe(true);
        expect(player.mustRest).toBe(true);
        expect(player.noKeeper).toBe(true);
        expect(player.status).toBe(CONSTANTS.PLAYER_STATUS.INJURED);
    });
});

describe('Sitting Schedule', () => {
    test('returns schedule object with 4 quarters', () => {
        const players = [];
        for (let i = 1; i <= 9; i++) {
            players.push(createPlayer(`Player ${i}`, i));
        }

        const schedule = determineSittingSchedule(players, 7, 4);

        // Schedule should have entries for all 4 quarters
        expect(schedule).toHaveProperty('1');
        expect(schedule).toHaveProperty('2');
        expect(schedule).toHaveProperty('3');
        expect(schedule).toHaveProperty('4');
        expect(Array.isArray(schedule[1])).toBe(true);
    });

    test('generates empty schedule when players equal field size', () => {
        const players = [];
        for (let i = 1; i <= 7; i++) {
            players.push(createPlayer(`Player ${i}`, i));
        }

        const schedule = determineSittingSchedule(players, 7, 4);

        expect(schedule[1].length).toBe(0);
        expect(schedule[2].length).toBe(0);
        expect(schedule[3].length).toBe(0);
        expect(schedule[4].length).toBe(0);
    });

    test('sitting schedule contains only valid player names', () => {
        const players = [
            createPlayer('Alice', 1),
            createPlayer('Bob', 2),
            createPlayer('Charlie', 3),
            createPlayer('Diana', 4),
            createPlayer('Eve', 5),
            createPlayer('Frank', 6),
            createPlayer('Grace', 7),
            createPlayer('Henry', 8)
        ];

        const schedule = determineSittingSchedule(players, 7, 4);
        const playerNames = players.map(p => p.name);

        // All sitting players should be from the roster
        for (let q = 1; q <= 4; q++) {
            schedule[q].forEach(name => {
                expect(playerNames).toContain(name);
            });
        }
    });
});

describe('Validation Rules', () => {
    test('no player sits more than 2 quarters', () => {
        const players = [];
        for (let i = 1; i <= 10; i++) {
            players.push(createPlayer(`Player ${i}`, i));
        }

        const schedule = determineSittingSchedule(players, 7, 4);

        // Count how many times each player sits
        const sittingCounts = {};
        for (let q = 1; q <= 4; q++) {
            schedule[q].forEach(name => {
                sittingCounts[name] = (sittingCounts[name] || 0) + 1;
            });
        }

        // No player should sit more than 2 quarters
        Object.values(sittingCounts).forEach(count => {
            expect(count).toBeLessThanOrEqual(CONSTANTS.MAX_SITTING_QUARTERS);
        });
    });

    test('no player sits consecutive quarters', () => {
        const players = [];
        for (let i = 1; i <= 10; i++) {
            players.push(createPlayer(`Player ${i}`, i));
        }

        // Run multiple times to test randomness
        for (let run = 0; run < 10; run++) {
            const schedule = determineSittingSchedule(players, 7, 4);

            // Check for consecutive sitting
            players.forEach(player => {
                const sittingQuarters = [];
                for (let q = 1; q <= 4; q++) {
                    if (schedule[q].includes(player.name)) {
                        sittingQuarters.push(q);
                    }
                }

                // Check no two consecutive quarters
                for (let i = 0; i < sittingQuarters.length - 1; i++) {
                    const diff = Math.abs(sittingQuarters[i + 1] - sittingQuarters[i]);
                    expect(diff).toBeGreaterThan(1);
                }
            });
        }
    });
});

describe('Player Status Filtering', () => {
    test('filters out injured players', () => {
        const players = [
            createPlayer('Available 1', 1),
            createPlayer('Available 2', 2),
            createPlayer('Injured', 3, { status: CONSTANTS.PLAYER_STATUS.INJURED }),
            createPlayer('Available 3', 4)
        ];

        const availablePlayers = players.filter(p =>
            p.status === CONSTANTS.PLAYER_STATUS.AVAILABLE
        );

        expect(availablePlayers.length).toBe(3);
        expect(availablePlayers.map(p => p.name)).not.toContain('Injured');
    });

    test('filters out absent players', () => {
        const players = [
            createPlayer('Available 1', 1),
            createPlayer('Absent', 2, { status: CONSTANTS.PLAYER_STATUS.ABSENT }),
            createPlayer('Available 2', 3)
        ];

        const availablePlayers = players.filter(p =>
            p.status === CONSTANTS.PLAYER_STATUS.AVAILABLE
        );

        expect(availablePlayers.length).toBe(2);
        expect(availablePlayers.map(p => p.name)).not.toContain('Absent');
    });
});

describe('Captain Selection', () => {
    test('allows maximum of 2 captains', () => {
        const captains = [];
        const maxCaptains = CONSTANTS.MAX_CAPTAINS;

        // Simulate adding captains
        for (let i = 1; i <= 3; i++) {
            if (captains.length >= maxCaptains) {
                captains.shift(); // Remove oldest captain
            }
            captains.push(`Player ${i}`);
        }

        expect(captains.length).toBe(2);
        expect(captains).toContain('Player 2');
        expect(captains).toContain('Player 3');
        expect(captains).not.toContain('Player 1');
    });
});

describe('Shuffle Array', () => {
    test('shuffles array in place', () => {
        const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const copy = [...original];

        shuffleArray(copy);

        // Array should still have same elements (compare sorted copies)
        expect([...copy].sort((a, b) => a - b)).toEqual([...original].sort((a, b) => a - b));
    });

    test('produces different orders', () => {
        const results = new Set();

        for (let i = 0; i < 100; i++) {
            const arr = [1, 2, 3, 4, 5];
            shuffleArray(arr);
            results.add(arr.join(','));
        }

        // Should produce more than 1 unique ordering
        expect(results.size).toBeGreaterThan(1);
    });
});
