/**
 * Lineup generation: the AYSO rotation rules the app exists to enforce.
 *
 * This is the real algorithm, imported by the app and by the unit tests. It
 * used to live inside a web worker, where tests could not reach it -- so
 * tests/lineup.test.js kept a hand-copied version, which drifted badly enough
 * that the rules being asserted were not the rules being shipped.
 *
 * It runs on the main thread now. The worker was there to keep the UI
 * responsive across the retry loop, but a full 500-attempt generation measures
 * under 60ms for the hardest roster shapes (11 players for 11v11, where the
 * constraints barely fit), so it costs a frame rather than a freeze.
 *
 * Keep it free of DOM and worker globals: progress is reported through an
 * onProgress callback rather than self.postMessage, so it runs anywhere.
 */

import { shuffleArray, shuffleWithinSimilarGroups } from './utils.js';

/** Attempts between progress reports during generation. */
const PROGRESS_INTERVAL = 50;

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

    const copyByName = Object.create(null);
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

                // A player already resting in the quarter they would move to
                // would end up listed there twice, which shrinks that quarter's
                // real rest group and pushes an unintended player off the field.
                if (copyA.sittingQuarters.includes(strongest.q)) continue;
                if (copyB.sittingQuarters.includes(weakest.q)) continue;

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

/** A player's average quarters sat per game so far this season. */
function averageSitting(player, seasonStats) {
    const stats = seasonStats[player.name] || { totalSitting: 0, gamesPlayed: 0 };
    return stats.gamesPlayed > 0 ? stats.totalSitting / stats.gamesPlayed : 0;
}

/** Coarse bucket of averageSitting, so near-equal players shuffle together. */
function sittingGroup(player, seasonStats) {
    return Math.round(averageSitting(player, seasonStats) * 2) / 2;
}

/** Every combination of `size` quarters drawn from 1..quarters. */
function quarterCombinations(size, quarters) {
    if (size <= 0) return [[]];

    const results = [];
    const walk = (start, picked) => {
        if (picked.length === size) {
            results.push([...picked]);
            return;
        }
        for (let q = start; q <= quarters; q++) {
            picked.push(q);
            walk(q + 1, picked);
            picked.pop();
        }
    };
    walk(1, []);
    return results;
}

/**
 * Picks which quarters a player sits out.
 *
 * Prefers sets with no two adjacent quarters, and among those the ones leaving
 * the schedule most evenly filled -- the previous approach walked a fixed
 * [1, 3, 2, 4] preference and simply gave up when its first choice was full,
 * which left quarters under-filled and players silently benched.
 *
 * Sitting three of four quarters cannot avoid adjacency, so in that case the
 * best available set is returned and validateLineup reports it honestly.
 */
function chooseSittingQuarters(size, remaining, quarters, avoidQuarters = []) {
    if (size <= 0) return [];

    const all = quarterCombinations(Math.min(size, quarters), quarters);
    const fits = all.filter(set => set.every(q => remaining[q] > 0));
    const pool = fits.length > 0 ? fits : all;

    const spaced = pool.filter(set => !hasConsecutive(set));
    const candidates = spaced.length > 0 ? spaced : pool;

    // Prefer candidates that do not include avoided quarters (e.g. Q1 when sat Q4 in previous match)
    const avoidedFiltered = avoidQuarters.length > 0
        ? candidates.filter(set => !set.some(q => avoidQuarters.includes(q)))
        : candidates;
    const poolToChooseFrom = avoidedFiltered.length > 0 ? avoidedFiltered : candidates;

    // Most remaining capacity first, so quarters fill evenly; ties broken at
    // random to keep successive lineups from looking identical
    let best = [];
    let bestTotal = -Infinity;
    let bestFloor = -Infinity;
    shuffleArray(poolToChooseFrom);
    poolToChooseFrom.forEach(set => {
        const total = set.reduce((sum, q) => sum + remaining[q], 0);
        const floor = Math.min(...set.map(q => remaining[q]));
        // Most total room first; then the option whose tightest quarter has the
        // most room, which keeps the quarters filling evenly instead of
        // draining one and stranding later players on adjacent quarters
        if (total > bestTotal || (total === bestTotal && floor > bestFloor)) {
            bestTotal = total;
            bestFloor = floor;
            best = set;
        }
    });

    return best;
}

