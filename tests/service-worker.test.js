/**
 * Guards the service worker's precache list against drift.
 *
 * A module missing from ASSETS_TO_CACHE is invisible while online — the app only
 * breaks offline, on a sideline, which is exactly where it is needed. Adding a
 * module to public/modules/ without adding it here has already happened once.
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

/** The string literals inside the ASSETS_TO_CACHE array in sw.js. */
function precachedAssets() {
    const source = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
    const match = source.match(/const ASSETS_TO_CACHE = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('service worker precache', () => {
    test('every ES module in public/modules/ is precached', () => {
        const modules = fs.readdirSync(path.join(publicDir, 'modules'))
            .filter(file => file.endsWith('.js'))
            .map(file => `/modules/${file}`);

        expect(modules.length).toBeGreaterThan(0);

        const cached = precachedAssets();
        const missing = modules.filter(m => !cached.includes(m));
        expect(missing).toEqual([]);
    });

    test('every precached path exists on disk', () => {
        // '/' is the index route rather than a file
        const missing = precachedAssets()
            .filter(asset => asset !== '/')
            .filter(asset => !fs.existsSync(path.join(publicDir, asset.replace(/^\//, ''))));

        expect(missing).toEqual([]);
    });

    test('top-level scripts loaded by index.html are precached', () => {
        const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
        const cached = precachedAssets();

        // Same-origin <script src> and <link rel=stylesheet href>, normalised to
        // the leading-slash form the precache list uses.
        const refs = [
            ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]),
            ...[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1])
        ]
            .filter(src => !src.startsWith('http'))
            .map(src => (src.startsWith('/') ? src : `/${src}`));

        expect(refs.length).toBeGreaterThan(0);

        const missing = refs.filter(ref => !cached.includes(ref));
        expect(missing).toEqual([]);
    });
});
