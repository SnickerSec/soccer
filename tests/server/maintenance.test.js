/**
 * The maintenance scheduler: it runs at once, repeats, and a failing run is
 * logged rather than thrown — tidying up must not take the server down.
 * What the DELETE removes is tested against PostgreSQL in
 * tests/integration/maintenance.test.js.
 */

import { describe, test, expect, jest, afterEach } from '@jest/globals';
import { scheduleMaintenance } from '../../server/maintenance.js';

const quietLog = () => ({ log: jest.fn(), error: jest.fn() });
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('scheduleMaintenance', () => {
    let stop;
    afterEach(() => {
        stop?.();
        jest.useRealTimers();
    });

    test('prunes on start and on every interval, and says when it removed something', async () => {
        jest.useFakeTimers({ doNotFake: ['setImmediate'] });
        const db = { query: jest.fn().mockResolvedValue({ rowCount: 2 }) };
        const log = quietLog();

        stop = scheduleMaintenance(db, { intervalMs: 1000, log });
        await flush();
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query.mock.calls[0][0]).toMatch(/DELETE FROM team_members/);
        expect(log.log).toHaveBeenCalledWith('Maintenance: removed 2 expired invite(s)');

        jest.advanceTimersByTime(1000);
        await flush();
        expect(db.query).toHaveBeenCalledTimes(2);
    });

    test('is silent when there was nothing to remove', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rowCount: 0 }) };
        const log = quietLog();

        stop = scheduleMaintenance(db, { log });
        await flush();
        expect(log.log).not.toHaveBeenCalled();
    });

    test('logs a failed run instead of throwing', async () => {
        const db = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
        const log = quietLog();

        stop = scheduleMaintenance(db, { log });
        await flush();
        expect(log.error).toHaveBeenCalledWith('Maintenance: pruning expired invites failed:', 'connection refused');
    });
});
