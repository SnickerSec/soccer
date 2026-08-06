/**
 * Copies browser builds of third-party libraries from node_modules into
 * public/vendor/ so they can be served from our own origin.
 *
 * Serving them ourselves (instead of from unpkg.com) means:
 *   - the CSP no longer needs to allow an external script host
 *   - PDF export keeps working offline, since the service worker can cache them
 *
 * Runs automatically via the `postinstall` npm script. public/vendor/ is
 * gitignored — it is a build artifact derived from package-lock.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const vendorDir = path.join(projectRoot, 'public', 'vendor');

const FILES = [
    {
        from: path.join('node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js'),
        to: 'pdf-lib.min.js'
    },
    {
        from: path.join('node_modules', '@pdf-lib', 'fontkit', 'dist', 'fontkit.umd.min.js'),
        to: 'fontkit.umd.min.js'
    }
];

fs.mkdirSync(vendorDir, { recursive: true });

let copied = 0;
for (const file of FILES) {
    const src = path.join(projectRoot, file.from);
    const dest = path.join(vendorDir, file.to);

    if (!fs.existsSync(src)) {
        console.warn(`⚠  copy-vendor: missing ${file.from} — PDF export will not work until dependencies are installed.`);
        continue;
    }

    fs.copyFileSync(src, dest);
    copied++;
}

console.log(`copy-vendor: copied ${copied}/${FILES.length} vendor file(s) to public/vendor/`);
