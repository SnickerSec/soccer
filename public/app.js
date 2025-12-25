// Module imports
import {
    safeGetFromStorage,
    safeSetToStorage,
    safeRemoveFromStorage,
    safeParseJSON
} from './modules/storage.js';

import {
    escapeHtml,
    shuffleArray,
    shuffleWithinSimilarGroups,
    deepClone,
    formatDate,
    debounce
} from './modules/utils.js';

import {
    calculatePlayerStats,
    getLineupRecommendations
} from './modules/season-stats.js';

import {
    FORMATIONS,
    getPositionsForFormation,
    getFormationsForFieldSize,
    isDefensivePosition,
    isOffensivePosition,
    getFormationDescription
} from './modules/formations.js';

class SoccerLineupGenerator {
    constructor() {
        this.players = [];
        this.captains = []; // Track selected captains
        this.ageDivision = '10U';
        this.formation = '2-3-1';
        this.quarters = CONSTANTS.DEFAULT_QUARTERS;
        this.playersOnField = 7;
        this.positions = [];
        this.lineup = [];

        // Undo/Redo stacks
        this.undoStack = [];
        this.redoStack = [];

        // PDF template cache
        this.pdfTemplateCache = null;

        // Theme
        this.currentTheme = 'dark';

        // Saved games for multi-game tracking
        this.savedGames = [];

        // Season stats cache for performance during lineup generation
        this.seasonStatsCache = null;

        // Minimum quarters setting
        this.minQuartersPerPlayer = 2;

        this.init();
    }

    init() {
        this.registerServiceWorker();
        this.loadTheme();
        this.loadData();
        this.loadSavedGames();
        this.renderSeasonStats();
        this.checkForSharedLineup();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.setupTooltips();
        this.initializeDefaults();
        this.showWelcomeMessage();
        this.updateUndoRedoButtons();
    }

