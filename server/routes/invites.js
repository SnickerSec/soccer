/**
 * Invite routes
 */

import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware.js';

const router = Router();

// Get invite info (public, no auth required)
router.get('/api/invites/:token', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT t.name as team_name, tm.role, p.display_name as invited_by_name, tm.invite_expires_at
             FROM team_members tm
             JOIN teams t ON t.id = tm.team_id
             LEFT JOIN profiles p ON p.id = tm.invited_by
             WHERE tm.invite_token = $1
               AND tm.invite_expires_at > NOW()
               AND tm.joined_at IS NULL`,
            [req.params.token]
        );

        if (result.rows.length === 0) {
            return res.json({ success: false, error: 'Invalid or expired invite' });
        }

        const invite = result.rows[0];
        res.json({
            success: true,
            data: {
                teamName: invite.team_name,
                role: invite.role,
                invitedBy: invite.invited_by_name,
                expiresAt: invite.invite_expires_at
            }
        });
    } catch (error) {
        console.error('Get invite info error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Accept invite
router.post('/api/invites/:token/accept', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Find and validate invite.
        //
        // FOR UPDATE holds the row for the rest of the transaction. An invite
        // link is single-use — joined_at IS NULL is what spends it — so two
        // people opening the same link at once would otherwise both see it
        // unclaimed and both run the UPDATE below. The second overwrites
        // user_id, leaving the first with a success response and no membership.
        const inviteResult = await client.query(
            `SELECT id, team_id FROM team_members
             WHERE invite_token = $1
               AND invite_expires_at > NOW()
               AND joined_at IS NULL
             FOR UPDATE`,
            [req.params.token]
        );

        if (inviteResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({ success: false, error: 'Invalid or expired invite' });
        }

        const { id: memberId, team_id: teamId } = inviteResult.rows[0];

        // Check if user is already a member
        const existingResult = await client.query(
            `SELECT 1 FROM team_members
             WHERE team_id = $1 AND user_id = $2 AND joined_at IS NOT NULL`,
            [teamId, req.user.id]
        );

        if (existingResult.rows.length > 0) {
            // Delete unused invite
            await client.query('DELETE FROM team_members WHERE id = $1', [memberId]);
            await client.query('COMMIT');
            return res.json({ success: false, error: 'Already a member of this team' });
        }

        // Accept invite
        await client.query(
            `UPDATE team_members
             SET user_id = $1, joined_at = NOW(), invite_token = NULL, invite_expires_at = NULL
             WHERE id = $2`,
            [req.user.id, memberId]
        );

        await client.query('COMMIT');
        res.json({ success: true, data: { teamId } });
    } catch (error) {
        // A failed BEGIN would make ROLLBACK throw as well, and that would
        // escape the handler and leave the request hanging. Same guard as the
        // roster replace in players.js.
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Rollback failed after accept invite error:', rollbackError);
        }
        console.error('Accept invite error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        client.release();
    }
});

export default router;
