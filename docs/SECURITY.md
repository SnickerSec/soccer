# Security Overview - Shinguard

This describes how the application is secured as it stands. For what data is
stored and who can see it, see the user-facing page at `/privacy.html`.

> An earlier version of this document described a static, client-only app with
> no accounts and no database, and listed an XSS hole, a missing CSP and missing
> input validation as open issues. All three were fixed, and the app has since
> grown a server, a database and optional accounts. Treat anything below as
> current only if it matches the code.

## Architecture

The app runs two ways:

- **Local only (default).** No account. Roster, saved games and settings live in
  the browser's `localStorage`. Nothing about the team reaches the server.
- **Signed in (optional).** Google OAuth. Roster, games and team membership are
  stored in PostgreSQL so co-coaches can share a team.

The lineup generator itself always runs in the browser, in a Web Worker.

## Authentication

- Google OAuth 2.0 via Passport (`passport-google-oauth20`). The app never sees
  a password.
- Sessions are server-side, stored in PostgreSQL through `connect-pg-simple`.
- The session cookie is `httpOnly`, `sameSite=lax`, and `secure` when
  `NODE_ENV=production`, with a 7-day lifetime.
- `SESSION_SECRET` **must** be set in production. The server logs a warning and
  falls back to a known development value if it is missing, which would make
  sessions forgeable.
- If `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are unset, OAuth is disabled and
  the app runs local-only.

## Authorization

Two middlewares in `server/middleware.js`:

- `requireAuth` — rejects anonymous requests with 401.
- `requireTeamAccess(minRole)` — resolves the caller's role on the team and
  rejects with 403 when they are not a member or their role is too low.

Roles are ordered `viewer < coach < owner`. An unrecognised role ranks below
every requirement, so unexpected data denies rather than grants. A pending
invitation does not count as membership: the lookup requires `joined_at IS NOT
NULL`.

Routes that take a resource id rather than a team id (`DELETE /api/players/:id`,
`PUT` and `DELETE /api/games/:id`) resolve the owning team first, then check the
caller's role with the same `getTeamRole` / `roleSatisfies` helpers. These
previously checked membership but not role, which let a read-only viewer delete
players and games; `tests/server/players-games.test.js` covers that.

Invitations are single-use rows with a 24-byte `base64url` token and an expiry
between 1 and 30 days. An owner cannot mint an `owner` invitation.

## Request protections

- **CSRF** — `csrf-sync` guards every state-changing `/api` route. `GET`, `HEAD`
  and `OPTIONS` are exempt. The token is issued by `GET /api/csrf-token`.
- **Rate limiting** — 100 requests per 15 minutes globally, 50 for `/api`. Static
  assets and `/health` are mounted before the limiter so page loads do not
  consume the budget.
- **Body size** — JSON bodies are capped at 100kb.
- **SQL** — every query uses parameter placeholders. No string interpolation of
  user input into SQL.

## Response headers

Set for every response in `server.js`:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob: https://*.googleusercontent.com`, `connect-src 'self'`, `frame-ancestors 'none'`, `form-action 'self' https://accounts.google.com`, `base-uri 'self'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |

No third-party scripts are loaded. `pdf-lib` and `fontkit` are vendored into
`public/vendor/` at install time rather than pulled from a CDN, which is what
allows `script-src` and `connect-src` to stay at `'self'`.

## Output escaping

Player names are attacker-controlled in practice — they arrive from imported
text files.

- DOM construction (`textContent`, `createElement`) is used for the roster list
  and the lineup grid.
- Where markup is built as a string (`modules/season-render.js`), values pass
  through `escapeHtml` from `modules/utils.js`. `tests/season-render.test.js`
  covers escaping of names, notes and position lists.

## Known weaknesses

- **`'unsafe-inline'` in `script-src` and `style-src`.** Inline handlers and
  styles in the markup still require it. Removing it means moving those to
  external files or adopting nonces, and would meaningfully strengthen the CSP.
- **No encryption at rest guarantee.** Whether the database encrypts at rest
  depends on the hosting provider, not on this code.
- **No account deletion endpoint.** Deleting a team removes its data, but a
  profile row persists after sign-out.

## Dependencies and verification

- Dependabot watches the repository; `npm audit` currently reports no
  vulnerabilities.
- CI runs the full suite on every push and pull request: unit tests including
  server-side authorization tests under `tests/server/`, plus end-to-end tests.
- Run `npm run test:all` locally.

## Deploying

1. Serve over HTTPS only.
2. Set `SESSION_SECRET` to a strong random value.
3. Set `NODE_ENV=production` so the session cookie is marked `secure`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if cloud sync is wanted.
5. Set `DATABASE_URL`, and keep the database off the public internet.
6. `app.set('trust proxy', 1)` is set for a single reverse proxy; adjust it if
   your topology differs, since rate limiting keys on the client IP.
