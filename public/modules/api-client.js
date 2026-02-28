/**
 * API Client Module
 * Thin fetch() wrapper replacing the Supabase client
 */

let cachedUser = null;
let csrfToken = null;

const STATE_CHANGING_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

/**
 * Fetch a CSRF token from the server and cache it
 */
async function ensureCsrfToken() {
    if (csrfToken) return;
    try {
        const res = await fetch('/api/csrf-token', { credentials: 'include' });
        const data = await res.json();
        csrfToken = data.token;
    } catch (e) {
        // Server may not be available
    }
}

/**
 * Make an authenticated API request
 */
async function request(method, url, body = null) {
    if (STATE_CHANGING_METHODS.includes(method)) {
        await ensureCsrfToken();
    }

    const options = {
        method,
        credentials: 'include',
        headers: {}
    };

    if (STATE_CHANGING_METHODS.includes(method) && csrfToken) {
        options.headers['x-csrf-token'] = csrfToken;
    }

    if (body !== null) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    return response.json();
}

export const api = {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body),
    delete: (url) => request('DELETE', url)
};

/**
 * Check if cloud backend is configured (always true with self-hosted)
 */
export function isSupabaseConfigured() {
    return true;
}

/**
 * Get current session (check auth status)
 */
export async function getSession() {
    const user = await getUser();
    return user ? { user } : null;
}

/**
 * Get current user from server
 */
export async function getUser() {
    if (cachedUser !== undefined && cachedUser !== null) {
        return cachedUser;
    }

    try {
        const result = await api.get('/api/auth/me');
        if (result.success && result.data) {
            cachedUser = result.data;
            await ensureCsrfToken();
            return cachedUser;
        }
    } catch (e) {
        // Offline or server error
    }

    cachedUser = null;
    return null;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
    const user = await getUser();
    return !!user;
}

/**
 * Clear cached user (called on sign-out)
 */
export function clearUserCache() {
    cachedUser = null;
}
