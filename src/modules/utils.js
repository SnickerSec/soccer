// Utility functions

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') return str;
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

/**
 * Shuffle array in place using Fisher-Yates algorithm
 */
export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Shuffle items within groups that have similar values
 */
export function shuffleWithinSimilarGroups(array, getGroupValue) {
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

/**
 * Deep clone an object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Format date for display
 */
export function formatDate(date, options = {}) {
    const defaults = {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    };
    return new Date(date).toLocaleDateString('en-US', { ...defaults, ...options });
}

/**
 * Debounce function calls
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
