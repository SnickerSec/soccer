class SoccerLineupGenerator {
    constructor() {
        this.players = [];
        this.captains = []; // Track selected captains
        this.ageDivision = '10U';
        this.formation = '2-3-1';
        this.quarters = 4;
        this.playersOnField = 7;
        this.positions = [];
        this.lineup = [];
        
        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.initializeDefaults();
        this.showWelcomeMessage();
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

        // Player evaluation form
        document.getElementById('generateEvaluation').addEventListener('click', () => this.generatePlayerEvaluationPDF());

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
        
        if (this.players.length >= 30) {
            this.showNotification('Maximum roster size reached (30 players)', 'error');
            return;
        }
        
        this.players.push({
            name: safeName,
            number: number,
            isCaptain: false,
            mustRest: false,
            noKeeper: false,
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
        // Remove from captains if they were a captain
        const captainIndex = this.captains.indexOf(name);
        if (captainIndex > -1) {
            this.captains.splice(captainIndex, 1);
        }
        this.players = this.players.filter(p => p.name !== name);
        this.updatePlayerList();
        this.savePlayers();
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
            const captainIcon = isCaptain ? '⭐' : '';
            li.innerHTML = `
                <label class="player-item">
                    <input type="checkbox" class="captain-checkbox" ${isCaptain ? 'checked' : ''}
                           onchange="lineupGenerator.toggleCaptain('${player.name}')" />
                    <input type="number" class="player-number-edit"
                           value="${player.number || ''}"
                           placeholder="#"
                           min="1" max="99"
                           onchange="lineupGenerator.updatePlayerNumber(${index}, this.value)"
                           onclick="event.stopPropagation()" />
                    <span class="player-name-display">${captainIcon} ${player.name}</span>
                </label>
                <button class="remove-btn" onclick="lineupGenerator.removePlayer('${player.name}')">×</button>
            `;
            list.appendChild(li);
        });

        // Also update evaluation list
        this.updateEvaluationList();
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

        const targetPane = tabName === 'roster' ? 'roster-tab' : 'evaluation-tab';
        document.getElementById(targetPane).classList.add('active');

        // Update evaluation list when switching to evaluation tab
        if (tabName === 'evaluation') {
            this.updateEvaluationList();
        }
    }

    updateEvaluationList() {
        const evalList = document.getElementById('evaluationPlayerList');

        if (this.players.length === 0) {
            evalList.innerHTML = '<div class="evaluation-empty">No players added yet. Add players in the Roster Management tab.</div>';
            return;
        }

        evalList.innerHTML = '';

        this.players.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'evaluation-player-item';

            const numberBadge = player.number ? `<span class="eval-player-number">#${player.number}</span>` : '';

            playerDiv.innerHTML = `
                <div class="eval-player-name">
                    ${player.name}
                    ${numberBadge}
                </div>
                <div class="eval-rating-group">
                    <label for="rating-${index}">Rating</label>
                    <select id="rating-${index}" onchange="lineupGenerator.updatePlayerRating(${index}, this.value)">
                        <option value="">-</option>
                        <option value="1" ${player.rating === 1 ? 'selected' : ''}>1 - Limited</option>
                        <option value="2" ${player.rating === 2 ? 'selected' : ''}>2 - Fair</option>
                        <option value="3" ${player.rating === 3 ? 'selected' : ''}>3 - Average</option>
                        <option value="4" ${player.rating === 4 ? 'selected' : ''}>4 - Very Accomplished</option>
                        <option value="5" ${player.rating === 5 ? 'selected' : ''}>5 - Excellent</option>
                    </select>
                </div>
                <div class="eval-comment-group">
                    <label for="comment-${index}">Comments / Parental Support</label>
                    <textarea id="comment-${index}"
                              placeholder="Enter comments about player skill or parental support..."
                              onchange="lineupGenerator.updatePlayerComment(${index}, this.value)">${player.comment || ''}</textarea>
                </div>
            `;

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
        if (!localStorage.getItem('ayso_visited')) {
            localStorage.setItem('ayso_visited', 'true');
            setTimeout(() => {
                this.showNotification('Welcome to AYSO Roster Pro! Add players to get started.', 'info');
            }, 500);
        }
    }

    async generateLineup() {
        if (this.players.length < this.playersOnField) {
            this.showNotification(`Need at least ${this.playersOnField} players. Currently have ${this.players.length}.`, 'error');
            return;
        }

        // Additional warning for small rosters
        const recommendedPlayers = Math.ceil(this.playersOnField * 1.5);
        if (this.players.length < recommendedPlayers) {
            this.showNotification(`Note: With ${this.players.length} players, some rotation rules may be challenging. Recommend ${recommendedPlayers}+ players.`, 'warning');
        }

        const maxAttempts = 500; // Maximum number of attempts to prevent infinite loops
        let attempts = 0;
        let validation = [];
        let bestLineup = null;
        let bestValidationCount = Infinity;
        
        // Show loading indicator
        const generateBtn = document.getElementById('generateLineup');
        const originalText = generateBtn.textContent;
        generateBtn.disabled = true;
        
        // Keep trying until we get a valid lineup or hit max attempts
        do {
            attempts++;
            generateBtn.textContent = `Generating... (Attempt ${attempts})`;
            
            // Add a small delay to allow UI to update
            if (attempts > 1) {
                await new Promise(resolve => setTimeout(resolve, 10));
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
        
        // Reset button
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
        } else if (attempts > 1) {
            this.showNotification(`Successfully generated lineup after ${attempts} attempts`, 'success');
        } else {
            this.showNotification('Lineup generated successfully!', 'success');
        }
        
        // Automatically mark 2 random players as captains after lineup generation
        this.captains = [];
        this.players.forEach(p => p.isCaptain = false);
        
        if (this.players.length >= 2) {
            // Shuffle players to randomize selection
            const shuffledPlayers = [...this.players];
            this.shuffleArray(shuffledPlayers);
            
            // Select first 2 as captains
            for (let i = 0; i < 2; i++) {
                const player = shuffledPlayers[i];
                player.isCaptain = true;
                this.captains.push(player.name);
            }
            
            // Update player list to reflect new captains
            this.updatePlayerList();
        }
        
        this.displayLineup(validation);
        this.savePlayers();
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
            mustRest: p.mustRest,
            sittingQuarters: []
        }));

        // Separate players who must rest from others
        const mustRestPlayers = playersCopy.filter(p => p.mustRest);
        const regularPlayers = playersCopy.filter(p => !p.mustRest);

        // Shuffle the regular players array to randomize who sits extra
        this.shuffleArray(regularPlayers);

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

        // Third pass: randomly select players who need to sit extra
        // Shuffle again to ensure different players get extra sits each time
        const playersForExtraSit = [...allPlayersCombined];
        this.shuffleArray(playersForExtraSit);

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

        // Find players who haven't been keeper yet from the allowed pool
        const potentialKeepers = poolToSelectFrom.filter(player => !player.goalieQuarter);

        if (potentialKeepers.length > 0) {
            // Random selection from those who haven't been keeper
            return potentialKeepers[Math.floor(Math.random() * potentialKeepers.length)];
        }

        // If all allowed players have been keeper, return any available player from the pool
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
                const playerName = quarter.positions[position] || 'TBD';
                const player = this.players.find(p => p.name === playerName);
                const captainIndicator = player && player.isCaptain ? '<span class="captain-star">⭐</span> ' : '';
                const numberStr = player && player.number ? `<span class="player-number">#${player.number}</span> ` : '';
                const isKeeper = position === 'Keeper';
                html += `
                    <tr class="${isKeeper ? 'keeper-row' : ''}">
                        <td class="position">${position}:</td>
                        <td class="player-name">${numberStr}${captainIndicator}${playerName}</td>
                    </tr>
                `;
            });

            // Show sitting players
            const sittingPlayers = this.players.filter(p => p.quartersSitting.includes(quarter.quarter));
            if (sittingPlayers.length > 0) {
                const sittingText = sittingPlayers.map(p => {
                    const captainIndicator = p.isCaptain ? '<span class="captain-star">⭐</span> ' : '';
                    const numberStr = p.number ? `<span class="player-number">#${p.number}</span> ` : '';
                    return `${numberStr}${captainIndicator}${p.name}`;
                }).join(', ');
                html += `
                    <tr class="sitting-row">
                        <td class="position">Resting:</td>
                        <td class="player-name">${sittingText}</td>
                    </tr>
                `;
            }

            html += '</table>';
            quarterDiv.innerHTML = html;
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

        // Get the existing export and print buttons
        const exportBtn = document.getElementById('exportLineup');
        const printBtn = document.getElementById('printLineup');

        // Clone the buttons so we can place them in the new location
        const regenerateBtnClone = regenerateBtn.cloneNode(true);
        regenerateBtnClone.addEventListener('click', () => this.generateLineup());
        const exportBtnClone = exportBtn.cloneNode(true);
        exportBtnClone.addEventListener('click', () => this.exportLineup());
        const printBtnClone = printBtn.cloneNode(true);
        printBtnClone.addEventListener('click', () => this.printLineup());

        // Add buttons to the new container
        actionButtonsContainer.appendChild(regenerateBtnClone);
        actionButtonsContainer.appendChild(exportBtnClone);
        actionButtonsContainer.appendChild(printBtnClone);

        // Insert the action buttons AFTER the grid (outside of grid constraint)
        display.insertBefore(actionButtonsContainer, display.querySelector('.action-buttons'));

        // Add player summary to the grid
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'player-summary';
        summaryDiv.innerHTML = '<h3>Player Summary</h3>' + this.getPlayerSummary();

        // Insert summary AFTER the action buttons
        display.insertBefore(summaryDiv, display.querySelector('.action-buttons'));

        // Hide the original action buttons at the bottom
        const originalActionButtons = document.querySelector('.action-buttons');
        if (originalActionButtons) {
            originalActionButtons.style.display = 'none';
        }

        display.classList.remove('hidden');
    }

    getPlayerSummary() {
        let html = '<table><thead><tr><th>Rest</th><th>No Keeper</th><th>Player</th><th>Captain</th><th>Quarters Played</th><th>Quarters Resting</th><th>Defense/Offense</th><th>Positions</th></tr></thead><tbody>'

        this.players.forEach(player => {
            const captainIndicator = player.isCaptain ? '⭐ Yes' : 'No';
            const positions = player.positionsPlayed.map(p => `Q${p.quarter}: ${p.position}`).join(', ');
            const defensive = player.defensiveQuarters || 0;
            const offensive = player.offensiveQuarters || 0;
            const numberStr = player.number ? ` #${player.number}` : '';
            const restChecked = player.mustRest ? 'checked' : '';
            const noKeeperChecked = player.noKeeper ? 'checked' : '';
            html += `
                <tr>
                    <td><input type="checkbox" class="rest-checkbox" ${restChecked}
                               onchange="lineupGenerator.toggleRestPreference('${player.name}')"
                               title="Check to ensure this player rests at least 1 quarter" /></td>
                    <td><input type="checkbox" class="no-keeper-checkbox" ${noKeeperChecked}
                               onchange="lineupGenerator.toggleNoKeeperPreference('${player.name}')"
                               title="Check to prevent this player from playing keeper" /></td>
                    <td>${player.name}${numberStr}</td>
                    <td>${captainIndicator}</td>
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
            this.players = [];
            this.captains = [];
            this.lineup = [];
            this.updatePlayerList();
            document.getElementById('lineupDisplay').classList.add('hidden');
            document.getElementById('fileInput').value = '';
            localStorage.removeItem('ayso_players');
            localStorage.removeItem('ayso_settings');
            this.showNotification('All data cleared', 'info');
        }
    }

    createFieldVisualization(quarter) {
        const positions = quarter.positions;
        
        // Position coordinates for all formations (percentage-based)
        const positionCoords = {
            'Keeper': { x: 50, y: 90 },
            // 2-3-1 Formation positions
            'Left Back': { x: 25, y: 70 },
            'Right Back': { x: 75, y: 70 },
            'Left Wing': { x: 15, y: 40 },
            'Right Wing': { x: 85, y: 40 },
            'Center Mid': { x: 50, y: 45 },
            'Striker': { x: 50, y: 20 },
            // 3-2-1 Formation positions
            'Center Back': { x: 50, y: 72 },
            'Left Mid': { x: 30, y: 45 },
            'Right Mid': { x: 70, y: 45 },
            // 2-2-2 Formation positions
            'Left Striker': { x: 35, y: 20 },
            'Right Striker': { x: 65, y: 20 },
            // Legacy/Other formations
            'Midfield': { x: 50, y: 50 },
            // 9v9 positions
            'Left Forward': { x: 35, y: 25 },
            'Right Forward': { x: 65, y: 25 },
            // 11v11 positions
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
        
        let svg = `
            <div class="field-container" role="img" aria-label="Soccer field visualization showing player positions for Quarter ${quarter.quarter}">
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
                
                // Get player info for displaying number or initials
                const playerInfo = this.players.find(p => p.name === player);
                const displayText = playerInfo && playerInfo.number ? playerInfo.number : this.getPlayerInitials(player);
                
                svg += `
                    <g class="player-marker">
                        <circle cx="${x}" cy="${y}" r="18" 
                            fill="${isKeeper ? '#ffcc00' : isDefensive ? '#3498db' : '#e74c3c'}" 
                            stroke="white" stroke-width="2"/>
                        <text x="${x}" y="${y}" 
                            text-anchor="middle" dominant-baseline="middle" 
                            fill="white" font-size="${playerInfo && playerInfo.number ? '12' : '10'}" font-weight="bold">
                            ${displayText}
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
    
    loadData() {
        // Load players
        const savedPlayers = localStorage.getItem('ayso_players');
        if (savedPlayers) {
            this.players = JSON.parse(savedPlayers);
            // Reconstruct captains from player data
            this.captains = this.players.filter(p => p.isCaptain).map(p => p.name);
        }

        // Load settings
        const savedSettings = localStorage.getItem('ayso_settings');
        if (savedSettings) {
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
        }

        // Update player list after loading
        this.updatePlayerList();
        this.updatePositions();
        this.updateFormationDescription();
        this.updateAgeRules();
    }

    savePlayers() {
        localStorage.setItem('ayso_players', JSON.stringify(this.players));
    }

    saveSettings() {
        const settings = {
            ageDivision: this.ageDivision,
            playersOnField: this.playersOnField,
            formation: this.formation
        };
        localStorage.setItem('ayso_settings', JSON.stringify(settings));
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
            alert('Please add players first before generating the evaluation form.');
            return;
        }

        const coachName = document.getElementById('coachName').value.trim();
        const assistantCoach = document.getElementById('assistantCoach').value.trim();
        const division = document.getElementById('division').value;
        const gender = document.getElementById('gender').value;

        if (!coachName) {
            alert('Please enter the coach name.');
            return;
        }

        try {
            // Load the PDF template
            const templateUrl = '/assets/Player Evaluation Form 2025.pdf';
            const existingPdfBytes = await fetch(templateUrl).then(res => res.arrayBuffer());

            // Load pdf-lib
            const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

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

            // Add coach signature at coordinate 241, 80 (using italic/oblique for cursive look)
            const coachSignatureWidth = helveticaOblique.widthOfTextAtSize(coachName, fontSize);
            firstPage.drawText(coachName, {
                x: 241 - (coachSignatureWidth / 2),
                y: 81,  // 80 + 1 to match other Y adjustment
                size: fontSize,
                font: helveticaOblique,
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

            alert('Player Evaluation Form generated successfully!');
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF. Please make sure the template file is accessible.');
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