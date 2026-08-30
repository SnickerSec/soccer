# Verification

How to prove a polish change actually worked. A change is not done because the diff looks
right; it is done when the gate for its lane has run and passed in front of you.

If a gate cannot run — no PostgreSQL, no browser, no network — name it in Not Measured and
do not describe the work as verified.

---

## The suites

| Command | What it proves | Needs |
| :--- | :--- | :--- |
| `npm test` | The framework-free logic in `src/modules/` and the routes with a mocked pool | nothing |
| `npm run test:db` | PostgreSQL accepts the SQL, migrations run on a fresh database | `TEST_DATABASE_URL` |
| `npm run test:e2e` | The app works in a browser; starts its own server | Chromium (auto-installed once, ~300MB) |
| `npm run build` | Vite builds and the service worker gets the hashed asset list injected | nothing |
| `npm run test:all` | All three suites | both of the above |

`npm test` passing while `test:db` is skipped is the trap. Without `TEST_DATABASE_URL`
every integration test **reports as skipped, not failed**, so a migration that only works
on a fresh database looks green. Set it up once:

```bash
createdb soccer_test
TEST_DATABASE_URL=postgres://localhost/soccer_test npm run test:db
```

The harness refuses any database whose name does not contain "test", because it truncates
every table between tests.

---

## Gate by lane

### UI/UX and polish

1. `npm test`
2. The e2e spec that covers the surface — the 34 specs in `tests/e2e/` are named after the
   feature (`roster-controls`, `lineup-swap`, `game-history`, `site-header`…). Run just
   one: `npx playwright test tests/e2e/roster-controls.spec.js`
3. If you changed a control's accessible name, run `tests/e2e/site-header.spec.js` too —
   it guards the one-`h1`-per-page rule.

About a third of the e2e specs collect `pageerror` and assert
`expect(errors).toEqual([])` (check with `grep -l pageerror tests/e2e/*.spec.js`). That is
the pattern worth copying into anything you add — it is what turns a silent React error
into a failed test rather than a screenshot that happens to look right.

### Mobile

Class names are not evidence. Load the app at a phone viewport and look:

```js
// scratch-mobile-check.mjs — run with `node` after `npm start`
import { chromium, devices } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ ...devices['iPhone 13'] });   // 390×844, touch, DSF 3
await page.goto('http://localhost:3000');
await page.click('#demoButton');
await page.click('#generateLineup');
await page.screenshot({ path: 'before.png', fullPage: true });
// horizontal overflow check — this must be false
console.log('page scrolls sideways:',
  await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
await browser.close();
```

`#demoButton` and `#generateLineup` are the fastest way into a populated app without
signing in; `window.lineupGenerator` is the hook the e2e suite uses to fake a signed-in
state.

Then take the screenshot again after the change and compare. For a tap-target change,
assert the box: `expect((await el.boundingBox()).height).toBeGreaterThanOrEqual(44)`.

Add the check to `tests/e2e/` with `test.use({ viewport: { width: 375, height: 667 } })`
so it does not regress.

### Database

Non-negotiable order:

1. `npm run migrate:create -- add_something`
2. **Rename the generated file by hand** to 14 digits: `YYYYMMDDHHMMSS_name.sql`. The
   generator emits 17, node-pg-migrate reads 17 as a date and 14 as a plain number, and a
   17-digit file sorts before every existing migration — the next `npm run migrate` aborts
   with "Not run migration ... is preceding already run migration".
3. Write only the change, in both `-- Up Migration` and `-- Down Migration`. Guards like
   `IF NOT EXISTS` belong only in the baseline, which ran against a production database
   that already had everything.
4. Never edit `20260822000000_baseline.sql`.
5. Add or extend a test in `tests/integration/` — that suite runs the real migrations, so
   a migration that only works on a fresh database fails there rather than on deploy.
6. `npm run test:db` with a real `TEST_DATABASE_URL`. A `tests/server/` test with a mocked
   pool does **not** substitute.

Railway runs `npm run migrate` as its `preDeployCommand`, so the migration ships with the
code that needs it. Do not touch `.railway/railway.ts` as part of a polish change; if you
must, `railway config plan` first and read the destroy count.

### Features

- A unit test in `tests/` for the module (`src/modules/` logic is framework-free precisely
  so it can be tested directly).
- An e2e spec for the flow.
- If it syncs: a test that the queued entry replays, that a 404 on replay counts as done,
  and that a second device's pull does not resurrect it. Those three are the bugs this app
  has actually shipped.

### Performance

- `npm run build`, then `node .claude/skills/roster-polish/scripts/audit-roster-app.js
  --lane=perf` before and after. Quote both gzip totals.
- If you changed anything in `public/`, bump `CACHE_NAME` in `public/sw.js` and confirm
  `tests/service-worker.test.js` still passes.
- `tests/e2e/offline.spec.js` and `tests/e2e/pdf-lazy-load.spec.js` are the ones that catch
  a deferred-loading change going wrong.

---

## Closing the loop

Re-run the audit for the lane you touched and show the finding is gone:

```bash
node .claude/skills/roster-polish/scripts/audit-roster-app.js --lane=mobile
```

Then report: what changed, which gates ran, their output, and what remains unmeasured.
State test failures with the output rather than around them.
