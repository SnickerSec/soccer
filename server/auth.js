/**
 * Passport session configuration
 * OAuth is handled by Supabase; this just manages the server-side session.
 */

import passport from 'passport';
import pool from './db.js';

export function configurePassport() {
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
