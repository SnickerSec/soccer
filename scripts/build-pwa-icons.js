/**
 * Rasterises public/favicon.svg into the PNG app icons the PWA install flows
 * need. Android's install prompt wants 192px and 512px PNGs, and iOS ignores
 * SVG for apple-touch-icon entirely.
 *
 * Run with `npm run build:pwa-icons`. This is NOT part of postinstall: the
 * rasteriser is a native devDependency, so a production install (which omits
 * dev dependencies) could not run it. The generated PNGs are committed instead
 * — they only change when the artwork does.
 *
 * If you replace favicon.svg, re-run this and commit the results.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const sourceFile = path.join(projectRoot, 'public', 'favicon.svg');
const outDir = path.join(projectRoot, 'public', 'assets', 'icons');

// The dark disc the logo already sits on. Used to fill the padding so masked
// and letterboxed renderings still look deliberate rather than cropped.
const BACKGROUND = '#000000';

const TARGETS = [
    // Plain icons. The artwork is a disc that already reaches the canvas edge,
    // so these are rendered full-bleed with a transparent surround.
    { file: 'icon-192.png', size: 192, scale: 1, background: null },
    { file: 'icon-512.png', size: 512, scale: 1, background: null },

    // Maskable icon. Android may crop this to a circle, squircle or rounded
    // square, and only the middle 80% is guaranteed to survive — so the logo is
    // inset to that safe zone over an opaque background.
    { file: 'icon-maskable-512.png', size: 512, scale: 0.8, background: BACKGROUND },

    // iOS home screen. iOS applies its own rounded corners and composites
    // transparency onto black, so this is opaque with a slight inset.
    { file: 'apple-touch-icon-180.png', size: 180, scale: 0.92, background: BACKGROUND }
];

const source = fs.readFileSync(sourceFile, 'utf8');

/**
 * Wraps the source artwork in a canvas of `size`, scaled to `scale` and centred,
 * optionally over an opaque background.
 */
function composeSvg(size, scale, background) {
    const inner = Math.round(size * scale);
    const offset = Math.round((size - inner) / 2);
    const backgroundRect = background
        ? `<rect width="${size}" height="${size}" fill="${background}"/>`
        : '';

    // The source is stripped of its XML declaration so it can nest as an element.
    const artwork = source.replace(/<\?xml[^>]*\?>\s*/, '').trim();

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${backgroundRect}
<svg x="${offset}" y="${offset}" width="${inner}" height="${inner}" viewBox="0 0 194 194">${artwork}</svg>
</svg>`;
}

fs.mkdirSync(outDir, { recursive: true });

for (const target of TARGETS) {
    const svg = composeSvg(target.size, target.scale, target.background);
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: target.size },
        background: target.background ?? 'rgba(0,0,0,0)'
    });

    const png = resvg.render().asPng();
    fs.writeFileSync(path.join(outDir, target.file), png);
    console.log(`build-pwa-icons: wrote ${target.file} (${target.size}x${target.size}, ${(png.length / 1024).toFixed(1)}KB)`);
}
