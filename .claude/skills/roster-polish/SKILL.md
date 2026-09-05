---
name: roster-polish
description: >-
  Audits and improves Shinguard across six lanes — UI/UX, mobile, database,
  features, performance, and code polish — then implements the change the user picks,
  with a verification gate matched to the lane. Use when asked to improve, polish,
  refine, tune, clean up, or "make better" any part of this app, or when asked what
  to work on next.
---

# Roster Polish

Measure the app, report what is actually true about it, offer three grounded choices,
then build the one chosen and prove it works.

## The rule this skill exists to enforce

"Make it better" is the easiest request to answer badly — with a diff that touches forty
files, changes the look of a working app, and fixes nothing a coach would notice. Three
constraints prevent that:

1. **Every finding traces to a line you read this session.** The audit script emits
   heuristic hits, not findings. A hit becomes a finding only after you open the file and
   confirm it. Prose in `CLAUDE.md` and in this skill is a hypothesis to verify, not
   evidence.
2. **Unmeasured is never "fine".** If the build is stale, `TEST_DATABASE_URL` is unset, or
   you never opened the app, say so in the Not Measured section. A clean report built from
   unrun checks is the worst thing this skill can produce.
3. **Polish is subtraction as often as addition.** Prefer fixing the thing that is wrong
   over adding a thing that is missing. A new feature nobody asked for is not polish.

This app is used one-handed, outdoors, on a phone, by a volunteer parent who is also
watching eight-year-olds. Weight every judgement by that.

## Step 1 — Run the diagnostic

```bash
node .claude/skills/roster-polish/scripts/audit-roster-app.js
```

Flags: `--lane=ui,mobile,db,features,perf,polish` narrows the run; `--all` lists every hit
instead of the first eight; `--json` emits the machine-readable report; `--strict` exits
non-zero on any FAIL.

The script measures rather than pattern-matches for its own sake: literal colors that
escape the theme tokens, catch blocks that tell the coach nothing, tap targets under 44px,
inputs that make mobile Safari zoom and never zoom back, foreign keys with no index,
multi-write handlers with no transaction, queries inside loops, modules no test imports,
gzipped entry-bundle size, precache paths no built file matches.

It knows what is deliberate here and marks it 🟢 rather than flagging it — the
`player-rename.js` mirror, the generated `public/vendor/` builds, `PrintSheet.jsx` being
exempt from the mobile rules. If you find yourself about to "fix" something the script
called deliberate, read `CLAUDE.md` first: it is load-bearing.

**Run `npm run build` first if `dist/` is stale.** The perf lane says so in Not Measured,
and quoting bundle numbers from an old build is exactly the kind of confident wrong answer
rule 2 is about.

## Step 2 — Fill the gaps the script cannot reach

The script reads source. It cannot tell you whether anything works. Add evidence for
whichever lanes you are about to touch:

| Question | How to answer it |
| :--- | :--- |
| Does the logic still pass? | `npm test` |
| Does PostgreSQL accept the SQL? | `createdb soccer_test && TEST_DATABASE_URL=postgres://localhost/soccer_test npm run test:db` |
| Does the app still work in a browser? | `npm run test:e2e` (starts its own server) |
| What does it actually look like on a phone? | `npm start`, then a Playwright script at 390×844 — see `references/verification.md` |
| Does it build? | `npm run build` |
| What has been tried already? | `git log --oneline -25` |

Read the source before asserting anything about behaviour. A finding like "the schedule
tab has no empty state" must cite the file you looked at.

## Step 3 — Assess the six lanes

Full criteria, and what "good" means for each in this codebase, are in
[references/lanes.md](./references/lanes.md).

1. **UI/UX** — theme-token discipline, feedback on every async action, empty and error
   states, keyboard paths, labelled controls, consistent density.
2. **Mobile** — tap targets, iOS input zoom, safe-area insets, hover-only affordances,
   horizontal overflow, one-handed reach for matchday controls.
3. **Database** — indexes matching the queries, transactions around multi-statement
   writes, `ON DELETE` decided explicitly, migrations that run on a fresh database and on
   production, integration coverage for anything new.
4. **Features** — gaps a coach would actually feel, TODOs already in the code, untested
   modules and routes.
5. **Performance** — entry payload on stadium LTE, deferred loading of heavy
   dependencies, service worker precache accuracy, render cost of the lineup tab.
6. **Polish** — dead code, console noise, files where size has become a real difficulty,
   naming and comments that no longer describe the code.

Severity rubric — use it literally so the colors carry information:

| | Meaning |
| :--- | :--- |
| 🔴 FAIL | A coach is affected now, or a safeguard is absent (data lost on sync, a control unreachable on a phone, an unindexed cascade on a growing table). |
| 🟡 WARN | A real defect or debt with a bounded blast radius (unlabelled icon button, silent catch, table that scrolls sideways). |
| ⚪ PARTIAL | Verified in part; one measurement could not be taken. Name the missing one. |
| 🟢 OK | Measured this session and sound. |

## Step 4 — Report

