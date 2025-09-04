class SoccerLineupGenerator {
    constructor() {
        this.players = [];
        this.positions = ['Keeper', 'Left Back', 'Right Back', 'Left Wing', 'Right Wing', 'Midfield', 'Striker'];
        this.quarters = 4;
        this.playersOnField = 7;
        this.lineup = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // File import
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileImport(e));
        
        // Manual player addition
        document.getElementById('addPlayer').addEventListener('click', () => this.addPlayerManually());
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addPlayerManually();
        });
        
        // Generate lineup
        document.getElementById('generateLineup').addEventListener('click', () => this.generateLineup());
        
        // Clear all
        document.getElementById('clearAll').addEventListener('click', () => this.clearAll());
        
        // Export and print
        document.getElementById('exportLineup').addEventListener('click', () => this.exportLineup());
        document.getElementById('printLineup').addEventListener('click', () => this.printLineup());
        
        // Field players setting
        document.getElementById('fieldPlayers').addEventListener('change', (e) => {
            this.playersOnField = parseInt(e.target.value);
            this.updatePositions();
        });
    }

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const names = content.split('\n').map(name => name.trim()).filter(name => name);
            names.forEach(name => this.addPlayer(name));
        };
        reader.readAsText(file);
    }

    addPlayerManually() {
        const input = document.getElementById('playerName');
        const name = input.value.trim();
        
        if (name) {
            this.addPlayer(name);
            input.value = '';
            input.focus();
        }
    }

    addPlayer(name) {
        if (!this.players.find(p => p.name === name)) {
            this.players.push({
                name: name,
                quartersPlayed: [],
                quartersSitting: [],
                positionsPlayed: [],
                goalieQuarter: null
            });
            this.updatePlayerList();
        }
    }

    removePlayer(name) {
        this.players = this.players.filter(p => p.name !== name);
        this.updatePlayerList();
    }

    updatePlayerList() {
        const list = document.getElementById('playerList');
        const count = document.getElementById('playerCount');
        
        count.textContent = this.players.length;
        list.innerHTML = '';
        
        this.players.forEach(player => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${player.name}</span>
                <button class="remove-btn" onclick="lineupGenerator.removePlayer('${player.name}')">×</button>
            `;
            list.appendChild(li);
        });
    }

    updatePositions() {
        // Adjust positions based on number of players on field
        if (this.playersOnField === 5) {
            this.positions = ['Keeper', 'Left Back', 'Right Back', 'Midfield', 'Striker'];
        } else if (this.playersOnField === 6) {
            this.positions = ['Keeper', 'Left Back', 'Right Back', 'Left Wing', 'Right Wing', 'Striker'];
        } else if (this.playersOnField === 7) {
            this.positions = ['Keeper', 'Left Back', 'Right Back', 'Left Wing', 'Right Wing', 'Midfield', 'Striker'];
        } else if (this.playersOnField === 9) {
            this.positions = ['Keeper', 'Left Back', 'Center Back', 'Right Back', 'Left Mid', 'Center Mid', 'Right Mid', 'Left Forward', 'Right Forward'];
        } else if (this.playersOnField === 11) {
            this.positions = ['Keeper', 'Left Back', 'Left Center Back', 'Right Center Back', 'Right Back', 
                            'Left Mid', 'Center Mid', 'Right Mid', 'Left Wing', 'Striker', 'Right Wing'];
        }
    }

    generateLineup() {
        if (this.players.length < this.playersOnField) {
            alert(`Need at least ${this.playersOnField} players to generate a lineup. Currently have ${this.players.length}.`);
            return;
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
        const validation = this.validateLineup();
        
        this.displayLineup(validation);
    }

    determineSittingSchedule() {
        const totalPlayers = this.players.length;
        const playersPerQuarter = this.playersOnField;
        const sittingPerQuarter = totalPlayers - playersPerQuarter;
        
        // Initialize sitting schedule
        const schedule = {
            1: [],
            2: [],
            3: [],
            4: []
        };
        
        // Create a copy of players to track sitting assignments, shuffled for randomness
        const playersCopy = this.players.map(p => ({
            name: p.name,
            sittingQuarters: []
        }));
        
        // Shuffle the players array to randomize who sits extra
        this.shuffleArray(playersCopy);
        
        // Calculate how many times each player should sit
        const totalSittingSlots = sittingPerQuarter * this.quarters;
        const minSitsPerPlayer = Math.floor(totalSittingSlots / totalPlayers);
        const playersWithExtraSit = totalSittingSlots % totalPlayers;
        
        // Assign sitting quarters to ensure even distribution and no consecutive sitting
        let quarterIndex = 0;
        
        // First pass: assign minimum sits to all players
        for (let i = 0; i < minSitsPerPlayer; i++) {
            playersCopy.forEach((player, idx) => {
                // Find a quarter where the player hasn't sat yet and won't sit consecutively
                let assignedQuarter = this.findNonConsecutiveSittingQuarter(player.sittingQuarters, schedule);
                if (assignedQuarter !== -1) {
                    player.sittingQuarters.push(assignedQuarter);
                    schedule[assignedQuarter].push(player.name);
                }
            });
        }
        
        // Second pass: randomly select players who need to sit extra
        // Shuffle again to ensure different players get extra sits each time
        const playersForExtraSit = [...playersCopy];
        this.shuffleArray(playersForExtraSit);
        
        let playersAssigned = 0;
        for (let i = 0; i < playersForExtraSit.length && playersAssigned < playersWithExtraSit; i++) {
            const player = playersForExtraSit[i];
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
                
                // Heavily penalize if already played this position
                if (hasPlayedPosition) {
                    score -= 1000 * timesPlayedPosition;
                }
                
                // Consider role balance
                if (isDefensive) {
                    score += (offensive - defensive) * 10; // Prefer if needs more defense
                } else {
                    score += (defensive - offensive) * 10; // Prefer if needs more offense
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
        // Find players who haven't been keeper yet
        const potentialKeepers = availablePlayers.filter(player => !player.goalieQuarter);
        
        if (potentialKeepers.length > 0) {
            // Random selection from those who haven't been keeper
            return potentialKeepers[Math.floor(Math.random() * potentialKeepers.length)];
        }
        
        // If all have been keeper, return any available player
        return availablePlayers[0];
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
        
        // Show validation messages
        if (validationIssues.length > 0) {
            validationDiv.innerHTML = '<h3>Rotation Issues:</h3>' + 
                validationIssues.map(issue => `<p>${issue}</p>`).join('');
            validationDiv.classList.add('has-issues');
        } else {
            validationDiv.innerHTML = '<p class="success">✓ All rotation rules satisfied!</p>';
            validationDiv.classList.remove('has-issues');
        }
        
        // Display lineup grid
        grid.innerHTML = '';
        
        this.lineup.forEach(quarter => {
            const quarterDiv = document.createElement('div');
            quarterDiv.className = 'quarter-lineup';
            
            let html = `<h3>Quarter ${quarter.quarter}</h3>`;
            
            // Add soccer field visualization
            html += this.createFieldVisualization(quarter);
            
            html += '<table>';
            
            this.positions.forEach(position => {
                const player = quarter.positions[position] || 'TBD';
                const isKeeper = position === 'Keeper';
                html += `
                    <tr class="${isKeeper ? 'keeper-row' : ''}">
                        <td class="position">${position}:</td>
                        <td class="player-name">${player}</td>
                    </tr>
                `;
            });
            
            // Show sitting players
            const sittingPlayers = this.players.filter(p => p.quartersSitting.includes(quarter.quarter));
            if (sittingPlayers.length > 0) {
                html += `
                    <tr class="sitting-row">
                        <td class="position">Sitting:</td>
                        <td class="player-name">${sittingPlayers.map(p => p.name).join(', ')}</td>
                    </tr>
                `;
            }
            
            html += '</table>';
            quarterDiv.innerHTML = html;
            grid.appendChild(quarterDiv);
        });
        
        // Add player summary
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'player-summary';
        summaryDiv.innerHTML = '<h3>Player Summary</h3>' + this.getPlayerSummary();
        grid.appendChild(summaryDiv);
        
        display.classList.remove('hidden');
    }

    getPlayerSummary() {
        let html = '<table><thead><tr><th>Player</th><th>Quarters Played</th><th>Quarters Sitting</th><th>Defense/Offense</th><th>Positions</th></tr></thead><tbody>';
        
        this.players.forEach(player => {
            const positions = player.positionsPlayed.map(p => `Q${p.quarter}: ${p.position}`).join(', ');
            const defensive = player.defensiveQuarters || 0;
            const offensive = player.offensiveQuarters || 0;
            html += `
                <tr>
                    <td>${player.name}</td>
                    <td>${player.quartersPlayed.join(', ') || 'None'}</td>
                    <td>${player.quartersSitting.join(', ') || 'None'}</td>
                    <td>D: ${defensive} / O: ${offensive}</td>
                    <td>${positions || 'None'}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        return html;
    }

    exportLineup() {
        let text = 'AYSO Roster Pro - Game Lineup\n';
        text += '==============================\n\n';
        
        this.lineup.forEach(quarter => {
            text += `Quarter ${quarter.quarter}\n`;
            text += '---------\n';
            
            this.positions.forEach(position => {
                const player = quarter.positions[position] || 'TBD';
                text += `${position}: ${player}\n`;
            });
            
            const sittingPlayers = this.players.filter(p => p.quartersSitting.includes(quarter.quarter));
            if (sittingPlayers.length > 0) {
                text += `Sitting: ${sittingPlayers.map(p => p.name).join(', ')}\n`;
            }
            
            text += '\n';
        });
        
        text += '\nPlayer Summary\n';
        text += '--------------\n';
        this.players.forEach(player => {
            text += `${player.name}:\n`;
            text += `  Played: Quarters ${player.quartersPlayed.join(', ') || 'None'}\n`;
            text += `  Sitting: Quarters ${player.quartersSitting.join(', ') || 'None'}\n`;
            const positions = player.positionsPlayed.map(p => `Q${p.quarter}-${p.position}`).join(', ');
            text += `  Positions: ${positions || 'None'}\n\n`;
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

    clearAll() {
        if (confirm('Clear all players and lineup? This cannot be undone.')) {
            this.players = [];
            this.lineup = [];
            this.updatePlayerList();
            document.getElementById('lineupDisplay').classList.add('hidden');
            document.getElementById('fileInput').value = '';
        }
    }

    createFieldVisualization(quarter) {
        const positions = quarter.positions;
        
        // Position coordinates for 7v7 formation (percentage-based)
        const positionCoords = {
            'Keeper': { x: 50, y: 90 },
            'Left Back': { x: 25, y: 70 },
            'Right Back': { x: 75, y: 70 },
            'Left Wing': { x: 15, y: 40 },
            'Right Wing': { x: 85, y: 40 },
            'Midfield': { x: 50, y: 50 },
            'Striker': { x: 50, y: 20 },
            // 5v5 positions
            'Left Mid': { x: 35, y: 50 },
            'Right Mid': { x: 65, y: 50 },
            // 9v9 positions
            'Center Back': { x: 50, y: 75 },
            'Center Mid': { x: 50, y: 45 },
            'Left Forward': { x: 35, y: 25 },
            'Right Forward': { x: 65, y: 25 },
            // 11v11 positions
            'Left Center Back': { x: 40, y: 75 },
            'Right Center Back': { x: 60, y: 75 }
        };
        
        let svg = `
            <div class="field-container">
                <svg viewBox="0 0 400 600" class="soccer-field">
                    <!-- Field background -->
                    <rect x="0" y="0" width="400" height="600" fill="#4a9b4a"/>
                    
                    <!-- Field lines -->
                    <rect x="20" y="20" width="360" height="560" fill="none" stroke="white" stroke-width="3"/>
                    
                    <!-- Center line -->
                    <line x1="20" y1="300" x2="380" y2="300" stroke="white" stroke-width="3"/>
                    
                    <!-- Center circle -->
                    <circle cx="200" cy="300" r="60" fill="none" stroke="white" stroke-width="3"/>
                    <circle cx="200" cy="300" r="5" fill="white"/>
                    
                    <!-- Penalty areas -->
                    <rect x="100" y="20" width="200" height="100" fill="none" stroke="white" stroke-width="3"/>
                    <rect x="100" y="480" width="200" height="100" fill="none" stroke="white" stroke-width="3"/>
                    
                    <!-- Goal areas -->
                    <rect x="140" y="20" width="120" height="40" fill="none" stroke="white" stroke-width="3"/>
                    <rect x="140" y="540" width="120" height="40" fill="none" stroke="white" stroke-width="3"/>
                    
                    <!-- Goals -->
                    <rect x="170" y="10" width="60" height="10" fill="white"/>
                    <rect x="170" y="580" width="60" height="10" fill="white"/>
                    
                    <!-- Penalty spots -->
                    <circle cx="200" cy="80" r="3" fill="white"/>
                    <circle cx="200" cy="520" r="3" fill="white"/>
        `;
        
        // Add player positions
        this.positions.forEach(position => {
            const player = positions[position];
            if (player && positionCoords[position]) {
                const coord = positionCoords[position];
                const x = coord.x * 4; // Convert percentage to SVG coordinates
                const y = coord.y * 6; // Convert percentage to SVG coordinates
                
                // Determine if defensive or offensive position
                const isDefensive = position.includes('Back') || position === 'Keeper';
                const isKeeper = position === 'Keeper';
                
                svg += `
                    <g class="player-marker">
                        <circle cx="${x}" cy="${y}" r="18" 
                            fill="${isKeeper ? '#ffcc00' : isDefensive ? '#3498db' : '#e74c3c'}" 
                            stroke="white" stroke-width="2"/>
                        <text x="${x}" y="${y}" 
                            text-anchor="middle" dominant-baseline="middle" 
                            fill="white" font-size="10" font-weight="bold">
                            ${this.getPlayerInitials(player)}
                        </text>
                    </g>
                `;
            }
        });
        
        svg += `
                </svg>
                <div class="field-legend">
                    <span class="legend-item"><span class="legend-color keeper"></span>Keeper</span>
                    <span class="legend-item"><span class="legend-color defensive"></span>Defense</span>
                    <span class="legend-item"><span class="legend-color offensive"></span>Offense</span>
                </div>
            </div>
        `;
        
        return svg;
    }
    
    getPlayerInitials(name) {
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return parts[0][0] + parts[parts.length - 1][0];
        }
        return name.substring(0, 2).toUpperCase();
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}

// Initialize the application
const lineupGenerator = new SoccerLineupGenerator();