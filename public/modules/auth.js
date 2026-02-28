/**
 * Authentication Module
 * Handles Google OAuth sign-in/sign-out and session management
 */

import { api, getUser, isAuthenticated, isSupabaseConfigured, clearUserCache } from './api-client.js';

// Auth state
let currentUser = null;
let authListeners = [];

/**
 * Sign in with Google OAuth
 * Redirects to the server-side OAuth flow
 */
export async function signInWithGoogle() {
    window.location.href = '/auth/google';
    return { success: true };
}

/**
 * Sign out the current user
 */
export async function signOut() {
    currentUser = null;
    clearUserCache();
    await api.post('/api/auth/logout');
    window.location.href = '/';
    return { success: true };
}

/**
 * Get the current authenticated user with profile info
 */
export async function getCurrentUser() {
    if (currentUser) {
        return currentUser;
    }

    const user = await getUser();
    if (!user) {
        return null;
    }

    currentUser = {
        id: user.id,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0],
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt
    };

    return currentUser;
}

/**
 * Update the user's profile
 */
export async function updateProfile(updates) {
    // Not implemented in new API yet — placeholder
    return { success: false, error: 'Not implemented' };
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

    // Check current session via API
    const user = await getCurrentUser();
    if (user) {
        notifyListeners('initialized', user);
        return user;
    }

    return null;
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
    return isSupabaseConfigured();
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
