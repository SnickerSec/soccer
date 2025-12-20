// Storage utilities for localStorage operations

export function safeGetFromStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.warn('localStorage read error:', error);
        return null;
    }
}

export function safeSetToStorage(key, value) {
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
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.warn('localStorage remove error:', error);
        return false;
    }
}

export function safeParseJSON(jsonString, fallback = null) {
    if (!jsonString) return fallback;
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn('JSON parse error:', error);
        return fallback;
    }
}