/** The ways to sit `size` quarters out of four without sitting back-to-back. */
function spacedSets(size, quarters) {
    return quarterCombinations(size, quarters).filter(set => !hasConsecutive(set));
}

/**
 * Works out, for the whole roster at once, which quarters each player sits.
 *
 * Choosing player by player cannot see far enough ahead. With fourteen players
 * at 7v7, for instance, exactly one split works -- half the squad sitting
 * quarters 1 and 3, half sitting 2 and 4, and nobody on 1 and 4 -- and a greedy
 * pass that takes 1 and 4 early strands everyone who follows.
 *
 * So the counts are solved first: how many players take each spaced set, such
 * that every quarter ends up exactly full. Returns one set per player in the
 * order given, or null when no exact solution exists, leaving the caller to
 * fall back to the greedy choice.
 */
function planSittingQuarters(requirements, sittingPerQuarter, quarters) {
    const reqs = requirements.map(r => typeof r === 'number' ? { target: r, avoid: [] } : r);
    const targets = reqs.map(r => r.target);

    if (targets.every(t => t === 0)) return targets.map(() => []);

    // Grouped by how many quarters each player sits; anything above two cannot
    // avoid adjacent quarters anyway, so it is left to the greedy path
    const sizes = [...new Set(targets)].filter(t => t > 0);
    if (sizes.some(size => size > 2)) return null;

    const options = new Map(sizes.map(size => [size, spacedSets(size, quarters)]));
    if ([...options.values()].some(sets => sets.length === 0)) return null;

    const capacity = {};
    for (let q = 1; q <= quarters; q++) capacity[q] = sittingPerQuarter;

    // Counts per (size, set) combination, searched depth-first
    const flat = [];
    sizes.forEach(size => options.get(size).forEach(set => flat.push({ size, set })));
    shuffleArray(flat);

    const demand = new Map(sizes.map(size => [size, targets.filter(t => t === size).length]));
    const chosenCounts = new Array(flat.length).fill(0);

    const search = (index, left, room) => {
        if (index === flat.length) {
            return [...left.values()].every(v => v === 0)
                && Object.values(room).every(v => v === 0);
        }

        const { size, set } = flat[index];
        const headroom = Math.min(left.get(size), ...set.map(q => room[q]));

        for (let take = headroom; take >= 0; take--) {
            left.set(size, left.get(size) - take);
            set.forEach(q => { room[q] -= take; });
            chosenCounts[index] = take;

            if (search(index + 1, left, room)) return true;

            left.set(size, left.get(size) + take);
            set.forEach(q => { room[q] += take; });
            chosenCounts[index] = 0;
        }

        return false;
    };

    if (!search(0, new Map(demand), { ...capacity })) return null;

    // Hand the solved sets back out, satisfying players with avoid constraints first
    const queues = new Map(sizes.map(size => [size, []]));
    flat.forEach(({ size, set }, index) => {
        for (let i = 0; i < chosenCounts[index]; i++) queues.get(size).push(set);
    });

    const results = new Array(reqs.length).fill(null);

    // Pass 1: Assign players who need to avoid specific quarters (e.g. Q1 when sat Q4 last game)
    reqs.forEach((req, idx) => {
        if (req.target === 0) {
            results[idx] = [];
            return;
        }
        if (req.avoid && req.avoid.length > 0) {
            const queue = queues.get(req.target);
            if (queue && queue.length > 0) {
                const matchIndex = queue.findIndex(set => !set.some(q => req.avoid.includes(q)));
                if (matchIndex !== -1) {
                    results[idx] = queue.splice(matchIndex, 1)[0];
                }
            }
        }
    });

    // Pass 2: Assign all remaining unassigned players
    reqs.forEach((req, idx) => {
        if (results[idx] !== null) return;
        if (req.target === 0) {
            results[idx] = [];
            return;
        }
        const queue = queues.get(req.target);
        results[idx] = queue && queue.length > 0 ? queue.shift() : [];
    });

    return results;
}

