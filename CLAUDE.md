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

Rename the stub to the 14-digit `YYYYMMDDHHMMSS_name.sql` the existing
migrations use. The generator emits a 17-digit prefix, and node-pg-migrate
reads 17 digits as a date but 14 as a plain number — so a generated file sorts
*before* every migration already in here, and the next `npm run migrate` aborts
with "Not run migration ... is preceding already run migration". No filename
format the generator offers matches, so this is done by hand.

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

This is an AYSO Soccer Lineup Generator web application with a Node.js/Express
backend and a React frontend built by Vite. `npm run build` emits `dist/`, which
the server serves ahead of `public/`; `public/` now holds only static files that
are copied into the build as-is.

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
├── index.html          # Vite entry point
├── src/                # React frontend
│   ├── main.jsx        # Mounts App
│   ├── App.jsx         # Application state: roster, settings, lineup, sync
│   ├── constants.js    # App constants and configuration
│   ├── index.css       # Tailwind layers and the theme tokens
│   ├── components/     # UI, including the shadcn primitives in components/ui
│   └── modules/        # Framework-free logic, shared with the unit tests
│       ├── api-client.js   # Fetch wrapper with CSRF token handling
│       ├── storage.js      # LocalStorage utilities
│       ├── utils.js        # General utilities (shuffle, escape, etc.)
│       ├── season-stats.js # Season statistics calculations
│       ├── formations.js   # Formation definitions and positions
│       ├── lineup-engine.js# The AYSO rotation rules
│       ├── sync.js         # Offline queue and cloud sync
│       ├── roster-merge.js # Three-way merge for a rejected roster save
│       └── team-settings.js# Division, field size, formation: shape and defaults
├── public/             # Copied into dist/ verbatim by the build
│   ├── sw.js           # Service worker (precache list, offline strategies)
│   ├── manifest.json   # PWA manifest
│   ├── privacy.html    # Static privacy page (uses styles.css)
│   ├── styles.css      # Stylesheet for privacy.html
│   ├── favicon.svg     # Site favicon
│   └── assets/         # Fonts, PDFs, images, icon sprite
├── tests/              # Jest unit tests
│   ├── server/             # Route tests with a mocked pool
│   ├── integration/        # Route and schema tests against a real PostgreSQL
│   └── e2e/                # Playwright browser tests
├── migrations/         # SQL migrations (node-pg-migrate), applied on deploy
├── docs/               # Documentation (security, privacy)
├── test-data/          # Sample player roster files
├── package.json        # Dependencies and scripts
└── .railway/railway.ts # Railway deployment config (Infrastructure as Code)
```

### Backend (server.js)
- Express server serving `dist/` when it exists, then `public/`
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

### Frontend (src/)
- **App.jsx**: holds the state the whole app reads — roster, captains, settings,
  the generated lineup, game history and sync — and passes it to the tab
  components. It also exposes `window.lineupGenerator`, which is how the e2e
  tests put the app in a signed-in state without real Google credentials.
- **components/**: one component per tab (roster, season, schedule, evaluation)
  plus the dialogs, on shadcn/ui primitives and Tailwind.
- **modules/**: the logic that is not React — the lineup engine, season stats,
  formations, sync, the PDF builders — imported by both the app and the unit
  tests.

The pre-React app (`public/app.js`, `public/index.html`, `public/modules/`) was
deleted once nothing loaded it. It had been shipping alongside the bundle and
being precached by the service worker, and six of its modules had quietly
diverged from their `src/` twins. Two sources of truth is what broke four
exports and several tests before it was noticed, so keep logic in `src/modules/`
and let `public/` hold static files only.

### The evaluation PDF

`src/modules/evaluation-pdf.js` fills the AYSO template with the roster.
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
against that one — `src/modules/roster-merge.js` — and retries once. Players
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

### The printed sheet

Print used to hand the browser the whole app, which came out as several pages
of dark-themed navigation. `src/components/PrintSheet.jsx` is what goes on
paper instead: one page, the four quarter cards, each row a position, a jersey
number and a name. It sits in the DOM at all times and is hidden until the
`@media print` block in `index.css` reveals it, so Ctrl-P and the Print button
produce the same sheet.

The numbers come from the roster, not the lineup: the engine records
`positions[position] = player.name` and nothing else, so `printableQuarters` in
`src/modules/print-lineup.js` looks each one up by name — and works out who is
resting the same way, since a generated quarter lists only who took the field.

The sheet is `aria-hidden` and uses no headings. It is a second copy of what is
already on screen, and an `h1` in it broke the one-h1-per-page rule that
`tests/e2e/site-header.spec.js` guards.

### Dates on the wire

`games.game_date` and `fixtures.game_date` are DATE columns, and pg parses those
into a JS Date at local midnight, which `res.json` then writes out as a UTC
timestamp. The client stores and formats plain calendar dates, so that string
reached Game History as a date it could not read and rendered as "Invalid
Date" — and on a server east of UTC it was the day before, midnight having
crossed back over. `toDateOnly` in `server/date.js` narrows both to
'YYYY-MM-DD', and `parseLocalDate` reads only the calendar date at the front of
whatever it is given, so saves already in local storage still render.

### Editing a saved game

`sync()` replaces local history with the server's list outright, so anything a
game edit does not send to the cloud is destroyed at the next pull rather than
merely left behind. Notes were written to state and localStorage only, and the
delete quoted the team's id where the game's belongs — the server answered 404
into an empty catch, the row survived, and the next pull brought the game back.

`pushGameUpdate` and `pushGameDelete` in `src/modules/sync.js` are the way to
change a saved game: local first, then the server, then the queue if there is
no signal. Both cases the queue has to reason about are handled there rather
than at the call site — an edit to a game whose creation is still queued is
folded into that entry, since there is no row to PUT to yet, and deleting such
a game drops the creation instead of queueing a delete for an id the server
never issued.

A replay that comes back 404 counts as done for both: the game has been deleted
elsewhere, and there is nothing left to edit or remove. `api-client.js`
therefore puts the HTTP status on a failed response, so the queue can tell that
apart from a 500 it must keep.

### The match schedule

The schedule is the most collaborative thing in the app — several coaches and a
snack rota — and it was the last entity still half offline-first. Creating a
match was queued; editing and deleting went straight to the API inside a catch
that only logged, so on the touchline they applied to the device and to nobody
else. `pushFixtureUpdate` and `pushFixtureDelete` in `src/modules/sync.js` are
the way to change one now, mirroring the game pair down to folding an edit into
a creation that is still queued, dropping the creation when the match is
deleted before it ever replayed, and counting a 404 as done.

`sync()` pulls the schedule with the roster and the history, and the server's
list replaces the local one outright. It used to be fetched only on a team
switch, and adopted only when the server had at least one match — so a
cancellation made on another device could never arrive: the match came back
every time, and a team whose last match was deleted kept showing it forever.

Two things follow from the pull being authoritative. `migrateLocalDataToCloud`
uploads the schedule, or a season planned before signing in would be pulled out
from under the coach on their first sync; matches the bulk route would reject
are left behind rather than failing the batch and costing them the rest.
And a queued creation adopts the id the server issues when it replays
(`adoptFixtureId`) — without that the local copy keeps the id this device made
up, every later edit or delete 404s against it, and the pull hands the match
back.

A fixtures pull that fails is not fatal: the roster and the season history are
what the app is for, and refusing to sync them because the schedule 500'd is
the worse trade. The local schedule stands until the next try.

Sync listeners are told `pulled: true` when local storage has just been
replaced by the server's copy, which is App's cue to read the schedule back.
A push reports `synced` too, and re-reading on one of those would race the
state being pushed.

### How the team plays

The division, how many take the field, the formation and the number of quarters
lived in this device's `ayso_settings` and nowhere else. A coach who set a team
up as 12U on the laptop opened the app on their phone at the field and was
handed 10U and a 7v7 formation, and the assistant coach never saw either.
`user_settings.default_settings` looked like the fix but was not: the migration
wrote it once at first sign-in and nothing ever read it back.

They belong to the team, not the coach — two coaches sharing a side want the
same answer, and a coach running two sides wants a different one for each — so
they live in `teams.settings`, a JSONB, behind `GET`/`PUT
/api/teams/:teamId/settings`. Reading takes `viewer`; writing takes `coach`,
who already writes the roster and the games these settings shape. The division
stays in the `age_division` column it already had, because the team list and
team creation read it there and a second copy in the JSONB would be a second
answer to the same question; `mapTeamSettings` is what puts the two back
together. A write merges (`settings || $2::jsonb`) rather than replacing, so a
build that knows about fewer fields does not drop the rest, and it deliberately
leaves `roster_version` alone — changing a formation must not reject a roster
edit another coach is in the middle of.

`pushSettings` in `src/modules/sync.js` is the way to change them: local first,
then the server, then the queue with no signal, like a game or a match. There
is no merge and no version — four fields the whole team shares, last write
wins. What the queue does differently is fold: one entry per team, replaced
rather than appended, since five taps at the field are one write and nothing
would merge them anyway. That entry carries its `teamId`, which the game and
fixture entries do not need to: every team always has settings, so a replay
addressed to whichever team happened to be open would not fail — it would
quietly hand one side the other's formation. A replay refused 403 (a viewer) or
404 (a deleted team) counts as done, since neither improves by being retried at
every drain.

`sync()` pulls them with the roster and the schedule, and the server's copy
replaces the local one, so `migrateLocalDataToCloud` uploads settings a coach
moved off the defaults before signing in — `sameSettings` is what decides
whether there is anything worth sending.

Everything reads them through `normalizeSettings` in
`src/modules/team-settings.js`, because they now arrive from other devices and
older builds: a formation for the wrong field size, or a field size nothing can
be fielded with, degrades to something playable rather than reaching the lineup
engine or a `<select>` with no such option. Custom formations are the case
worth knowing about — they live in the device that made them and do not travel,
so a team set to one reads back elsewhere as the default for its field size.

In App this is `updateSettings`, and it is deliberately not an effect on
`settings`: an effect fires on a pull and on a team switch too, which would
push the team its own settings back, or hand the team being switched *to* the
settings of the one being left. Reopening a saved game passes `push: false` —
that sets the screen up the way that game was played, which is nobody else's
business.

The coach's theme is the one thing here that stays per-user. It is adopted from
`user_settings.theme` only on a device with no preference of its own — a phone
being signed into for the first time — and pushed whenever it changes after
that. A device set to light for the sun at the touchline should not be dragged
into dark because the laptop is. `PUT /api/settings` used to substitute
defaults for whatever the body left out, so recording which team was last
opened — which happens on every team switch — put a coach who works in light
back into dark; every column keeps its stored value now.

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
Configured for Railway deployment via **`.railway/railway.ts`** with automatic
builds using Nixpacks.

That file is the whole desired state, not a patch: anything it does not declare
is deleted on apply. The first draft of it planned to remove all five service
variables and disconnect the GitHub repo, simply by not mentioning them. So the
source is declared explicitly and the variables are held with `preserve()`,
which keeps Railway's existing value without writing a secret into this repo.

It replaced `railway.json`, which Railway deprecated with a 2026-12-01 cutoff.
Do not migrate it with `railway config migrate`: that drops `preDeployCommand`,
the builder and the restart policy to comments rather than translating them,
and losing the first of those would silently stop migrations running on deploy.

Preview with `railway config plan` before every `railway config apply`, and read
the destroy count. Note that an apply triggers a deployment of its own.

## Guidelines

- Keep the codebase organized