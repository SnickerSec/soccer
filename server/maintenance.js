/**
 * Housekeeping the database does not do for itself.
 *
 * Expired sessions are already handled — connect-pg-simple prunes its own
 * table every fifteen minutes — and autovacuum looks after dead tuples. What
 * nothing removed was an invite nobody accepted: POST .../invite inserts a
 * team_members row with no user, and accepting it is the only thing that ever
 * changed it. Once its link has expired the row cannot be spent (both invite
 * routes require `invite_expires_at > NOW()`), and it is not shown anywhere
 * (the member list requires `joined_at IS NOT NULL`), so it only accumulates.
 */

const SIX_HOURS = 6 * 60 * 60 * 1000;

/**
 * Deletes invites whose link has expired unspent. Returns how many went.
 *
 * `user_id IS NULL` as well as `joined_at IS NULL`, so that whatever else a
 * row is, one that names a person is never touched by this.
 */
export async function pruneExpiredInvites(db) {
    const result = await db.query(
        `DELETE FROM team_members
         WHERE joined_at IS NULL
           AND user_id IS NULL
           AND invite_expires_at < NOW()`
    );
    return result.rowCount;
}

/**
 * Runs the housekeeping now and then every `intervalMs`. The timer is unref'd
 * so it never holds the process open, and a failed run is logged rather than
 * thrown: tidying up must not be able to take the server down.
 *
 * Returns a function that stops it.
 */
export function scheduleMaintenance(db, { intervalMs = SIX_HOURS, log = console } = {}) {
    const run = async () => {
        try {
            const removed = await pruneExpiredInvites(db);
            if (removed > 0) log.log(`Maintenance: removed ${removed} expired invite(s)`);
        } catch (error) {
            log.error('Maintenance: pruning expired invites failed:', error.message);
        }
    };

    run();
    const timer = setInterval(run, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
}
