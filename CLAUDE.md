# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- **Run the application locally**: `npm start` (runs on http://localhost:3000)
- **Install dependencies**: `npm install`
- **Run unit tests**: `npm test`
- **Run e2e tests**: `npm run test:e2e`
- **Run all tests**: `npm run test:all`

## Architecture

This is an AYSO Soccer Lineup Generator web application with a simple Node.js/Express backend and vanilla JavaScript frontend.

### Project Structure
```
├── server.js           # Express server with API endpoints
├── server/             # Backend modules
│   ├── db.js               # PostgreSQL connection pool
│   ├── auth.js             # Passport/Google OAuth configuration
│   └── routes/             # Express route modules
│       ├── auth.js             # Auth endpoints (/auth/*, /api/auth/me)
│       ├── teams.js            # Team CRUD (/api/teams/*)
│       ├── players.js          # Player CRUD (/api/players/*)
│       ├── games.js            # Game CRUD (/api/games/*)
│       ├── settings.js         # User settings (/api/settings/*)
│       └── invites.js          # Team invitations (/api/invites/*)
├── public/             # Frontend static files
│   ├── index.html      # Main UI
│   ├── app.js          # Core application logic (SoccerLineupGenerator class)
│   ├── constants.js    # App constants and configuration
│   ├── styles.css      # Application styles
│   ├── favicon.svg     # Site favicon
│   ├── modules/        # ES6 modules for code organization
│   │   ├── api-client.js   # Fetch wrapper with CSRF token handling
│   │   ├── storage.js      # LocalStorage utilities
│   │   ├── utils.js        # General utilities (shuffle, escape, etc.)
│   │   ├── season-stats.js # Season statistics calculations
│   │   ├── formations.js   # Formation definitions and positions
│   │   └── index.js        # Module exports
│   └── assets/         # Fonts, PDFs, images
├── tests/              # Jest unit tests
├── docs/               # Documentation (security, privacy)
├── test-data/          # Sample player roster files
├── package.json        # Dependencies and scripts
└── railway.json        # Railway deployment config
```

### Backend (server.js)
- Express server serving static files from `public/`
- Health check endpoint for Railway deployment
- PDF analysis API endpoint
- Security middleware stack (in order):
  1. Security headers (CSP, X-Frame-Options, etc.)
  2. Rate limiting (global + stricter for /api and /auth)
  3. express.json body parser
  4. express-session (PostgreSQL-backed via connect-pg-simple)
  5. Passport (Google OAuth)
  6. CSRF token endpoint (`GET /api/csrf-token`)
  7. CSRF protection (`csrf-sync` on all `/api` state-changing routes)
  8. Route modules
  9. CSRF error handler

### Frontend (public/)
- **index.html**: Main UI with player management, game settings, and lineup display
- **app.js**: `SoccerLineupGenerator` class handling:
  - Player roster management (import from file or manual entry)
  - Lineup generation with AYSO rotation rules
  - Visual field display for each quarter
  - Export/print functionality
- **styles.css**: Application styling

### Key Features & Constraints
The lineup generator enforces AYSO "Everyone Plays" rules:
- No player sits more than 1 quarter consecutively
- No player sits more than 2 quarters total
- Maximum 1 quarter as goalkeeper per player
- Players rotate between offensive and defensive positions
- Supports multiple formations (5v5, 7v7, 9v9, 11v11)

### Deployment
Configured for Railway deployment via **railway.json** with automatic builds using Nixpacks.

## Guidelines

- Keep the codebase organized