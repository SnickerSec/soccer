# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- **Run the application locally**: `npm start` (runs on http://localhost:3000)
- **Install dependencies**: `npm install`
- **Run unit tests**: `npm test` (Jest; includes the server route tests under `tests/server/`)
- **Run database tests**: `npm run test:db` (Jest against a real PostgreSQL; skipped without `TEST_DATABASE_URL`)
- **Run e2e tests**: `npm run test:e2e` (Playwright; starts the server itself)
- **Run all tests**: `npm run test:all`
- **Rebuild generated assets**: `npm run build:assets` (icon sprite + PWA icons)
- **Apply pending migrations**: `npm run migrate` (needs `DATABASE_URL`)
- **Start a new migration**: `npm run migrate:create -- <name>`

### Database migrations

`migrations/` holds SQL migrations run by node-pg-migrate, which records what
it has applied in a `pgmigrations` table. Railway runs `npm run migrate` as its
`preDeployCommand`, so a schema change ships with the code that needs it rather
than waiting for someone to remember.

`npm run migrate:create -- add_something` writes a timestamped stub with `-- Up
Migration` and `-- Down Migration` sections. Write the change, not the whole
schema — each migration runs exactly once, so guards like `IF NOT EXISTS` are
only needed in the baseline.

The baseline, `20260822000000_baseline.sql`, is the schema as it stood when
migrations were introduced. Every statement in it is guarded, because it had to
be a no-op against a production database that already had all of it. It is
deliberately not reversible: reverting would drop every table.

The integration suite runs the same migrations rather than a schema dump, so a
migration that only works on a fresh database fails in CI rather than on deploy.

The tests under `tests/server/` mock the connection pool, which proves the
routes build the right SQL but not that PostgreSQL accepts it. The suite under
`tests/integration/` executes the statements for real, and is what catches a
column the migrations never added, a constraint violation surfacing as a 500,
or a transaction that half-applies. It is opt-in:

```
createdb soccer_test
TEST_DATABASE_URL=postgres://localhost/soccer_test npm run test:db
```

Without `TEST_DATABASE_URL` every test in it reports as skipped, so `npm test`
and `npm run test:all` still work with no database installed. CI runs it
against a `postgres:18` service container. The database is truncated between
tests, so the harness refuses any `TEST_DATABASE_URL` whose database name does
not contain "test".

`npm run test:e2e` downloads the Chromium build Playwright needs on first run,
via the `pretest:e2e` hook — roughly 300MB once, then a ~0.5s no-op. Keep
Playwright reasonably current: older versions resolve distro-pinned browser
builds and fail on newer Linux releases with "does not support chromium on
<distro>".

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
│   │   ├── sync.js         # Offline queue and cloud sync
│   │   ├── roster-merge.js # Three-way merge for a rejected roster save
│   │   └── index.js        # Module exports
│   └── assets/         # Fonts, PDFs, images
├── tests/              # Jest unit tests
│   ├── server/             # Route tests with a mocked pool
│   ├── integration/        # Route and schema tests against a real PostgreSQL
│   └── e2e/                # Playwright browser tests
├── migrations/         # SQL migrations (node-pg-migrate), applied on deploy
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

### The evaluation PDF

`public/modules/evaluation-pdf.js` fills the AYSO template with the roster.
Text is drawn with an embedded Liberation Sans rather than one of pdf-lib's
standard fonts: those are WinAnsi-encoded and `drawText` throws on anything
outside it, so a single player named Łukasz aborted the whole document and
nobody on the team got a form. Liberation Sans is metric-compatible with the
Helvetica it replaced, so the layout did not move, and it covers Latin Extended,
Greek, Cyrillic and Hebrew.

It does not cover CJK, Arabic or Devanagari, and a missing glyph draws as an
empty box rather than raising. So the module checks and returns
`undrawableNames`, and the caller tells the coach which names to write in by
hand — the form is still produced, since one such name should not cost the rest
of the team theirs.

The font is fetched at generation time from `/assets/`, which the service worker
caches as immutable, so it costs nothing on first load and is downloaded once.
Its licence sits beside it: SIL OFL 1.1 requires that.

### Team roles

`team_members.role` is one of `viewer`, `coach`, `owner`, lowest to highest, and
`roleSatisfies` treats an unrecognised value as below everything so an odd row
denies rather than grants. Viewers read; coaches write players and games; owners
rename, invite, remove members and delete the team.

A team must always keep one owner. Nothing grants the role, so a team with none
cannot be renamed, invited to, administered or even deleted — it would sit in
every member's list with the roster and season history inside. Both routes that
could remove the last one refuse: `DELETE .../members/:memberId` and
`DELETE .../membership`, the latter being how any member leaves a team on their
own.

### Roster concurrency

A team can have several coaches, and a roster save replaces the whole list, so
two of them editing at once would otherwise mean the second save silently
discards the first.

`teams.roster_version` is bumped by every roster write and by nothing else (a
team rename must not invalidate an in-flight roster edit). `GET .../players`
returns it; `PUT .../players` takes it as `expectedVersion` and answers 409 with
the winning roster when it no longer matches. The client then merges its version
against that one — `public/modules/roster-merge.js` — and retries once. Players
both coaches edited differently come back in `conflicts` and are reported to the
coach rather than settled silently.

Writes sent without `expectedVersion` apply unconditionally. That is what an
offline queue entry recorded by an older build does; new entries carry the
version and base roster they were made against, and replay through the same
merge.

### The two shapes of a saved game

The client holds a game flat — `quarters` for the per-quarter lineup, with the
division, formation and field size beside it. The `games` table has a `lineup`
column and a `settings` JSONB, and the route persists exactly those.

`toWireGame` / `fromWireGame` in `src/modules/cloud-storage.js` map between the
two, and are the only place that should. Before they existed nothing did, so
`game.lineup` was undefined on every save and the column stored `[]`. It was
easy to miss because season stats read `player_snapshot`, which survived; what
broke was reopening a synced game, which found no quarters and fell back to a
default formation. Games saved before the fix stored those columns empty and
cannot be recovered — they reopen empty.

### Renaming a player

Nothing carries a player id. `players` is keyed `UNIQUE(team_id, name)`, the
roster replace matches rows by name, and a saved game records names inside
`player_snapshot`, `lineup` and `captains`. Season stats key on name too. So a
rename has to move the name everywhere at once, or it splits one player into a
renamed entry with no history and an orphan holding all of it.

`PUT .../players` therefore takes an optional `renames: [{from, to}]`, applied
*before* the delete-and-upsert in the same transaction. Order matters: renaming
first means the upsert matches the row by its new name and updates it, where
renaming afterwards would have the DELETE see a name no longer on the roster
and remove the player, minting a new id. Chains and swaps (A→B with B→C) are
refused rather than ordered, and a target name already on the roster answers
409 rather than reaching the unique constraint as a 500.

The rewriting itself is pure and lives in `server/player-rename.js`, mirrored
client-side by `src/modules/player-rename.js` — the app is offline-first, so
the local roster and game history move immediately whether or not the write
lands. A rename that loses the three-way merge is dropped rather than saved
alongside the name it lost to; `surviveMerge` decides that, and the abandoned
name is reported to the coach with the merge conflicts.

Renames are not undoable. The undo stack holds players, captains and settings
but not the game history, so undoing a rename would restore the old name to the
roster while the games kept the new one. Renaming back is the exact inverse.

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