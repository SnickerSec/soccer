// Season statistics calculations

/**
 * Calculate aggregate stats for all players across saved games
 */
export function calculatePlayerStats(players, savedGames) {
    const stats = {};

    // Initialize stats for current roster
    players.forEach(player => {
        stats[player.name] = createEmptyStats();
    });

    // Aggregate stats from saved games
    savedGames.forEach(game => {
        game.players.forEach(player => {
            if (!stats[player.name]) {
                stats[player.name] = createEmptyStats();
            }

            const s = stats[player.name];

            // Track attendance
            s.gamesOnRoster++;
            if (player.status === 'available') {
                s.gamesAttended++;
                s.gamesPlayed++;
            } else if (player.status === 'absent') {
                s.gamesAbsent++;
            } else if (player.status === 'injured') {
                s.gamesInjured++;
            }

            s.totalQuarters += player.quartersPlayed?.length || 0;
            s.totalSitting += player.quartersSitting?.length || 0;

            // Track captain assignments from player snapshot (isCaptain flag is set when game is saved)
            if (player.isCaptain) {
                s.captainGames++;
            }

            // Track positions
            player.positionsPlayed?.forEach(pos => {
                s.positions[pos.position] = (s.positions[pos.position] || 0) + 1;
            });

            // Count goalkeeper games from actual positions played (more reliable than goalieQuarter field)
            const keeperQuartersThisGame = player.positionsPlayed?.filter(pos => pos.position === 'Keeper').length || 0;
            if (keeperQuartersThisGame > 0) {
                s.goalkeeperQuarters++;
            }
        });
    });

    return stats;
}

function createEmptyStats() {
    return {
        gamesPlayed: 0,
        gamesOnRoster: 0,
        gamesAttended: 0,
        gamesAbsent: 0,
        gamesInjured: 0,
        totalQuarters: 0,
        totalSitting: 0,
        goalkeeperQuarters: 0,
        captainGames: 0,
        positions: {}
    };
}

/**
 * Get lineup recommendations based on season history
 */
export function getLineupRecommendations(players, savedGames, stats) {
    const availablePlayers = players.filter(p => p.status === 'available');

    if (availablePlayers.length === 0 || savedGames.length === 0) {
        return null;
    }

    const recommendations = {
        shouldSit: [],
        shouldKeep: [],
        shouldCaptain: [],
        needsOffense: [],
        needsDefense: [],
        positionVariety: []
    };

    // Calculate data for each player
    const playerData = availablePlayers.map(player => {
        const s = stats[player.name] || createEmptyStats();
        const gamesPlayed = s.gamesPlayed || 0;

        // Get offensive/defensive balance from saved games
        let offenseQtrs = 0, defenseQtrs = 0;
        savedGames.forEach(game => {
            const gamePlayer = game.players.find(p => p.name === player.name);
            if (gamePlayer) {
                offenseQtrs += gamePlayer.offensiveQuarters || 0;
                defenseQtrs += gamePlayer.defensiveQuarters || 0;
            }
        });

        return {
            name: player.name,
            noKeeper: player.noKeeper,
            gamesPlayed,
            avgSitting: gamesPlayed > 0 ? s.totalSitting / gamesPlayed : 0,
            gkCount: s.goalkeeperQuarters,
            captainCount: s.captainGames || 0,
            offenseQtrs,
            defenseQtrs,
            positionCount: Object.keys(s.positions).length,
            positions: s.positions
        };
    });

    // Players who should sit more (lowest sitting averages)
    const bySitting = [...playerData].sort((a, b) => a.avgSitting - b.avgSitting);
    const minSitting = bySitting[0]?.avgSitting || 0;
    recommendations.shouldSit = bySitting
        .filter(p => p.gamesPlayed > 0 && p.avgSitting <= minSitting + 0.5)
        .slice(0, 3)
        .map(p => ({ name: p.name, avgSitting: p.avgSitting.toFixed(1), gamesPlayed: p.gamesPlayed }));

    // Players who should be goalkeeper
    const byGK = [...playerData]
        .filter(p => !p.noKeeper && p.gamesPlayed > 0)
        .sort((a, b) => a.gkCount - b.gkCount);
    const minGK = byGK[0]?.gkCount || 0;
    recommendations.shouldKeep = byGK
        .filter(p => p.gkCount <= minGK)
        .slice(0, 3)
        .map(p => ({ name: p.name, gkCount: p.gkCount }));

    // Players who should be captain
    const byCaptain = [...playerData]
        .filter(p => p.gamesPlayed > 0)
        .sort((a, b) => a.captainCount - b.captainCount);
    const minCaptain = byCaptain[0]?.captainCount || 0;
    recommendations.shouldCaptain = byCaptain
        .filter(p => p.captainCount <= minCaptain)
        .slice(0, 3)
        .map(p => ({ name: p.name, captainCount: p.captainCount }));

    // Players needing more offense
    const withBalance = playerData.filter(p => p.offenseQtrs + p.defenseQtrs > 0);
    recommendations.needsOffense = withBalance
        .filter(p => p.defenseQtrs > p.offenseQtrs)
        .sort((a, b) => (b.defenseQtrs - b.offenseQtrs) - (a.defenseQtrs - a.offenseQtrs))
        .slice(0, 3)
        .map(p => ({ name: p.name, offense: p.offenseQtrs, defense: p.defenseQtrs }));

    // Players needing more defense
    recommendations.needsDefense = withBalance
        .filter(p => p.offenseQtrs > p.defenseQtrs)
        .sort((a, b) => (b.offenseQtrs - b.defenseQtrs) - (a.offenseQtrs - a.defenseQtrs))
        .slice(0, 3)
        .map(p => ({ name: p.name, offense: p.offenseQtrs, defense: p.defenseQtrs }));

    // Players needing position variety
    const byVariety = [...playerData]
        .filter(p => p.gamesPlayed > 0)
        .sort((a, b) => a.positionCount - b.positionCount);
    const minPositions = byVariety[0]?.positionCount || 0;
    recommendations.positionVariety = byVariety
        .filter(p => p.positionCount <= minPositions + 1)
        .slice(0, 3)
        .map(p => ({
            name: p.name,
            positionCount: p.positionCount,
            topPositions: Object.entries(p.positions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(([pos]) => pos)
                .join(', ')
        }));

    return recommendations;
}
