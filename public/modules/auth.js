/**
 * Authentication Module
 * Handles Google OAuth sign-in/sign-out via direct server-side flow
 */

import { api, clearUserCache } from './api-client.js';

// Auth state
let currentUser = null;
let authListeners = [];

/**
 * Sign in with Google OAuth (redirects to server-side flow)
 */
export function signInWithGoogle() {
    window.location.href = '/auth/google';
}

/**
 * Sign out the current user
 */
export async function signOut() {
    currentUser = null;
    clearUserCache();

    try {
        await api.post('/api/auth/logout');
    } catch (e) {
        // Session may already be gone
    }

    window.location.href = '/';
    return { success: true };
}

/**
 * Get the current authenticated user
 */
export async function getCurrentUser() {
    if (currentUser) {
        return currentUser;
    }

    try {
        const result = await api.get('/api/auth/me');
        if (result.success && result.data) {
            currentUser = {
                id: result.data.id,
                email: result.data.email,
                displayName: result.data.displayName || result.data.email?.split('@')[0],
                avatarUrl: result.data.avatarUrl,
                createdAt: result.data.createdAt
            };
            return currentUser;
        }
    } catch (e) {
        // Backend session not available
    }

    return null;
}

/**
 * Initialize auth and set up listeners
 * @param {Function} onAuthChange - Callback for auth state changes
 * @returns {Promise<object|null>} Current user if authenticated
 */
export async function initAuth(onAuthChange) {
    if (onAuthChange) {
        authListeners.push(onAuthChange);
    }

    const user = await getCurrentUser();
    if (user) {
        notifyListeners('initialized', user);
    }
    return user;
}

/**
 * Add an auth state change listener
 */
export function addAuthListener(listener) {
    authListeners.push(listener);
}

/**
 * Remove an auth state change listener
 */
export function removeAuthListener(listener) {
    authListeners = authListeners.filter(l => l !== listener);
}

/**
 * Notify all listeners of auth state change
 */
function notifyListeners(event, user) {
    authListeners.forEach(listener => {
        try {
            listener(event, user);
        } catch (error) {
            console.error('Auth listener error:', error);
        }
    });
}

/**
 * Check if cloud sync is available
 */
export function isCloudAvailable() {
    return isCloudConfigured();
}

/**
 * Check if cloud backend is configured (always true with self-hosted)
 */
export function isCloudConfigured() {
    return true;
}

/**
 * Get user settings from database
 */
export async function getUserSettings() {
    try {
        const result = await api.get('/api/settings');
        if (result.success) {
            return result.data;
        }
        return null;
    } catch (error) {
        console.error('Error fetching user settings:', error);
        return null;
    }
}

/**
 * Update user settings in database
 */
export async function updateUserSettings(settings) {
    try {
        const result = await api.put('/api/settings', settings);
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}
