/**
 * API Client Module
 * Thin fetch() wrapper replacing the Supabase client
 */

let cachedUser = null;

/**
 * Make an authenticated API request
 */
async function request(method, url, body = null) {
    const options = {
        method,
        credentials: 'include',
        headers: {}
    };

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
