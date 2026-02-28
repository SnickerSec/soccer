/**
 * Passport session configuration
 * OAuth is handled by Supabase. The full user object is stored directly
 * in the session so no database lookup is needed on each request.
 */

import passport from 'passport';

export function configurePassport() {
    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((user, done) => {
        done(null, user);
    });
}
