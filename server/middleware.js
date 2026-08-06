/**
 * Auth & authorization middleware
 */

import pool from './db.js';

/**
 * Require authenticated user
 */
export function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    next();
}

/**
 * Team roles, lowest to highest. A role satisfies any requirement at or below
 * its own level.
 */
export const ROLE_HIERARCHY = { viewer: 0, coach: 1, owner: 2 };

/**
 * Whether `userRole` satisfies `minRole`.
 *
 * Unknown roles rank below every requirement, so an unexpected value in the
 * database denies rather than grants.
 */
export function roleSatisfies(userRole, minRole) {
    return (ROLE_HIERARCHY[userRole] ?? -1) >= (ROLE_HIERARCHY[minRole] ?? 0);
}

/**
 * Looks up the caller's role on a team, for routes that resolve the team from a
 * resource id and so cannot use requireTeamAccess.
 *
 * Returns null when the caller is not a joined member.
 */
export async function getTeamRole(teamId, userId) {
    const result = await pool.query(
        `SELECT role FROM team_members
         WHERE team_id = $1 AND user_id = $2 AND joined_at IS NOT NULL`,
        [teamId, userId]
    );

    return result.rows.length > 0 ? result.rows[0].role : null;
}

/**
 * Require team access with minimum role
 * Reads teamId from req.params.teamId or req.params.id
 */
export function requireTeamAccess(minRole = 'viewer') {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        const teamId = req.params.teamId || req.params.id;
        if (!teamId) {
            return res.status(400).json({ success: false, error: 'Team ID required' });
        }

        try {
            const userRole = await getTeamRole(teamId, req.user.id);

            if (userRole === null) {
                return res.status(403).json({ success: false, error: 'No access to this team' });
            }

            if (!roleSatisfies(userRole, minRole)) {
                return res.status(403).json({ success: false, error: 'Insufficient permissions' });
            }

            req.teamRole = userRole;
            next();
        } catch (error) {
            console.error('Team access check error:', error);
            return res.status(500).json({ success: false, error: 'Server error' });
        }
    };
}
