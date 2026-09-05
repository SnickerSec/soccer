/**
 * Canonical hostname redirect.
 *
 * The app answers on the domain it moved to and on the one it moved from, so
 * the rules about which of those actually serves the app are worth pinning:
 * a blanket "redirect anything not canonical" would bounce Railway's health
 * check and localhost, and a redirect on a write would drop its body.
 */

import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const { canonicalRedirect, CANONICAL_HOST } = await import('../../server/canonical-host.js');

describe('canonicalRedirect', () => {
    test('sends the legacy domain to the canonical host, path and query intact', () => {
        expect(canonicalRedirect('GET', 'aysoroster.com', '/app?invite=tok-123&tab=roster'))
            .toBe('https://shinguard.app/app?invite=tok-123&tab=roster');
    });

    test('sends www to the apex', () => {
        expect(canonicalRedirect('GET', 'www.shinguard.app', '/')).toBe('https://shinguard.app/');
        expect(canonicalRedirect('GET', 'www.aysoroster.com', '/')).toBe('https://shinguard.app/');
    });

    test('serves the canonical host itself', () => {
        expect(canonicalRedirect('GET', CANONICAL_HOST, '/')).toBeNull();
    });

    test('leaves hosts that are not on the list alone', () => {
        // Railway's health check and its generated domain arrive under their own
        // Host, as does localhost. Redirecting those fails the deploy.
        expect(canonicalRedirect('GET', 'localhost:3000', '/health')).toBeNull();
        expect(canonicalRedirect('GET', 'uqbcpgso.up.railway.app', '/health')).toBeNull();
        expect(canonicalRedirect('GET', undefined, '/')).toBeNull();
    });

    test('ignores the port and the case of the Host header', () => {
        expect(canonicalRedirect('GET', 'AYSORoster.com:8080', '/')).toBe('https://shinguard.app/');
    });

    test('does not redirect a write', () => {
        // A 301 may be replayed as a GET, which would silently drop the body.
        for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
            expect(canonicalRedirect(method, 'aysoroster.com', '/api/teams')).toBeNull();
        }
    });

    test('redirects HEAD as well as GET', () => {
        expect(canonicalRedirect('HEAD', 'aysoroster.com', '/')).toBe('https://shinguard.app/');
    });
});

describe('as express middleware', () => {
    function buildApp() {
        const app = express();
        app.use((req, res, next) => {
            const target = canonicalRedirect(req.method, req.get('host'), req.originalUrl);
            if (target) return res.redirect(301, target);
            next();
        });
        app.get('/health', (req, res) => res.status(200).send('OK'));
        app.get('/', (req, res) => res.status(200).send('app'));
        return app;
    }

    test('answers 301 with a Location on the legacy domain', async () => {
        const res = await request(buildApp()).get('/').set('Host', 'aysoroster.com');
        expect(res.status).toBe(301);
        expect(res.headers.location).toBe('https://shinguard.app/');
    });

    test('lets the health check through', async () => {
        const res = await request(buildApp()).get('/health').set('Host', 'healthcheck.railway.app');
        expect(res.status).toBe(200);
        expect(res.text).toBe('OK');
    });
});
