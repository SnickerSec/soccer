/**
 * Auth routes — Google OAuth + session info
 */

import { Router } from 'express';
import passport from 'passport';

const router = Router();

// Initiate Google OAuth
router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    accessType: 'offline',
    prompt: 'consent'
}));

// OAuth callback
router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/');
    }
);

// Logout
router.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

// Get current user
router.get('/api/auth/me', (req, res) => {
    if (!req.user) {
        return res.json({ success: true, data: null });
    }

    res.json({
        success: true,
        data: {
            id: req.user.id,
            email: req.user.email,
            displayName: req.user.display_name,
            avatarUrl: req.user.avatar_url,
            createdAt: req.user.created_at
        }
    });
});

export default router;
