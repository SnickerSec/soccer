/**
 * Authentication Module
 * Handles Google OAuth sign-in/sign-out via direct server-side flow
 */

import { api, clearUserCache, getUser } from './api-client.js';
import { clearTeamScopedData } from './storage.js';

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
    // The cached roster and season history belong to the account being signed
    // out of; leaving them would show them to whoever loads the page next.
    clearTeamScopedData();

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

    // Goes through the api-client cache rather than hitting /api/auth/me
    // again: both modules ask on startup, which doubled the auth requests.
    const user = await getUser();
    if (user) {
        currentUser = {
            id: user.id,
            email: user.email,
            displayName: user.displayName || user.email?.split('@')[0],
            avatarUrl: user.avatarUrl,
            createdAt: user.createdAt
        };
        return currentUser;
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
