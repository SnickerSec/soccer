/**
 * One canonical hostname for the app.
 *
 * The app answers on shinguard.app and on www.shinguard.app, and only the
 * apex should serve it. A session cookie belongs to an origin, so a coach who
 * signed in on one would look signed out on the other, and search engines
 * would index two copies of the same site.
 *
 * The list is an allowlist rather than "anything that is not canonical".
 * Railway's health check and its generated *.up.railway.app domain reach this
 * server under their own Host, and so does localhost in development; a blanket
 * redirect would bounce all of them and fail the deploy.
 */

export const CANONICAL_HOST = 'shinguard.app';

const REDIRECTED_HOSTS = new Set([
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
    if (!REDIRECTED_HOSTS.has(hostname)) return null;

    return `https://${CANONICAL_HOST}${originalUrl || '/'}`;
}