export function determineSittingSchedule(players, playersOnField, quarters, seasonStats = {}) {
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
        const statsA = seasonStats?.[a.name] || { totalSitting: 0, gamesPlayed: 0 };
        const statsB = seasonStats?.[b.name] || { totalSitting: 0, gamesPlayed: 0 };
        const avgSitA = statsA.gamesPlayed > 0 ? statsA.totalSitting / statsA.gamesPlayed : 0;
        const avgSitB = statsB.gamesPlayed > 0 ? statsB.totalSitting / statsB.gamesPlayed : 0;
        return avgSitA - avgSitB;
    });

    shuffleWithinSimilarGroups(regularPlayers, (p) => {
        const stats = seasonStats?.[p.name] || { totalSitting: 0, gamesPlayed: 0 };
        return stats.gamesPlayed > 0 ? Math.round(stats.totalSitting / stats.gamesPlayed * 2) / 2 : 0;
    });

    const totalSittingSlots = sittingPerQuarter * quarters;
    const minSitsPerPlayer = Math.floor(totalSittingSlots / totalPlayers);
    const playersWithExtraSit = totalSittingSlots % totalPlayers;

    // Fairness order for the remainder: whoever has sat least across the season
    // takes the extra quarter off first.
    const playersForExtraSit = [...mustRestPlayers, ...regularPlayers];
    playersForExtraSit.sort((a, b) => averageSitting(a, seasonStats) - averageSitting(b, seasonStats));
    shuffleWithinSimilarGroups(playersForExtraSit, (p) => sittingGroup(p, seasonStats));

    const targetSits = new Map();
    const avoidMap = new Map();

    playersForExtraSit.forEach((player, index) => {
        let target = minSitsPerPlayer + (index < playersWithExtraSit ? 1 : 0);
        // A player asked to rest sits at least once, even on a roster where
        // nobody would otherwise sit at all
        if (player.mustRest) target = Math.max(target, 1);
        targetSits.set(player.name, target);

        // If player sat in Q4 of their last match, avoid having them sit in Q1 of this match
        const satQ4Last = Boolean(seasonStats?.[player.name]?.lastGameSatQ4);
        avoidMap.set(player.name, satQ4Last ? [1] : []);
    });

    const allPlayersCombined = [...mustRestPlayers, ...regularPlayers];

    // Must-rest players are placed first, then the rest in fairness order
    const assignmentOrder = [
        ...playersForExtraSit.filter(p => p.mustRest),
        ...playersForExtraSit.filter(p => !p.mustRest)
    ];

    const remaining = {};
    for (let q = 1; q <= quarters; q++) remaining[q] = sittingPerQuarter;

    const plan = planSittingQuarters(
        assignmentOrder.map(p => ({
            target: targetSits.get(p.name) ?? 0,
            avoid: avoidMap.get(p.name) || []
        })),
        sittingPerQuarter,
        quarters
    );

    assignmentOrder.forEach((player, index) => {
        const playerAvoid = avoidMap.get(player.name) || [];
        const chosen = (plan && plan[index]
            ? plan[index]
            : chooseSittingQuarters(targetSits.get(player.name) ?? 0, remaining, quarters, playerAvoid)) || [];

        chosen.forEach(q => {
            player.sittingQuarters.push(q);
            schedule[q].push(player.name);
            remaining[q]--;
        });
    });

    balanceSittingByRating(schedule, allPlayersCombined, players, playersOnField);

    return schedule;
}