```markdown
# ⚽ Shinguard — Polish Review

**Evidence base:** [lanes run, suites run, what could NOT be measured and why]

## Executive Summary
[3–4 sentences: overall health, the single change most worth making, the biggest blind spot.]

## Lane Assessment

| Lane | Status | Measured Evidence | Opportunity |
| :--- | :---: | :--- | :--- |
| UI/UX | 🟢/🟡/🔴/⚪ | [file:line or a number you observed] | [gap] |
| … | | | |

## Findings
[FAIL first, then WARN. Each: what is wrong, the evidence, who it affects, the fix.]

## Not Measured
[Explicit. Never empty unless every lane took every measurement.]
```

## Step 5 — Offer exactly 3 options

Build them **from the findings**, not from a menu of themes.

- Each option traces to at least one confirmed finding. A lane with no finding is not an
  option this time, however appealing.
- The three differ in kind — risk, effort, payoff — so the choice is real. If the findings
  cluster in one lane, differ by depth instead (fix the instance / fix the class / change
  the mechanism) and say that is what you did.
- Recommend one, for a reason tied to coach impact or severity — not to effort.
- Each gets: title, why-now citing the finding, 3–4 concrete deliverables naming files,
  an effort estimate, and the verification you will run.
- If a FAIL exists, the recommended option addresses it or explains why not.

Present the choice with `AskUserQuestion`, one question, `multiSelect: false`, the
recommended option first and labelled `(Recommended)`.

## Step 6 — Build it, then prove it

Once the user picks, implement it **fully** — including the verification you promised.
Per-lane gates, expanded in [references/verification.md](./references/verification.md):

| Lane touched | Gate before you report done |
| :--- | :--- |
| UI/UX, polish | `npm test`, plus the e2e spec covering that surface |
| Mobile | A 390×844 Playwright pass over the changed screens, and `npm run test:e2e` |
| Database | A new migration + `npm run test:db` against a real PostgreSQL. Not optional — a mocked-pool test does not prove PostgreSQL accepts the SQL. |
| Features | A unit test in `tests/` for the module, an e2e spec for the flow |
| Performance | `npm run build` and the before/after gzip numbers from the audit script |

Then re-run the audit for the lane you touched and show the finding is gone.

If a suite fails, say so with the output. If a gate could not run — no PostgreSQL, no
browser — say which, and do not describe the work as verified.

## Invariants — do not "improve" these

Each of these is a scar. Breaking one reintroduces a bug this codebase already paid for.
The reasoning is in `CLAUDE.md`; the short list:

- **Logic lives in `src/modules/` only.** `public/` holds static files; `public/vendor/` is
  generated by `scripts/copy-vendor.js` and gitignored.
- **Migrations**: a new file per change, 14-digit `YYYYMMDDHHMMSS_name.sql`, never edit
  `20260822000000_baseline.sql`, never run `railway config migrate`.
- **`toWireGame`/`fromWireGame`** are the only place the two game shapes map.
- **`normalizeSettings`** is the only door team settings come through.
- A roster write bumps `roster_version`; **a settings write must not**.
- Changing a saved game or match goes through `pushGameUpdate`/`pushGameDelete`/
  `pushFixtureUpdate`/`pushFixtureDelete` — local, then server, then queue; a replayed 404
  counts as done.
- **`updateSettings` is not an effect on `settings`** — an effect would push a team its own
  settings back, or hand a team the settings of the one being left.
- A team always keeps one owner.
- `PrintSheet.jsx` stays `aria-hidden` with no `h1`.
- A rename rewrites `server/player-rename.js` and `src/modules/player-rename.js` together.
- Dates on the wire go through `toDateOnly` / `parseLocalDate`.
- Bump `CACHE_NAME` in `public/sw.js` whenever a precached asset changes.

## References

- [Lane criteria](./references/lanes.md) — what good looks like per lane, in this app's terms.
- [Verification](./references/verification.md) — how to prove each kind of change, including
  the mobile screenshot pass and the database gate.
- [Diagnostic script](./scripts/audit-roster-app.js)

## Keeping the installed copies in sync

This skill is project-scoped and ships in the repo, in two places — and a third can shadow
both.

| Location | Used by |
| :--- | :--- |
| `.claude/skills/roster-polish/` | Claude Code — **source of truth** |
| `.agents/skills/roster-polish/` | Antigravity |
| `~/.claude/skills/roster-polish/` | user-level Claude Code install; **takes precedence over the project copy** |

After editing the source of truth:

```bash
bash .claude/skills/roster-polish/scripts/sync-skill.sh         # push to every target present
bash .claude/skills/roster-polish/scripts/sync-skill.sh --check # verify, non-zero if drifted
```

The user-level copy is synced only if it already exists — the script will not create one,
since a project-specific skill should not appear in unrelated projects. If a report
contradicts the repo, run `--check` first: you may be reading output from a shadowed copy.

The diagnostic script locates the repo from its own path, then the working directory, then
`$ROSTER_REPO_ROOT`, so it works from any of the three installs and exits 2 with an
explanation rather than guessing.
