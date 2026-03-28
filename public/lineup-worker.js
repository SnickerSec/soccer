/**
 * Web Worker for lineup generation
 * Offloads computationally intensive lineup generation to a background thread
 */

// Utility function to shuffle array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Group players with similar values and shuffle within groups
function shuffleWithinSimilarGroups(array, getGroupValue) {
    if (array.length <= 1) return array;

    let i = 0;
    while (i < array.length) {
        const currentValue = getGroupValue(array[i]);
        let j = i + 1;

        // Find end of current group
        while (j < array.length && getGroupValue(array[j]) === currentValue) {
            j++;
        }

        // Shuffle within this group
        const groupSize = j - i;
        if (groupSize > 1) {
            for (let k = j - 1; k > i; k--) {
                const randomIndex = i + Math.floor(Math.random() * (k - i + 1));
                [array[k], array[randomIndex]] = [array[randomIndex], array[k]];
            }
        }

        i = j;
    }

    return array;
}

function hasConsecutive(quarters) {
    const sorted = [...quarters].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] - sorted[i] === 1) return true;
    }
    return false;
}

function findNonConsecutiveSittingQuarter(currentSittingQuarters, schedule, totalPlayers, playersOnField) {
    const quartersToTry = [1, 3, 2, 4]; // Prefer alternating quarters
    const maxSitting = totalPlayers - playersOnField;

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

function balanceSittingByRating(schedule, playersCopy, players, playersOnField) {
    const ratingOf = {};
    let hasAnyRating = false;
    players.forEach(p => {
        ratingOf[p.name] = p.overallRating || 3;
        if (p.overallRating) hasAnyRating = true;
    });
    if (!hasAnyRating) return;

    const quarters = [1, 2, 3, 4];
    const allNames = players.map(p => p.name);

    const quarterRating = (q) => {
        const sitting = new Set(schedule[q]);
        return allNames.reduce((sum, name) => sitting.has(name) ? sum : sum + ratingOf[name], 0);
    };

    const copyByName = {};
    playersCopy.forEach(p => { copyByName[p.name] = p; });

    for (let iter = 0; iter < 20; iter++) {
        const ratings = quarters.map(q => ({ q, rating: quarterRating(q) }));
        ratings.sort((a, b) => a.rating - b.rating);
        const weakest = ratings[0];
        const strongest = ratings[ratings.length - 1];

        if (strongest.rating - weakest.rating <= 1) break;

        const sittingInWeak = schedule[weakest.q];
        const sittingInStrong = schedule[strongest.q];

        let bestSwap = null;
        let bestImprovement = 0;

        for (const nameA of sittingInWeak) {
            for (const nameB of sittingInStrong) {
                if (nameA === nameB) continue;
                const ratingDiff = ratingOf[nameA] - ratingOf[nameB];
                if (ratingDiff <= 0) continue;

                const copyA = copyByName[nameA];
                const copyB = copyByName[nameB];
                if (!copyA || !copyB) continue;

                const newSittingA = copyA.sittingQuarters.filter(q => q !== weakest.q).concat(strongest.q);
                const newSittingB = copyB.sittingQuarters.filter(q => q !== strongest.q).concat(weakest.q);

                if (hasConsecutive(newSittingA) || hasConsecutive(newSittingB)) continue;

                if (ratingDiff > bestImprovement) {
                    bestImprovement = ratingDiff;
                    bestSwap = { nameA, nameB, qWeak: weakest.q, qStrong: strongest.q };
                }
            }
        }

        if (!bestSwap) break;

        const { nameA, nameB, qWeak, qStrong } = bestSwap;
        schedule[qWeak] = schedule[qWeak].filter(n => n !== nameA);
        schedule[qWeak].push(nameB);
        schedule[qStrong] = schedule[qStrong].filter(n => n !== nameB);
        schedule[qStrong].push(nameA);

        const copyA = copyByName[nameA];
        const copyB = copyByName[nameB];
        copyA.sittingQuarters = copyA.sittingQuarters.filter(q => q !== qWeak);
        copyA.sittingQuarters.push(qStrong);
        copyB.sittingQuarters = copyB.sittingQuarters.filter(q => q !== qStrong);
        copyB.sittingQuarters.push(qWeak);
    }
}

function determineSittingSchedule(players, playersOnField, quarters, seasonStats) {
    const totalPlayers = players.length;
    const sittingPerQuarter = totalPlayers - playersOnField;
    const schedule = { 1: [], 2: [], 3: [], 4: [] };

    const playersCopy = players.map(p => ({
        name: p.name,
        mustRest: p.mustRest,
        sittingQuarters: []
    }));

    const mustRestPlayers = playersCopy.filter(p => p.mustRest);
    const regularPlayers = playersCopy.filter(p => !p.mustRest);

    regularPlayers.sort((a, b) => {
        const statsA = seasonStats[a.name] || { totalSitting: 0, gamesPlayed: 0 };
        const statsB = seasonStats[b.name] || { totalSitting: 0, gamesPlayed: 0 };
        const avgSitA = statsA.gamesPlayed > 0 ? statsA.totalSitting / statsA.gamesPlayed : 0;
        const avgSitB = statsB.gamesPlayed > 0 ? statsB.totalSitting / statsB.gamesPlayed : 0;
        return avgSitA - avgSitB;
    });

    shuffleWithinSimilarGroups(regularPlayers, (p) => {
        const stats = seasonStats[p.name] || { totalSitting: 0, gamesPlayed: 0 };
        return stats.gamesPlayed > 0 ? Math.round(stats.totalSitting / stats.gamesPlayed * 2) / 2 : 0;
    });

    const totalSittingSlots = sittingPerQuarter * quarters;
    const minSitsPerPlayer = Math.floor(totalSittingSlots / totalPlayers);
    const playersWithExtraSit = totalSittingSlots % totalPlayers;

    mustRestPlayers.forEach(player => {
        let assignedQuarter = findNonConsecutiveSittingQuarter(player.sittingQuarters, schedule, totalPlayers, playersOnField);
        if (assignedQuarter !== -1) {
            player.sittingQuarters.push(assignedQuarter);
            schedule[assignedQuarter].push(player.name);
        }
    });

    const allPlayersCombined = [...mustRestPlayers, ...regularPlayers];

    for (let i = 0; i < minSitsPerPlayer; i++) {
        allPlayersCombined.forEach((player) => {
            if (player.sittingQuarters.length > i) return;

            let assignedQuarter = findNonConsecutiveSittingQuarter(player.sittingQuarters, schedule, totalPlayers, playersOnField);
            if (assignedQuarter !== -1) {
                player.sittingQuarters.push(assignedQuarter);
                schedule[assignedQuarter].push(player.name);
            }
        });
    }

    const playersForExtraSit = [...allPlayersCombined];
    playersForExtraSit.sort((a, b) => {
        const statsA = seasonStats[a.name] || { totalSitting: 0, gamesPlayed: 0 };
        const statsB = seasonStats[b.name] || { totalSitting: 0, gamesPlayed: 0 };
        const avgSitA = statsA.gamesPlayed > 0 ? statsA.totalSitting / statsA.gamesPlayed : 0;
        const avgSitB = statsB.gamesPlayed > 0 ? statsB.totalSitting / statsB.gamesPlayed : 0;
        return avgSitA - avgSitB;
    });

    shuffleWithinSimilarGroups(playersForExtraSit, (p) => {
        const stats = seasonStats[p.name] || { totalSitting: 0, gamesPlayed: 0 };
        return stats.gamesPlayed > 0 ? Math.round(stats.totalSitting / stats.gamesPlayed * 2) / 2 : 0;
    });

    let playersAssigned = 0;
    for (let i = 0; i < playersForExtraSit.length && playersAssigned < playersWithExtraSit; i++) {
        const player = playersForExtraSit[i];
        const neededSits = minSitsPerPlayer + 1;
        if (player.sittingQuarters.length >= neededSits) continue;

        let assignedQuarter = findNonConsecutiveSittingQuarter(player.sittingQuarters, schedule, totalPlayers, playersOnField);
        if (assignedQuarter !== -1) {
            player.sittingQuarters.push(assignedQuarter);
            schedule[assignedQuarter].push(player.name);
            playersAssigned++;
        }
    }

    balanceSittingByRating(schedule, allPlayersCombined, players, playersOnField);

    return schedule;
}

function selectKeeper(availablePlayers, quarter, seasonStats) {
    const allowedKeepers = availablePlayers.filter(player => !player.noKeeper);
    const poolToSelectFrom = allowedKeepers.length > 0 ? allowedKeepers : availablePlayers;
    let potentialKeepers = poolToSelectFrom.filter(player => !player.goalieQuarter);

    if (potentialKeepers.length > 0) {
        potentialKeepers.sort((a, b) => {
            const gkA = seasonStats[a.name]?.goalkeeperQuarters || 0;
            const gkB = seasonStats[b.name]?.goalkeeperQuarters || 0;
            return gkA - gkB;
        });

        const minGK = seasonStats[potentialKeepers[0].name]?.goalkeeperQuarters || 0;
        const lowestGKGroup = potentialKeepers.filter(p =>
            (seasonStats[p.name]?.goalkeeperQuarters || 0) === minGK
        );

        const hasKeeperRatings = lowestGKGroup.some(p => (p.positionalRatings || {}).keeper);
        if (hasKeeperRatings) {
            lowestGKGroup.sort((a, b) => {
                const rA = (a.positionalRatings || {}).keeper || 0;
                const rB = (b.positionalRatings || {}).keeper || 0;
                return rB - rA;
            });
            const topRating = (lowestGKGroup[0].positionalRatings || {}).keeper || 0;
            const topRatedKeepers = lowestGKGroup.filter(p =>
                ((p.positionalRatings || {}).keeper || 0) === topRating
            );
            return topRatedKeepers[Math.floor(Math.random() * topRatedKeepers.length)];
        }

        return lowestGKGroup[Math.floor(Math.random() * lowestGKGroup.length)];
    }

    return poolToSelectFrom[0];
}

function getPositionRatingCategory(position) {
    if (position === 'Keeper') return 'keeper';
    if (position.includes('Back')) return 'defense';
    if (position.includes('Mid') || position === 'Midfield') return 'midfield';
    return 'offense';
}

function assignPositionsOptimally(players, positions, defensivePositions, seasonStats) {
    const assignments = [];
    const remainingPlayers = [...players];
    const remainingPositions = [...positions];

    shuffleArray(remainingPositions);

    for (let i = remainingPositions.length - 1; i >= 0; i--) {
        const position = remainingPositions[i];
        const isDefensive = defensivePositions.includes(position);

        const scoredPlayers = remainingPlayers.map(player => {
            const hasPlayedPosition = player.positionsPlayed.some(p => p.position === position);
            const timesPlayedPosition = player.positionsPlayed.filter(p => p.position === position).length;
            const defensive = player.defensiveQuarters || 0;
            const offensive = player.offensiveQuarters || 0;

            let score = 0;

            if (hasPlayedPosition) {
                score -= 1000 * timesPlayedPosition;
            }

            const currentImbalance = Math.abs(defensive - offensive);
            let projectedImbalance;
            if (isDefensive) {
                projectedImbalance = Math.abs((defensive + 1) - offensive);
                score += (offensive - defensive) * 100;
            } else {
                projectedImbalance = Math.abs(defensive - (offensive + 1));
                score += (defensive - offensive) * 100;
            }

            if (projectedImbalance > currentImbalance) {
                score -= 200 * (projectedImbalance - currentImbalance);
            }

            const playerSeasonStats = seasonStats[player.name];
            if (playerSeasonStats && playerSeasonStats.positions) {
                const timesPlayedPositionSeason = playerSeasonStats.positions[position] || 0;
                const totalPositionsPlayed = Object.values(playerSeasonStats.positions).reduce((a, b) => a + b, 0);
                if (totalPositionsPlayed > 0) {
                    const positionPct = timesPlayedPositionSeason / totalPositionsPlayed;
                    score += (1 - positionPct) * 200;
                } else {
                    score += 100;
                }
            } else {
                score += 100;
            }

            const posRatings = player.positionalRatings || {};
            const posRatingCategory = getPositionRatingCategory(position);
            const posRating = posRatings[posRatingCategory] || 0;
            if (posRating > 0) {
                score += posRating * 30;
            }

            score += Math.random() * 5;

            return { player, score };
        });

        scoredPlayers.sort((a, b) => b.score - a.score);

        if (scoredPlayers.length > 0) {
            const chosen = scoredPlayers[0];
            assignments.push({ position, player: chosen.player });

            const playerIndex = remainingPlayers.indexOf(chosen.player);
            remainingPlayers.splice(playerIndex, 1);
            remainingPositions.splice(i, 1);
        }
    }

    while (remainingPositions.length > 0 && remainingPlayers.length > 0) {
        assignments.push({
            position: remainingPositions.shift(),
            player: remainingPlayers.shift()
        });
    }

    return assignments;
}

function generateQuarterLineup(quarter, sittingSchedule, players, positions, seasonStats) {
    const quarterLineup = {
        quarter: quarter,
        positions: {}
    };

    const sittingPlayers = sittingSchedule[quarter] || [];
    const playingPlayers = players.filter(p => !sittingPlayers.includes(p.name));

    const defensivePositions = positions.filter(p =>
        p.includes('Back') || p === 'Keeper'
    );

    const positionsToFill = [...positions];

    const keeperIndex = positionsToFill.indexOf('Keeper');
    if (keeperIndex !== -1) {
        const keeper = selectKeeper(playingPlayers, quarter, seasonStats);
        if (keeper) {
            quarterLineup.positions['Keeper'] = keeper.name;
            keeper.quartersPlayed.push(quarter);
            keeper.positionsPlayed.push({ quarter, position: 'Keeper' });
            keeper.goalieQuarter = quarter;
            keeper.defensiveQuarters = (keeper.defensiveQuarters || 0) + 1;
            playingPlayers.splice(playingPlayers.indexOf(keeper), 1);
            positionsToFill.splice(keeperIndex, 1);
        }
    }

    const assignments = assignPositionsOptimally(playingPlayers, positionsToFill, defensivePositions, seasonStats);

    assignments.forEach(({ position, player }) => {
        quarterLineup.positions[position] = player.name;
        player.quartersPlayed.push(quarter);
        player.positionsPlayed.push({ quarter, position });

        if (defensivePositions.includes(position)) {
            player.defensiveQuarters = (player.defensiveQuarters || 0) + 1;
        } else {
            player.offensiveQuarters = (player.offensiveQuarters || 0) + 1;
        }
    });

    players.forEach(player => {
        if (sittingPlayers.includes(player.name)) {
            player.quartersSitting.push(quarter);
        }
    });

    return quarterLineup;
}

function validateLineup(players, quarters) {
    const issues = [];

    players.forEach(player => {
        const goalieQuarters = player.positionsPlayed.filter(p => p.position === 'Keeper').length;
        if (goalieQuarters > 1) {
            issues.push(`⚠️ ${player.name} is playing goalie for ${goalieQuarters} quarters (max 1)`);
        }

        for (let i = 0; i < player.quartersSitting.length - 1; i++) {
            if (player.quartersSitting[i + 1] === player.quartersSitting[i] + 1) {
                issues.push(`⚠️ ${player.name} sits consecutively in quarters ${player.quartersSitting[i]} and ${player.quartersSitting[i + 1]}`);
            }
        }

        if (player.quartersSitting.length > 2) {
            issues.push(`⚠️ ${player.name} sits for ${player.quartersSitting.length} quarters (max 2)`);
        }

        const defensiveQuarters = player.defensiveQuarters || 0;
        const offensiveQuarters = player.offensiveQuarters || 0;
        const totalPlayed = player.quartersPlayed.length;

        if (totalPlayed > 0) {
            if (defensiveQuarters === 0) {
                issues.push(`⚠️ ${player.name} never played defense`);
            }
            if (offensiveQuarters === 0) {
                issues.push(`⚠️ ${player.name} never played offense`);
            }

            const doImbalance = Math.abs(defensiveQuarters - offensiveQuarters);
            if (doImbalance > 1) {
                issues.push(`⚠️ ${player.name} has D/O imbalance of ${doImbalance} (D:${defensiveQuarters} / O:${offensiveQuarters})`);
            }
        }

        const positionCounts = {};
        player.positionsPlayed.forEach(p => {
            positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
        });

        for (const [pos, count] of Object.entries(positionCounts)) {
            if (count > 1) {
                issues.push(`⚠️ ${player.name} plays ${pos} ${count} times (should play each position only once)`);
            }
        }
    });

    return issues;
}

function generateLineup(data) {
    const { players, positions, playersOnField, quarters, maxAttempts, seasonStats } = data;

    let attempts = 0;
    let validation = [];
    let bestLineup = null;
    let bestValidationCount = Infinity;
    let lineup = [];
    let bestPlayers = null;

    do {
        attempts++;

        players.forEach(player => {
            player.quartersPlayed = [];
            player.quartersSitting = [];
            player.positionsPlayed = [];
            player.goalieQuarter = null;
            player.defensiveQuarters = 0;
            player.offensiveQuarters = 0;
        });

        lineup = [];

        const sittingSchedule = determineSittingSchedule(players, playersOnField, quarters, seasonStats);

        for (let quarter = 1; quarter <= quarters; quarter++) {
            const quarterLineup = generateQuarterLineup(quarter, sittingSchedule, players, positions, seasonStats);
            lineup.push(quarterLineup);
        }

        validation = validateLineup(players, quarters);

        if (validation.length < bestValidationCount) {
            bestValidationCount = validation.length;
            bestLineup = JSON.parse(JSON.stringify(lineup));
            bestPlayers = JSON.parse(JSON.stringify(players));
        }

        if (attempts % 50 === 0) {
            self.postMessage({ type: 'progress', attempts, validation: validation.length });
        }

    } while (validation.length > 0 && attempts < maxAttempts);

    if (validation.length > 0 && bestLineup) {
        return { lineup: bestLineup, validation, attempts, players: bestPlayers };
    }

    return { lineup, validation, attempts, players };
}

// Handle messages from main thread
self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'generate') {
        try {
            const result = generateLineup(data);
            self.postMessage({ type: 'complete', result });
        } catch (error) {
            self.postMessage({ type: 'error', error: error.message });
        }
    }
};
