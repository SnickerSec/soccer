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
            const result = await pool.query(
                `SELECT role FROM team_members
                 WHERE team_id = $1 AND user_id = $2 AND joined_at IS NOT NULL`,
                [teamId, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(403).json({ success: false, error: 'No access to this team' });
            }

            const userRole = result.rows[0].role;
            const roleHierarchy = { viewer: 0, coach: 1, owner: 2 };

            if ((roleHierarchy[userRole] ?? -1) < (roleHierarchy[minRole] ?? 0)) {
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
