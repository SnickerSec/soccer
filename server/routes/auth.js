/**
 * Auth routes — Supabase session exchange + session info
 */

import { Router } from 'express';

const router = Router();

const SUPABASE_URL = 'https://mokykxzodxdjgmhyraje.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1va3lreHpvZHhkamdtaHlyYWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3NzUwNTUsImV4cCI6MjA4MjM1MTA1NX0.kem-9MJ_u3_8qI6X5X0AHVvL11TK2_2M4k5c1pTLEV8';

/**
 * Exchange a Supabase access token for a backend Passport session.
 * Called by the frontend after Supabase OAuth completes.
 */
router.post('/api/auth/supabase-session', async (req, res, next) => {
    const { accessToken } = req.body;
    if (!accessToken) {
        return res.status(400).json({ success: false, error: 'Access token required' });
    }

    try {
        // Verify the token with Supabase
        const supabaseRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'apikey': SUPABASE_ANON_KEY
            }
        });

        if (!supabaseRes.ok) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const supabaseUser = await supabaseRes.json();
        const email = supabaseUser.email;
        if (!email) {
            return res.status(400).json({ success: false, error: 'No email in token' });
        }

        // Build user object directly from Supabase data — no separate DB needed
        const user = {
            id: supabaseUser.id,
            email,
            display_name: supabaseUser.user_metadata?.full_name
                || supabaseUser.user_metadata?.name
                || email.split('@')[0],
            avatar_url: supabaseUser.user_metadata?.avatar_url || null,
            created_at: supabaseUser.created_at
        };

        // Establish Passport session
        req.login(user, (err) => {
            if (err) return next(err);
            res.json({ success: true });
        });
    } catch (error) {
        console.error('Supabase session exchange error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
});

// Logout
router.post('/api/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy(() => {
            res.json({ success: true });
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
