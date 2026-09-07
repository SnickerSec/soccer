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

### Creating a team before there is an account

The Create Team button on the Lineup tab is shown signed out as well: a coach
with no account is precisely the one with no team, and hiding it left the
feature reachable only from the account menu, which is itself only there once
signed in.

Signing in is a whole-page redirect to Google, so the intent has to outlive the
component. `handleCreateTeam` writes `shinguard_pending_create_team` to
sessionStorage and starts the sign-in; the effect watching `currentUser` reads
that flag once, removes it, and opens the dialog on the create form. Removing
it on read is the point — otherwise every later sign-in in that tab would
reopen the dialog.

### Signing in must not cost the team its roster

`PUT .../players` replaces a team's whole roster, so an empty list deletes
every player for every coach. Two separate things had to be true for the app
to survive a sign-in, and neither was.

`sync()` writes the pulled roster to localStorage but cannot touch React
state, and startup adopted only the schedule and the settings from it. So
`players` stayed `[]`, and the effect that persists players wrote that `[]`
back over the roster the pull had just stored. `adoptRoster` in App is what
takes up the roster, the captains and the history now — after `refreshTeams`,
which is what settles which team is open, and again on every pull.

The push itself is an effect whose dependencies include `currentUser` and
`currentTeam`, and those change for reasons that are not edits: a sign-in, a
team switch, and the pull that follows either. `rosterPushDecision` in
`src/modules/roster-push-guard.js` records the roster per team — the first
sight of a team is never pushed, and after that only a roster differing from
the last one recorded counts as an edit. Clearing a roster deliberately still
pushes, since it differs from what was recorded.

Together they cost a real roster. Moving to `shinguard.app` gave the app a new
origin, so localStorage was empty; the roster was deleted server-side before
the pull could fill it in, and the only surviving copy was the
`player_snapshot` inside a saved game.

The lesson worth keeping is about the effect, not the domain: an effect that
writes to the server has to be able to tell "the user changed this" from "the
app just finished loading", and a dependency array cannot. The settings push
avoids the whole hazard by not being an effect at all.

`tests/e2e/roster-not-wiped-on-signin.spec.js` covers both, including the
slow-pull case that is the incident's real shape. Both were verified by
removing each fix and watching the tests fail.

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

### What a saved game records about the squad

A game's `players` snapshot is the only record of who was there. The lineup
engine is handed the available players and nothing else, so saving its
`playerStats` verbatim recorded a full turnout every time: `calculatePlayerStats`
counts a game towards a player only when the game names them, so nobody was
ever absent, every attendance in the Season tab read 100%, the Squad Attendance
Rate could not read anything else, and "Returning from Absence" could never
fire.

Captains went the same way for the same reason. They live in their own state
rather than on the roster rows, so no snapshot carried `isCaptain`,
`captainGames` stayed 0 for the whole squad, and the balancing in
`handleGenerateLineup` that picks next week's captains from whoever has worn
the armband least was reading that zero.

`gameRosterSnapshot` in App is what the save records now: every player on the
roster, with the engine's per-quarter stats merged in for the ones who took the
field, their status, and the armband. The saved game also carries `captains`,
which the column and the route had always been there to hold.

Old games cannot be repaired — who was on the roster the day they were played
is not recoverable — so they still report a full turnout.

The armband lives in `captains` and nowhere else. A roster row carries an
`isCaptain` only as of the last time the roster was persisted, and the engine
hands its copies of those rows through to the lineup as `playerStats` — so the
Player Summary, which read that field, went on naming the pair from before the
generation while the quarter cards beside it, which read `captains`, named the
one it had just picked. Anything showing the armband reads `captains`; a
lineup does not get a copy of its own, because a second place for a name to
live is a second answer to who is wearing it.

The armband is a season stat like the quarters and the gloves, so the Season
tab's Player Statistics table has a Captain column and the CSV a "Captain
Matches" one. What the column marks is the balancing: the available players
tied at the squad's lowest count are the ones `handleGenerateLineup` draws
next week's captains from, and they are badged — all of them, not the first
three the recommendations banner has room to name. Nobody is badged until
somebody has worn it, since a minimum everybody is tied at says nothing.
`tests/e2e/attendance-tracking.spec.js` saves four games and asserts the eight
armbands land on eight different players.

