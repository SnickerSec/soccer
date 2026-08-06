// @ts-check
import { test, expect } from '@playwright/test';

/**
 * A manifest icon with a wrong path or a mismatched `sizes` value is silently
 * ignored by the install prompt — there is no error anywhere. These check the
 * declared icons actually exist and really are the size they claim.
 */
test.describe('PWA icons', () => {
    /** Reads a PNG's true dimensions from its IHDR chunk. */
    function pngSize(buffer) {
        expect(buffer.slice(1, 4).toString('ascii')).toBe('PNG');
        return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }

    test('every manifest icon exists and matches its declared size', async ({ request }) => {
        const res = await request.get('/manifest.json');
        expect(res.status()).toBe(200);
        const manifest = await res.json();

        // An SVG-only manifest would otherwise skip every dimension check below
        expect(manifest.icons.filter(i => i.type === 'image/png').length).toBeGreaterThan(0);

        for (const icon of manifest.icons) {
            const iconRes = await request.get(icon.src);
            expect(iconRes.status(), `${icon.src} should be served`).toBe(200);

            if (icon.type !== 'image/png') continue;

            const { width, height } = pngSize(await iconRes.body());
            expect(`${width}x${height}`, `${icon.src} dimensions`).toBe(icon.sizes);
        }
    });

    test('declares the PNG sizes Android install prompts require', async ({ request }) => {
        const manifest = await (await request.get('/manifest.json')).json();
        const pngs = manifest.icons.filter(i => i.type === 'image/png');

        const sizes = pngs.map(i => i.sizes);
        expect(sizes).toContain('192x192');
        expect(sizes).toContain('512x512');

        // A maskable icon must be declared separately: combining "any maskable"
        // on one un-padded icon gets it cropped on Android.
        const maskable = pngs.filter(i => i.purpose === 'maskable');
        expect(maskable.length).toBeGreaterThan(0);
        for (const icon of maskable) {
            expect(icon.purpose).toBe('maskable');
        }
    });

    test('apple-touch-icon is a real PNG, since iOS ignores SVG', async ({ page, request }) => {
        await page.goto('/');

        const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
        expect(href).toBeTruthy();
        expect(href).toMatch(/\.png$/);

        const res = await request.get(String(href));
        expect(res.status()).toBe(200);

        const { width, height } = pngSize(await res.body());
        expect(width).toBe(180);
        expect(height).toBe(180);
    });
});
