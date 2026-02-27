/**
 * Team routes
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import pool from '../db.js';
import { requireAuth, requireTeamAccess } from '../middleware.js';

const router = Router();

// List user's teams
router.get('/api/teams', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT t.*, tm.role
             FROM teams t
             JOIN team_members tm ON tm.team_id = t.id
             WHERE tm.user_id = $1 AND tm.joined_at IS NOT NULL
             ORDER BY t.created_at DESC`,
            [req.user.id]
        );

        const teams = result.rows.map(t => ({
            id: t.id,
            name: t.name,
            ageDivision: t.age_division,
            createdBy: t.created_by,
            createdAt: t.created_at,
            role: t.role
        }));

        res.json({ success: true, data: teams });
    } catch (error) {
        console.error('List teams error:', error);
        res.status(500).json({ success: false, error: 'Failed to list teams' });
    }
});

// Create team
router.post('/api/teams', requireAuth, async (req, res) => {
    try {
        const { name, ageDivision } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 255) {
            return res.status(400).json({ success: false, error: 'Team name is required and must be under 255 characters' });
        }

        const result = await pool.query(
            `INSERT INTO teams (name, age_division, created_by)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [name, ageDivision || '10U', req.user.id]
        );

        const team = result.rows[0];
        res.json({
            success: true,
            data: {
                id: team.id,
                name: team.name,
                ageDivision: team.age_division,
                createdBy: team.created_by,
                createdAt: team.created_at,
                role: 'owner'
            }
        });
    } catch (error) {
        console.error('Create team error:', error);
        res.status(500).json({ success: false, error: 'Failed to create team' });
    }
});

// Update team
router.put('/api/teams/:id', requireTeamAccess('owner'), async (req, res) => {
    try {
        const { name, ageDivision } = req.body;

        if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0 || name.length > 255)) {
            return res.status(400).json({ success: false, error: 'Team name must be a non-empty string under 255 characters' });
        }

        await pool.query(
            `UPDATE teams SET name = COALESCE($1, name), age_division = COALESCE($2, age_division)
             WHERE id = $3`,
            [name, ageDivision, req.params.id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update team error:', error);
        res.status(500).json({ success: false, error: 'Failed to update team' });
    }
});

// Delete team
router.delete('/api/teams/:id', requireTeamAccess('owner'), async (req, res) => {
    try {
        await pool.query('DELETE FROM teams WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete team error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete team' });
    }
});

// List team members
router.get('/api/teams/:teamId/members', requireTeamAccess('viewer'), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT tm.id, tm.role, tm.joined_at,
                    p.id as user_id, p.email, p.display_name, p.avatar_url
             FROM team_members tm
             LEFT JOIN profiles p ON p.id = tm.user_id
             WHERE tm.team_id = $1 AND tm.joined_at IS NOT NULL
             ORDER BY tm.role ASC`,
            [req.params.teamId]
        );

        const members = result.rows.map(m => ({
            id: m.id,
            role: m.role,
            joinedAt: m.joined_at,
            userId: m.user_id,
            email: m.email,
            displayName: m.display_name,
            avatarUrl: m.avatar_url
        }));

        res.json({ success: true, data: members });
    } catch (error) {
        console.error('List members error:', error);
        res.status(500).json({ success: false, error: 'Failed to list members' });
    }
});

// Generate team invite
router.post('/api/teams/:teamId/invite', requireTeamAccess('owner'), async (req, res) => {
    try {
        const { role = 'coach', expiresInDays = 7 } = req.body;

        const allowedRoles = ['coach', 'viewer'];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ success: false, error: 'Role must be coach or viewer' });
        }

        const days = Math.floor(Number(expiresInDays));
        if (!Number.isFinite(days) || days < 1 || days > 30) {
            return res.status(400).json({ success: false, error: 'expiresInDays must be between 1 and 30' });
        }

        const token = generateToken();

        await pool.query(
            `INSERT INTO team_members (team_id, role, invite_token, invite_expires_at, invited_by)
             VALUES ($1, $2, $3, NOW() + $4::interval, $5)`,
            [req.params.teamId, role, token, `${days} days`, req.user.id]
        );

        const url = `${process.env.APP_URL || req.protocol + '://' + req.get('host')}/?invite=${encodeURIComponent(token)}`;

        res.json({ success: true, data: { token, url } });
    } catch (error) {
        console.error('Generate invite error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate invite' });
    }
});

// Remove a team member
router.delete('/api/teams/:teamId/members/:memberId', requireTeamAccess('owner'), async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM team_members WHERE id = $1 AND team_id = $2',
            [req.params.memberId, req.params.teamId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ success: false, error: 'Failed to remove member' });
    }
});

function generateToken() {
    return crypto.randomBytes(24).toString('base64url');
}

export default router;
