/**
 * HTML and CSV builders for the Season Tracker tab.
 *
 * These are pure: they take data and return strings, leaving DOM writes and
 * notifications to the caller. That keeps the markup unit-testable and keeps
 * escaping in one place.
 */

import { escapeHtml } from './utils.js';
import { csvRow } from './export.js';

/**
 * The recommendation sections, in display order. Each `detail` returns the
 * escaped HTML shown after the player's name.
 */
const RECOMMENDATION_SECTIONS = [
    {
        key: 'shouldSit',
        heading: '🪑 Should Sit More',
        description: 'These players have sat the least this season',
        detail: p => `avg ${p.avgSitting} sits/game`
    },
    {
        key: 'shouldKeep',
        heading: '🧤 Goalkeeper Priority',
        description: 'These players have played goalkeeper the least',
        detail: p => `${p.gkCount} GK games`
    },
    {
        key: 'shouldCaptain',
        heading: '⭐ Captain Priority',
        description: 'These players have been captain the least',
        detail: p => `${p.captainCount} captain games`
    },
    {
        key: 'needsOffense',
        heading: '⚽ Needs More Offense',
        description: 'These players have played mostly defense',
        detail: p => `${p.offense} off / ${p.defense} def quarters`
    },
    {
        key: 'needsDefense',
        heading: '🛡️ Needs More Defense',
        description: 'These players have played mostly offense',
        detail: p => `${p.offense} off / ${p.defense} def quarters`
    },
    {
        key: 'positionVariety',
        heading: '🔄 Needs Position Variety',
        description: 'These players have played the fewest unique positions',
        detail: p => `${p.positionCount} positions (${escapeHtml(p.topPositions || 'none')})`
    }
];

/**
 * Markup for the recommendations panel.
 *
 * Returns null when there is nothing to recommend, so the caller can choose the
 * right empty state.
 */
export function buildRecommendationsHtml(recommendations) {
    if (!recommendations) return null;

    const sections = RECOMMENDATION_SECTIONS
        .filter(section => recommendations[section.key]?.length > 0)
        .map(section => `
                <div class="rec-section">
                    <h4>${section.heading}</h4>
                    <p class="rec-desc">${section.description}</p>
                    <ul>${recommendations[section.key].map(player =>
                        `<li><strong>${escapeHtml(player.name)}</strong> - ${section.detail(player)}</li>`
                    ).join('')}</ul>
                </div>
            `);

    if (sections.length === 0) return null;

    return `
                <div class="recommendations-grid">
                    ${sections.join('')}
                </div>
                <p class="rec-note">These recommendations are automatically applied when you generate a lineup.</p>
            `;
}

