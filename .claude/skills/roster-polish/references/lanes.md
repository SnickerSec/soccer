# Lane criteria

What "good" means for each lane **in this app**, what the audit script can and cannot see,
and the false leads that waste a review.

The user for all of this is a volunteer coach: outdoors, one hand, a phone in bright sun,
patchy LTE, eight-year-olds to watch. When two improvements compete, the one that helps at
the touchline wins over the one that helps at a desk.

---

## 1. UI/UX

**Good here means**

- Colors come from the HSL tokens in `src/index.css`. Both `[data-theme="dark"]` (the
  default) and `[data-theme="light"]` define every token, so a literal color is a control
  that stops matching the app when the coach switches theme at kickoff.
- Every async action ends in visible feedback. `sonner` is already wired in `main.jsx` and
  imported by ten components — a failed save that only reaches `console.error` is a coach
  who thinks the roster is saved.
- Every list has an empty state that says what to do next, not just blank space.
- Destructive actions confirm through `AlertDialog`, not `window.confirm`. The native
  dialog blocks the thread, ignores the theme, and on iOS Safari renders as a system sheet
  that looks like it came from somewhere else.
- Every control is reachable by keyboard and announced by name. `role="button"` +
  `tabIndex={0}` + `onKeyDown` on a clickable `<div>`, `aria-label` on an icon-only button.
- Density is consistent within a surface. Mixed `text-xs`/`text-sm` in one card reads as
  unfinished.

**False leads**

- `#4285F4` in `Header.jsx` is Google's brand blue on the sign-in button. Brand marks are
  legitimately literal — the audit flags it because it cannot tell; do not tokenize it.
- The pitch colors in `FieldVisualization.jsx` are a drawing, not chrome. If they should
  follow the theme, that is a design decision to raise, not a defect to fix silently.
- `PrintSheet.jsx` deliberately has no headings and is `aria-hidden`. It is a second copy
  of what is already on screen; an `h1` there breaks
  `tests/e2e/site-header.spec.js`.

---

## 2. Mobile

**Good here means**

- Tap targets at least 44px (iOS) / 48dp (Android) on small screens. The pattern that
  keeps desktop density is a responsive pair — `min-h-11 sm:min-h-9` — not a global bump.
- Inputs at 16px or larger on mobile. Below that, Safari zooms the page on focus and does
  not zoom back; the coach then scrolls a magnified app one-handed for the rest of the
  game. `text-base sm:text-xs` on the field, not `text-xs` everywhere.
- Safe areas respected. `index.html` asks for `black-translucent` and the app is
  installable, so without `viewport-fit=cover` **plus** `env(safe-area-inset-*)` padding
  the header sits under the notch. Neither half works alone.
- Nothing revealed only on hover. There is no hover on a phone.
- Tables either scroll inside their own `overflow-x-auto`, or become stacked cards below
  `sm:`. The page body must never scroll sideways.
- The matchday controls sit in thumb reach — bottom half of the screen, not the top bar.
  `LineupSection.jsx` already does the swipe gesture and `navigator.vibrate(15)`; new
  matchday controls should match that vocabulary rather than invent one.

**Verify on a real viewport, not by reading class names.** `tests/e2e/mobile-swipe.spec.js`
shows the pattern: `test.use({ viewport: { width: 375, height: 667 } })`.

---

## 3. Database

**Good here means**

- Every foreign key is indexed if anything joins or cascades on it, and every `REFERENCES`
  states `ON DELETE` explicitly. The default is `NO ACTION`, which surfaces as a 500 when
  a coach deletes a team.
- A handler that writes more than once does it in a transaction on one checked-out client.
  Half-applied writes are precisely what `tests/integration/` exists to catch.
- No query inside a loop. `server/routes/players.js` reads game rows in a loop; whether
  that matters depends on how many games a season has — measure before proposing.
- Interpolation in SQL is for generated identifier and placeholder lists only
  (`GAME_COLUMNS`, `setClauses.join(', ')`). A request value in a template literal is
  injection. The audit flags all of them because it cannot tell the two apart; you can, by
  reading.
- New schema arrives as a new migration file: 14-digit `YYYYMMDDHHMMSS_name.sql`, written
  by hand after `npm run migrate:create` (which emits a 17-digit name that sorts before
  every existing migration and aborts the next `npm run migrate`). The baseline is never
  edited and never reversible.
- Anything new gets a test in `tests/integration/`, which runs the real migrations against
  a real PostgreSQL. A `tests/server/` test with a mocked pool proves the SQL was built,
  not that the database accepts it.

---

## 4. Features

**Good here means** a gap the coach feels, not a gap in a feature matrix. Sources of real
gaps, in order of reliability:

1. TODO/FIXME already in the code — someone hit the wall and deferred it.
2. Modules and routes no test imports: `evaluation-pdf`, `field-visualization`,
   `match-card-pdf`, `team-manager`, `whistle-audio` and `routes/auth.js` at last count.
   Untested is where the next silent regression lands, and a test is often the more
   valuable deliverable than a feature.
3. Asymmetries between entities. Games, fixtures and settings each got the full
   offline-first treatment (`push*Update`/`push*Delete`, queue folding, 404-as-done) at
   different times. Anything added later must follow that same shape or it will apply to
   one device and nobody else — that was the schedule bug.

**Before proposing any new entity that syncs**, read "The match schedule" and "How the
team plays" in `CLAUDE.md`. The pull is authoritative and replaces local state outright,
so anything the client does not push is destroyed at the next sync.

---

## 5. Performance

**Good here means**

- The entry payload stays small enough for stadium LTE. `vite.config.js` already splits
  `vendor-react`, `vendor-radix` and `vendor-icons`; measure the gzip total with the audit
  script before and after any change and quote both numbers.
- Heavy dependencies load on demand. `evaluation-pdf.js` injects pdf-lib and fontkit
  (~1.2MB) from `/vendor/` via `loadScript()` when the coach opens the form, and the
  service worker caches `/vendor/` and `/assets/` as immutable. A new heavy dependency
  follows that pattern or a dynamic `import()`.
- `ASSETS_TO_CACHE` in `public/sw.js` matches what the build emits. The install handler
  swallows a 404 per asset, so drift here fails silently and the app is quietly less
  available offline than it claims. `CACHE_NAME` (currently `v37`) is bumped whenever a
  precached asset changes.
- Render cost: the lineup tab redraws four quarter cards on every drag. Measure with the
  React profiler before proposing memoization — `App.jsx` holds the state everything
  reads, so a `useMemo` in the wrong place buys nothing.

---

## 6. Polish

**Good here means** the code says what it does and nothing extra. Candidates:

- `console.log`/`debug`/`info` left in shipped client code (`console.error` and `.warn`
  earn their place).
- Comments that describe a previous version of the function.
- Files where the size has become a real difficulty — not files that are merely long.
  `App.jsx` at ~1500 lines is deliberate: it holds the state the whole app reads. Split it
  only where a specific edit is hard *because* of the size, and say which edit.
- Dead exports, unused props, `useEffect`s whose dependency array no longer matches.

**Never propose deduplicating `server/player-rename.js` and
`src/modules/player-rename.js`.** They mirror each other because the app is offline-first
and the rewrite has to happen on both sides. Do check they still agree after either changes.
