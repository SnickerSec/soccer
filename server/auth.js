/**
 * Passport.js Google OAuth configuration
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from './db.js';

export function configurePassport() {
    passport.use(new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: `${process.env.APP_URL || ''}/auth/google/callback`
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const googleId = profile.id;
                const email = profile.emails?.[0]?.value || '';
                const displayName = profile.displayName || email.split('@')[0];
                const avatarUrl = profile.photos?.[0]?.value || null;

                // Find existing profile by google_id
                let result = await pool.query(
                    'SELECT * FROM profiles WHERE google_id = $1',
                    [googleId]
                );

                if (result.rows.length > 0) {
                    // Update display name and avatar on each login
                    await pool.query(
                        'UPDATE profiles SET display_name = $1, avatar_url = $2 WHERE id = $3',
                        [displayName, avatarUrl, result.rows[0].id]
                    );
                    return done(null, result.rows[0]);
                }

                // Try matching by email (for migrated users who don't have google_id yet)
                result = await pool.query(
                    'SELECT * FROM profiles WHERE email = $1 AND google_id IS NULL',
                    [email]
                );

                if (result.rows.length > 0) {
                    // Backfill google_id
                    await pool.query(
                        'UPDATE profiles SET google_id = $1, display_name = $2, avatar_url = $3 WHERE id = $4',
                        [googleId, displayName, avatarUrl, result.rows[0].id]
                    );
                    return done(null, result.rows[0]);
                }

                // Create new profile + user_settings
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');

                    const insertResult = await client.query(
                        `INSERT INTO profiles (google_id, email, display_name, avatar_url)
                         VALUES ($1, $2, $3, $4)
                         RETURNING *`,
                        [googleId, email, displayName, avatarUrl]
                    );
                    const newProfile = insertResult.rows[0];

                    await client.query(
                        'INSERT INTO user_settings (user_id) VALUES ($1)',
                        [newProfile.id]
                    );

                    await client.query('COMMIT');
                    return done(null, newProfile);
                } catch (err) {
                    await client.query('ROLLBACK');
                    throw err;
                } finally {
                    client.release();
                }
            } catch (error) {
                console.error('Google OAuth error:', error);
                return done(error, null);
            }
        }
    ));

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const result = await pool.query(
                'SELECT * FROM profiles WHERE id = $1',
                [id]
            );
            done(null, result.rows[0] || null);
        } catch (error) {
            done(error, null);
        }
    });
}
