/**
 * Canonical hostname redirect.
 *
 * The app answers on the apex and on www, and only the apex serves it. The
 * rules about which hosts are redirected are worth pinning: a blanket
 * "redirect anything not canonical" would bounce Railway's health check and
 * localhost, and a redirect on a write would drop its body.
 */

import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const { canonicalRedirect, CANONICAL_HOST } = await import('../../server/canonical-host.js');

describe('canonicalRedirect', () => {
    test('sends www to the apex, path and query intact', () => {
        expect(canonicalRedirect('GET', 'www.shinguard.app', '/app?invite=tok-123&tab=roster'))
            .toBe('https://shinguard.app/app?invite=tok-123&tab=roster');
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

    test('does not redirect a domain the project no longer owns', () => {
        // aysoroster.com was let go and removed from the service. Nothing here
        // should send traffic to, or accept it on behalf of, a name we do not
        // control.
        expect(canonicalRedirect('GET', 'aysoroster.com', '/')).toBeNull();
        expect(canonicalRedirect('GET', 'www.aysoroster.com', '/')).toBeNull();
    });

    test('ignores the port and the case of the Host header', () => {
        expect(canonicalRedirect('GET', 'WWW.Shinguard.app:8080', '/')).toBe('https://shinguard.app/');
    });

    test('does not redirect a write', () => {
        // A 301 may be replayed as a GET, which would silently drop the body.
        for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
            expect(canonicalRedirect(method, 'www.shinguard.app', '/api/teams')).toBeNull();
        }
    });

    test('redirects HEAD as well as GET', () => {
        expect(canonicalRedirect('HEAD', 'www.shinguard.app', '/')).toBe('https://shinguard.app/');
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

    test('answers 301 with a Location on www', async () => {
        const res = await request(buildApp()).get('/').set('Host', 'www.shinguard.app');
        expect(res.status).toBe(301);
        expect(res.headers.location).toBe('https://shinguard.app/');
    });

    test('lets the health check through', async () => {
        const res = await request(buildApp()).get('/health').set('Host', 'healthcheck.railway.app');
        expect(res.status).toBe(200);
        expect(res.text).toBe('OK');
    });
});
