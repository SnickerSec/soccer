// Storage utilities for localStorage operations

export function safeGetFromStorage(key) {
    if (typeof localStorage === 'undefined') return null;
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.warn('localStorage read error:', error);
        return null;
    }
}

export function safeSetToStorage(key, value) {
    if (typeof localStorage === 'undefined') return false;
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        if (error.name === 'QuotaExceededError' || error.code === 22) {
            console.warn('Storage quota exceeded');
        } else {
            console.warn('localStorage write error:', error);
        }
        return false;
    }
}

export function safeRemoveFromStorage(key) {
    if (typeof localStorage === 'undefined') return false;
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.warn('localStorage remove error:', error);
        return false;
    }
}

// Keys holding a signed-in user's roster/season data, as opposed to device
// preferences like theme. Cleared on sign-out and when the last team is
// deleted, so the next user (or the same user with no teams) doesn't inherit
// the previous account's players and game history.
const TEAM_SCOPED_KEYS = [
    'ayso_players',
    'ayso_lineup_history',
    'ayso_schedule_fixtures',
    'ayso_settings',
    'ayso_sync_queue',
    'ayso_migration_status',
    'ayso_current_team'
];

export function clearTeamScopedData() {
    TEAM_SCOPED_KEYS.forEach(safeRemoveFromStorage);
}

export function safeParseJSON(jsonString, fallback = null) {
    if (!jsonString) return fallback;
    try {
        const parsed = JSON.parse(jsonString);
        return parsed !== null && parsed !== undefined ? parsed : fallback;
    } catch (error) {
        console.warn('JSON parse error:', error);
        return fallback;
    }
}