function selectKeeper(availablePlayers, quarter, seasonStats = {}) {
    const allowedKeepers = availablePlayers.filter(player => !player.noKeeper);
    const poolToSelectFrom = allowedKeepers.length > 0 ? allowedKeepers : availablePlayers;
    let potentialKeepers = poolToSelectFrom.filter(player => !player.goalieQuarter);

    if (potentialKeepers.length > 0) {
        const statsOf = (name) => seasonStats?.[name] || {};

        potentialKeepers.sort((a, b) => {
            const gkA = statsOf(a.name).goalkeeperQuarters || 0;
            const gkB = statsOf(b.name).goalkeeperQuarters || 0;
            if (gkA !== gkB) return gkA - gkB;

            // Multi-game tie breaker: prefer players who were NOT keeper in their previous game
            const wasGkLastA = statsOf(a.name).lastGameKeeper ? 1 : 0;
            const wasGkLastB = statsOf(b.name).lastGameKeeper ? 1 : 0;
            return wasGkLastA - wasGkLastB;
        });

        const minGK = statsOf(potentialKeepers[0].name).goalkeeperQuarters || 0;
        const lowestGKGroup = potentialKeepers.filter(p =>
            (statsOf(p.name).goalkeeperQuarters || 0) === minGK
        );

        // Within lowest GK group, prioritize candidates who did not play keeper in their last match
        const notLastGameKeepers = lowestGKGroup.filter(p => !statsOf(p.name).lastGameKeeper);
        const candidateGroup = notLastGameKeepers.length > 0 ? notLastGameKeepers : lowestGKGroup;

        const hasKeeperRatings = candidateGroup.some(p => (p.positionalRatings || {}).keeper);
        if (hasKeeperRatings) {
            candidateGroup.sort((a, b) => {
                const rA = (a.positionalRatings || {}).keeper || 0;
                const rB = (b.positionalRatings || {}).keeper || 0;
                return rB - rA;
            });
            const topRating = (candidateGroup[0].positionalRatings || {}).keeper || 0;
            const topRatedKeepers = candidateGroup.filter(p =>
                ((p.positionalRatings || {}).keeper || 0) === topRating
            );
            return topRatedKeepers[Math.floor(Math.random() * topRatedKeepers.length)];
        }

        return candidateGroup[Math.floor(Math.random() * candidateGroup.length)];
    }

    return poolToSelectFrom[0];
}

function getPositionRatingCategory(position) {
    if (position === 'Keeper') return 'keeper';
    if (position.includes('Back')) return 'defense';
    if (position.includes('Mid') || position === 'Midfield') return 'midfield';
    return 'offense';
}

function assignPositionsOptimally(players, positions, defensivePositions, seasonStats = {}) {
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

            // 1. Current match D/O balance (primary)
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

            // 2. Multi-game / Season-wide D/O balance
            const playerSeasonStats = seasonStats?.[player.name];
            if (playerSeasonStats) {
                const seasonDef = playerSeasonStats.defensiveQuarters || 0;
                const seasonOff = (playerSeasonStats.offensiveQuarters || 0) + (playerSeasonStats.midfieldQuarters || 0);
                const seasonImbalance = seasonDef - seasonOff; // > 0 means has played more defense across season
                if (isDefensive) {
                    score -= seasonImbalance * 25;
                } else {
                    score += seasonImbalance * 25;
                }
            }

            // 3. Season-wide Position Variety
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

    // Record who sat from who actually took the field, not from the schedule.
    // When the sitting schedule cannot place someone it leaves a quarter
    // under-filled, so more players arrive here than there are positions; the
    // surplus get no position. Trusting the schedule left them counted as
    // playing, which hid genuine rotation violations from validateLineup and
    // from the coach's resting list.
    const onField = new Set(Object.values(quarterLineup.positions));
    players.forEach(player => {
        if (!onField.has(player.name)) {
            player.quartersSitting.push(quarter);
        }
    });

    return quarterLineup;
}

export function validateLineup(players, quarters) {
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

export function generateLineup(data, { onProgress } = {}) {
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

        if (attempts % PROGRESS_INTERVAL === 0) {
            onProgress?.(attempts, validation.length);
        }

    } while (validation.length > 0 && attempts < maxAttempts);

    if (validation.length > 0 && bestLineup) {
        return { lineup: bestLineup, validation, attempts, players: bestPlayers };
    }

    return { lineup, validation, attempts, players };
}
