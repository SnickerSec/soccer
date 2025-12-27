/**
 * Authentication Module
 * Handles Google OAuth sign-in/sign-out and session management
 */

import { getSupabase, getSession, getUser, isSupabaseConfigured, onAuthStateChange } from './supabase.js';

// Auth state
let currentUser = null;
let authListeners = [];

/**
 * Sign in with Google OAuth
 * Redirects to Google for authentication
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signInWithGoogle() {
    const supabase = await getSupabase();
    if (!supabase) {
        return { success: false, error: 'Cloud sync not configured' };
    }

    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + window.location.pathname,
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
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signOut() {
    const supabase = await getSupabase();
    if (!supabase) {
        return { success: false, error: 'Cloud sync not configured' };
    }

    try {
        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error('Sign-out error:', error);
            return { success: false, error: error.message };
        }

        currentUser = null;
        return { success: true };
    } catch (error) {
        console.error('Sign-out failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get the current authenticated user with profile info
 * @returns {Promise<object|null>}
 */
export async function getCurrentUser() {
    if (currentUser) {
        return currentUser;
    }

    const user = await getUser();
    if (!user) {
        return null;
    }

    // Fetch profile data
    const supabase = await getSupabase();
    if (supabase) {
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            currentUser = {
                id: user.id,
                email: user.email,
                displayName: profile?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0],
                avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url,
                createdAt: profile?.created_at
            };
        } catch (error) {
            // Profile might not exist yet, use user metadata
            currentUser = {
                id: user.id,
                email: user.email,
                displayName: user.user_metadata?.full_name || user.email?.split('@')[0],
                avatarUrl: user.user_metadata?.avatar_url,
                createdAt: user.created_at
            };
        }
    }

    return currentUser;
}

/**
 * Update the user's profile
 * @param {object} updates - Profile updates (displayName, avatarUrl)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateProfile(updates) {
    const supabase = await getSupabase();
    if (!supabase) {
        return { success: false, error: 'Cloud sync not configured' };
    }

    const user = await getUser();
    if (!user) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { error } = await supabase
            .from('profiles')
            .update({
                display_name: updates.displayName,
                avatar_url: updates.avatarUrl
            })
            .eq('id', user.id);

        if (error) {
            return { success: false, error: error.message };
        }

        // Update cached user
        if (currentUser) {
            currentUser.displayName = updates.displayName ?? currentUser.displayName;
            currentUser.avatarUrl = updates.avatarUrl ?? currentUser.avatarUrl;
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Initialize auth and set up listeners
 * @param {Function} onAuthChange - Callback for auth state changes
 * @returns {Promise<object|null>} Current user if authenticated
 */
export async function initAuth(onAuthChange) {
    if (!isSupabaseConfigured()) {
        return null;
    }

    // Add listener
    if (onAuthChange) {
        authListeners.push(onAuthChange);
    }

    // Set up Supabase auth listener
    await onAuthStateChange(async (event, session) => {
        console.log('Auth state change:', event);

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            currentUser = null; // Clear cache to refetch
            const user = await getCurrentUser();
            notifyListeners('signed_in', user);
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            notifyListeners('signed_out', null);
        }
    });

    // Check for existing session
    const session = await getSession();
    if (session) {
        const user = await getCurrentUser();
        notifyListeners('initialized', user);
        return user;
    }

    return null;
}

/**
 * Add an auth state change listener
 * @param {Function} listener - Called with (event, user) on auth changes
 */
export function addAuthListener(listener) {
    authListeners.push(listener);
}

/**
 * Remove an auth state change listener
 * @param {Function} listener
 */
export function removeAuthListener(listener) {
    authListeners = authListeners.filter(l => l !== listener);
}

/**
 * Notify all listeners of auth state change
 * @param {string} event
 * @param {object|null} user
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
 * @returns {boolean}
 */
export function isCloudAvailable() {
    return isSupabaseConfigured();
}

/**
 * Get user settings from database
 * @returns {Promise<object|null>}
 */
export async function getUserSettings() {
    const supabase = await getSupabase();
    const user = await getUser();

    if (!supabase || !user) {
        return null;
    }

    try {
        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
            console.error('Error fetching user settings:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Error fetching user settings:', error);
        return null;
    }
}

/**
 * Update user settings in database
 * @param {object} settings
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateUserSettings(settings) {
    const supabase = await getSupabase();
    const user = await getUser();

    if (!supabase || !user) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                ...settings
            });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