A tie in the Season tab's recommendations used to be settled by roster order.
Two even games leave a squad tied almost everywhere, so the same three names
were recommended for everything, week after week, and rest priority named
players who had already sat the most: the filter admitted anyone within half a
quarter of the minimum, then took the first three. Only players actually at the
minimum are behind now, and ties break on who has been on the field most, then
on name — the same input gives the same answer whatever order the roster is in.

A player who has missed every game so far is the exception, and was hidden
twice over. The gloves and the armband are owed to whoever has had fewest
turns, so a `gamesPlayed > 0` filter took out the player owed most: he had
nought of each because he had never been there, and the only line naming him
was "Returning from Absence". That filter is gone from both lists, and such a
player leads a tie rather than trailing it — ordering on quarters played sorts
someone with no quarters last. It stays on rest priority alone: a player who
has sat nothing because he has played nothing must not be told to sit.

### Correcting a game after it was played

What was planned and what happened are rarely the same match: someone does not
turn up, the armband changes hands, a keeper swaps out at half time. So a saved
game's squad, captains and per-quarter lineup are editable, not only its name,
date and notes.

Everything a game records about a player is *derived*. The engine writes
`quartersPlayed`, `quartersSitting`, `positionsPlayed`, `offensiveQuarters`,
`defensiveQuarters` and `goalieQuarter` onto the snapshot, and
`calculatePlayerStats` reads those and never the quarters. An edited lineup
saved without recomputing them would show the coach a corrected game and go on
counting the planned one. `recalculateGamePlayers` in
`src/modules/game-edit.js` is what derives them again, and its bookkeeping
mirrors `generateQuarterLineup` field for field — Keeper counts as a defensive
quarter and records the quarter it fell in — so a hand-edited game and a
generated one are the same shape and count the same way.

An absence records nothing rather than four sat quarters: `calculatePlayerStats`
counts a game towards a player only when the game names them, and a player who
was not there did not sit either. Marking someone absent therefore also empties
the slots they were penciled into and takes the armband off them, since a
snapshot still carrying `isCaptain` credits a captain game for a match they
missed. Nobody may hold two positions in one quarter — `assignToSlot` clears
the other one — or that quarter is counted twice against one afternoon.

The rotation warnings are shown and never enforced. A match that broke the
"everyone plays" rules is still what happened, and the record has to be able to
say so.

Reading a game and correcting one are the same screen, and it opens over the
Season tab. Opening a game used to move the coach to the Lineup tab and set the
division, field size and formation to that game's — a lot to do to someone who
wanted to look something up. Putting the lineup back on the field is still
there, as `handleOpenGameOnField` behind a button that says so.

On the wire, `toWireGameUpdates` in `cloud-storage.js` maps a *partial* edit:
`quarters` to the `lineup` column, and `settings` only when the edit actually
carries a division, formation or field size. Running an edit through the whole
of `toWireGame` would build a settings object out of undefined fields, so
changing the notes alone would blank the formation the game was played at. Both
the live edit and the offline queue's replay go through `updateGame`, so the
mapping happens once for both.

### Today is a calendar date, not a moment

`new Date().toISOString()` is the UTC day, and every timezone this app is used
in is behind it. A game ended on a Saturday afternoon was dated Sunday, so it
landed in Game History under the wrong date and in the wrong place in the
season. `todayLocalDate` in `src/modules/schedule.js` is what dates a game, in
the save dialog and at the end of a match. It goes with `toDateOnly` and
`parseLocalDate`: these are plain calendar dates the whole way through.

### The domain

The app is `shinguard.app`. It was `aysoroster.com`, which is gone: the
registration was not renewed, and both it and its `www` were removed from the
Railway service. A domain nobody here controls must not stay attached to the
service — whoever registers it next could point it at this app and serve the
whole thing, branding included, under a name they own.

`server/canonical-host.js` sends `www.shinguard.app` to the apex, so there is
one origin. That matters beyond tidiness — a session cookie belongs to an
origin, and a coach signed in on `www` would look signed out on the apex.

