// Season statistics calculations

/**
 * The 3-3 used to be three backs behind a midfield three. It was redefined as
 * three backs and three forwards, and the middle line was renamed with it:
 *
 *   Left Mid -> Left Forward,  Center Mid -> Striker,  Right Mid -> Right Forward
 *
 * Games saved before that carry the old names, so a coach reading the Season
 * tab found quarters filed under a midfield the formation no longer has — the
 * same three players, in the same three slots, counted as a line that had been
 * renamed out from under them. They are read here as what those slots became.
 *
 * The 6v6 3-3 lost its Right Mid, so its Center Mid became the Right Forward.
 * A game that never recorded fieldPlayers falls back to the 7v7 map: the exact
 * name may then be Striker where it should be Right Forward, but both are
 * forwards, so every count and zone this feeds is right either way.
 *
 * Only 3-3 is remapped. A Center Mid in a 2-3-1 is still a midfielder.
 */
const RENAMED_3_3_POSITIONS = {
    7: { 'Left Mid': 'Left Forward', 'Center Mid': 'Striker', 'Right Mid': 'Right Forward' },
    6: { 'Left Mid': 'Left Forward', 'Center Mid': 'Right Forward' },
};

/**
 * A position under the name its formation gives it today.
 *
 * @param {string} position as recorded in the saved game
 * @param {object} game the saved game it came from
 * @returns {string} the current name, or the original where nothing was renamed
 */
export function currentPositionName(position, game = {}) {
    if (game.formation !== '3-3') return position;

    const map = RENAMED_3_3_POSITIONS[Number(game.fieldPlayers)] || RENAMED_3_3_POSITIONS[7];
    return map[position] || position;
}

/**
 * A saved game's quarters with each position under its current name.
 *
 * Reopening a game from Game History fills the screen by looking up the
 * formation's positions in what the game stored. An old 3-3 stored Left Mid,
 * Center Mid and Right Mid, so the three forward rows found no such key and
 * every one of them read TBD — the game looked as though nobody had played up
 * front, when in fact those three had.
 *
 * @param {object} game a saved game
 * @returns {Array} its quarters, keyed by the names the formation uses now
 */
export function currentQuarters(game) {
    const quarters = Array.isArray(game?.quarters) ? game.quarters : [];
    if (game?.formation !== '3-3') return quarters;

    return quarters.map((q) => ({
        ...q,
        positions: Object.fromEntries(
            Object.entries(q.positions || {}).map(
                ([position, name]) => [currentPositionName(position, game), name]
            )
        ),
    }));
}

/**
 * A saved game's per-player rows with each position under its current name.
 *
 * The Player Summary under a reopened lineup lists the positions each player
 * held, straight out of the saved game — so an old 3-3 read "Q2: Left Mid"
 * beneath quarter cards that had just been corrected to say Left Forward.
 *
 * @param {object} game a saved game
 * @returns {Array} its players, with positionsPlayed renamed
 */
export function currentPlayerPositions(game) {
    const players = Array.isArray(game?.players) ? game.players : [];
    if (game?.formation !== '3-3') return players;

    return players.map((player) => ({
        ...player,
        positionsPlayed: (player.positionsPlayed || []).map((entry) => ({
            ...entry,
            position: currentPositionName(entry.position, game),
        })),
    }));
}

/**
 * Calculate aggregate stats for all players across saved games
 */
