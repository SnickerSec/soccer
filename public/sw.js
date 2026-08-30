// Service Worker for AYSO Roster Pro - Offline Support
const CACHE_NAME = 'ayso-roster-pro-v38';

// App shell: fetched on install so a first-time visitor who later goes offline
// still gets a working app. The application code itself is the Vite bundle,
// which is hashed per build: vite.config.js reads the built index.html and
// injects those /assets/ paths into this array at build time. Only the static
// files served straight out of public/ are listed by hand here.
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/privacy.html',
    // The privacy page is plain HTML and still uses the hand-written stylesheet
    '/styles.css',
    '/favicon.svg',
    '/assets/icons.svg',
    '/assets/icons/apple-touch-icon-180.png',
    '/manifest.json'
];

// Large, rarely-changing files (PDF libraries, fonts, the evaluation template).
// Cached on first use rather than up front — precaching ~1.5MB would make the
// first visit slow for the many coaches who never open the evaluation form.
// Served cache-first with no revalidation, since they only change on a deploy
// (which bumps CACHE_NAME and drops the whole cache anyway).
const IMMUTABLE_PATHS = ['/vendor/', '/assets/'];

const isImmutable = (pathname) => IMMUTABLE_PATHS.some((prefix) => pathname.startsWith(prefix));

// Install event - cache the app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                console.log('Service Worker: Caching app shell');
                await Promise.all(
                    ASSETS_TO_CACHE.map(async (url) => {
                        try {
                            const res = await fetch(url);
                            if (res.ok) {
                                await cache.put(url, res);
                            }
                        } catch (e) {
                            console.warn('Service worker asset caching error:', url, e);
                        }
                    })
                );
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Clearing old cache');
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Puts a successful response in the cache and returns the original.
function cachePut(request, response) {
    if (response && response.status === 200 && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
}

// Fetch event
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // Never cache API or auth requests
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        return;
    }

    // Cache-first for large immutable assets: no background re-download of a
    // 1.2MB library every time the evaluation form is opened.
    if (isImmutable(url.pathname)) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => cachePut(event.request, response));
            })
        );
        return;
    }

    // Stale-while-revalidate for app code: serve the cached copy immediately,
    // then refresh it in the background so the next load picks up a new deploy
    // even if CACHE_NAME was not bumped.
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const network = fetch(event.request)
                .then((response) => cachePut(event.request, response))
                .catch(() => {
                    // Offline: fall back to the cached shell for navigations
                    if (!cached && event.request.mode === 'navigate') {
                        return caches.match('/index.html') || caches.match('/');
                    }
                    return cached;
                });

            return cached || network;
        })
    );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