/** Markup for the game history list, newest game first. */
export function buildGameHistoryHtml(savedGames) {
    const sortedGames = [...savedGames].sort((a, b) => new Date(b.date) - new Date(a.date));

    return sortedGames.map(game => {
        const formattedDate = new Date(game.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const playerCount = game.players.filter(p => p.status === 'available').length;
        const safeId = escapeHtml(String(game.id));
        const safeName = escapeHtml(game.name);
        const safeFormation = escapeHtml(game.settings.formation);
        const safeDivision = escapeHtml(game.settings.ageDivision);
        const notesHtml = game.notes
            ? `<span class="game-notes">${escapeHtml(game.notes)}</span>`
            : '';

        return `
                    <div class="game-history-item" data-game-id="${safeId}">
                        <div class="game-info">
                            <span class="game-name">${safeName}</span>
                            <span class="game-date">${formattedDate}</span>
                            <span class="game-meta">${playerCount} players | ${safeFormation} | ${safeDivision}</span>
                            ${notesHtml}
                        </div>
                        <div class="game-actions">
                            <button class="btn-view-game" data-action="view-game" data-game-id="${safeId}" aria-label="View ${safeName}">View</button>
                            <button class="btn-notes-game" data-action="notes-game" data-game-id="${safeId}" aria-label="Edit notes for ${safeName}">Notes</button>
                            <button class="btn-delete-game" data-action="delete-game" data-game-id="${safeId}" aria-label="Delete ${safeName}">Delete</button>
                        </div>
                    </div>
                `;
    }).join('');
}

/** Players with at least one game, ordered for display: most games, then name. */
export function rankPlayersByGames(stats) {
    return Object.keys(stats)
        .filter(name => stats[name].gamesPlayed > 0)
        .sort((a, b) => {
            const diff = stats[b].gamesPlayed - stats[a].gamesPlayed;
            return diff !== 0 ? diff : a.localeCompare(b);
        });
}

/** The player's three most-played positions, as "POS (n)" entries. */
function topPositions(playerStats, separator = ', ', format = (pos, count) => `${escapeHtml(pos)} (${count})`) {
    return Object.entries(playerStats.positions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([pos, count]) => format(pos, count))
        .join(separator);
}

/** Percentage of available quarters the player spent sitting. */
function sittingPercent(playerStats) {
    const totalPossible = playerStats.gamesPlayed * 4;
    return totalPossible > 0 ? Math.round((playerStats.totalSitting / totalPossible) * 100) : 0;
}

/**
 * Markup for the season stats table.
 *
 * Returns null when no player has played a game, so the caller can show an
 * empty state instead.
 */
export function buildPlayerStatsHtml(stats) {
    const playerNames = rankPlayersByGames(stats);
    if (playerNames.length === 0) return null;

    const maxQuarters = Math.max(...playerNames.map(name => stats[name].totalQuarters)) || 1;

    const rows = playerNames.map(name => {
        const s = stats[name];
        const barWidth = Math.round((s.totalQuarters / maxQuarters) * 50);
        const attended = s.gamesAttended || s.gamesPlayed;
        const onRoster = s.gamesOnRoster || s.gamesPlayed;
        const attendanceDisplay = onRoster > 0 ? `${attended}/${onRoster}` : '-';
        const positions = topPositions(s) || '-';

        return `
                                <tr>
                                    <td>${escapeHtml(name)}</td>
                                    <td title="${s.gamesAbsent || 0} absent, ${s.gamesInjured || 0} injured">${attendanceDisplay}</td>
                                    <td>${s.totalQuarters}<span class="stat-bar" style="width: ${barWidth}px;"></span></td>
                                    <td>${sittingPercent(s)}%</td>
                                    <td>${s.goalkeeperQuarters}</td>
                                    <td>${s.captainGames || 0}</td>
                                    <td>${positions}</td>
                                </tr>
                            `;
    }).join('');

    return `
                <table class="player-stats-table">
                    <thead>
                        <tr>
                            <th>Player</th>
                            <th class="sortable" data-sort="attendance" title="Games Attended / Games on Roster">Attend</th>
                            <th class="sortable" data-sort="quarters">Quarters</th>
                            <th class="sortable" data-sort="sitting">Sitting %</th>
                            <th class="sortable" data-sort="gk">GK</th>
                            <th class="sortable" data-sort="captain">Capt</th>
                            <th>Top Positions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            `;
}

const CSV_HEADERS = [
    'Player', 'Games Attended', 'Absent', 'Injured', 'Attendance %', 'Quarters Played',
    'Quarters Sitting', 'Sitting %', 'GK Games', 'Captain Games', 'Top Positions'
];

/**
 * Season stats as CSV.
 *
 * Returns null when no player has played a game.
 */
export function buildSeasonStatsCsv(stats) {
    // Ordered by games played only, matching the exported report's convention
    const playerNames = Object.keys(stats)
        .filter(name => stats[name].gamesPlayed > 0)
        .sort((a, b) => stats[b].gamesPlayed - stats[a].gamesPlayed);

    if (playerNames.length === 0) return null;

    const rows = playerNames.map(name => {
        const s = stats[name];
        const attendancePct = s.gamesOnRoster > 0
            ? Math.round((s.gamesAttended / s.gamesOnRoster) * 100)
            : 0;

        return [
            name,
            s.gamesAttended || s.gamesPlayed,
            s.gamesAbsent || 0,
            s.gamesInjured || 0,
            `${attendancePct}%`,
            s.totalQuarters,
            s.totalSitting,
            `${sittingPercent(s)}%`,
            s.goalkeeperQuarters,
            s.captainGames || 0,
            topPositions(s, '; ', (pos, count) => `${pos}(${count})`)
        ];
    });

    // Through csvRow, which doubles an embedded quote. Wrapping each cell in
    // quotes and stopping there broke the row for a name like Bob "Bobby" Smith.
    return [csvRow(CSV_HEADERS), ...rows.map(csvRow)].join('\n');
}
