/**
 * Production refuses to boot without SESSION_SECRET.
 *
 * The fallback secret is committed to a public repo, so a production deploy
 * that quietly used it would let anyone forge a session cookie and sign in as
 * any coach. The failure mode this guards is a *working-looking* site, which
 * nobody investigates — so the guard has to stop the process, and it equally
 * has to not fire when the secret is present.
 *
 * Spawns the real server rather than importing it: the check runs at module
 * load and its whole job is to end the process.
 */

import { describe, test, expect } from '@jest/globals';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '..', '..', 'server.js');

/**
 * Runs server.js with `env` merged over a cleared SESSION_SECRET, and resolves
 * once it exits or once it reports that it is listening.
 */
function runServer(env) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [serverPath], {
            env: {
                ...process.env,
                SESSION_SECRET: '',
                GOOGLE_CLIENT_ID: '',
                GOOGLE_CLIENT_SECRET: '',
                PORT: '0',
                ...env
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            // Left pending, this keeps the Jest process alive past the run
            clearTimeout(hangGuard);
            child.kill('SIGKILL');
            resolve(result);
        };

        child.stdout.on('data', (chunk) => {
            stdout += chunk;
            // Booted successfully; nothing further to wait for
            if (stdout.includes('running on port')) {
                finish({ exitCode: null, listening: true, stdout, stderr });
            }
        });
        child.stderr.on('data', (chunk) => { stderr += chunk; });

        child.on('exit', (exitCode) => {
            finish({ exitCode, listening: false, stdout, stderr });
        });

        // A hang is a failure too — do not let it stall the suite
        const hangGuard = setTimeout(
            () => finish({ exitCode: null, listening: false, stdout, stderr }),
            10000
        );
    });
}

describe('server startup', () => {
    test('exits rather than serving with the public fallback secret in production', async () => {
        const result = await runServer({ NODE_ENV: 'production' });

        expect(result.exitCode).toBe(1);
        expect(result.listening).toBe(false);
        expect(result.stderr).toMatch(/SESSION_SECRET/);
    }, 15000);

    test('starts in production once SESSION_SECRET is set', async () => {
        const result = await runServer({
            NODE_ENV: 'production',
            SESSION_SECRET: 'a-real-secret-for-this-test'
        });

        // A guard that fired regardless would be worse than the hole it closes
        expect(result.listening).toBe(true);
    }, 15000);

    test('development still boots on the fallback, with a warning', async () => {
        const result = await runServer({ NODE_ENV: 'development' });

        expect(result.listening).toBe(true);
        expect(result.stderr).toMatch(/SESSION_SECRET/);
    }, 15000);
});
