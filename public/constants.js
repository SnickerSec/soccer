/**
 * Application Constants
 * Centralized configuration values for the AYSO Roster Pro application
 */

const CONSTANTS = {
    // Player constraints
    MAX_PLAYERS: 30,
    MAX_PLAYER_NAME_LENGTH: 50,
    MIN_PLAYER_NUMBER: 1,
    MAX_PLAYER_NUMBER: 99,
    MAX_CAPTAINS: 2,

    // File constraints
    MAX_FILE_SIZE_BYTES: 1024 * 1024, // 1MB
    MAX_FILE_SIZE_DISPLAY: '1MB',

    // Lineup generation
    MAX_GENERATION_ATTEMPTS: 500,
    GENERATION_DELAY_MS: 10,

    // Quarters
    DEFAULT_QUARTERS: 4,
    MAX_SITTING_QUARTERS: 2,
    MAX_GOALIE_QUARTERS: 1,

    // PDF generation
    MAX_COMMENT_LENGTH: 50,
    PLAYERS_PER_PDF_PAGE: 10,
    MAX_PLAYERS_PDF: 20,

    // UI timing
    NOTIFICATION_DURATION_MS: 3000,
    NOTIFICATION_FADE_MS: 300,
    WELCOME_MESSAGE_DELAY_MS: 500,

    // Undo/Redo
    MAX_UNDO_STACK_SIZE: 20,

    // LocalStorage keys
    STORAGE_KEYS: {
        PLAYERS: 'ayso_players',
        SETTINGS: 'ayso_settings',
        VISITED: 'ayso_visited',
        THEME: 'ayso_theme',
        LINEUP_HISTORY: 'ayso_lineup_history'
    },

    // Theme options
    THEMES: {
        DARK: 'dark',
        LIGHT: 'light'
    },

    // Player status options
    PLAYER_STATUS: {
        AVAILABLE: 'available',
        INJURED: 'injured',
        ABSENT: 'absent'
    },

    // Position categories
    POSITION_TYPES: {
        KEEPER: 'keeper',
        DEFENSIVE: 'defensive',
        OFFENSIVE: 'offensive'
    },

    // Default formations by field size
    DEFAULT_FORMATIONS: {
        5: '2-2',
        6: '2-3-1',
        7: '2-3-1',
        9: '3-3-2',
        11: '4-4-2'
    },

    // Age divisions and their field sizes
    AGE_DIVISIONS: {
        '10U': { fieldSize: 7, altFieldSize: 6 },
        '12U': { fieldSize: 9 },
        '14U': { fieldSize: 11 },
        '16U': { fieldSize: 11 },
        '19U': { fieldSize: 11 }
    },

    // Keyboard shortcuts
    KEYBOARD_SHORTCUTS: {
        GENERATE: { key: 'g', ctrl: true, description: 'Generate lineup' },
        DEMO: { key: 'd', ctrl: true, description: 'Load demo players' },
        PRINT: { key: 'p', ctrl: true, description: 'Print lineup' },
        EXPORT: { key: 'e', ctrl: true, description: 'Export lineup' },
        UNDO: { key: 'z', ctrl: true, description: 'Undo' },
        REDO: { key: 'y', ctrl: true, description: 'Redo' }
    }
};

// Freeze the constants to prevent modification
Object.freeze(CONSTANTS);
Object.freeze(CONSTANTS.STORAGE_KEYS);
Object.freeze(CONSTANTS.THEMES);
Object.freeze(CONSTANTS.PLAYER_STATUS);
Object.freeze(CONSTANTS.POSITION_TYPES);
Object.freeze(CONSTANTS.DEFAULT_FORMATIONS);
Object.freeze(CONSTANTS.AGE_DIVISIONS);
Object.freeze(CONSTANTS.KEYBOARD_SHORTCUTS);

// Export for use in modules (if using ES modules in the future)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONSTANTS;
}
