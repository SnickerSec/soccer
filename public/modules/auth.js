/**
 * Authentication Module
 * Handles Google OAuth sign-in/sign-out via Supabase, with backend session sync
 */

import { getSupabase, getSession, isSupabaseConfigured, onAuthStateChange } from './supabase.js';
import { api, clearUserCache } from './api-client.js';

// Auth state
let currentUser = null;
let authListeners = [];
let sessionSyncInProgress = false;

/**
 * Exchange a Supabase access token for a backend session
 */
async function syncSessionToBackend(accessToken) {
    if (sessionSyncInProgress) return;
    sessionSyncInProgress = true;
    try {
        await api.post('/api/auth/supabase-session', { accessToken });
    } catch (e) {
        console.error('Backend session sync failed:', e);
    } finally {
        sessionSyncInProgress = false;
    }
}

/**
 * Sign in with Google OAuth via Supabase
 */
export async function signInWithGoogle() {
    const supabase = await getSupabase();
    if (!supabase) {
        return { success: false, error: 'Cloud sync not configured' };
    }

    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });

        if (error) {
            console.error('Google sign-in error:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Sign-in failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sign out the current user
 */
export async function signOut() {
    const supabase = await getSupabase();
    currentUser = null;
    clearUserCache();

    if (supabase) {
        await supabase.auth.signOut();
    }

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

    // Try backend session first (fastest path after sync)
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

    // Set up Supabase auth listener
    await onAuthStateChange(async (event, session) => {
        if (['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) {
            if (session?.access_token) {
                await syncSessionToBackend(session.access_token);
            }
            currentUser = null;
            clearUserCache();
            const user = await getCurrentUser();
            if (user) notifyListeners('signed_in', user);
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            clearUserCache();
            notifyListeners('signed_out', null);
        }
    });

    // Check for existing Supabase session on load
    const session = await getSession();
    if (session?.access_token) {
        await syncSessionToBackend(session.access_token);
        const user = await getCurrentUser();
        if (user) {
            notifyListeners('initialized', user);
            return user;
        }
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
