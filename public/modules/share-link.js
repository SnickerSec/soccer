/**
 * Packing a lineup into a URL and getting it back out.
 *
 * The payload is JSON, UTF-8, base64url. Each of those matters:
 *
 *   UTF-8 — btoa() only accepts code points up to U+00FF, so encoding a roster
 *   straight through it throws on any name outside Latin-1. That is not an edge
 *   case: an iPhone types the curly apostrophe U+2019 for "D'Angelo" by
 *   default, and names in Polish, Romanian, Hungarian, Turkish, or any
 *   non-Latin script are past it too. The throw escaped uncaught, so Share
 *   simply did nothing.
 *
 *   base64url — '+' and '/' are not safe in a query string ('+' decodes as a
 *   space), and while plain ASCII JSON produces them only rarely, "rarely" here
 *   means a share link that works for most teams and silently fails for one.
 */

/** Base64 for arbitrary bytes, chunked so a big roster cannot blow the stack. */
function bytesToBase64(bytes) {
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

const toUrlSafe = (base64) => base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromUrlSafe(encoded) {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    // atob wants the padding back
    return base64 + '='.repeat((4 - (base64.length % 4)) % 4);
}

/**
 * Packs a shareable payload into the value of a `lineup` query parameter.
 * @param {object} data the lineup, players and settings to share
 */
export function encodeShareData(data) {
    const utf8 = new TextEncoder().encode(JSON.stringify(data));
    return toUrlSafe(bytesToBase64(utf8));
}

/**
 * Unpacks what encodeShareData produced.
 *
 * Also reads links made before this was UTF-8 and url-safe, so one already sent
 * round a team chat keeps working. Those are plain base64 of Latin-1, which
 * TextDecoder would turn into mojibake rather than fail on, so the legacy path
 * is tried only when the modern one does not yield valid JSON.
 *
 * @returns {object|null} the payload, or null if it cannot be read
 */
export function decodeShareData(encoded) {
    if (!encoded) return null;

    try {
        // fatal, so bytes that are not valid UTF-8 throw here and fall through
        // to the legacy path. Left lenient, a Latin-1 payload decodes to
        // replacement characters instead — valid JSON, wrong names, no error.
        const utf8 = new TextDecoder('utf-8', { fatal: true });
        return JSON.parse(utf8.decode(base64ToBytes(fromUrlSafe(encoded))));
    } catch {
        // Fall through to the pre-UTF-8 format
    }

    try {
        return JSON.parse(atob(encoded));
    } catch {
        return null;
    }
}

/**
 * The full share URL for a payload.
 * @param {object} data
 * @param {{origin: string, pathname: string}} location where the app is served
 */
export function buildShareUrl(data, location) {
    return `${location.origin}${location.pathname}?lineup=${encodeShareData(data)}`;
}
