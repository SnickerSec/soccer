/**
 * Web Worker for lineup generation.
 *
 * Runs the generator off the main thread so the UI stays responsive while it
 * retries. The algorithm itself lives in modules/lineup-engine.js so the unit
 * tests can exercise the same code that ships here.
 *
 * This is a module worker; app.js creates it with { type: 'module' }.
 */

import { generateLineup } from './modules/lineup-engine.js';

self.onmessage = function (e) {
    const { type, data } = e.data;

    if (type !== 'generate') return;

    try {
        const result = generateLineup(data, {
            onProgress: (attempts, validation) =>
                self.postMessage({ type: 'progress', attempts, validation })
        });
        self.postMessage({ type: 'complete', result });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};