export function calculatePlayerStats(players = [], savedGames = []) {
    const stats = {};

    // Initialize stats for current roster
    (players || []).forEach(player => {
        stats[player.name] = createEmptyStats();
    });

    const gamesList = Array.isArray(savedGames) ? savedGames : [];

    // Aggregate stats from saved games
    gamesList.forEach((game) => {
        (game.players || []).forEach(player => {
            if (!stats[player.name]) {
                stats[player.name] = createEmptyStats();
            }

            const s = stats[player.name];

            // Track attendance
            s.gamesOnRoster++;
            const isAttended = player.status === 'available' || (player.quartersPlayed && player.quartersPlayed.length > 0);
            if (player.status === 'available') {
                s.gamesAttended++;
                s.gamesPlayed++;
            } else if (player.status === 'absent') {
                s.gamesAbsent++;
            } else if (player.status === 'injured') {
                s.gamesInjured++;
            } else if (isAttended) {
                s.gamesAttended++;
                s.gamesPlayed++;
            }

            const qPlayed = player.quartersPlayed?.length || 0;
            const qSitting = player.quartersSitting?.length || 0;
            s.totalQuarters += qPlayed;
            s.quartersPlayed = s.totalQuarters;
            s.totalSitting += qSitting;
            s.sittingQuarters = s.totalSitting;

            // Track captain assignments from player snapshot
            if (player.isCaptain) {
                s.captainGames++;
            }

            // Track positions and zone distribution
            let gameKeeperCount = 0;
            let gameDefCount = 0;
            let gameMidCount = 0;
            let gameOffCount = 0;

            if (Array.isArray(player.positionsPlayed) && player.positionsPlayed.length > 0) {
                player.positionsPlayed.forEach(pos => {
                    const posName = currentPositionName(pos.position, game);
                    s.positions[posName] = (s.positions[posName] || 0) + 1;
                    if (posName === 'Keeper') {
                        // Keeper is its own zone everywhere this feeds — the
                        // heatmap draws it as a third band, the statistics
                        // table gives it its own column — so counting it as a
                        // defensive quarter as well reported it twice. A
                        // player with one keeper, one back and one forward
                        // quarter came out as 2 Backs (67%) plus 1 GK (33%),
                        // percentages summing past 100 and a season total one
                        // quarter longer than they had played.
                        gameKeeperCount++;
                    } else if (posName.includes('Back')) {
                        gameDefCount++;
                    } else if (posName.includes('Mid') || posName === 'Midfield') {
                        gameMidCount++;
                    } else {
                        gameOffCount++;
                    }
                });
            } else {
                gameDefCount = player.defensiveQuarters || 0;
                gameOffCount = player.offensiveQuarters || 0;
                if (player.goalieQuarter) gameKeeperCount = 1;
            }

            if (gameKeeperCount > 0) {
                s.goalkeeperQuarters++;
                s.keeperQuarters = s.goalkeeperQuarters;
            }
            s.defensiveQuarters += gameDefCount;
            s.defenseQuarters = s.defensiveQuarters;
            s.midfieldQuarters += gameMidCount;
            s.offensiveQuarters += gameOffCount;
            s.offenseQuarters = s.offensiveQuarters;

            // Track most recent game participation for cross-game rotation
            if (!s.lastGamePlayed && isAttended) {
                const totalQ = game.quarters?.length || 4;
                const satQ4 = Boolean(player.quartersSitting && player.quartersSitting.includes(totalQ));
                s.lastGamePlayed = {
                    id: game.id,
                    date: game.date,
                    name: game.name,
                    wasKeeper: gameKeeperCount > 0,
                    satQ4,
                    quartersSitting: player.quartersSitting || [],
                    quartersPlayed: player.quartersPlayed || []
                };
                s.lastGameKeeper = gameKeeperCount > 0;
                s.lastGameSatQ4 = satQ4;
                s.lastGameSatQuarters = player.quartersSitting || [];
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
        quartersPlayed: 0,
        totalSitting: 0,
        sittingQuarters: 0,
        goalkeeperQuarters: 0,
        keeperQuarters: 0,
        captainGames: 0,
        defensiveQuarters: 0,
        defenseQuarters: 0,
        midfieldQuarters: 0,
        offensiveQuarters: 0,
        offenseQuarters: 0,
        positions: {},
        lastGamePlayed: null,
        lastGameKeeper: false,
        lastGameSatQ4: false,
        lastGameSatQuarters: []
    };
}

export function getLineupRecommendations(arg1, arg2, arg3) {
    let players, savedGames;

    const isGameArray = (arr) =>
        Array.isArray(arr) && arr.length > 0 && Boolean(arr[0].quarters || arr[0].date || Array.isArray(arr[0].players));

    if (isGameArray(arg1)) {
        savedGames = arg1;
        players = Array.isArray(arg2) ? arg2 : [];
    } else if (isGameArray(arg2)) {
        players = Array.isArray(arg1) ? arg1 : [];
        savedGames = arg2;
    } else {
        players = Array.isArray(arg1) ? arg1 : [];
        savedGames = Array.isArray(arg2) ? arg2 : [];
    }

    const stats = arg3 || calculatePlayerStats(players, savedGames);
    const availablePlayers = (players || []).filter(p => !p.status || p.status === 'available');

    if (availablePlayers.length === 0 || (savedGames || []).length === 0) {
        return null;
    }

    const recommendations = {
        shouldSit: [],
        shouldKeep: [],
        shouldCaptain: [],
        needsOffense: [],
        needsDefense: [],
        positionVariety: [],
        returningFromAbsence: [],
    };

    // Calculate data for each player
    const playerData = availablePlayers.map(player => {
        const s = stats[player.name] || createEmptyStats();
        const gamesPlayed = s.gamesPlayed || 0;

        return {
            name: player.name,
            noKeeper: player.noKeeper,
            gamesPlayed,
            avgSitting: gamesPlayed > 0 ? s.totalSitting / gamesPlayed : 0,
            gkCount: s.goalkeeperQuarters,
            captainCount: s.captainGames || 0,
            offenseQtrs: s.offensiveQuarters,
            defenseQtrs: s.defensiveQuarters,
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

    // Players returning from absence (missed games previously, now available)
    recommendations.returningFromAbsence = availablePlayers
        .filter(p => {
            const s = stats[p.name];
            return s && s.gamesAbsent > 0;
        })
        .slice(0, 3)
        .map(p => ({
            name: p.name,
            gamesAbsent: stats[p.name]?.gamesAbsent || 0,
        }));

    return recommendations;
}
