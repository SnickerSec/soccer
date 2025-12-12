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

function determineSittingSchedule(players, playersOnField, quarters) {
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
    shuffleArray(regularPlayers);

    const totalSittingSlots = sittingPerQuarter * quarters;
    const minSitsPerPlayer = Math.floor(totalSittingSlots / totalPlayers);
    const playersWithExtraSit = totalSittingSlots % totalPlayers;

    // Helper to find non-consecutive sitting quarter
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

        for (let q = 1; q <= 4; q++) {
            if (schedule[q].length < maxSitting && !currentSittingQuarters.includes(q)) {
                let isConsecutive = false;
                for (let sat of currentSittingQuarters) {
                    if (Math.abs(sat - q) === 1) {
                        isConsecutive = true;
                        break;
                    }
                }
                if (!isConsecutive) return q;
            }
        }

        return -1;
    }

    const maxSitting = totalPlayers - playersOnField;

    mustRestPlayers.forEach(player => {
        let assignedQuarter = findNonConsecutiveSittingQuarter(player.sittingQuarters, schedule, maxSitting);
        if (assignedQuarter !== -1) {
            player.sittingQuarters.push(assignedQuarter);
            schedule[assignedQuarter].push(player.name);
        }
    });

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

    const playersForExtraSit = [...allPlayersCombined];
    shuffleArray(playersForExtraSit);

    let playersAssigned = 0;
    for (let i = 0; i < playersForExtraSit.length && playersAssigned < playersWithExtraSit; i++) {
        const player = playersForExtraSit[i];
        const neededSits = minSitsPerPlayer + 1;
        if (player.sittingQuarters.length >= neededSits) continue;

        let assignedQuarter = findNonConsecutiveSittingQuarter(player.sittingQuarters, schedule, maxSitting);
        if (assignedQuarter !== -1) {
            player.sittingQuarters.push(assignedQuarter);
            schedule[assignedQuarter].push(player.name);
            playersAssigned++;
        }
    }

    return schedule;
}

function selectKeeper(availablePlayers, quarter) {
    const allowedKeepers = availablePlayers.filter(player => !player.noKeeper);
    const poolToSelectFrom = allowedKeepers.length > 0 ? allowedKeepers : availablePlayers;
    const potentialKeepers = poolToSelectFrom.filter(player => !player.goalieQuarter);

    if (potentialKeepers.length > 0) {
        return potentialKeepers[Math.floor(Math.random() * potentialKeepers.length)];
    }

    return poolToSelectFrom[0];
}

function assignPositionsOptimally(players, positions, defensivePositions) {
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

function generateQuarterLineup(quarter, sittingSchedule, players, positions) {
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
        const keeper = selectKeeper(playingPlayers, quarter);
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

    const assignments = assignPositionsOptimally(playingPlayers, positionsToFill, defensivePositions);

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
            issues.push(`${player.name} is playing goalie for ${goalieQuarters} quarters (max 1)`);
        }

        for (let i = 0; i < player.quartersSitting.length - 1; i++) {
            if (player.quartersSitting[i + 1] === player.quartersSitting[i] + 1) {
                issues.push(`${player.name} sits consecutively in quarters ${player.quartersSitting[i]} and ${player.quartersSitting[i + 1]}`);
            }
        }

        if (player.quartersSitting.length > 2) {
            issues.push(`${player.name} sits for ${player.quartersSitting.length} quarters (max 2)`);
        }

        const defensiveQuarters = player.defensiveQuarters || 0;
        const offensiveQuarters = player.offensiveQuarters || 0;
        const totalPlayed = player.quartersPlayed.length;

        if (totalPlayed > 0) {
            if (defensiveQuarters === 0) {
                issues.push(`${player.name} never played defense`);
            }
            if (offensiveQuarters === 0) {
                issues.push(`${player.name} never played offense`);
            }

            const doImbalance = Math.abs(defensiveQuarters - offensiveQuarters);
            if (doImbalance > 1) {
                issues.push(`${player.name} has D/O imbalance of ${doImbalance} (D:${defensiveQuarters} / O:${offensiveQuarters})`);
            }
        }

        const positionCounts = {};
        player.positionsPlayed.forEach(p => {
            positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
        });

        for (const [pos, count] of Object.entries(positionCounts)) {
            if (count > 1) {
                issues.push(`${player.name} plays ${pos} ${count} times (should play each position only once)`);
            }
        }
    });

    return issues;
}

function generateLineup(data) {
    const { players, positions, playersOnField, quarters, maxAttempts } = data;

    let attempts = 0;
    let validation = [];
    let bestLineup = null;
    let bestValidationCount = Infinity;
    let lineup = [];

    do {
        attempts++;

        // Reset player stats
        players.forEach(player => {
            player.quartersPlayed = [];
            player.quartersSitting = [];
            player.positionsPlayed = [];
            player.goalieQuarter = null;
            player.defensiveQuarters = 0;
            player.offensiveQuarters = 0;
        });

        lineup = [];

        const sittingSchedule = determineSittingSchedule(players, playersOnField, quarters);

        for (let quarter = 1; quarter <= quarters; quarter++) {
            const quarterLineup = generateQuarterLineup(quarter, sittingSchedule, players, positions);
            lineup.push(quarterLineup);
        }

        validation = validateLineup(players, quarters);

        if (validation.length < bestValidationCount) {
            bestValidationCount = validation.length;
            bestLineup = JSON.parse(JSON.stringify(lineup));
        }

        // Send progress update
        if (attempts % 50 === 0) {
            self.postMessage({ type: 'progress', attempts, validation: validation.length });
        }

    } while (validation.length > 0 && attempts < maxAttempts);

    if (attempts >= maxAttempts && validation.length > 0 && bestLineup) {
        lineup = bestLineup;
        // Re-run validation on the best lineup
        players.forEach(player => {
            player.quartersPlayed = [];
            player.quartersSitting = [];
            player.positionsPlayed = [];
            player.goalieQuarter = null;
            player.defensiveQuarters = 0;
            player.offensiveQuarters = 0;
        });

        const sittingSchedule = determineSittingSchedule(players, playersOnField, quarters);
        lineup = [];
        for (let quarter = 1; quarter <= quarters; quarter++) {
            const quarterLineup = generateQuarterLineup(quarter, sittingSchedule, players, positions);
            lineup.push(quarterLineup);
        }
        validation = validateLineup(players, quarters);
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