The list there is an allowlist, not "anything that is not canonical". Railway's
health check and its generated `*.up.railway.app` name reach the server under
their own `Host`, as does localhost; a blanket redirect bounces all three and
fails the deploy. Only GET and HEAD are redirected, because a 301 may be
replayed as a GET and would drop the body of an API write.

Nothing else hardcodes the domain. `APP_URL` is what the OAuth callback and the
invite links are built from, so moving again means that variable, the Google
console's redirect URI, and this list — not a search across the source.

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

### Importing a calendar

`src/modules/schedule-importer.js` reads a season out of a `.ics` export.
TeamSnap is what it is written against, and a TeamSnap export gets three things
wrong if it is read literally.

`DTSTART` is stamped in UTC. A 2pm Saturday kickoff in Hawaii is
`20260830T000000Z` — midnight, the following day — so reading the digits as
written filed every match in the season a day late at 12:00 AM.
`parseIcsDateTime` converts: `Z` is an instant and is rendered in the coach's
own zone, a `TZID=` parameter names the zone its wall time belongs to, and a
floating time with neither means the same clock reading everywhere and is taken
as it stands. It takes the zone to render into as an argument, defaulting to
the device's, because a test that asserts a converted date otherwise passes or
fails on where the machine running it happens to be.

The export is the whole calendar, not the match list. The season this was
written against holds ten games and forty practices, and importing all fifty
filled the schedule with matches against "Practice at Kaha Park".
`classifyIcsEvent` reads the label TeamSnap puts in front of every summary, and
a calendar that names any of its events a game is taken at its word — nothing
else in it is imported, and the preview says how many were left. A calendar
that labels nothing is still imported whole, so a hand-made one of ten untitled
fixtures works.

`SUMMARY`, `LOCATION` and `DESCRIPTION` each carry more than the field they
fill. The label comes off the front of the opponent ("Game: A vs B"), and the
coach's own team is recognised on either side of the separator, since "A vs us"
is our away game. A multi-line `LOCATION` is a venue and its street address and
is flattened onto one line. Most of a `DESCRIPTION` is the summary and the
location again, a duration and a deep link a hundred characters long, so
`parseIcsDescription` lifts out the volunteer duties and drops the rest rather
than putting all of it in the notes of a match the coach is already looking at.

Home and away is the one thing an export like this cannot say. TeamSnap names
your team first whether or not you are hosting, so every match imports as home
and the coach fixes the away ones. Nothing here guesses from the venue.

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
then the server, then the queue, like a game or a match. There is no merge and
no version — four fields the whole team shares, last write wins.

"Then the queue" was read as `navigator.onLine` alone, and this was the one
push here that queued on nothing else. The commoner case at a field is a phone
that has a bar of LTE, believes it is online, and watches the request die: the
change was written to the device and nowhere else, and since `sync()` replaces
local settings with the server's copy outright, the next pull handed the
formation back the way it was — to a coach who had been looking at the new one
since they tapped it. A failed response and a thrown request now queue too. The
exceptions are 403 and 404, which the drain already counts as done for the same
reason it does: a viewer's write and a deleted team's will not start working. What the queue does differently is fold: one entry per team, replaced
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

### One roster editor, two places

The first tab is called Lineup — generating one is what the app is for — and
the roster it edits is also editable from the Season tab, which is where a
misspelt name or a player who has left is actually noticed. Both render
`src/components/RosterEditor.jsx`: the add form, the player rows and the
ratings dialog, writing through the same handlers in App. A second copy of a
row that sets jersey numbers, the armband and availability would be a second
answer to what a roster row does.

Both tab panels are in the DOM at once, so the editor takes an `idPrefix`. The
Lineup tab keeps the bare ids (`playerName`, `playerList`, …) that the e2e
suite selects on and the Season dialog prefixes them, since a duplicate id
matches whichever the browser reaches first.

The Season dialog has no Save. Every control writes through as it is touched,
exactly as on the Lineup tab, so there is nothing to commit — only a Done that
closes it.

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