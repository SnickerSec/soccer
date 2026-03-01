/**
 * Passport configuration — Google OAuth via passport-google-oauth20
 * Upserts users into the profiles table using google_id (with email fallback
 * for existing users migrating from Supabase).
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from './db.js';

export function configurePassport() {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    if (!clientID || !clientSecret) {
        console.warn('\x1b[33m\u26a0  WARNING: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set. Google OAuth disabled.\x1b[0m');
    } else {
        passport.use(new GoogleStrategy(
            {
                clientID,
                clientSecret,
                callbackURL: `${appUrl}/auth/google/callback`
            },
            async (_accessToken, _refreshToken, profile, done) => {
                try {
                    const googleId = profile.id;
                    const email = profile.emails?.[0]?.value;
                    const displayName = profile.displayName || email?.split('@')[0];
                    const avatarUrl = profile.photos?.[0]?.value || null;

                    // 1. Try to match existing profile by google_id
                    let { rows } = await pool.query(
                        `UPDATE profiles SET email = $2, display_name = $3, avatar_url = $4
                         WHERE google_id = $1
                         RETURNING *`,
                        [googleId, email, displayName, avatarUrl]
                    );

                    // 2. No google_id match — check by email and backfill google_id
                    if (rows.length === 0 && email) {
                        ({ rows } = await pool.query(
                            `UPDATE profiles SET google_id = $1, display_name = $2, avatar_url = $3
                             WHERE email = $4 AND google_id IS NULL
                             RETURNING *`,
                            [googleId, displayName, avatarUrl, email]
                        ));
                    }

                    // 3. No existing profile — create new
                    if (rows.length === 0) {
                        ({ rows } = await pool.query(
                            `INSERT INTO profiles (google_id, email, display_name, avatar_url)
                             VALUES ($1, $2, $3, $4)
                             RETURNING *`,
                            [googleId, email, displayName, avatarUrl]
                        ));
                    }

                    done(null, rows[0]);
                } catch (err) {
                    done(err);
                }
            }
        ));
    }

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const { rows } = await pool.query('SELECT * FROM profiles WHERE id = $1', [id]);
            done(null, rows[0] || null);
        } catch (err) {
            done(err);
        }
    });
}
