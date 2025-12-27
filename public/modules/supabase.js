/**
 * Supabase Client Module
 * Handles initialization and provides the Supabase client instance
 */

// Supabase configuration
const SUPABASE_CONFIG = {
    url: 'https://mokykxzodxdjgmhyraje.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1va3lreHpvZHhkamdtaHlyYWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3NzUwNTUsImV4cCI6MjA4MjM1MTA1NX0.kem-9MJ_u3_8qI6X5X0AHVvL11TK2_2M4k5c1pTLEV8'
};

let supabaseClient = null;
let supabasePromise = null;

/**
 * Check if Supabase is configured
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
    return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

/**
 * Initialize and get the Supabase client
 * Lazy loads the Supabase library from CDN
 * @returns {Promise<object|null>} Supabase client or null if not configured
 */
export async function getSupabase() {
    if (!isSupabaseConfigured()) {
        console.warn('Supabase not configured. Cloud sync disabled.');
        return null;
    }

    if (supabaseClient) {
        return supabaseClient;
    }

    if (supabasePromise) {
        return supabasePromise;
    }

    supabasePromise = initSupabase();
    return supabasePromise;
}

/**
 * Internal initialization function
 * @returns {Promise<object>}
 */
async function initSupabase() {
    try {
        // Dynamic import from CDN
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

        supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                storage: window.localStorage,
                storageKey: 'ayso_supabase_auth'
            },
            realtime: {
                params: {
                    eventsPerSecond: 10
                }
            }
        });

        console.log('Supabase client initialized');
        return supabaseClient;
    } catch (error) {
        console.error('Failed to initialize Supabase:', error);
        supabasePromise = null;
        return null;
    }
}

/**
 * Get the current session
 * @returns {Promise<object|null>}
 */
export async function getSession() {
    const supabase = await getSupabase();
    if (!supabase) return null;

    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
            console.error('Error getting session:', error);
            return null;
        }
        return session;
    } catch (error) {
        console.error('Error getting session:', error);
        return null;
    }
}

/**
 * Get the current user
 * @returns {Promise<object|null>}
 */
export async function getUser() {
    const session = await getSession();
    return session?.user || null;
}

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
    const session = await getSession();
    return !!session;
}

/**
 * Subscribe to auth state changes
 * @param {Function} callback - Called with (event, session) on auth changes
 * @returns {Promise<object|null>} Subscription object with unsubscribe method
 */
export async function onAuthStateChange(callback) {
    const supabase = await getSupabase();
    if (!supabase) return null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });

    return subscription;
}

/**
 * Get Supabase config info (for debugging, doesn't expose full key)
 * @returns {object}
 */
export function getConfigInfo() {
    return {
        configured: isSupabaseConfigured(),
        url: SUPABASE_CONFIG.url || '(not set)',
        keyPrefix: SUPABASE_CONFIG.anonKey ? SUPABASE_CONFIG.anonKey.substring(0, 20) + '...' : '(not set)'
    };
}
