/**
 * Guards the service worker's precache list against drift.
 *
 * An asset missing from ASSETS_TO_CACHE is invisible while online — the app only
 * breaks offline, on a sideline, which is exactly where it is needed.
 *
 * The application code is no longer listed here by hand: it is the Vite bundle,
 * hashed per build, and vite.config.js injects those paths at build time. So
 * what needs guarding is the handful of static files under public/ and the
 * injection point itself, which is a string replace and would silently stop
 * matching if this file were reformatted.
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const swSource = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');

/** The string literals inside the ASSETS_TO_CACHE array in sw.js. */
function precachedAssets() {
    const match = swSource.match(/const ASSETS_TO_CACHE = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('service worker precache', () => {
    test('every precached path exists in public/', () => {
        // '/' and '/index.html' are the built app shell, which lives in dist/
        const shell = ['/', '/index.html'];
        const missing = precachedAssets()
            .filter(asset => !shell.includes(asset))
            .filter(asset => !fs.existsSync(path.join(publicDir, asset.replace(/^\//, ''))));

        expect(missing).toEqual([]);
    });

    test('the app shell is precached, so a navigation works offline', () => {
        expect(precachedAssets()).toEqual(expect.arrayContaining(['/', '/index.html']));
    });

    test('the build can still find the array it injects the bundle into', () => {
        // vite.config.js replaces this exact opening; no match means the bundle
        // is never precached and the app is dead offline, with nothing failing
        const marker = 'const ASSETS_TO_CACHE = [';
        expect(swSource).toContain(marker);
        expect(fs.readFileSync(path.join(rootDir, 'vite.config.js'), 'utf8')).toContain(marker);
    });

    test('nothing is precached from the retired pre-React app', () => {
        const dead = precachedAssets().filter(
            asset => asset === '/app.js' || asset === '/constants.js' ||
                asset === '/lineup-worker.js' || asset.startsWith('/modules/')
        );

        expect(dead).toEqual([]);
    });
});