    // Register Service Worker for offline support
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                        console.log('Service Worker registered:', registration.scope);
                    })
                    .catch((error) => {
                        console.log('Service Worker registration failed:', error);
                    });
            });
        }
    }

    // Check URL for shared lineup data
    checkForSharedLineup() {
        const urlParams = new URLSearchParams(window.location.search);
        const sharedData = urlParams.get('lineup');

        if (sharedData) {
            try {
                const decoded = JSON.parse(atob(sharedData));
                if (decoded.players && decoded.lineup) {
                    this.saveStateForUndo();
                    this.players = decoded.players;
                    this.lineup = decoded.lineup;
                    this.captains = this.players.filter(p => p.isCaptain).map(p => p.name);

                    if (decoded.settings) {
                        this.ageDivision = decoded.settings.ageDivision || this.ageDivision;
                        this.playersOnField = decoded.settings.playersOnField || this.playersOnField;
                        this.formation = decoded.settings.formation || this.formation;
                    }

                    this.updatePlayerList();
                    this.displayLineup(this.validateLineup());
                    this.showNotification('Shared lineup loaded!', 'success');

                    // Clear URL params
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } catch (e) {
                console.error('Failed to parse shared lineup:', e);
            }
        }
    }

    // Generate shareable URL
    generateShareURL() {
        if (this.lineup.length === 0) {
            this.showNotification('Generate a lineup first before sharing', 'error');
            return null;
        }

        const shareData = {
            players: this.players,
            lineup: this.lineup,
            settings: {
                ageDivision: this.ageDivision,
                playersOnField: this.playersOnField,
                formation: this.formation
            }
        };

        const encoded = btoa(JSON.stringify(shareData));
        const url = `${window.location.origin}${window.location.pathname}?lineup=${encoded}`;
        return url;
    }

    // Share lineup
    shareLineup() {
        const url = this.generateShareURL();
        if (!url) return;

        if (navigator.share) {
            navigator.share({
                title: 'AYSO Lineup',
                text: 'Check out this game lineup!',
                url: url
            }).catch(() => {
                this.copyShareURL(url);
            });
        } else {
            this.copyShareURL(url);
        }
    }

    copyShareURL(url) {
        navigator.clipboard.writeText(url).then(() => {
            this.showNotification('Share link copied to clipboard!', 'success');
        }).catch(() => {
            this.showNotification('Failed to copy link', 'error');
        });
    }

    // Copy lineup to clipboard as text
    copyLineupToClipboard() {
        if (this.lineup.length === 0) {
            this.showNotification('No lineup to copy', 'error');
            return;
        }

        let text = `AYSO Lineup - ${this.formation} Formation\n`;
        text += `${'='.repeat(40)}\n\n`;

        this.lineup.forEach((quarter) => {
            text += `Quarter ${quarter.quarter}\n`;
            text += `${'-'.repeat(20)}\n`;

            for (const [position, playerName] of Object.entries(quarter.positions)) {
                const player = this.players.find(p => p.name === playerName);
                const number = player?.number ? `#${player.number}` : '';
                text += `${position}: ${playerName} ${number}\n`;
            }

            // Add sitting players
            const sittingPlayers = this.players.filter(p =>
                p.quartersSitting && p.quartersSitting.includes(quarter.quarter)
            );
            if (sittingPlayers.length > 0) {
                text += `Sitting: ${sittingPlayers.map(p => p.name).join(', ')}\n`;
            }
            text += '\n';
        });

        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Lineup copied to clipboard!', 'success');
        }).catch(() => {
            this.showNotification('Failed to copy lineup', 'error');
        });
    }

    // Export to CSV
    exportToCSV() {
        if (this.lineup.length === 0) {
            this.showNotification('Generate a lineup first', 'error');
            return;
        }

        // Create CSV header
        let csv = 'Position,Quarter 1,Quarter 2,Quarter 3,Quarter 4\n';

        // Get all positions
        const allPositions = [...new Set(this.lineup.flatMap(q => Object.keys(q.positions)))];

        // Add row for each position
        allPositions.forEach(position => {
            const row = [position];
            for (let q = 1; q <= 4; q++) {
                const quarter = this.lineup.find(l => l.quarter === q);
                const playerName = quarter?.positions[position] || '';
                const player = this.players.find(p => p.name === playerName);
                const display = player?.number ? `${playerName} (#${player.number})` : playerName;
                row.push(`"${display}"`);
            }
            csv += row.join(',') + '\n';
        });

        // Add sitting row
        const sittingRow = ['Sitting'];
        for (let q = 1; q <= 4; q++) {
            const sitting = this.players
                .filter(p => p.quartersSitting?.includes(q))
                .map(p => p.name)
                .join('; ');
            sittingRow.push(`"${sitting}"`);
        }
        csv += sittingRow.join(',') + '\n';

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lineup_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        this.showNotification('CSV exported successfully', 'success');
    }

    // Multi-game tracking
    loadSavedGames() {
        const saved = this.safeGetFromStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY);
        if (saved) {
            try {
                this.savedGames = JSON.parse(saved);
            } catch (e) {
                this.savedGames = [];
            }
        }
    }

    saveCurrentGame(gameName, notes = '') {
        if (this.lineup.length === 0) {
            this.showNotification('Generate a lineup first', 'error');
            return;
        }

        const game = {
            id: Date.now(),
            name: gameName || `Game ${this.savedGames.length + 1}`,
            date: new Date().toISOString(),
            notes: notes || '',
            players: JSON.parse(JSON.stringify(this.players)),
            lineup: JSON.parse(JSON.stringify(this.lineup)),
            settings: {
                ageDivision: this.ageDivision,
                playersOnField: this.playersOnField,
                formation: this.formation
            },
            captains: [...this.captains]
        };

        this.savedGames.push(game);
        this.safeSetToStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY, JSON.stringify(this.savedGames));
        this.renderSeasonStats();
        this.showNotification(`Game "${game.name}" saved!`, 'success');
    }

    // Update game notes
    updateGameNotes(gameId, notes) {
        const game = this.savedGames.find(g => g.id === gameId);
        if (!game) return;

        game.notes = notes;
        this.safeSetToStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY, JSON.stringify(this.savedGames));
        this.renderSeasonStats();
        this.showNotification('Notes updated', 'success');
    }

    // Edit game notes dialog
    editGameNotes(gameId) {
        const game = this.savedGames.find(g => g.id === gameId);
        if (!game) return;

        const notes = prompt('Enter notes for this game:', game.notes || '');
        if (notes !== null) {
            this.updateGameNotes(gameId, notes);
        }
    }

    loadSavedGame(gameId) {
        const game = this.savedGames.find(g => g.id === gameId);
        if (!game) {
            this.showNotification('Game not found', 'error');
            return;
        }

        this.saveStateForUndo();
        this.players = JSON.parse(JSON.stringify(game.players));
        this.lineup = JSON.parse(JSON.stringify(game.lineup));
        this.captains = this.players.filter(p => p.isCaptain).map(p => p.name);
        this.ageDivision = game.settings.ageDivision;
        this.playersOnField = game.settings.playersOnField;
        this.formation = game.settings.formation;

        this.updatePlayerList();
        this.displayLineup(this.validateLineup());
        this.showNotification(`Loaded "${game.name}"`, 'success');
    }

    getPlayerStats() {
        const stats = {};

        const createEmptyStats = () => ({
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
        });

        this.players.forEach(player => {
            stats[player.name] = createEmptyStats();
        });

        this.savedGames.forEach(game => {
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

                if (player.goalieQuarter) {
                    s.goalkeeperQuarters++;
                }

                // Track captain assignments (check both new captains array and legacy isCaptain flag)
                if (game.captains?.includes(player.name) || player.isCaptain) {
                    s.captainGames++;
                }

                player.positionsPlayed?.forEach(pos => {
                    s.positions[pos.position] = (s.positions[pos.position] || 0) + 1;
                });
            });
        });

        return stats;
    }

    // Get lineup recommendations based on season history
    getLineupRecommendations() {
        const stats = this.getPlayerStats();
        const availablePlayers = this.players.filter(p => p.status === 'available');

        if (availablePlayers.length === 0 || this.savedGames.length === 0) {
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

        // Calculate averages for each player
        const playerData = availablePlayers.map(player => {
            const s = stats[player.name] || { gamesPlayed: 0, totalSitting: 0, goalkeeperQuarters: 0, captainGames: 0, totalQuarters: 0, positions: {} };
            const gamesPlayed = s.gamesPlayed || 0;

            // Get offensive/defensive balance from saved games
            let offenseQtrs = 0, defenseQtrs = 0;
            this.savedGames.forEach(game => {
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

        // Players who should be goalkeeper (lowest GK count, excluding noKeeper)
        const byGK = [...playerData]
            .filter(p => !p.noKeeper && p.gamesPlayed > 0)
            .sort((a, b) => a.gkCount - b.gkCount);
        const minGK = byGK[0]?.gkCount || 0;
        recommendations.shouldKeep = byGK
            .filter(p => p.gkCount <= minGK)
            .slice(0, 3)
            .map(p => ({ name: p.name, gkCount: p.gkCount }));

        // Players who should be captain (lowest captain count)
        const byCaptain = [...playerData]
            .filter(p => p.gamesPlayed > 0)
            .sort((a, b) => a.captainCount - b.captainCount);
        const minCaptain = byCaptain[0]?.captainCount || 0;
        recommendations.shouldCaptain = byCaptain
            .filter(p => p.captainCount <= minCaptain)
            .slice(0, 3)
            .map(p => ({ name: p.name, captainCount: p.captainCount }));

        // Players needing more offense (high defense, low offense ratio)
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

        // Players needing position variety (played fewer unique positions)
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

    // Render lineup recommendations section
    renderRecommendations() {
        const container = document.getElementById('lineupRecommendations');
        if (!container) return;

        const recommendations = this.getLineupRecommendations();

        if (!recommendations) {
            container.innerHTML = '<p class="empty-state">Play some games to see lineup recommendations for the next game.</p>';
            return;
        }

        const sections = [];

        if (recommendations.shouldSit.length > 0) {
            sections.push(`
                <div class="rec-section">
                    <h4>🪑 Should Sit More</h4>
                    <p class="rec-desc">These players have sat the least this season</p>
                    <ul>${recommendations.shouldSit.map(p =>
                        `<li><strong>${this.escapeHtmlAttribute(p.name)}</strong> - avg ${p.avgSitting} sits/game</li>`
                    ).join('')}</ul>
                </div>
            `);
        }

        if (recommendations.shouldKeep.length > 0) {
            sections.push(`
                <div class="rec-section">
                    <h4>🧤 Goalkeeper Priority</h4>
                    <p class="rec-desc">These players have played goalkeeper the least</p>
                    <ul>${recommendations.shouldKeep.map(p =>
                        `<li><strong>${this.escapeHtmlAttribute(p.name)}</strong> - ${p.gkCount} GK games</li>`
                    ).join('')}</ul>
                </div>
            `);
        }

        if (recommendations.shouldCaptain.length > 0) {
            sections.push(`
                <div class="rec-section">
                    <h4>⭐ Captain Priority</h4>
                    <p class="rec-desc">These players have been captain the least</p>
                    <ul>${recommendations.shouldCaptain.map(p =>
                        `<li><strong>${this.escapeHtmlAttribute(p.name)}</strong> - ${p.captainCount} captain games</li>`
                    ).join('')}</ul>
                </div>
            `);
        }

        if (recommendations.needsOffense.length > 0) {
            sections.push(`
                <div class="rec-section">
                    <h4>⚽ Needs More Offense</h4>
                    <p class="rec-desc">These players have played mostly defense</p>
                    <ul>${recommendations.needsOffense.map(p =>
                        `<li><strong>${this.escapeHtmlAttribute(p.name)}</strong> - ${p.offense} off / ${p.defense} def quarters</li>`
                    ).join('')}</ul>
                </div>
            `);
        }

        if (recommendations.needsDefense.length > 0) {
            sections.push(`
                <div class="rec-section">
                    <h4>🛡️ Needs More Defense</h4>
                    <p class="rec-desc">These players have played mostly offense</p>
                    <ul>${recommendations.needsDefense.map(p =>
                        `<li><strong>${this.escapeHtmlAttribute(p.name)}</strong> - ${p.offense} off / ${p.defense} def quarters</li>`
                    ).join('')}</ul>
                </div>
            `);
        }

        if (recommendations.positionVariety.length > 0) {
            sections.push(`
                <div class="rec-section">
                    <h4>🔄 Needs Position Variety</h4>
                    <p class="rec-desc">These players have played the fewest unique positions</p>
                    <ul>${recommendations.positionVariety.map(p =>
                        `<li><strong>${this.escapeHtmlAttribute(p.name)}</strong> - ${p.positionCount} positions (${p.topPositions || 'none'})</li>`
                    ).join('')}</ul>
                </div>
            `);
        }

        if (sections.length === 0) {
            container.innerHTML = '<p class="empty-state">All players are well-balanced! No specific recommendations.</p>';
        } else {
            container.innerHTML = `
                <div class="recommendations-grid">
                    ${sections.join('')}
                </div>
                <p class="rec-note">These recommendations are automatically applied when you generate a lineup.</p>
            `;
        }
    }

    // Render season stats tab
    renderSeasonStats() {
        const totalGamesEl = document.getElementById('totalGames');
        const totalPlayersEl = document.getElementById('totalPlayersTracked');
        const gameHistoryEl = document.getElementById('gameHistoryList');
        const playerStatsEl = document.getElementById('playerStatsTable');

        if (!totalGamesEl || !gameHistoryEl || !playerStatsEl) return;

        // Update summary stats
        totalGamesEl.textContent = this.savedGames.length;

        const allPlayers = new Set();
        this.savedGames.forEach(game => {
            game.players.forEach(p => allPlayers.add(p.name));
        });
        totalPlayersEl.textContent = allPlayers.size;

        // Render game history
        if (this.savedGames.length === 0) {
            gameHistoryEl.innerHTML = '<p class="empty-state">No games saved yet. Generate a lineup and click "Save Game" to start tracking.</p>';
        } else {
            const sortedGames = [...this.savedGames].sort((a, b) => new Date(b.date) - new Date(a.date));
            gameHistoryEl.innerHTML = sortedGames.map(game => {
                const date = new Date(game.date);
                const formattedDate = date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
                const playerCount = game.players.filter(p => p.status === 'available').length;
                const notesHtml = game.notes
                    ? `<span class="game-notes">${this.escapeHtmlAttribute(game.notes)}</span>`
                    : '';
                return `
                    <div class="game-history-item" data-game-id="${game.id}">
                        <div class="game-info">
                            <span class="game-name">${this.escapeHtmlAttribute(game.name)}</span>
                            <span class="game-date">${formattedDate}</span>
                            <span class="game-meta">${playerCount} players | ${game.settings.formation} | ${game.settings.ageDivision}</span>
                            ${notesHtml}
                        </div>
                        <div class="game-actions">
                            <button class="btn-view-game" data-action="view-game" data-game-id="${game.id}" aria-label="View ${this.escapeHtmlAttribute(game.name)}">View</button>
                            <button class="btn-notes-game" data-action="notes-game" data-game-id="${game.id}" aria-label="Edit notes for ${this.escapeHtmlAttribute(game.name)}">Notes</button>
                            <button class="btn-delete-game" data-action="delete-game" data-game-id="${game.id}" aria-label="Delete ${this.escapeHtmlAttribute(game.name)}">Delete</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Render player stats
        if (this.savedGames.length === 0) {
            playerStatsEl.innerHTML = '<p class="empty-state">Save some games to see player statistics across the season.</p>';
        } else {
            const stats = this.getPlayerStats();
            const playerNames = Object.keys(stats).filter(name => stats[name].gamesPlayed > 0);

            if (playerNames.length === 0) {
                playerStatsEl.innerHTML = '<p class="empty-state">No player statistics available.</p>';
                return;
            }

            // Sort by games played (descending), then by name
            playerNames.sort((a, b) => {
                const diff = stats[b].gamesPlayed - stats[a].gamesPlayed;
                return diff !== 0 ? diff : a.localeCompare(b);
            });

            const maxQuarters = Math.max(...playerNames.map(n => stats[n].totalQuarters)) || 1;

            playerStatsEl.innerHTML = `
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
                        ${playerNames.map(name => {
                            const s = stats[name];
                            const totalPossibleQuarters = s.gamesPlayed * 4;
                            const sittingPct = totalPossibleQuarters > 0
                                ? Math.round((s.totalSitting / totalPossibleQuarters) * 100)
                                : 0;
                            const barWidth = Math.round((s.totalQuarters / maxQuarters) * 50);
                            const attended = s.gamesAttended || s.gamesPlayed;
                            const onRoster = s.gamesOnRoster || s.gamesPlayed;
                            const attendanceDisplay = onRoster > 0 ? `${attended}/${onRoster}` : '-';

                            // Get top 3 positions
                            const positions = Object.entries(s.positions)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 3)
                                .map(([pos, count]) => `${pos} (${count})`)
                                .join(', ') || '-';

                            return `
                                <tr>
                                    <td>${this.escapeHtmlAttribute(name)}</td>
                                    <td title="${s.gamesAbsent || 0} absent, ${s.gamesInjured || 0} injured">${attendanceDisplay}</td>
                                    <td>${s.totalQuarters}<span class="stat-bar" style="width: ${barWidth}px;"></span></td>
                                    <td>${sittingPct}%</td>
                                    <td>${s.goalkeeperQuarters}</td>
                                    <td>${s.captainGames || 0}</td>
                                    <td>${positions}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }

        // Also render lineup recommendations
        this.renderRecommendations();
    }

    // Delete a saved game
    deleteGame(gameId) {
        const game = this.savedGames.find(g => g.id === gameId);
        if (!game) return;

        if (!confirm(`Are you sure you want to delete "${game.name}"?`)) {
            return;
        }

        this.savedGames = this.savedGames.filter(g => g.id !== gameId);
        this.safeSetToStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY, JSON.stringify(this.savedGames));
        this.renderSeasonStats();
        this.showNotification(`Deleted "${game.name}"`, 'info');
    }

    // View a saved game's lineup
    viewGameDetails(gameId) {
        const game = this.savedGames.find(g => g.id === gameId);
        if (!game) {
            this.showNotification('Game not found', 'error');
            return;
        }

        // Load the game data temporarily to display the lineup
        const originalPlayers = JSON.parse(JSON.stringify(this.players));
        const originalLineup = JSON.parse(JSON.stringify(this.lineup));

        this.players = JSON.parse(JSON.stringify(game.players));
        this.lineup = JSON.parse(JSON.stringify(game.lineup));

        // Display the lineup
        this.displayLineup([]);

        // Scroll to lineup section
        const lineupSection = document.getElementById('lineupDisplay');
        if (lineupSection) {
            lineupSection.scrollIntoView({ behavior: 'smooth' });
        }

        this.showNotification(`Viewing lineup from "${game.name}"`, 'info');

        // Restore original data after a delay (user can see the lineup)
        // Note: We don't restore automatically - user can generate a new lineup or save this one
    }

    // Clear all season history
    clearSeasonHistory() {
        if (!confirm('Are you sure you want to delete ALL saved games? This cannot be undone.')) {
            return;
        }

        this.savedGames = [];
        this.safeSetToStorage(CONSTANTS.STORAGE_KEYS.LINEUP_HISTORY, JSON.stringify(this.savedGames));
        this.renderSeasonStats();
        this.showNotification('Season history cleared', 'info');
    }

    // Export season stats to CSV
    exportSeasonStatsCSV() {
        if (this.savedGames.length === 0) {
            this.showNotification('No games to export', 'error');
            return;
        }

        const stats = this.getPlayerStats();
        const playerNames = Object.keys(stats).filter(name => stats[name].gamesPlayed > 0);

        if (playerNames.length === 0) {
            this.showNotification('No player statistics available', 'error');
            return;
        }

        // Sort by games played descending
        playerNames.sort((a, b) => stats[b].gamesPlayed - stats[a].gamesPlayed);

        // Build CSV content
        const headers = ['Player', 'Games Attended', 'Absent', 'Injured', 'Attendance %', 'Quarters Played', 'Quarters Sitting', 'Sitting %', 'GK Games', 'Captain Games', 'Top Positions'];
        const rows = playerNames.map(name => {
            const s = stats[name];
            const totalPossible = s.gamesPlayed * 4;
            const sittingPct = totalPossible > 0 ? Math.round((s.totalSitting / totalPossible) * 100) : 0;
            const attendancePct = s.gamesOnRoster > 0 ? Math.round((s.gamesAttended / s.gamesOnRoster) * 100) : 0;
            const topPositions = Object.entries(s.positions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([pos, count]) => `${pos}(${count})`)
                .join('; ');

            return [
                name,
                s.gamesAttended || s.gamesPlayed,
                s.gamesAbsent || 0,
                s.gamesInjured || 0,
                `${attendancePct}%`,
                s.totalQuarters,
                s.totalSitting,
                `${sittingPct}%`,
                s.goalkeeperQuarters,
                s.captainGames || 0,
                topPositions
            ];
        });

        // Convert to CSV string
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `season-stats-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);

        this.showNotification('Season stats exported to CSV', 'success');
    }

    // Setup tooltips
    setupTooltips() {
        // Add tooltip data attributes to elements that need them
        const tooltips = {
            '#generateLineup': 'Generate a fair lineup following AYSO rules (Ctrl+G)',
            '#demoButton': 'Load sample players to try the app (Ctrl+D)',
            '#exportLineup': 'Export lineup to text file (Ctrl+E)',
            '#printLineup': 'Print the lineup (Ctrl+P)',
            '#themeToggle': 'Switch between dark and light theme',
            '#undoBtn': 'Undo last change (Ctrl+Z)',
            '#redoBtn': 'Redo last change (Ctrl+Y)',
            '.captain-checkbox': 'Select as team captain (max 2)',
            '.pref-checkbox.no-keeper': 'Player should not play goalkeeper',
            '.pref-checkbox.must-rest': 'Player needs extra rest time'
        };

        Object.entries(tooltips).forEach(([selector, text]) => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (!el.hasAttribute('title')) {
                    el.setAttribute('title', text);
                }
            });
        });
    }

    // Theme management
    loadTheme() {
        const savedTheme = this.safeGetFromStorage(CONSTANTS.STORAGE_KEYS.THEME);
        if (savedTheme) {
            this.currentTheme = savedTheme;
            document.documentElement.setAttribute('data-theme', savedTheme);
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        this.safeSetToStorage(CONSTANTS.STORAGE_KEYS.THEME, this.currentTheme);
        this.showNotification(`Switched to ${this.currentTheme} theme`, 'info');
    }

    // Safe localStorage operations - delegate to module
    safeGetFromStorage(key) {
        return safeGetFromStorage(key);
    }

    safeSetToStorage(key, value) {
        const result = safeSetToStorage(key, value);
        if (!result) {
            this.showNotification('Storage quota exceeded. Some data may not be saved.', 'error');
        }
        return result;
    }

    safeRemoveFromStorage(key) {
        return safeRemoveFromStorage(key);
    }

    // Undo/Redo system
    saveStateForUndo() {
        const state = {
            players: JSON.parse(JSON.stringify(this.players)),
            captains: [...this.captains],
            lineup: JSON.parse(JSON.stringify(this.lineup))
        };

        this.undoStack.push(state);
        if (this.undoStack.length > CONSTANTS.MAX_UNDO_STACK_SIZE) {
            this.undoStack.shift();
        }

        // Clear redo stack when new action is performed
        this.redoStack = [];
        this.updateUndoRedoButtons();
    }

    undo() {
        if (this.undoStack.length === 0) return;

        // Save current state to redo stack
        const currentState = {
            players: JSON.parse(JSON.stringify(this.players)),
            captains: [...this.captains],
            lineup: JSON.parse(JSON.stringify(this.lineup))
        };
        this.redoStack.push(currentState);

        // Restore previous state
        const previousState = this.undoStack.pop();
        this.players = previousState.players;
        this.captains = previousState.captains;
        this.lineup = previousState.lineup;

        this.updatePlayerList();
        if (this.lineup.length > 0) {
            this.displayLineup(this.validateLineup());
        }
        this.savePlayers();
        this.updateUndoRedoButtons();
        this.showNotification('Undo successful', 'info');
    }

    redo() {
        if (this.redoStack.length === 0) return;

        // Save current state to undo stack
        const currentState = {
            players: JSON.parse(JSON.stringify(this.players)),
            captains: [...this.captains],
            lineup: JSON.parse(JSON.stringify(this.lineup))
        };
        this.undoStack.push(currentState);

        // Restore next state
        const nextState = this.redoStack.pop();
        this.players = nextState.players;
        this.captains = nextState.captains;
        this.lineup = nextState.lineup;

        this.updatePlayerList();
        if (this.lineup.length > 0) {
            this.displayLineup(this.validateLineup());
        }
        this.savePlayers();
        this.updateUndoRedoButtons();
        this.showNotification('Redo successful', 'info');
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');

        if (undoBtn) {
            undoBtn.disabled = this.undoStack.length === 0;
        }
        if (redoBtn) {
            redoBtn.disabled = this.redoStack.length === 0;
        }
    }
    
    initializeDefaults() {
        // Get the current values from the dropdowns
        const ageDivisionSelect = document.getElementById('ageDivision');
        const fieldPlayersSelect = document.getElementById('fieldPlayers');
        const formationSelect = document.getElementById('formation');
        
        // Set the age division
        this.ageDivision = ageDivisionSelect.value;
        
        // Update field options based on age division
        this.updateFieldOptions();
        
        // Set the values from the updated dropdowns
        this.playersOnField = parseInt(fieldPlayersSelect.value);
        this.formation = formationSelect.value;
        
        // Update formation options based on field size
        this.updateFormationOptions();
        
        // Initialize positions based on defaults
        this.updatePositions();
        
        // Update age-specific rules
        this.updateAgeRules();
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // File import
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileImport(e));

        // Manual player addition
        document.getElementById('addPlayer').addEventListener('click', () => this.addPlayerManually());
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addPlayerManually();
        });

        // Demo button
        document.getElementById('demoButton').addEventListener('click', () => this.populateDemo());

        // Generate lineup
        document.getElementById('generateLineup').addEventListener('click', () => this.generateLineup());

        // Clear all
        document.getElementById('clearAll').addEventListener('click', () => this.clearAll());

        // Export and print
        document.getElementById('exportLineup').addEventListener('click', () => this.exportLineup());
        document.getElementById('printLineup').addEventListener('click', () => this.printLineup());
        document.getElementById('exportPlayers').addEventListener('click', () => this.exportPlayers());

        // New action buttons
        const copyBtn = document.getElementById('copyLineup');
        const shareBtn = document.getElementById('shareLineup');
        const csvBtn = document.getElementById('exportCSV');
        const saveGameBtn = document.getElementById('saveGame');

        if (copyBtn) copyBtn.addEventListener('click', () => this.copyLineupToClipboard());
        if (shareBtn) shareBtn.addEventListener('click', () => this.shareLineup());
        if (csvBtn) csvBtn.addEventListener('click', () => this.exportToCSV());
        if (saveGameBtn) saveGameBtn.addEventListener('click', () => {
            const name = prompt('Enter a name for this game (e.g., "vs Tigers 12/10"):');
            if (name !== null) this.saveCurrentGame(name);
        });

        // Season stats tab - event delegation for game actions
        const gameHistoryList = document.getElementById('gameHistoryList');
        if (gameHistoryList) {
            gameHistoryList.addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (!button) return;

                const action = button.dataset.action;
                const gameId = parseInt(button.dataset.gameId);

                if (action === 'view-game') {
                    this.viewGameDetails(gameId);
                } else if (action === 'delete-game') {
                    this.deleteGame(gameId);
                } else if (action === 'notes-game') {
                    this.editGameNotes(gameId);
                }
            });
        }

        // Clear season history button
        const clearSeasonBtn = document.getElementById('clearSeasonHistory');
        if (clearSeasonBtn) {
            clearSeasonBtn.addEventListener('click', () => this.clearSeasonHistory());
        }

        // Export season stats button
        const exportSeasonBtn = document.getElementById('exportSeasonStats');
        if (exportSeasonBtn) {
            exportSeasonBtn.addEventListener('click', () => this.exportSeasonStatsCSV());
        }

        // Player evaluation form
        document.getElementById('generateEvaluation').addEventListener('click', () => this.generatePlayerEvaluationPDF());

        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Undo/Redo buttons
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => this.undo());
        }
        if (redoBtn) {
            redoBtn.addEventListener('click', () => this.redo());
        }

        // Age division setting
        document.getElementById('ageDivision').addEventListener('change', (e) => {
            this.ageDivision = e.target.value;
            this.updateFieldOptions();
            this.updateFormationOptions();
            this.updatePositions();
            this.updateAgeRules();
            this.saveSettings();
        });

        // Field players setting
        document.getElementById('fieldPlayers').addEventListener('change', (e) => {
            this.playersOnField = parseInt(e.target.value);
            this.updateFormationOptions();
            this.updatePositions();
            this.saveSettings();
        });

        // Formation setting
        document.getElementById('formation').addEventListener('change', (e) => {
            this.formation = e.target.value;
            this.updatePositions();
            this.updateFormationDescription();
            this.saveSettings();
        });

        // Event delegation for player list (fixes XSS vulnerability)
        const playerList = document.getElementById('playerList');
        if (playerList) {
            playerList.addEventListener('click', (e) => this.handlePlayerListClick(e));
            playerList.addEventListener('change', (e) => this.handlePlayerListChange(e));
        }
    }

    // Event delegation handlers to fix XSS vulnerability
    handlePlayerListClick(e) {
        const target = e.target;

        // Remove button
        if (target.classList.contains('remove-btn')) {
            const playerName = target.dataset.player;
            if (playerName) {
                this.removePlayer(playerName);
            }
            return;
        }

        // Preference checkbox
        if (target.classList.contains('pref-checkbox')) {
            const playerName = target.dataset.player;
            const prefType = target.dataset.pref;
            if (playerName && prefType) {
                if (prefType === 'noKeeper') {
                    this.toggleNoKeeperPreference(playerName);
                } else if (prefType === 'mustRest') {
                    this.toggleRestPreference(playerName);
                }
                this.updatePlayerList();
            }
            return;
        }
    }

    handlePlayerListChange(e) {
        const target = e.target;

        // Captain checkbox
        if (target.classList.contains('captain-checkbox')) {
            const playerName = target.dataset.player;
            if (playerName) {
                this.toggleCaptainByName(playerName, target.checked);
            }
            return;
        }

        // Player number edit
        if (target.classList.contains('player-number-edit')) {
            const playerIndex = parseInt(target.dataset.index);
            if (!isNaN(playerIndex)) {
                this.updatePlayerNumber(playerIndex, target.value);
            }
            return;
        }

        // Player status select
        if (target.classList.contains('player-status-select')) {
            const playerName = target.dataset.player;
            if (playerName) {
                this.updatePlayerStatus(playerName, target.value);
            }
            return;
        }
    }

    // Update player status (available, injured, absent)
    updatePlayerStatus(playerName, status) {
        const player = this.players.find(p => p.name === playerName);
        if (!player) return;

        this.saveStateForUndo();
        player.status = status;
        this.savePlayers();
        this.updatePlayerList();

        const statusLabels = {
            available: 'available',
            injured: 'injured',
            absent: 'absent'
        };
        this.showNotification(`${playerName} marked as ${statusLabels[status] || status}`, 'info');
    }

    // Toggle captain using name (for event delegation)
    toggleCaptainByName(playerName, isChecked) {
        const player = this.players.find(p => p.name === playerName);
        if (!player) return;

        this.saveStateForUndo();

        if (isChecked) {
            if (this.captains.length >= CONSTANTS.MAX_CAPTAINS) {
                const removedCaptain = this.captains.shift();
                const removedPlayer = this.players.find(p => p.name === removedCaptain);
                if (removedPlayer) {
                    removedPlayer.isCaptain = false;
                }
                this.showNotification(`Captain limit reached. Replaced ${removedCaptain} with ${playerName}`, 'info');
            } else {
                this.showNotification(`${playerName} is now a captain`, 'success');
            }
            this.captains.push(playerName);
            player.isCaptain = true;
        } else {
            const index = this.captains.indexOf(playerName);
            if (index > -1) {
                this.captains.splice(index, 1);
            }
            player.isCaptain = false;
            this.showNotification(`${playerName} is no longer a captain`, 'info');
        }

        this.updatePlayerList();
        this.savePlayers();
    }

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Check file size (max 1MB)
        if (file.size > 1024 * 1024) {
            this.showNotification('File is too large (max 1MB)', 'error');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const lines = content.split('\n').map(line => line.trim()).filter(line => line);
                
                if (lines.length === 0) {
                    this.showNotification('No player names found in file', 'warning');
                    return;
                }
                
                if (lines.length > 30) {
                    this.showNotification('Too many players in file (max 30)', 'error');
                    return;
                }
                
                let addedCount = 0;
                lines.forEach(line => {
                    if (this.players.length < 30) {
                        const beforeCount = this.players.length;
                        
                        // Check if line has a number (format: "Name #Number" or "Number Name" or "Name,Number")
                        let name = line;
                        let number = null;
                        
                        // Try to parse different formats
                        // Format 1: "Name #Number" (e.g., "John Smith #10")
                        const hashMatch = line.match(/^(.+?)\s*#(\d+)$/);
                        // Format 2: "Number Name" (e.g., "10 John Smith")
                        const prefixMatch = line.match(/^(\d+)\s+(.+)$/);
                        // Format 3: "Name,Number" (e.g., "John Smith,10")
                        const commaMatch = line.match(/^(.+?),\s*(\d+)$/);
                        
                        if (hashMatch) {
                            name = hashMatch[1].trim();
                            number = parseInt(hashMatch[2]);
                        } else if (prefixMatch) {
                            number = parseInt(prefixMatch[1]);
                            name = prefixMatch[2].trim();
                        } else if (commaMatch) {
                            name = commaMatch[1].trim();
                            number = parseInt(commaMatch[2]);
                        }
                        
                        // Validate number range
                        if (number !== null && (number < 1 || number > 99)) {
                            number = null;
                        }
                        
                        this.addPlayer(name, number);
                        if (this.players.length > beforeCount) addedCount++;
                    }
                });
                
                if (addedCount > 0) {
                    this.showNotification(`Imported ${addedCount} player${addedCount > 1 ? 's' : ''}`, 'success');
                }
            } catch (error) {
                this.showNotification('Error reading file', 'error');
                console.error('File import error:', error);
            }
            
            event.target.value = ''; // Reset file input
        };
        
        reader.onerror = () => {
            this.showNotification('Failed to read file', 'error');
            event.target.value = '';
        };
        
        reader.readAsText(file);
    }

    addPlayerManually() {
        const nameInput = document.getElementById('playerName');
        const numberInput = document.getElementById('playerNumber');
        const name = nameInput.value.trim();
        const number = numberInput.value ? parseInt(numberInput.value) : null;
        
        if (name) {
            this.addPlayer(name, number);
            nameInput.value = '';
            numberInput.value = '';
            nameInput.focus();
        }
    }

    addPlayer(name, number = null) {
        const safeName = this.sanitizeHtml(name.trim());
        
        // Validation
        if (!safeName) {
            this.showNotification('Please enter a player name', 'error');
            return;
        }
        
        if (safeName.length > 50) {
            this.showNotification('Player name is too long (max 50 characters)', 'error');
            return;
        }
        
        if (this.players.find(p => p.name.toLowerCase() === safeName.toLowerCase())) {
            this.showNotification(`Player "${safeName}" already exists`, 'warning');
            return;
        }
        
        // Check for duplicate number if provided
        if (number !== null && this.players.find(p => p.number === number)) {
            this.showNotification(`Player number ${number} is already taken`, 'warning');
            return;
        }
        
        if (this.players.length >= CONSTANTS.MAX_PLAYERS) {
            this.showNotification(`Maximum roster size reached (${CONSTANTS.MAX_PLAYERS} players)`, 'error');
            return;
        }

        this.saveStateForUndo();

        this.players.push({
            name: safeName,
            number: number,
            isCaptain: false,
            mustRest: false,
            noKeeper: false,
            status: CONSTANTS.PLAYER_STATUS.AVAILABLE,
            preferredPositions: [],
            quartersPlayed: [],
            quartersSitting: [],
            positionsPlayed: [],
            goalieQuarter: null
        });

        this.updatePlayerList();
        this.savePlayers();
        this.showNotification(`Added ${safeName}${number ? ' #' + number : ''} to roster`, 'success');
    }

    populateDemo() {
        const demoNames = [
            'Alex Martinez', 'Sam Johnson', 'Jordan Chen', 'Taylor Brown', 'Casey Rivera',
            'Morgan Davis', 'Avery Thompson', 'Riley Kim', 'Cameron Wilson', 'Sage Anderson',
            'Quinn Rodriguez', 'Emery Williams', 'River Patel', 'Skyler Garcia', 'Rowan Clark',
            'Phoenix Lee', 'Sage Mitchell', 'Harley Cooper', 'Justice Turner', 'Cameron Hill',
            'Mason Garcia', 'Isabella Thompson', 'Ethan Williams', 'Sophia Rodriguez', 'Liam Anderson',
            'Emma Johnson', 'Noah Martinez', 'Olivia Davis', 'William Brown', 'Ava Wilson',
            'James Miller', 'Charlotte Moore', 'Benjamin Taylor', 'Amelia Jackson', 'Lucas White',
            'Harper Lewis', 'Henry Walker', 'Evelyn Hall', 'Alexander Allen', 'Abigail Young'
        ];

        // Clear existing players first
        this.players = [];
        
        // Shuffle the demo names array to ensure randomness
        const shuffledNames = [...demoNames];
        this.shuffleArray(shuffledNames);
        
        // Determine how many players to add based on field size
        let playerCount = 10; // Default for 7v7
        if (this.playersOnField === 11) {
            playerCount = 18; // More players for 11v11
        } else if (this.playersOnField === 9) {
            playerCount = 14; // More players for 9v9
        } else if (this.playersOnField === 6) {
            playerCount = 8; // Fewer players for 6v6
        }
        
        // Take the appropriate number of names and add them with random numbers
        const selectedNames = shuffledNames.slice(0, playerCount);
        const usedNumbers = [];
        selectedNames.forEach(name => {
            // Generate a unique random number
            let number;
            do {
                number = Math.floor(Math.random() * 99) + 1;
            } while (usedNumbers.includes(number));
            usedNumbers.push(number);
            this.addPlayer(name, number);
        });
    }

    removePlayer(name) {
        this.saveStateForUndo();

        // Remove from captains if they were a captain
        const captainIndex = this.captains.indexOf(name);
        if (captainIndex > -1) {
            this.captains.splice(captainIndex, 1);
        }
        this.players = this.players.filter(p => p.name !== name);
        this.updatePlayerList();
        this.savePlayers();
        this.showNotification(`Removed ${name} from roster`, 'info');
    }

    updatePlayerList() {
        const list = document.getElementById('playerList');
        const count = document.getElementById('playerCount');
        const exportBtn = document.getElementById('exportPlayers');

        count.textContent = this.players.length;
        list.innerHTML = '';

        // Show/hide export button based on whether there are players
        if (this.players.length > 0) {
            exportBtn.style.display = 'block';
        } else {
            exportBtn.style.display = 'none';
        }

        this.players.forEach((player, index) => {
            const li = document.createElement('li');
            const isCaptain = this.captains.includes(player.name);
            const status = player.status || CONSTANTS.PLAYER_STATUS.AVAILABLE;

            li.setAttribute('role', 'listitem');
            li.setAttribute('aria-label', `Player ${player.name}${player.number ? ' number ' + player.number : ''}`);

            // Status indicator class
            const statusClass = status === CONSTANTS.PLAYER_STATUS.INJURED ? 'status-injured' :
                               status === CONSTANTS.PLAYER_STATUS.ABSENT ? 'status-absent' : 'status-available';

            // Build DOM elements instead of innerHTML to avoid XSS
            const container = document.createElement('div');
            container.className = 'player-item-container';

            // Captain checkbox
            const captainCheckbox = document.createElement('input');
            captainCheckbox.type = 'checkbox';
            captainCheckbox.className = 'captain-checkbox';
            captainCheckbox.checked = isCaptain;
            captainCheckbox.dataset.player = player.name;
            captainCheckbox.setAttribute('aria-label', `Select ${player.name} as captain`);
            captainCheckbox.title = 'Captain';
            container.appendChild(captainCheckbox);

            // Player number input
            const numberInput = document.createElement('input');
            numberInput.type = 'number';
            numberInput.className = 'player-number-edit';
            numberInput.value = player.number || '';
            numberInput.placeholder = '#';
            numberInput.min = CONSTANTS.MIN_PLAYER_NUMBER;
            numberInput.max = CONSTANTS.MAX_PLAYER_NUMBER;
            numberInput.dataset.index = index;
            numberInput.setAttribute('aria-label', `Jersey number for ${player.name}`);
            numberInput.onclick = (e) => e.stopPropagation();
            container.appendChild(numberInput);

            // Player name display
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name-display';
            if (isCaptain) {
                const starSpan = document.createElement('span');
                starSpan.className = 'captain-star';
                starSpan.textContent = '★';
                nameSpan.appendChild(starSpan);
                nameSpan.appendChild(document.createTextNode(' '));
            }
            nameSpan.appendChild(document.createTextNode(player.name));
            container.appendChild(nameSpan);

            // Preferences container
            const prefsDiv = document.createElement('div');
            prefsDiv.className = 'player-preferences';

            // No keeper button
            const noKeeperBtn = document.createElement('button');
            noKeeperBtn.type = 'button';
            noKeeperBtn.className = `pref-checkbox no-keeper${player.noKeeper ? ' active' : ''}`;
            noKeeperBtn.dataset.player = player.name;
            noKeeperBtn.dataset.pref = 'noKeeper';
            noKeeperBtn.setAttribute('aria-label', `Toggle no goalkeeper for ${player.name}`);
            noKeeperBtn.setAttribute('aria-pressed', player.noKeeper);
            noKeeperBtn.title = 'No Keeper';
            noKeeperBtn.textContent = 'GK';
            prefsDiv.appendChild(noKeeperBtn);

            // Must rest button
            const mustRestBtn = document.createElement('button');
            mustRestBtn.type = 'button';
            mustRestBtn.className = `pref-checkbox must-rest${player.mustRest ? ' active' : ''}`;
            mustRestBtn.dataset.player = player.name;
            mustRestBtn.dataset.pref = 'mustRest';
            mustRestBtn.setAttribute('aria-label', `Toggle must rest for ${player.name}`);
            mustRestBtn.setAttribute('aria-pressed', player.mustRest);
            mustRestBtn.title = 'Must Rest';
            mustRestBtn.textContent = 'R';
            prefsDiv.appendChild(mustRestBtn);

            // Status select
            const statusSelect = document.createElement('select');
            statusSelect.className = `player-status-select ${statusClass}`;
            statusSelect.dataset.player = player.name;
            statusSelect.setAttribute('aria-label', `Status for ${player.name}`);
            const statusOptions = [
                { value: 'available', text: '●' },
                { value: 'injured', text: '🩹' },
                { value: 'absent', text: '✖' }
            ];
            statusOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.text;
                option.selected = status === opt.value;
                statusSelect.appendChild(option);
            });
            prefsDiv.appendChild(statusSelect);

            container.appendChild(prefsDiv);
            li.appendChild(container);

            // Remove button
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.dataset.player = player.name;
            removeBtn.setAttribute('aria-label', `Remove ${player.name} from roster`);
            removeBtn.title = 'Remove player';
            removeBtn.textContent = '×';
            li.appendChild(removeBtn);

            list.appendChild(li);
        });

        // Also update evaluation list
        this.updateEvaluationList();
    }

    // Escape HTML attribute to prevent XSS
    escapeHtmlAttribute(str) {
        return str.replace(/[&<>"']/g, (char) => {
            const entities = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return entities[char];
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            }
        });

        // Update tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });

        const targetPane = `${tabName}-tab`;
        const paneEl = document.getElementById(targetPane);
        if (paneEl) {
            paneEl.classList.add('active');
        }

        // Update evaluation list when switching to evaluation tab
        if (tabName === 'evaluation') {
            this.updateEvaluationList();
        }

        // Render season stats when switching to season tab
        if (tabName === 'season') {
            this.renderSeasonStats();
        }
    }

    updateEvaluationList() {
        const evalList = document.getElementById('evaluationPlayerList');
        evalList.textContent = '';

        if (this.players.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'evaluation-empty';
            emptyDiv.textContent = 'No players added yet. Add players in the Roster Management tab.';
            evalList.appendChild(emptyDiv);
            return;
        }

        this.players.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'evaluation-player-item';

            // Player name div
            const nameDiv = document.createElement('div');
            nameDiv.className = 'eval-player-name';
            nameDiv.appendChild(document.createTextNode(player.name));
            if (player.number) {
                const numberSpan = document.createElement('span');
                numberSpan.className = 'eval-player-number';
                numberSpan.textContent = `#${player.number}`;
                nameDiv.appendChild(numberSpan);
            }
            playerDiv.appendChild(nameDiv);

            // Rating group
            const ratingGroup = document.createElement('div');
            ratingGroup.className = 'eval-rating-group';
            const ratingLabel = document.createElement('label');
            ratingLabel.setAttribute('for', `rating-${index}`);
            ratingLabel.textContent = 'Rating';
            ratingGroup.appendChild(ratingLabel);

            const ratingSelect = document.createElement('select');
            ratingSelect.id = `rating-${index}`;
            ratingSelect.addEventListener('change', () => this.updatePlayerRating(index, ratingSelect.value));
            const ratingOptions = [
                { value: '', text: '-' },
                { value: '1', text: '1 - Limited' },
                { value: '2', text: '2 - Fair' },
                { value: '3', text: '3 - Average' },
                { value: '4', text: '4 - Very Accomplished' },
                { value: '5', text: '5 - Excellent' }
            ];
            ratingOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.text;
                option.selected = player.rating === parseInt(opt.value);
                ratingSelect.appendChild(option);
            });
            ratingGroup.appendChild(ratingSelect);
            playerDiv.appendChild(ratingGroup);

            // Comment group
            const commentGroup = document.createElement('div');
            commentGroup.className = 'eval-comment-group';
            const commentLabel = document.createElement('label');
            commentLabel.setAttribute('for', `comment-${index}`);
            commentLabel.textContent = 'Comments / Parental Support';
            commentGroup.appendChild(commentLabel);

            const textarea = document.createElement('textarea');
            textarea.id = `comment-${index}`;
            textarea.placeholder = 'Enter comments about player skill or parental support...';
            textarea.value = player.comment || '';
            textarea.addEventListener('change', () => this.updatePlayerComment(index, textarea.value));
            commentGroup.appendChild(textarea);
            playerDiv.appendChild(commentGroup);

            evalList.appendChild(playerDiv);
        });
    }

    updatePlayerRating(index, rating) {
        if (this.players[index]) {
            this.players[index].rating = rating ? parseInt(rating) : null;
            this.savePlayers();
        }
    }

    updatePlayerComment(index, comment) {
        if (this.players[index]) {
            this.players[index].comment = comment.trim();
            this.savePlayers();
        }
    }

    toggleCaptain(playerName) {
        const player = this.players.find(p => p.name === playerName);
        if (!player) return;

        const checkbox = event.target;
        const isChecked = checkbox.checked;

        if (isChecked) {
            // Adding captain
            if (this.captains.length >= 2) {
                // Remove the first captain and add the new one
                const removedCaptain = this.captains.shift();
                const removedPlayer = this.players.find(p => p.name === removedCaptain);
                if (removedPlayer) {
                    removedPlayer.isCaptain = false;
                }
                // Update the UI for the removed captain
                this.updatePlayerList();
                this.showNotification(`Captain limit reached. Replaced ${removedCaptain} with ${playerName}`, 'info');
            } else {
                this.showNotification(`${playerName} is now a captain`, 'success');
            }
            this.captains.push(playerName);
            player.isCaptain = true;
        } else {
            // Removing captain
            const index = this.captains.indexOf(playerName);
            if (index > -1) {
                this.captains.splice(index, 1);
            }
            player.isCaptain = false;
            this.showNotification(`${playerName} is no longer a captain`, 'info');
        }

        // Refresh the player list to update checkboxes and icons
        this.updatePlayerList();
        this.savePlayers();
    }

    toggleRestPreference(playerName) {
        const player = this.players.find(p => p.name === playerName);
        if (!player) return;

        player.mustRest = !player.mustRest;
        this.savePlayers();

        if (player.mustRest) {
            this.showNotification(`${playerName} will rest at least 1 quarter`, 'success');
        } else {
            this.showNotification(`${playerName} may play all quarters`, 'info');
        }
    }

    toggleNoKeeperPreference(playerName) {
        const player = this.players.find(p => p.name === playerName);
        if (!player) return;

        player.noKeeper = !player.noKeeper;
        this.savePlayers();

        if (player.noKeeper) {
            this.showNotification(`${playerName} will not play keeper`, 'success');
        } else {
            this.showNotification(`${playerName} may play keeper`, 'info');
        }
    }

    updatePlayerNumber(playerIndex, value) {
        const number = value ? parseInt(value) : null;

        // Check if number is already taken by another player
        if (number !== null && this.players.some((p, idx) => idx !== playerIndex && p.number === number)) {
            this.showNotification(`Number ${number} is already taken`, 'warning');
            // Reset the input value
            this.updatePlayerList();
            return;
        }

        this.players[playerIndex].number = number;
        this.savePlayers();
        this.showNotification(`Updated player number`, 'success');
    }

    getPositionsForFormation(formation) {
        // For 11v11 (14U-19U)
        if (this.playersOnField === 11) {
            switch(formation) {
                case '4-3-3':
                    return ['Keeper', 'Left Back', 'Left Center Back', 'Right Center Back', 'Right Back',
                            'Left Mid', 'Center Mid', 'Right Mid',
                            'Left Wing', 'Striker', 'Right Wing'];
                case '4-4-2':
                    return ['Keeper', 'Left Back', 'Left Center Back', 'Right Center Back', 'Right Back',
                            'Left Mid', 'Left Center Mid', 'Right Center Mid', 'Right Mid',
                            'Left Striker', 'Right Striker'];
                case '4-2-3-1':
                    return ['Keeper', 'Left Back', 'Left Center Back', 'Right Center Back', 'Right Back',
                            'Left Defensive Mid', 'Right Defensive Mid',
                            'Left Wing', 'Attacking Mid', 'Right Wing',
                            'Striker'];
                case '3-5-2':
                    return ['Keeper', 'Left Center Back', 'Center Back', 'Right Center Back',
                            'Left Wing Back', 'Left Mid', 'Center Mid', 'Right Mid', 'Right Wing Back',
                            'Left Striker', 'Right Striker'];
                case '5-3-2':
                    return ['Keeper', 'Left Wing Back', 'Left Center Back', 'Center Back', 'Right Center Back', 'Right Wing Back',
                            'Left Mid', 'Center Mid', 'Right Mid',
                            'Left Striker', 'Right Striker'];
                default:
                    return this.getPositionsForFormation('4-4-2');
            }
        }
        // For 9v9 (12U standard)
        else if (this.playersOnField === 9) {
            switch(formation) {
                case '3-3-2':
                    return ['Keeper', 'Left Back', 'Center Back', 'Right Back', 
                            'Left Mid', 'Center Mid', 'Right Mid', 
                            'Left Forward', 'Right Forward'];
                case '3-2-3':
                    return ['Keeper', 'Left Back', 'Center Back', 'Right Back', 
                            'Left Mid', 'Right Mid', 
                            'Left Wing', 'Striker', 'Right Wing'];
                case '2-3-3':
                    return ['Keeper', 'Left Back', 'Right Back', 
                            'Left Mid', 'Center Mid', 'Right Mid', 
                            'Left Wing', 'Striker', 'Right Wing'];
                default:
                    return this.getPositionsForFormation('3-3-2');
            }
        }
        // For 7v7 (10U standard)
        else if (this.playersOnField === 7 || this.playersOnField === 6) {
            switch(formation) {
                case '2-3-1':
                    if (this.playersOnField === 6) {
                        return ['Keeper', 'Left Back', 'Right Back', 'Left Mid', 'Right Mid', 'Striker'];
                    }
                    return ['Keeper', 'Left Back', 'Right Back', 'Left Wing', 'Right Wing', 'Center Mid', 'Striker'];
                case '3-2-1':
                    if (this.playersOnField === 6) {
                        return ['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Mid', 'Striker'];
                    }
                    return ['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Mid', 'Right Mid', 'Striker'];
                case '2-2-2':
                    if (this.playersOnField === 6) {
                        return ['Keeper', 'Left Back', 'Right Back', 'Left Mid', 'Right Mid', 'Striker'];
                    }
                    return ['Keeper', 'Left Back', 'Right Back', 'Left Mid', 'Right Mid', 'Left Striker', 'Right Striker'];
                case '3-3':
                    if (this.playersOnField === 6) {
                        return ['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Mid', 'Center Mid', 'Right Mid'];
                    }
                    return ['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Mid', 'Center Mid', 'Right Mid'];
                default:
                    return this.getPositionsForFormation('2-3-1');
            }
        }
        // For other field sizes, use default formations
        else if (this.playersOnField === 5) {
            return ['Keeper', 'Left Back', 'Right Back', 'Midfield', 'Striker'];
        }
        // Default fallback to 7v7 2-3-1 formation
        return ['Keeper', 'Left Back', 'Right Back', 'Left Wing', 'Right Wing', 'Center Mid', 'Striker'];
    }
    
    updatePositions() {
        this.positions = this.getPositionsForFormation(this.formation);
    }
    
    updateFieldOptions() {
        const fieldSelect = document.getElementById('fieldPlayers');
        fieldSelect.innerHTML = '';
        
        switch(this.ageDivision) {
            case '10U':
                fieldSelect.innerHTML = `
                    <option value="7">7v7 (Standard)</option>
                    <option value="6">6v6 (Small-sided)</option>
                `;
                this.playersOnField = 7;
                break;
            case '12U':
                fieldSelect.innerHTML = `
                    <option value="9">9v9 (Standard)</option>
                `;
                this.playersOnField = 9;
                break;
            case '14U':
            case '16U':
            case '19U':
                fieldSelect.innerHTML = `
                    <option value="11">11v11 (Full Field)</option>
                `;
                this.playersOnField = 11;
                break;
        }
        
        fieldSelect.value = this.playersOnField;
    }
    
    updateFormationOptions() {
        const formationSelect = document.getElementById('formation');
        const currentValue = formationSelect.value;
        
        // Clear existing options
        formationSelect.innerHTML = '';
        
        if (this.playersOnField === 11) {
            // 11v11 formations for 14U-19U
            formationSelect.innerHTML = `
                <option value="4-3-3">4-3-3 (Attacking)</option>
                <option value="4-4-2">4-4-2 (Balanced)</option>
                <option value="4-2-3-1">4-2-3-1 (Modern)</option>
                <option value="3-5-2">3-5-2 (Midfield Heavy)</option>
                <option value="5-3-2">5-3-2 (Defensive)</option>
            `;
            // Set default formation for 11v11 if current is not valid
            if (!['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '5-3-2'].includes(currentValue)) {
                this.formation = '4-4-2';
            }
        } else if (this.playersOnField === 9) {
            // 9v9 formations for 12U
            formationSelect.innerHTML = `
                <option value="3-3-2">3-3-2 (Balanced)</option>
                <option value="3-2-3">3-2-3 (Attacking)</option>
                <option value="2-3-3">2-3-3 (Very Attacking)</option>
            `;
            // Set default formation for 9v9 if current is not valid
            if (!['3-3-2', '3-2-3', '2-3-3'].includes(currentValue)) {
                this.formation = '3-3-2';
            }
        } else {
            // 7v7 and 6v6 formations for 10U
            formationSelect.innerHTML = `
                <option value="2-3-1">2-3-1 (Balanced)</option>
                <option value="3-2-1">3-2-1 (Defensive)</option>
                <option value="2-2-2">2-2-2 (Paired)</option>
                <option value="3-3">3-3 (Midfield Heavy)</option>
            `;
            // Set default formation for 7v7 if current is not valid
            if (!['2-3-1', '3-2-1', '2-2-2', '3-3'].includes(currentValue)) {
                this.formation = '2-3-1';
            }
        }
        
        // Set the selected value
        formationSelect.value = this.formation;
        this.updateFormationDescription();
    }
    
    updateAgeRules() {
        const rulesDiv = document.getElementById('ageRules');
        if (!rulesDiv) return;
        
        const rules = {
            '10U': '<strong>10U Rules:</strong> 7v7 format with build-out line. No heading allowed. Offside enforced with build-out line. Substitutions at quarters. Small-sided field.',
            '12U': '<strong>12U Rules:</strong> 9v9 format. Full offside rule (no build-out line). No heading allowed. Larger small-sided field. Players develop tactical understanding.',
            '14U': '<strong>14U Rules:</strong> 11v11 format on full-size field. All FIFA laws apply including offside. Heading permitted in games and practices. More complex tactics.',
            '16U': '<strong>16U Rules:</strong> 11v11 format on full-size field. All standard soccer rules apply. Faster-paced, more physical play. Often combined with 19U.',
            '19U': '<strong>19U Rules:</strong> 11v11 format on full-size field. All standard soccer rules apply. Highest youth level with competitive, physical play.'
        };
        
        rulesDiv.innerHTML = `<p>${rules[this.ageDivision] || rules['10U']}</p>`;
    }
    
    updateFormationDescription() {
        const descriptions = {
            // 7v7 formations
            '2-3-1': '<strong>2-3-1 Formation:</strong> Provides a solid balance between defense and offense. Easy for players to understand with clear roles: 2 defenders (LB, RB), 3 midfielders (LW, Mid, RW), and 1 striker.',
            '3-2-1': '<strong>3-2-1 Formation:</strong> More defensive formation with an extra defender. Useful against stronger opponents or to develop defensive skills. Can leave the striker isolated if not managed well.',
            '2-2-2': '<strong>2-2-2 Formation:</strong> Creates two lines of paired players. Good for teams with strong partnerships. May lack natural width, requiring midfielders to cover more ground.',
            '3-3': '<strong>3-3 Formation:</strong> No dedicated striker - focuses on ball control and possession through midfield dominance. Three defenders provide solid protection while three midfielders maintain width and creativity. Emphasizes passing and teamwork over individual scoring.',
            // 9v9 formations
            '3-3-2': '<strong>3-3-2 Formation:</strong> Balanced 9v9 formation with strong defense and midfield. Three defenders provide width and security, three midfielders control the center, and two forwards maintain attacking threat.',
            '3-2-3': '<strong>3-2-3 Formation:</strong> Attacking 9v9 formation with three forwards. Good for teams with strong offensive players. Requires disciplined midfielders to cover defensive gaps.',
            '2-3-3': '<strong>2-3-3 Formation:</strong> Very attacking 9v9 formation. Strong midfield presence with three forwards. Best for teams with pacey defenders who can cover ground quickly.',
            // 11v11 formations
            '4-3-3': '<strong>4-3-3 Formation:</strong> Classic attacking formation with width from wingers. Four defenders provide solid base, three midfielders control the center, and three forwards offer multiple attacking options.',
            '4-4-2': '<strong>4-4-2 Formation:</strong> Traditional balanced formation. Four defenders, four midfielders in a line, and two strikers. Simple to understand and provides good coverage across the field.',
            '4-2-3-1': '<strong>4-2-3-1 Formation:</strong> Modern formation with two defensive midfielders providing protection. Three attacking midfielders support a lone striker. Flexible and allows for quick transitions.',
            '3-5-2': '<strong>3-5-2 Formation:</strong> Midfield-heavy formation with wing backs providing width. Three center backs, five midfielders including wing backs, and two strikers. Dominates midfield battles.',
            '5-3-2': '<strong>5-3-2 Formation:</strong> Defensive formation with five at the back including wing backs. Three midfielders and two strikers. Solid defensively while maintaining counter-attacking threat.'
        };
        
        const descDiv = document.getElementById('formationDescription');
        if (descDiv) {
            descDiv.innerHTML = `<p>${descriptions[this.formation] || descriptions['2-3-1']}</p>`;
        }
    }
    
    showWelcomeMessage() {
        // Only show on first visit
        if (!this.safeGetFromStorage(CONSTANTS.STORAGE_KEYS.VISITED)) {
            this.safeSetToStorage(CONSTANTS.STORAGE_KEYS.VISITED, 'true');
            setTimeout(() => {
                this.showNotification('Welcome to AYSO Roster Pro! Add players to get started.', 'info');
            }, CONSTANTS.WELCOME_MESSAGE_DELAY_MS);
        }
    }

    // Loading indicator methods
    showLoading(message = 'Generating lineup...') {
        // Remove any existing loading overlay
        this.hideLoading();

        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.id = 'loadingOverlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">${message}</div>
            <div class="loading-progress" id="loadingProgress"></div>
        `;
        document.body.appendChild(overlay);
    }

    updateLoadingProgress(text) {
        const progress = document.getElementById('loadingProgress');
        if (progress) {
            progress.textContent = text;
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.remove();
        }
    }

    async generateLineup() {
        // Filter out unavailable players
        const availablePlayers = this.players.filter(p =>
            p.status === CONSTANTS.PLAYER_STATUS.AVAILABLE || !p.status
        );

        if (availablePlayers.length < this.playersOnField) {
            this.showNotification(`Need at least ${this.playersOnField} available players. Currently have ${availablePlayers.length}.`, 'error');
            return;
        }

        // Additional warning for small rosters
        const recommendedPlayers = Math.ceil(this.playersOnField * 1.5);
        if (availablePlayers.length < recommendedPlayers) {
            this.showNotification(`Note: With ${availablePlayers.length} players, some rotation rules may be challenging. Recommend ${recommendedPlayers}+ players.`, 'warning');
        }

        // Cache season stats for performance during generation
        this.seasonStatsCache = this.getPlayerStats();

        const maxAttempts = CONSTANTS.MAX_GENERATION_ATTEMPTS;
        let attempts = 0;
        let validation = [];
        let bestLineup = null;
        let bestValidationCount = Infinity;

        // Show loading indicator
        this.showLoading('Generating lineup...');
        const generateBtn = document.getElementById('generateLineup');
        const originalText = generateBtn.textContent;
        generateBtn.disabled = true;

        // Keep trying until we get a valid lineup or hit max attempts
        do {
            attempts++;
            this.updateLoadingProgress(`Attempt ${attempts} of ${maxAttempts}`);

            // Add a small delay to allow UI to update
            if (attempts > 1) {
                await new Promise(resolve => setTimeout(resolve, CONSTANTS.GENERATION_DELAY_MS));
            }
            
            // Reset player stats
            this.players.forEach(player => {
                player.quartersPlayed = [];
                player.quartersSitting = [];
                player.positionsPlayed = [];
                player.goalieQuarter = null;
                player.defensiveQuarters = 0;
                player.offensiveQuarters = 0;
            });

            this.lineup = [];

            // Calculate how many quarters each player should sit
            const totalPlayerQuarters = this.players.length * this.quarters;
            const totalFieldQuarters = this.playersOnField * this.quarters;
            const totalSittingQuarters = totalPlayerQuarters - totalFieldQuarters;
            const avgSittingPerPlayer = totalSittingQuarters / this.players.length;
            
            // Determine sitting distribution
            const sittingSchedule = this.determineSittingSchedule();
            
            // Generate lineup for each quarter
            for (let quarter = 1; quarter <= this.quarters; quarter++) {
                const quarterLineup = this.generateQuarterLineup(quarter, sittingSchedule);
                this.lineup.push(quarterLineup);
            }

            // Validate the generated lineup
            validation = this.validateLineup();
            
            // Keep track of the best lineup found
            if (validation.length < bestValidationCount) {
                bestValidationCount = validation.length;
                bestLineup = JSON.parse(JSON.stringify(this.lineup));
            }
            
        } while (validation.length > 0 && attempts < maxAttempts);

        // Hide loading and reset button
        this.hideLoading();
        generateBtn.textContent = originalText;
        generateBtn.disabled = false;

        // If we hit max attempts, use the best lineup found
        if (attempts >= maxAttempts && validation.length > 0) {
            if (bestLineup) {
                this.lineup = bestLineup;
                validation = this.validateLineup();
            }
            console.warn(`Generated lineup after ${attempts} attempts with ${validation.length} minor issues.`);
            if (validation.length > 0) {
                this.showNotification(`Generated best possible lineup after ${attempts} attempts`, 'info');
            }
        } else {
            this.showNotification('Lineup generated successfully', 'success');
        }
        
        // Automatically assign captains based on season history (rotation)
        this.captains = [];
        this.players.forEach(p => p.isCaptain = false);

        if (this.players.length >= 2) {
            const seasonStats = this.seasonStatsCache || this.getPlayerStats();

            // Filter to available players only
            const availablePlayers = this.players.filter(p =>
                p.status === CONSTANTS.PLAYER_STATUS.AVAILABLE || !p.status
            );

            // Sort by captain games ascending (players who've been captain less get priority)
            const sortedPlayers = [...availablePlayers].sort((a, b) => {
                const captainA = seasonStats[a.name]?.captainGames || 0;
                const captainB = seasonStats[b.name]?.captainGames || 0;
                return captainA - captainB;
            });

            // Get minimum captain count
            const minCaptain = seasonStats[sortedPlayers[0]?.name]?.captainGames || 0;

            // Filter to players with minimum captain games
            const lowestCaptainGroup = sortedPlayers.filter(p =>
                (seasonStats[p.name]?.captainGames || 0) === minCaptain
            );

            // Shuffle within the lowest group for variety
            this.shuffleArray(lowestCaptainGroup);

            // Select captains from lowest group first
            for (let i = 0; i < Math.min(2, lowestCaptainGroup.length); i++) {
                const player = lowestCaptainGroup[i];
                player.isCaptain = true;
                this.captains.push(player.name);
            }

            // If we need more captains (less than 2 in lowest group), take from next tier
            if (this.captains.length < 2 && sortedPlayers.length > lowestCaptainGroup.length) {
                const remaining = sortedPlayers.filter(p => !this.captains.includes(p.name));
                this.shuffleArray(remaining);
                for (let i = 0; i < Math.min(2 - this.captains.length, remaining.length); i++) {
                    const player = remaining[i];
                    player.isCaptain = true;
                    this.captains.push(player.name);
                }
            }

            // Update player list to reflect new captains
            this.updatePlayerList();
        }

        // Clear season stats cache
        this.seasonStatsCache = null;

        this.displayLineup(validation);
        this.savePlayers();
    }

    determineSittingSchedule() {
        const totalPlayers = this.players.length;
        const playersPerQuarter = this.playersOnField;
        const sittingPerQuarter = totalPlayers - playersPerQuarter;

        // Get season stats for sitting priority
        const seasonStats = this.seasonStatsCache || this.getPlayerStats();

        // Initialize sitting schedule
        const schedule = {
            1: [],
            2: [],
            3: [],
            4: []
        };

        // Create a copy of players to track sitting assignments
        const playersCopy = this.players.map(p => ({
            name: p.name,
            mustRest: p.mustRest,
            sittingQuarters: []
        }));

        // Separate players who must rest from others
        const mustRestPlayers = playersCopy.filter(p => p.mustRest);
        const regularPlayers = playersCopy.filter(p => !p.mustRest);

        // Sort regular players by season sitting history (ascending avg sitting = higher priority to sit now)
        // Players who've sat less across the season should sit more now
        regularPlayers.sort((a, b) => {
            const statsA = seasonStats[a.name] || { totalSitting: 0, gamesPlayed: 0 };
            const statsB = seasonStats[b.name] || { totalSitting: 0, gamesPlayed: 0 };

            // Calculate average sitting per game (normalize for players with different game counts)
            const avgSitA = statsA.gamesPlayed > 0 ? statsA.totalSitting / statsA.gamesPlayed : 0;
            const avgSitB = statsB.gamesPlayed > 0 ? statsB.totalSitting / statsB.gamesPlayed : 0;

            // Players with lower average sitting should sit more (appear first)
            return avgSitA - avgSitB;
        });

        // Add small randomness within similar sitting averages to prevent deterministic lineups
        // Group players with similar averages and shuffle within groups
        this.shuffleWithinSimilarGroups(regularPlayers, (p) => {
            const stats = seasonStats[p.name] || { totalSitting: 0, gamesPlayed: 0 };
            return stats.gamesPlayed > 0 ? Math.round(stats.totalSitting / stats.gamesPlayed * 2) / 2 : 0;
        });

        // Calculate how many times each player should sit
        const totalSittingSlots = sittingPerQuarter * this.quarters;
        const minSitsPerPlayer = Math.floor(totalSittingSlots / totalPlayers);
        const playersWithExtraSit = totalSittingSlots % totalPlayers;
        
        // Assign sitting quarters to ensure even distribution and no consecutive sitting
        let quarterIndex = 0;

        // First pass: Ensure players who must rest get at least 1 sitting quarter
        mustRestPlayers.forEach(player => {
            let assignedQuarter = this.findNonConsecutiveSittingQuarter(player.sittingQuarters, schedule);
            if (assignedQuarter !== -1) {
                player.sittingQuarters.push(assignedQuarter);
                schedule[assignedQuarter].push(player.name);
            }
        });

        // Combine all players for remaining assignments
        const allPlayersCombined = [...mustRestPlayers, ...regularPlayers];

        // Second pass: assign minimum sits to all players (skipping those already assigned)
        for (let i = 0; i < minSitsPerPlayer; i++) {
            allPlayersCombined.forEach((player, idx) => {
                // Skip if player already has enough sits
                if (player.sittingQuarters.length > i) return;

                // Find a quarter where the player hasn't sat yet and won't sit consecutively
                let assignedQuarter = this.findNonConsecutiveSittingQuarter(player.sittingQuarters, schedule);
                if (assignedQuarter !== -1) {
                    player.sittingQuarters.push(assignedQuarter);
                    schedule[assignedQuarter].push(player.name);
                }
            });
        }

        // Third pass: select players who need to sit extra based on season history
        // Players who've sat less this season get priority for extra sits
        const playersForExtraSit = [...allPlayersCombined];
        playersForExtraSit.sort((a, b) => {
            const statsA = seasonStats[a.name] || { totalSitting: 0, gamesPlayed: 0 };
            const statsB = seasonStats[b.name] || { totalSitting: 0, gamesPlayed: 0 };
            const avgSitA = statsA.gamesPlayed > 0 ? statsA.totalSitting / statsA.gamesPlayed : 0;
            const avgSitB = statsB.gamesPlayed > 0 ? statsB.totalSitting / statsB.gamesPlayed : 0;
            return avgSitA - avgSitB;
        });
        // Shuffle within similar groups for variety
        this.shuffleWithinSimilarGroups(playersForExtraSit, (p) => {
            const stats = seasonStats[p.name] || { totalSitting: 0, gamesPlayed: 0 };
            return stats.gamesPlayed > 0 ? Math.round(stats.totalSitting / stats.gamesPlayed * 2) / 2 : 0;
        });

        let playersAssigned = 0;
        for (let i = 0; i < playersForExtraSit.length && playersAssigned < playersWithExtraSit; i++) {
            const player = playersForExtraSit[i];
            // Skip if they already have enough quarters
            const neededSits = minSitsPerPlayer + 1;
            if (player.sittingQuarters.length >= neededSits) continue;

            let assignedQuarter = this.findNonConsecutiveSittingQuarter(player.sittingQuarters, schedule);
            if (assignedQuarter !== -1) {
                player.sittingQuarters.push(assignedQuarter);
                schedule[assignedQuarter].push(player.name);
                playersAssigned++;
            }
        }
        
        return schedule;
    }

    findNonConsecutiveSittingQuarter(currentSittingQuarters, schedule) {
        // Try to find a quarter where:
        // 1. Player hasn't sat yet
        // 2. Won't create consecutive sitting
        // 3. Quarter isn't full
        
        const quartersToTry = [1, 3, 2, 4]; // Prefer alternating quarters
        
        for (let q of quartersToTry) {
            // Check if quarter is not full
            const maxSitting = this.players.length - this.playersOnField;
            if (schedule[q].length >= maxSitting) continue;
            
            // Check if player already sits this quarter
            if (currentSittingQuarters.includes(q)) continue;
            
            // Check for consecutive sitting
            let isConsecutive = false;
            for (let sat of currentSittingQuarters) {
                if (Math.abs(sat - q) === 1) {
                    isConsecutive = true;
                    break;
                }
            }
            
            if (!isConsecutive) {
                return q;
            }
        }
        
        // If no perfect quarter found, still avoid consecutive sitting
        for (let q = 1; q <= 4; q++) {
            const maxSitting = this.players.length - this.playersOnField;
            if (schedule[q].length < maxSitting && !currentSittingQuarters.includes(q)) {
                // Still check for consecutive sitting even in fallback
                let isConsecutive = false;
                for (let sat of currentSittingQuarters) {
                    if (Math.abs(sat - q) === 1) {
                        isConsecutive = true;
                        break;
                    }
                }
                if (!isConsecutive) {
                    return q;
                }
            }
        }
        
        return -1;
    }

    generateQuarterLineup(quarter, sittingSchedule) {
        const quarterLineup = {
            quarter: quarter,
            positions: {}
        };

        // Determine who sits this quarter
        const sittingPlayers = sittingSchedule[quarter] || [];
        
        // Get players who will play this quarter
        const playingPlayers = this.players.filter(p => !sittingPlayers.includes(p.name));
        
        // Categorize positions as offensive or defensive
        const defensivePositions = this.positions.filter(p => 
            p.includes('Back') || p === 'Keeper'
        );
        const offensivePositions = this.positions.filter(p => 
            !p.includes('Back') && p !== 'Keeper'
        );

        // Assign positions for this quarter
        const positionsToFill = [...this.positions];
        const assignedPlayers = new Map();
        
        // First, assign goalkeeper (special handling)
        const keeperIndex = positionsToFill.indexOf('Keeper');
        if (keeperIndex !== -1) {
            const keeper = this.selectKeeper(playingPlayers, quarter);
            if (keeper) {
                quarterLineup.positions['Keeper'] = keeper.name;
                keeper.quartersPlayed.push(quarter);
                keeper.positionsPlayed.push({ quarter, position: 'Keeper' });
                keeper.goalieQuarter = quarter;
                // Track keeper as defensive role
                keeper.defensiveQuarters = (keeper.defensiveQuarters || 0) + 1;
                assignedPlayers.set('Keeper', keeper);
                playingPlayers.splice(playingPlayers.indexOf(keeper), 1);
                positionsToFill.splice(keeperIndex, 1);
            }
        }

        // Create position-player assignments prioritizing unique positions
        const assignments = this.assignPositionsOptimally(playingPlayers, positionsToFill, defensivePositions);
        
        // Apply the assignments
        assignments.forEach(({ position, player }) => {
            quarterLineup.positions[position] = player.name;
            player.quartersPlayed.push(quarter);
            player.positionsPlayed.push({ quarter, position });
            
            // Track role type
            if (defensivePositions.includes(position)) {
                player.defensiveQuarters = (player.defensiveQuarters || 0) + 1;
            } else {
                player.offensiveQuarters = (player.offensiveQuarters || 0) + 1;
            }
        });

        // Mark sitting players
        this.players.forEach(player => {
            if (sittingPlayers.includes(player.name)) {
                player.quartersSitting.push(quarter);
            }
        });

        return quarterLineup;
    }
    
    assignPositionsOptimally(players, positions, defensivePositions) {
        const assignments = [];
        const remainingPlayers = [...players];
        const remainingPositions = [...positions];

        // Get season stats for position variety bonus
        const seasonStats = this.seasonStatsCache || this.getPlayerStats();

        // Shuffle positions to vary assignment order across quarters
        this.shuffleArray(remainingPositions);

        // First pass: Assign positions prioritizing players who haven't played them
        for (let i = remainingPositions.length - 1; i >= 0; i--) {
            const position = remainingPositions[i];
            const isDefensive = defensivePositions.includes(position);

            // Sort remaining players by priority for this position
            const scoredPlayers = remainingPlayers.map(player => {
                const hasPlayedPosition = player.positionsPlayed.some(p => p.position === position);
                const timesPlayedPosition = player.positionsPlayed.filter(p => p.position === position).length;
                const defensive = player.defensiveQuarters || 0;
                const offensive = player.offensiveQuarters || 0;

                let score = 0;

                // Heavily penalize if already played this position THIS GAME (-1000)
                if (hasPlayedPosition) {
                    score -= 1000 * timesPlayedPosition;
                }

                // Strongly prioritize role balance to prevent extreme D/O imbalances
                // Calculate the imbalance this assignment would create
                const currentImbalance = Math.abs(defensive - offensive);
                let projectedImbalance;
                if (isDefensive) {
                    projectedImbalance = Math.abs((defensive + 1) - offensive);
                    // Reward players who need more defense (have played more offense)
                    score += (offensive - defensive) * 100;
                } else {
                    projectedImbalance = Math.abs(defensive - (offensive + 1));
                    // Reward players who need more offense (have played more defense)
                    score += (defensive - offensive) * 100;
                }

                // Extra penalty for making the imbalance worse
                if (projectedImbalance > currentImbalance) {
                    score -= 200 * (projectedImbalance - currentImbalance);
                }

                // Season position variety bonus (+50 to +200)
                // Reward positions this player has played less across the season
                const playerSeasonStats = seasonStats[player.name];
                if (playerSeasonStats && playerSeasonStats.positions) {
                    const timesPlayedPositionSeason = playerSeasonStats.positions[position] || 0;
                    const totalPositionsPlayed = Object.values(playerSeasonStats.positions).reduce((a, b) => a + b, 0);
                    if (totalPositionsPlayed > 0) {
                        // Calculate what percentage of their positions this has been
                        const positionPct = timesPlayedPositionSeason / totalPositionsPlayed;
                        // Bonus for positions played less this season (0-200 points)
                        score += (1 - positionPct) * 200;
                    } else {
                        // No season history, give neutral bonus
                        score += 100;
                    }
                } else {
                    // No season history for this player, give neutral bonus
                    score += 100;
                }

                // Add small random factor to vary assignments
                score += Math.random() * 5;

                return { player, score };
            });
            
            // Sort by score (highest first)
            scoredPlayers.sort((a, b) => b.score - a.score);
            
            if (scoredPlayers.length > 0) {
                const chosen = scoredPlayers[0];
                assignments.push({ 
                    position, 
                    player: chosen.player 
                });
                
                const playerIndex = remainingPlayers.indexOf(chosen.player);
                remainingPlayers.splice(playerIndex, 1);
                remainingPositions.splice(i, 1);
            }
        }
        
        // Handle any remaining assignments (shouldn't happen)
        while (remainingPositions.length > 0 && remainingPlayers.length > 0) {
            assignments.push({ 
                position: remainingPositions.shift(), 
                player: remainingPlayers.shift() 
            });
        }
        
        return assignments;
    }
    
    sortPlayersByRoleBalance(players) {
        return players.sort((a, b) => {
            const aDefensive = a.defensiveQuarters || 0;
            const aOffensive = a.offensiveQuarters || 0;
            const bDefensive = b.defensiveQuarters || 0;
            const bOffensive = b.offensiveQuarters || 0;
            
            // Calculate imbalance (higher number means more imbalanced)
            const aImbalance = Math.abs(aDefensive - aOffensive);
            const bImbalance = Math.abs(bDefensive - bOffensive);
            
            // Prioritize players with more imbalance
            return bImbalance - aImbalance;
        });
    }
    
    selectPlayerForBalancedRole(availablePlayers, position) {
        const isDefensive = position.includes('Back') || position === 'Keeper';
        
        // First, filter out players who have already played this position
        const playersWhoHaventPlayedPosition = availablePlayers.filter(player => {
            const hasPlayedPosition = player.positionsPlayed.some(p => p.position === position);
            return !hasPlayedPosition;
        });
        
        // Use filtered list if we have options, otherwise use all available
        const candidatePlayers = playersWhoHaventPlayedPosition.length > 0 
            ? playersWhoHaventPlayedPosition 
            : availablePlayers;
        
        // Find players who need this type of position most (offensive vs defensive balance)
        const prioritizedPlayers = candidatePlayers.filter(player => {
            const defensive = player.defensiveQuarters || 0;
            const offensive = player.offensiveQuarters || 0;
            
            if (isDefensive) {
                // Prioritize players who have played less defense
                return defensive <= offensive;
            } else {
                // Prioritize players who have played less offense
                return offensive <= defensive;
            }
        });
        
        // If we have prioritized players, choose from them, otherwise choose any
        const pool = prioritizedPlayers.length > 0 ? prioritizedPlayers : candidatePlayers;
        
        // Return the first player from the pool (already sorted by need)
        return pool[0];
    }

    selectKeeper(availablePlayers, quarter) {
        // First filter out players who should not play keeper
        const allowedKeepers = availablePlayers.filter(player => !player.noKeeper);

        // If no players are allowed to be keeper, fall back to all available players
        const poolToSelectFrom = allowedKeepers.length > 0 ? allowedKeepers : availablePlayers;

        // Find players who haven't been keeper yet THIS GAME from the allowed pool
        let potentialKeepers = poolToSelectFrom.filter(player => !player.goalieQuarter);

        if (potentialKeepers.length > 0) {
            // Use season stats to prioritize players who've been goalkeeper less across the season
            const seasonStats = this.seasonStatsCache || this.getPlayerStats();

            // Sort by season goalkeeper quarters (ascending - fewer GK = higher priority)
            potentialKeepers.sort((a, b) => {
                const gkA = seasonStats[a.name]?.goalkeeperQuarters || 0;
                const gkB = seasonStats[b.name]?.goalkeeperQuarters || 0;
                return gkA - gkB;
            });

            // Get minimum GK count from the sorted list
            const minGK = seasonStats[potentialKeepers[0].name]?.goalkeeperQuarters || 0;

            // Filter to players with lowest GK count this season
            const lowestGKGroup = potentialKeepers.filter(p =>
                (seasonStats[p.name]?.goalkeeperQuarters || 0) === minGK
            );

            // Random selection within the lowest GK group for variety
            return lowestGKGroup[Math.floor(Math.random() * lowestGKGroup.length)];
        }

        // If all allowed players have been keeper this game, return any available player from the pool
        return poolToSelectFrom[0];
    }

    validateLineup() {
        const issues = [];

        this.players.forEach(player => {
            // Check goalie rule (max 1 quarter)
            const goalieQuarters = player.positionsPlayed.filter(p => p.position === 'Keeper').length;
            if (goalieQuarters > 1) {
                issues.push(`⚠️ ${player.name} is playing goalie for ${goalieQuarters} quarters (max 1)`);
            }

            // Check consecutive sitting
            for (let i = 0; i < player.quartersSitting.length - 1; i++) {
                if (player.quartersSitting[i + 1] === player.quartersSitting[i] + 1) {
                    issues.push(`⚠️ ${player.name} sits consecutively in quarters ${player.quartersSitting[i]} and ${player.quartersSitting[i + 1]}`);
                }
            }

            // Check total sitting (max 2 quarters)
            if (player.quartersSitting.length > 2) {
                issues.push(`⚠️ ${player.name} sits for ${player.quartersSitting.length} quarters (max 2)`);
            }

            // Check offensive/defensive balance
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

                // Check D/O imbalance - difference should not exceed 1
                const doImbalance = Math.abs(defensiveQuarters - offensiveQuarters);
                if (doImbalance > 1) {
                    issues.push(`⚠️ ${player.name} has D/O imbalance of ${doImbalance} (D:${defensiveQuarters} / O:${offensiveQuarters})`);
                }
            }

            // Check for duplicate positions
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

    displayLineup(validationIssues) {
        const display = document.getElementById('lineupDisplay');
        const grid = document.getElementById('lineupGrid');
        const validationDiv = document.getElementById('validationMessages');

        // Show validation messages using DOM APIs
        validationDiv.textContent = '';
        if (validationIssues.length > 0) {
            const h3 = document.createElement('h3');
            h3.textContent = 'Rotation Issues:';
            validationDiv.appendChild(h3);
            validationIssues.forEach(issue => {
                const p = document.createElement('p');
                p.textContent = issue;
                validationDiv.appendChild(p);
            });
            validationDiv.classList.add('has-issues');
        } else {
            const p = document.createElement('p');
            p.className = 'success';
            p.textContent = '✓ All rotation rules satisfied!';
            validationDiv.appendChild(p);
            validationDiv.classList.remove('has-issues');
        }

        // Display lineup grid
        grid.textContent = '';

        this.lineup.forEach(quarter => {
            const quarterDiv = document.createElement('div');
            quarterDiv.className = 'quarter-lineup';

            // Quarter heading
            const h3 = document.createElement('h3');
            h3.textContent = `Quarter ${quarter.quarter}`;
            quarterDiv.appendChild(h3);

            // Add soccer field visualization (returns DOM element)
            quarterDiv.appendChild(this.createFieldVisualization(quarter));

            // Create positions table
            const table = document.createElement('table');

            this.positions.forEach(position => {
                const playerName = quarter.positions[position] || 'TBD';
                const player = this.players.find(p => p.name === playerName);
                const isKeeper = position === 'Keeper';

                const tr = document.createElement('tr');
                if (isKeeper) tr.className = 'keeper-row';

                const tdPosition = document.createElement('td');
                tdPosition.className = 'position';
                tdPosition.textContent = `${position}:`;
                tr.appendChild(tdPosition);

                const tdPlayer = document.createElement('td');
                tdPlayer.className = 'player-name';
                if (player && player.number) {
                    const numberSpan = document.createElement('span');
                    numberSpan.className = 'player-number';
                    numberSpan.textContent = `#${player.number}`;
                    tdPlayer.appendChild(numberSpan);
                    tdPlayer.appendChild(document.createTextNode(' '));
                }
                if (player && player.isCaptain) {
                    const starSpan = document.createElement('span');
                    starSpan.className = 'captain-star';
                    starSpan.textContent = '⭐';
                    tdPlayer.appendChild(starSpan);
                    tdPlayer.appendChild(document.createTextNode(' '));
                }
                tdPlayer.appendChild(document.createTextNode(playerName));
                tr.appendChild(tdPlayer);

                table.appendChild(tr);
            });

            // Show sitting players
            const sittingPlayers = this.players.filter(p => p.quartersSitting.includes(quarter.quarter));
            if (sittingPlayers.length > 0) {
                const tr = document.createElement('tr');
                tr.className = 'sitting-row';

                const tdPosition = document.createElement('td');
                tdPosition.className = 'position';
                tdPosition.textContent = 'Resting:';
                tr.appendChild(tdPosition);

                const tdPlayer = document.createElement('td');
                tdPlayer.className = 'player-name';
                sittingPlayers.forEach((p, idx) => {
                    if (idx > 0) tdPlayer.appendChild(document.createTextNode(', '));
                    if (p.number) {
                        const numberSpan = document.createElement('span');
                        numberSpan.className = 'player-number';
                        numberSpan.textContent = `#${p.number}`;
                        tdPlayer.appendChild(numberSpan);
                        tdPlayer.appendChild(document.createTextNode(' '));
                    }
                    if (p.isCaptain) {
                        const starSpan = document.createElement('span');
                        starSpan.className = 'captain-star';
                        starSpan.textContent = '⭐';
                        tdPlayer.appendChild(starSpan);
                        tdPlayer.appendChild(document.createTextNode(' '));
                    }
                    tdPlayer.appendChild(document.createTextNode(p.name));
                });
                tr.appendChild(tdPlayer);

                table.appendChild(tr);
            }

            quarterDiv.appendChild(table);
            grid.appendChild(quarterDiv);
        });

        // Remove any existing inline action buttons and player summary
        const existingInlineButtons = display.querySelector('.action-buttons-inline');
        if (existingInlineButtons) {
            existingInlineButtons.remove();
        }
        const existingSummary = display.querySelector('.player-summary');
        if (existingSummary) {
            existingSummary.remove();
        }

        // Create action buttons container
        const actionButtonsContainer = document.createElement('div');
        actionButtonsContainer.className = 'action-buttons-inline';

        // Create or update the regenerate button
        let regenerateBtn = document.getElementById('regenerateLineup');
        if (!regenerateBtn) {
            regenerateBtn = document.createElement('button');
            regenerateBtn.id = 'regenerateLineup';
            regenerateBtn.className = 'btn-export';
            regenerateBtn.style.background = '#3498db';
            regenerateBtn.setAttribute('aria-label', 'Regenerate a new lineup with different positions');
            regenerateBtn.textContent = 'Regenerate Lineup';
            regenerateBtn.addEventListener('click', () => this.generateLineup());
        }

        // Get the existing buttons
        const copyBtn = document.getElementById('copyLineup');
        const shareBtn = document.getElementById('shareLineup');
        const csvBtn = document.getElementById('exportCSV');
        const exportBtn = document.getElementById('exportLineup');
        const printBtn = document.getElementById('printLineup');
        const saveGameBtn = document.getElementById('saveGame');

        // Clone the buttons so we can place them in the new location
        const regenerateBtnClone = regenerateBtn.cloneNode(true);
        regenerateBtnClone.addEventListener('click', () => this.generateLineup());
        const copyBtnClone = copyBtn.cloneNode(true);
        copyBtnClone.addEventListener('click', () => this.copyLineupToClipboard());
        const shareBtnClone = shareBtn.cloneNode(true);
        shareBtnClone.addEventListener('click', () => this.shareLineup());
        const csvBtnClone = csvBtn.cloneNode(true);
        csvBtnClone.addEventListener('click', () => this.exportToCSV());
        const exportBtnClone = exportBtn.cloneNode(true);
        exportBtnClone.addEventListener('click', () => this.exportLineup());
        const printBtnClone = printBtn.cloneNode(true);
        printBtnClone.addEventListener('click', () => this.printLineup());
        const saveGameBtnClone = saveGameBtn.cloneNode(true);
        saveGameBtnClone.addEventListener('click', () => {
            const name = prompt('Enter a name for this game (e.g., "vs Tigers 12/10"):');
            if (name !== null) this.saveCurrentGame(name);
        });

        // Helper to create dropdown menu
        const createDropdown = (label, icon, items) => {
            const dropdown = document.createElement('div');
            dropdown.className = 'action-dropdown';

            const trigger = document.createElement('button');
            trigger.className = 'dropdown-trigger';
            trigger.innerHTML = `<span>${icon}</span> ${label} <span class="dropdown-arrow">▾</span>`;
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('open');
                // Close other dropdowns
                document.querySelectorAll('.action-dropdown.open').forEach(d => {
                    if (d !== dropdown) d.classList.remove('open');
                });
            });

            const menu = document.createElement('div');
            menu.className = 'dropdown-menu';
            items.forEach(item => {
                menu.appendChild(item);
            });

            dropdown.appendChild(trigger);
            dropdown.appendChild(menu);
            return dropdown;
        };

        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            document.querySelectorAll('.action-dropdown.open').forEach(d => d.classList.remove('open'));
        });

        // Add buttons to the new container

        // Regenerate (standalone)
        actionButtonsContainer.appendChild(regenerateBtnClone);

        // Share dropdown
        const shareDropdown = createDropdown('Share', '📤', [copyBtnClone, shareBtnClone]);
        actionButtonsContainer.appendChild(shareDropdown);

        // Export dropdown
        const exportDropdown = createDropdown('Export', '📁', [csvBtnClone, exportBtnClone, printBtnClone]);
        actionButtonsContainer.appendChild(exportDropdown);

        // Save Game (standalone)
        actionButtonsContainer.appendChild(saveGameBtnClone);

        // Add player summary to the grid
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'player-summary';

        // Create a header container with title and buttons
        const summaryHeader = document.createElement('div');
        summaryHeader.className = 'player-summary-header';

        const summaryTitle = document.createElement('h3');
        summaryTitle.textContent = 'Player Summary';

        summaryHeader.appendChild(summaryTitle);
        summaryHeader.appendChild(actionButtonsContainer);

        summaryDiv.appendChild(summaryHeader);

        // Create a container for the player summary table
        const summaryTableDiv = document.createElement('div');
        summaryTableDiv.appendChild(this.getPlayerSummary());
        summaryDiv.appendChild(summaryTableDiv);

        // Insert summary into the display
        display.insertBefore(summaryDiv, display.querySelector('.action-buttons'));

        // Hide the original action buttons at the bottom
        const originalActionButtons = document.querySelector('.action-buttons');
        if (originalActionButtons) {
            originalActionButtons.style.display = 'none';
        }

        display.classList.remove('hidden');
    }

    getPlayerSummary() {
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const headers = ['Rest', 'No Keeper', 'Player', 'Captain', 'Quarters Played', 'Quarters Resting', 'Defense/Offense', 'Positions'];
        headers.forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        this.players.forEach(player => {
            const tr = document.createElement('tr');

            // Rest checkbox
            const tdRest = document.createElement('td');
            const restCheckbox = document.createElement('input');
            restCheckbox.type = 'checkbox';
            restCheckbox.className = 'rest-checkbox';
            restCheckbox.checked = player.mustRest;
            restCheckbox.title = 'Check to ensure this player rests at least 1 quarter';
            restCheckbox.addEventListener('change', () => this.toggleRestPreference(player.name));
            tdRest.appendChild(restCheckbox);
            tr.appendChild(tdRest);

            // No Keeper checkbox
            const tdNoKeeper = document.createElement('td');
            const noKeeperCheckbox = document.createElement('input');
            noKeeperCheckbox.type = 'checkbox';
            noKeeperCheckbox.className = 'no-keeper-checkbox';
            noKeeperCheckbox.checked = player.noKeeper;
            noKeeperCheckbox.title = 'Check to prevent this player from playing keeper';
            noKeeperCheckbox.addEventListener('change', () => this.toggleNoKeeperPreference(player.name));
            tdNoKeeper.appendChild(noKeeperCheckbox);
            tr.appendChild(tdNoKeeper);

            // Player name
            const tdPlayer = document.createElement('td');
            tdPlayer.textContent = player.name + (player.number ? ` #${player.number}` : '');
            tr.appendChild(tdPlayer);

            // Captain
            const tdCaptain = document.createElement('td');
            tdCaptain.textContent = player.isCaptain ? '⭐ Yes' : 'No';
            tr.appendChild(tdCaptain);

            // Quarters Played
            const tdPlayed = document.createElement('td');
            tdPlayed.textContent = player.quartersPlayed.join(', ') || 'None';
            tr.appendChild(tdPlayed);

            // Quarters Resting
            const tdResting = document.createElement('td');
            tdResting.textContent = player.quartersSitting.join(', ') || 'None';
            tr.appendChild(tdResting);

            // Defense/Offense
            const tdDO = document.createElement('td');
            const defensive = player.defensiveQuarters || 0;
            const offensive = player.offensiveQuarters || 0;
            tdDO.textContent = `D: ${defensive} / O: ${offensive}`;
            tr.appendChild(tdDO);

            // Positions
            const tdPositions = document.createElement('td');
            const positions = player.positionsPlayed.map(p => `Q${p.quarter}: ${p.position}`).join(', ');
            tdPositions.textContent = positions || 'None';
            tr.appendChild(tdPositions);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        return table;
    }

    exportLineup() {
        let text = 'AYSO Roster Pro - Game Lineup\n';
        text += '==============================\n\n';
        
        this.lineup.forEach(quarter => {
            text += `Quarter ${quarter.quarter}\n`;
            text += '---------\n';
            
            this.positions.forEach(position => {
                const playerName = quarter.positions[position] || 'TBD';
                const player = this.players.find(p => p.name === playerName);
                const captainIndicator = player && player.isCaptain ? '⭐ ' : '';
                const numberStr = player && player.number ? ` #${player.number}` : '';
                text += `${position}: ${captainIndicator}${playerName}${numberStr}\n`;
            });
            
            const sittingPlayers = this.players.filter(p => p.quartersSitting.includes(quarter.quarter));
            if (sittingPlayers.length > 0) {
                const sittingText = sittingPlayers.map(p => {
                    const captainIndicator = p.isCaptain ? '⭐ ' : '';
                    const numberStr = p.number ? ` #${p.number}` : '';
                    return `${captainIndicator}${p.name}${numberStr}`;
                }).join(', ');
                text += `Resting: ${sittingText}\n`;
            }
            
            text += '\n';
        });
        
        text += '\nPlayer Summary\n';
        text += '--------------\n';
        this.players.forEach(player => {
            const captainIndicator = player.isCaptain ? '⭐ ' : '';
            const numberStr = player.number ? ` #${player.number}` : '';
            text += `${captainIndicator}${player.name}${numberStr}:\n`;
            text += `  Played: Quarters ${player.quartersPlayed.join(', ') || 'None'}\n`;
            text += `  Resting: Quarters ${player.quartersSitting.join(', ') || 'None'}\n`;
            const positions = player.positionsPlayed.map(p => `Q${p.quarter}-${p.position}`).join(', ');
            text += `  Positions: ${positions || 'None'}\n`;
            text += `  Captain: ${player.isCaptain ? 'Yes' : 'No'}\n\n`;
        });
        
        // Download file
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lineup_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
    }

    printLineup() {
        window.print();
    }

    exportPlayers() {
        if (this.players.length === 0) {
            alert('No players to export');
            return;
        }
        
        // Create text content in a format compatible with import
        // Using "Name #Number" format
        let text = '';
        this.players.forEach(p => {
            const numberStr = p.number ? ` #${p.number}` : '';
            text += `${p.name}${numberStr}\n`;
        });
        
        // Create blob and download
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `players_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        
        // Clean up
        URL.revokeObjectURL(url);
        
        this.showNotification('Players exported successfully. File can be re-imported later.', 'success');
    }
    
    clearAll() {
        if (confirm('Clear all players and lineup? This cannot be undone.')) {
            this.saveStateForUndo();
            this.players = [];
            this.captains = [];
            this.lineup = [];
            this.updatePlayerList();
            document.getElementById('lineupDisplay').classList.add('hidden');
            document.getElementById('fileInput').value = '';
            this.safeRemoveFromStorage(CONSTANTS.STORAGE_KEYS.PLAYERS);
            this.safeRemoveFromStorage(CONSTANTS.STORAGE_KEYS.SETTINGS);
            this.showNotification('All data cleared', 'info');
        }
    }

    createFieldVisualization(quarter) {
        const positions = quarter.positions;
        const svgNS = 'http://www.w3.org/2000/svg';

        // Position coordinates for all formations (percentage-based)
        const positionCoords = {
            'Keeper': { x: 50, y: 90 },
            'Left Back': { x: 25, y: 70 },
            'Right Back': { x: 75, y: 70 },
            'Left Wing': { x: 15, y: 40 },
            'Right Wing': { x: 85, y: 40 },
            'Center Mid': { x: 50, y: 45 },
            'Striker': { x: 50, y: 20 },
            'Center Back': { x: 50, y: 72 },
            'Left Mid': { x: 30, y: 45 },
            'Right Mid': { x: 70, y: 45 },
            'Left Striker': { x: 35, y: 20 },
            'Right Striker': { x: 65, y: 20 },
            'Midfield': { x: 50, y: 50 },
            'Left Forward': { x: 35, y: 25 },
            'Right Forward': { x: 65, y: 25 },
            'Left Center Back': { x: 35, y: 75 },
            'Right Center Back': { x: 65, y: 75 },
            'Left Wing Back': { x: 15, y: 55 },
            'Right Wing Back': { x: 85, y: 55 },
            'Left Center Mid': { x: 35, y: 50 },
            'Right Center Mid': { x: 65, y: 50 },
            'Left Defensive Mid': { x: 40, y: 60 },
            'Right Defensive Mid': { x: 60, y: 60 },
            'Attacking Mid': { x: 50, y: 35 }
        };

        // Create container
        const container = document.createElement('div');
        container.className = 'field-container';
        container.setAttribute('role', 'img');
        container.setAttribute('aria-label', `Soccer field visualization showing player positions for Quarter ${quarter.quarter}`);

        // Create SVG element
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 400 600');
        svg.setAttribute('class', 'soccer-field');

        // Helper to create SVG elements
        const createSvgElement = (tag, attrs) => {
            const el = document.createElementNS(svgNS, tag);
            Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
            return el;
        };

        // Field background
        svg.appendChild(createSvgElement('rect', { x: 0, y: 0, width: 400, height: 600, fill: '#4a9b4a' }));
        // Field lines
        svg.appendChild(createSvgElement('rect', { x: 20, y: 20, width: 360, height: 560, fill: 'none', stroke: 'white', 'stroke-width': 3 }));
        // Center line
        svg.appendChild(createSvgElement('line', { x1: 20, y1: 300, x2: 380, y2: 300, stroke: 'white', 'stroke-width': 3 }));
        // Center circle
        svg.appendChild(createSvgElement('circle', { cx: 200, cy: 300, r: 60, fill: 'none', stroke: 'white', 'stroke-width': 3 }));
        svg.appendChild(createSvgElement('circle', { cx: 200, cy: 300, r: 5, fill: 'white' }));
        // Penalty areas
        svg.appendChild(createSvgElement('rect', { x: 100, y: 20, width: 200, height: 100, fill: 'none', stroke: 'white', 'stroke-width': 3 }));
        svg.appendChild(createSvgElement('rect', { x: 100, y: 480, width: 200, height: 100, fill: 'none', stroke: 'white', 'stroke-width': 3 }));
        // Goal areas
        svg.appendChild(createSvgElement('rect', { x: 140, y: 20, width: 120, height: 40, fill: 'none', stroke: 'white', 'stroke-width': 3 }));
        svg.appendChild(createSvgElement('rect', { x: 140, y: 540, width: 120, height: 40, fill: 'none', stroke: 'white', 'stroke-width': 3 }));
        // Goals
        svg.appendChild(createSvgElement('rect', { x: 170, y: 10, width: 60, height: 10, fill: 'white' }));
        svg.appendChild(createSvgElement('rect', { x: 170, y: 580, width: 60, height: 10, fill: 'white' }));
        // Penalty spots
        svg.appendChild(createSvgElement('circle', { cx: 200, cy: 80, r: 3, fill: 'white' }));
        svg.appendChild(createSvgElement('circle', { cx: 200, cy: 520, r: 3, fill: 'white' }));

        // Add player positions
        this.positions.forEach(position => {
            const player = positions[position];
            if (player && positionCoords[position]) {
                const coord = positionCoords[position];
                const x = coord.x * 4;
                const y = coord.y * 6;
                const isDefensive = position.includes('Back') || position === 'Keeper';
                const isKeeper = position === 'Keeper';
                const playerInfo = this.players.find(p => p.name === player);
                const displayText = playerInfo && playerInfo.number ? playerInfo.number : this.getPlayerInitials(player);

                const g = document.createElementNS(svgNS, 'g');
                g.setAttribute('class', 'player-marker');

                const circle = createSvgElement('circle', {
                    cx: x, cy: y, r: 18,
                    fill: isKeeper ? '#ffcc00' : isDefensive ? '#3498db' : '#e74c3c',
                    stroke: 'white', 'stroke-width': 2
                });
                g.appendChild(circle);

                const text = createSvgElement('text', {
                    x: x, y: y,
                    'text-anchor': 'middle',
                    'dominant-baseline': 'middle',
                    fill: 'white',
                    'font-size': playerInfo && playerInfo.number ? '12' : '10',
                    'font-weight': 'bold'
                });
                text.textContent = String(displayText);
                g.appendChild(text);

                svg.appendChild(g);
            }
        });

        container.appendChild(svg);

        // Create legend
        const legend = document.createElement('div');
        legend.className = 'field-legend';
        const legendItems = [
            { className: 'keeper', label: 'Keeper' },
            { className: 'defensive', label: 'Defense' },
            { className: 'offensive', label: 'Offense' }
        ];
        legendItems.forEach(item => {
            const span = document.createElement('span');
            span.className = 'legend-item';
            const colorSpan = document.createElement('span');
            colorSpan.className = `legend-color ${item.className}`;
            span.appendChild(colorSpan);
            span.appendChild(document.createTextNode(item.label));
            legend.appendChild(span);
        });
        container.appendChild(legend);

        return container;
    }
    
    getPlayerInitials(name) {
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return parts[0][0] + parts[parts.length - 1][0];
        }
        return name.substring(0, 2).toUpperCase();
    }

    // Shuffle utilities - delegate to module
    shuffleArray(array) {
        return shuffleArray(array);
    }

    shuffleWithinSimilarGroups(array, keyFn) {
        return shuffleWithinSimilarGroups(array, keyFn);
    }

    loadData() {
        // Load players
        const savedPlayers = this.safeGetFromStorage(CONSTANTS.STORAGE_KEYS.PLAYERS);
        if (savedPlayers) {
            try {
                this.players = JSON.parse(savedPlayers);
                // Ensure all players have required fields (migration for older data)
                this.players = this.players.map(p => ({
                    ...p,
                    status: p.status || CONSTANTS.PLAYER_STATUS.AVAILABLE,
                    preferredPositions: p.preferredPositions || []
                }));
                // Reconstruct captains from player data
                this.captains = this.players.filter(p => p.isCaptain).map(p => p.name);
            } catch (error) {
                console.error('Error parsing players data:', error);
                this.players = [];
                this.captains = [];
            }
        }

        // Load settings
        const savedSettings = this.safeGetFromStorage(CONSTANTS.STORAGE_KEYS.SETTINGS);
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                this.ageDivision = settings.ageDivision || this.ageDivision;
                this.playersOnField = settings.playersOnField || this.playersOnField;
                this.formation = settings.formation || this.formation;

                // Update UI with loaded settings
                const ageDivisionSelect = document.getElementById('ageDivision');
                if (ageDivisionSelect) {
                    ageDivisionSelect.value = this.ageDivision;
                    this.updateFieldOptions();
                }
                const fieldPlayersSelect = document.getElementById('fieldPlayers');
                if (fieldPlayersSelect) {
                    fieldPlayersSelect.value = this.playersOnField;
                    this.updateFormationOptions();
                }
                const formationSelect = document.getElementById('formation');
                if (formationSelect) formationSelect.value = this.formation;
            } catch (error) {
                console.error('Error parsing settings data:', error);
            }
        }

        // Update player list after loading
        this.updatePlayerList();
        this.updatePositions();
        this.updateFormationDescription();
        this.updateAgeRules();
    }

    savePlayers() {
        this.safeSetToStorage(CONSTANTS.STORAGE_KEYS.PLAYERS, JSON.stringify(this.players));
    }

    saveSettings() {
        const settings = {
            ageDivision: this.ageDivision,
            playersOnField: this.playersOnField,
            formation: this.formation
        };
        this.safeSetToStorage(CONSTANTS.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    }

    sanitizeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }
    
    showNotification(message, type = 'info') {
        // Remove any existing notification
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Trigger animation
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    async fetchFormCoordinates() {
        // Fetch automatically detected field coordinates from the server
        try {
            const response = await fetch('/api/analyze-form');
            const data = await response.json();
            if (data.success) {
                console.log('Auto-detected form coordinates:', data.fieldCoordinates);
                return data;
            }
            return null;
        } catch (error) {
            console.error('Error fetching form coordinates:', error);
            return null;
        }
    }

    drawCoordinateGrid(page, width, height) {
        /**
         * COORDINATE GRID HELPER - For finding exact PDF positions
         *
         * How to use this tool:
         * 1. Uncomment the call to this function in generatePlayerEvaluationPDF()
         * 2. Generate a PDF - it will have a grid overlay with coordinate labels
         * 3. Open the PDF and see where lines fall on the grid
         * 4. Use the coordinates to adjust text placement
         *
         * PDF Coordinate System:
         * - Origin (0,0) is at BOTTOM-LEFT corner
         * - X increases from left to right →
         * - Y increases from bottom to top ↑
         * - US Letter page: 612 points wide × 792 points tall
         * - 1 inch = 72 points
         *
         * Example calculations:
         * - Top of page (US Letter): height = 792
         * - 1 inch from top: y = 792 - 72 = 720
         * - 2 inches from top: y = 792 - 144 = 648
         * - 1 inch from left: x = 72
         * - Center horizontally: x = 612 / 2 = 306
         *
         * Using height variable:
         * - We use `height - value` because we measure from top in design
         * - Example: height - 150 means 150 points down from top of page
         *
         * ADVANCED: Programmatic Form Field Detection
         * ============================================
         * For automatic coordinate detection, you could:
         * 1. Parse PDF to extract all Path objects (vector graphics)
         * 2. Filter for horizontal lines: |y1 - y2| < epsilon
         * 3. Filter by length: min 50-100 points for form fields
         * 4. Find nearby text labels (e.g., "Coach:", "Division:")
         * 5. Calculate field position: label_x_right → line_x_left, line_y
         * 6. This approach requires advanced PDF parsing (PyMuPDF, PDFBox)
         *
         * Our simpler approach: Use this grid to manually measure positions
         */
        const { rgb } = window.PDFLib;

        // Draw vertical lines every 50 points
        for (let x = 0; x <= width; x += 50) {
            page.drawLine({
                start: { x, y: 0 },
                end: { x, y: height },
                thickness: x % 100 === 0 ? 0.5 : 0.2,
                color: rgb(0.7, 0.7, 0.7),
                opacity: 0.5
            });

            // Label every 100 points
            if (x % 100 === 0) {
                page.drawText(`${x}`, {
                    x: x + 2,
                    y: height - 20,
                    size: 8,
                    color: rgb(1, 0, 0)
                });
            }
        }

        // Draw horizontal lines every 50 points
        for (let y = 0; y <= height; y += 50) {
            page.drawLine({
                start: { x: 0, y },
                end: { x: width, y },
                thickness: y % 100 === 0 ? 0.5 : 0.2,
                color: rgb(0.7, 0.7, 0.7),
                opacity: 0.5
            });

            // Label every 100 points
            if (y % 100 === 0) {
                page.drawText(`${y}`, {
                    x: 5,
                    y: y + 2,
                    size: 8,
                    color: rgb(1, 0, 0)
                });
            }
        }

        console.log('Coordinate grid drawn on PDF (50pt spacing, labeled every 100pt)');
    }

    async generatePlayerEvaluationPDF() {
        if (this.players.length === 0) {
            this.showNotification('Please add players first before generating the evaluation form.', 'error');
            return;
        }

        const coachName = document.getElementById('coachName').value.trim();
        const assistantCoach = document.getElementById('assistantCoach').value.trim();
        const division = document.getElementById('division').value;
        const gender = document.getElementById('gender').value;

        if (!coachName) {
            this.showNotification('Please enter the coach name.', 'error');
            return;
        }

        // Check for PDF library
        if (typeof window.PDFLib === 'undefined') {
            this.showNotification('PDF library not loaded. Please refresh the page and try again.', 'error');
            return;
        }

        try {
            // Load the PDF template (use cache if available)
            const templateUrl = '/assets/Player Evaluation Form 2025.pdf';
            let existingPdfBytes;

            if (this.pdfTemplateCache) {
                existingPdfBytes = this.pdfTemplateCache;
            } else {
                const response = await fetch(templateUrl);
                if (!response.ok) {
                    throw new Error(`Failed to load PDF template: ${response.status} ${response.statusText}`);
                }
                existingPdfBytes = await response.arrayBuffer();
                // Cache the template for future use
                this.pdfTemplateCache = existingPdfBytes;
            }

            // Load pdf-lib
            const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
            const pdfDoc = await PDFDocument.load(existingPdfBytes);

            // Register fontkit to enable custom fonts
            pdfDoc.registerFontkit(fontkit);

            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

            // Load custom handwriting font for signature
            const autographyFontUrl = '/assets/Autography-DOLnW.otf';
            const autographyFontBytes = await fetch(autographyFontUrl).then(res => res.arrayBuffer());
            const autographyFont = await pdfDoc.embedFont(autographyFontBytes);

            // Sort players alphabetically by last name
            const sortedPlayers = [...this.players].sort((a, b) => {
                const lastNameA = a.name.split(' ').pop().toLowerCase();
                const lastNameB = b.name.split(' ').pop().toLowerCase();
                return lastNameA.localeCompare(lastNameB);
            });

            // Get the first page
            const pages = pdfDoc.getPages();
            const firstPage = pages[0];
            const { width, height } = firstPage.getSize();

            // LOG: Display page dimensions for debugging
            console.log('PDF Page Dimensions:');
            console.log(`  Width: ${width} points`);
            console.log(`  Height: ${height} points`);
            console.log('  Note: Origin (0,0) is at bottom-left corner');
            console.log('  Common page sizes:');
            console.log('    - US Letter: 612 × 792 points');
            console.log('    - A4: 595 × 842 points');

            // DEBUG MODE: Uncomment to draw coordinate grid for alignment
            // this.drawCoordinateGrid(firstPage, width, height);

            // Fill in header information (exact coordinates from user measurement)
            // Note: PDF coordinates are from bottom-left. Y coordinates moved up by 1 point.
            // Text is centered on the X coordinate.
            const fontSize = 11;

            const coachWidth = helveticaFont.widthOfTextAtSize(coachName, fontSize);
            firstPage.drawText(coachName, {
                x: 266 - (coachWidth / 2),
                y: 714,
                size: fontSize,
                font: helveticaFont,
                color: rgb(0, 0, 0)
            });

            const divisionWidth = helveticaFont.widthOfTextAtSize(division, fontSize);
            firstPage.drawText(division, {
                x: 443 - (divisionWidth / 2),
                y: 714,
                size: fontSize,
                font: helveticaFont,
                color: rgb(0, 0, 0)
            });

            // Abbreviate gender to just B or G
            const genderAbbrev = gender === 'Boys' ? 'B' : gender === 'Girls' ? 'G' : gender.charAt(0);
            const genderWidth = helveticaFont.widthOfTextAtSize(genderAbbrev, fontSize);
            firstPage.drawText(genderAbbrev, {
                x: 531 - (genderWidth / 2),
                y: 714,
                size: fontSize,
                font: helveticaFont,
                color: rgb(0, 0, 0)
            });

            const assistantWidth = helveticaFont.widthOfTextAtSize(assistantCoach, fontSize);
            firstPage.drawText(assistantCoach, {
                x: 314 - (assistantWidth / 2),
                y: 686,
                size: fontSize,
                font: helveticaFont,
                color: rgb(0, 0, 0)
            });

            // Add coach signature at coordinate 241, 80 (using custom handwriting font)
            const coachSignatureWidth = autographyFont.widthOfTextAtSize(coachName, fontSize);
            firstPage.drawText(coachName, {
                x: 241 - (coachSignatureWidth / 2),
                y: 81,  // 80 + 1 to match other Y adjustment
                size: fontSize,
                font: autographyFont,
                color: rgb(0, 0, 0)
            });

            // Add today's date at coordinate 448, 80
            const today = new Date();
            const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
            const dateWidth = helveticaFont.widthOfTextAtSize(dateStr, fontSize);
            firstPage.drawText(dateStr, {
                x: 448 - (dateWidth / 2),
                y: 81,  // 80 + 1 to match other Y adjustment
                size: fontSize,
                font: helveticaFont,
                color: rgb(0, 0, 0)
            });

            // Player list coordinates (exact measurements from user)
            // Y coordinates moved up by 1 point, text centered on X coordinates
            const playerNameX = 164;
            const ratingX = 326;
            const commentsX = 460;
            const firstPlayerY = 390;  // 389 + 1
            const lineHeight = 28.8;  // Each line is 28.8 points below the previous
            const playersPerPage = 10;
            const playerFontSize = 10;
            const commentFontSize = 9;

            // Fill in player names, ratings, and comments
            for (let i = 0; i < sortedPlayers.length && i < 20; i++) {
                const pageIndex = Math.floor(i / playersPerPage);

                // Determine which page to use
                let currentPage;
                if (pageIndex === 0) {
                    currentPage = firstPage;
                } else if (pageIndex === 1 && pages.length > 1) {
                    currentPage = pages[1];
                } else {
                    // Template only has 2 pages with ~20 player slots
                    break;
                }

                // Get the player
                const player = sortedPlayers[i];
                const playerName = player.number ? `${player.name} #${player.number}` : player.name;

                // Calculate Y position based on which page and position on that page
                const positionOnPage = i % playersPerPage;
                let yPosition;

                if (pageIndex === 0) {
                    yPosition = firstPlayerY - (positionOnPage * lineHeight);
                } else {
                    // Second page - need to determine starting Y for page 2
                    // Assuming similar spacing, will adjust if needed
                    yPosition = firstPlayerY - (positionOnPage * lineHeight);
                }

                // Draw player name (left column) - centered on X coordinate
                const playerNameWidth = helveticaFont.widthOfTextAtSize(playerName, playerFontSize);
                currentPage.drawText(playerName, {
                    x: playerNameX - (playerNameWidth / 2),
                    y: yPosition,
                    size: playerFontSize,
                    font: helveticaFont,
                    color: rgb(0, 0, 0)
                });

                // Draw rating if available (center column) - centered on X coordinate
                if (player.rating) {
                    const ratingText = player.rating.toString();
                    const ratingWidth = helveticaFont.widthOfTextAtSize(ratingText, playerFontSize);
                    currentPage.drawText(ratingText, {
                        x: ratingX - (ratingWidth / 2),
                        y: yPosition,
                        size: playerFontSize,
                        font: helveticaFont,
                        color: rgb(0, 0, 0)
                    });
                }

                // Draw comment if available (right column - truncate to fit) - centered on X coordinate
                if (player.comment) {
                    const maxCommentLength = 50;
                    const comment = player.comment.length > maxCommentLength
                        ? player.comment.substring(0, maxCommentLength - 3) + '...'
                        : player.comment;

                    const commentWidth = helveticaFont.widthOfTextAtSize(comment, commentFontSize);
                    currentPage.drawText(comment, {
                        x: commentsX - (commentWidth / 2),
                        y: yPosition,
                        size: commentFontSize,
                        font: helveticaFont,
                        color: rgb(0, 0, 0)
                    });
                }
            }

            // Save the PDF
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            // Download the file
            const a = document.createElement('a');
            a.href = url;
            a.download = `Player_Evaluation_${division}_${gender}_${new Date().getFullYear()}.pdf`;
            a.click();

            URL.revokeObjectURL(url);

            this.showNotification('Player Evaluation Form generated successfully!', 'success');
        } catch (error) {
            console.error('Error generating PDF:', error);

            // Provide specific error messages based on error type
            let errorMessage = 'Error generating PDF: ';
            if (error.message.includes('Failed to load PDF template')) {
                errorMessage += 'Could not load the template file. Please check your internet connection.';
            } else if (error.message.includes('font')) {
                errorMessage += 'Font loading error. Please refresh the page and try again.';
            } else if (error.name === 'TypeError') {
                errorMessage += 'Invalid data format. Please check player information.';
            } else {
                errorMessage += error.message || 'Unknown error occurred.';
            }

            this.showNotification(errorMessage, 'error');
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + G: Generate lineup
            if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                e.preventDefault();
                document.getElementById('generateLineup').click();
            }

            // Ctrl/Cmd + D: Demo players
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                document.getElementById('demoButton').click();
            }

            // Ctrl/Cmd + P: Print lineup
            if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !document.getElementById('lineupDisplay').classList.contains('hidden')) {
                e.preventDefault();
                this.printLineup();
            }

            // Ctrl/Cmd + E: Export lineup
            if ((e.ctrlKey || e.metaKey) && e.key === 'e' && !document.getElementById('lineupDisplay').classList.contains('hidden')) {
                e.preventDefault();
                this.exportLineup();
            }

            // Ctrl/Cmd + Z: Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }

            // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
            }

            // ESC: Clear player name input
            if (e.key === 'Escape') {
                const playerInput = document.getElementById('playerName');
                if (document.activeElement === playerInput) {
                    playerInput.value = '';
                    playerInput.blur();
                }
            }
        });
    }
}

// Initialize the application
const lineupGenerator = new SoccerLineupGenerator();