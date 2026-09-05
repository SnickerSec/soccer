/**
 * One canonical hostname for the app.
 *
 * The site moved from aysoroster.com to shinguard.app, and both are still
 * pointed at this service so that bookmarks, installed PWAs and invite links
 * already in circulation keep working. Serving the same app on four hostnames
 * is what we do not want: a session cookie is per-origin, so a coach signed in
 * on the old domain looks signed out on the new one, and search engines index
 * both copies. So the legacy names redirect rather than serve.
 *
 * The list is an allowlist rather than "anything that is not canonical".
 * Railway's health check and its generated *.up.railway.app domain reach this
 * server under their own Host, and so does localhost in development; a blanket
 * redirect would bounce all of them and fail the deploy.
 */

export const CANONICAL_HOST = 'shinguard.app';

const LEGACY_HOSTS = new Set([
    'aysoroster.com',
    'www.aysoroster.com',
    'www.shinguard.app',
]);

/**
 * The absolute URL a request should be redirected to, or null to serve it here.
 *
 * Only GET and HEAD are redirected. A 301 on a POST is allowed to be replayed
 * as a GET, which would silently drop the body of an API write; anything else
 * is served on whatever host it arrived at.
 */
export function canonicalRedirect(method, host, originalUrl) {
    if (method !== 'GET' && method !== 'HEAD') return null;
    if (!host) return null;

    // Host carries a port when the client sent one, and case is not significant.
    const hostname = String(host).toLowerCase().split(':')[0];
    if (!LEGACY_HOSTS.has(hostname)) return null;

    return `https://${CANONICAL_HOST}${originalUrl || '/'}`;
}
