import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import { csrfSync } from 'csrf-sync';
import { configurePassport } from './server/auth.js';
import pool from './server/db.js';

// Route imports
import authRoutes from './server/routes/auth.js';
import teamRoutes from './server/routes/teams.js';
import playerRoutes from './server/routes/players.js';
import gameRoutes from './server/routes/games.js';
import settingsRoutes from './server/routes/settings.js';
import inviteRoutes from './server/routes/invites.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's proxy so express-rate-limit can read X-Forwarded-For correctly
app.set('trust proxy', 1);

// Security headers middleware
app.use((req, res, next) => {
    // Content Security Policy
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://*.googleusercontent.com",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "form-action 'self' https://accounts.google.com",
        "base-uri 'self'"
    ].join('; '));

    // Other security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    next();
});

// Serve static files and the health check BEFORE the rate limiter and session
// middleware. A cold page load is ~18 asset requests, so counting them against
// the 100-per-15-min budget would lock out coaches sharing a club/school NAT.
// This also skips a session-store DB lookup on every CSS/JS request.
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for Railway
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
    // /api has its own budget below. Counting those requests here too meant a
    // coach hit whichever ceiling was lower first, and the two limits could
    // not be reasoned about independently.
    skip: (req) => req.path.startsWith('/api/')
});

// Apply rate limiting to all routes
app.use(limiter);

// Rate limiting for API endpoints. A normal session is chatty: page load costs
// a CSRF token, an auth check, settings, teams, players and games, and every
// roster or lineup edit pushes again. 50 per 15 minutes locked coaches out
// mid-game, so this is sized for real use while still stopping a scraper.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many API requests, please try again later.'
});

app.use(express.json({ limit: '100kb' }));

// Warn if using default session secret
if (!process.env.SESSION_SECRET) {
    console.warn('\x1b[33m⚠  WARNING: SESSION_SECRET is not set. Using insecure default. Set SESSION_SECRET env var in production.\x1b[0m');
}

// Session middleware (PostgreSQL-backed via connect-pg-simple)
const PgStore = connectPgSimple(session);
app.use(session({
    store: new PgStore({ pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'lax'
    }
}));

// Passport middleware
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// Apply API rate limiter to /api/* routes
app.use('/api', apiLimiter);

// CSRF protection
const { csrfSynchronisedProtection, generateToken } = csrfSync({
    getTokenFromRequest: (req) => req.headers['x-csrf-token'],
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS']
});

// Endpoint to get a CSRF token (must be before the protection middleware)
app.get('/api/csrf-token', (req, res) => {
    const token = generateToken(req);
    res.json({ token });
});

// Apply CSRF protection to all state-changing requests (POST, PUT, DELETE, PATCH)
app.use(csrfSynchronisedProtection);

// Mount routes
app.use(authRoutes);
app.use(teamRoutes);
app.use(playerRoutes);
app.use(gameRoutes);
app.use(settingsRoutes);
app.use(inviteRoutes);

// CSRF error handler
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN' || err.message === 'invalid csrf token') {
        return res.status(403).json({ error: 'Invalid or missing CSRF token' });
    }
    next(err);
});

app.listen(PORT, () => {
    console.log(`AYSO Roster Pro running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
