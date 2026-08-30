#!/usr/bin/env node
/**
 * Diagnostic for the roster-polish skill.
 *
 * Measures the AYSO Roster Pro codebase across six lanes — ui, mobile, db,
 * features, perf, polish — and prints findings with file:line evidence.
 *
 * Every check here is a HEURISTIC that points at a line to read. It is a
 * starting point for a finding, never the finding itself: confirm each hit by
 * opening the file before reporting it to the user.
 *
 * Usage:
 *   node .claude/skills/roster-polish/scripts/audit-roster-app.js [options]
 *
 *   --lane=ui,mobile,db,features,perf,polish   only run these lanes
 *   --json                                     machine-readable report
 *   --all                                      do not truncate hit lists
 *   --strict                                   exit 1 if any FAIL
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

/* ------------------------------------------------------------------ setup */

const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const opt = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
};

const AS_JSON = flag('json');
const SHOW_ALL = flag('all');
const STRICT = flag('strict');
const ALL_LANES = ['ui', 'mobile', 'db', 'features', 'perf', 'polish'];
const LANES = (opt('lane') || '').split(',').filter(Boolean);
const lanes = LANES.length ? LANES.filter((l) => ALL_LANES.includes(l)) : ALL_LANES;

function findRepoRoot() {
    const candidates = [];
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (let d = here; d !== path.dirname(d); d = path.dirname(d)) candidates.push(d);
    for (let d = process.cwd(); d !== path.dirname(d); d = path.dirname(d)) candidates.push(d);
    if (process.env.ROSTER_REPO_ROOT) candidates.unshift(process.env.ROSTER_REPO_ROOT);

    for (const dir of candidates) {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
            if (pkg.name === 'ayso-roster-pro') return dir;
        } catch { /* keep looking */ }
    }
    return null;
}

const ROOT = findRepoRoot();
if (!ROOT) {
    console.error(
        'Could not locate the ayso-roster-pro repo.\n' +
        'Run this from inside the repo, or set ROSTER_REPO_ROOT=/path/to/soccer.'
    );
    process.exit(2);
}

/* ------------------------------------------------------------- file utils */

const abs = (rel) => path.join(ROOT, rel);
const rel = (file) => path.relative(ROOT, file);
const exists = (relPath) => fs.existsSync(abs(relPath));

function read(relPath) {
    try { return fs.readFileSync(abs(relPath), 'utf8'); } catch { return ''; }
}

function walk(relDir, extensions) {
    const out = [];
    const start = abs(relDir);
    if (!fs.existsSync(start)) return out;
    const stack = [start];
    while (stack.length) {
        const dir = stack.pop();
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
                stack.push(full);
            } else if (!extensions || extensions.some((e) => entry.name.endsWith(e))) {
                out.push(rel(full));
            }
        }
    }
    return out.sort();
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** Balanced `{...}` block starting at the first brace at or after `from`. */
function balancedBlock(text, from) {
    const open = text.indexOf('{', from);
    if (open === -1) return null;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) {
            return { start: open, end: i, body: text.slice(open + 1, i) };
        }
    }
    return null;
}

/** The full text of the JSX opening tag beginning at `from` (a `<`). */
function openingTag(text, from) {
    let depth = 0;
    for (let i = from; i < text.length && i < from + 4000; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        else if (text[i] === '>' && depth === 0) return text.slice(from, i + 1);
    }
    return text.slice(from, from + 400);
}

/* --------------------------------------------------------------- findings */

const findings = [];
const notMeasured = [];

function report(lane, id, severity, message, hits, fix) {
    findings.push({ lane, id, severity, message, hits: hits || [], fix: fix || '' });
}

function scan(files, regex, onMatch) {
    const hits = [];
    for (const file of files) {
        const text = read(file);
        if (!text) continue;
        const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
        let m;
        while ((m = re.exec(text)) !== null) {
            const hit = onMatch
                ? onMatch({ file, text, match: m, index: m.index })
                : { file, line: lineOf(text, m.index), snippet: m[0].trim().slice(0, 90) };
            if (hit) hits.push(hit);
        }
    }
    return hits;
}

/* ------------------------------------------------------------ file groups */

const COMPONENTS = walk('src/components', ['.jsx']);
/* PrintSheet is paper-only and aria-hidden by design — mobile and a11y rules do
   not apply to it. See "The printed sheet" in CLAUDE.md. */
const SCREEN_COMPONENTS = COMPONENTS.filter((f) => !f.endsWith('PrintSheet.jsx'));
const APP_FILES = ['src/App.jsx', ...COMPONENTS].filter(exists);
const SCREEN_FILES = ['src/App.jsx', ...SCREEN_COMPONENTS].filter(exists);
const SRC_JS = walk('src', ['.js', '.jsx']);
const MODULES = walk('src/modules', ['.js']);
const SERVER_JS = ['server.js', ...walk('server', ['.js'])].filter(exists);
const ROUTES = walk('server/routes', ['.js']);
const MIGRATIONS = walk('migrations', ['.sql']);
const TEST_FILES = walk('tests', ['.js']);

/* Deliberate by design — see CLAUDE.md. Never report these as duplication. */
const DELIBERATE_MIRRORS = [
    ['server/player-rename.js', 'src/modules/player-rename.js'],
];

/* ================================================================ LANE: ui */

function laneUi() {
    const hits = scan(APP_FILES, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\brgba?\(/);
    if (hits.length) {
        report('ui', 'raw-color', 'WARN',
            `${hits.length} literal color value(s) in components, bypassing the HSL theme tokens in src/index.css`,
            hits,
            'Replace with a token (bg-card, text-muted-foreground, hsl(var(--warning))…) or add a token if none fits. Literals do not follow the light/dark switch.');
    }

    const native = scan(SRC_JS, /\b(?:window\.)?(alert|confirm|prompt)\s*\(/, ({ file, text, match, index }) => {
        if (/\.(test|spec)\./.test(file)) return null;
        const before = text.slice(Math.max(0, index - 30), index);
        if (/[.\w]$/.test(before.trim())) return null; // e.g. AlertDialog, .confirm chained
        return { file, line: lineOf(text, index), snippet: match[0].trim() };
    });
    if (native.length) {
        report('ui', 'native-dialog', 'WARN',
            `${native.length} native alert/confirm/prompt call(s)`, native,
            'Use the AlertDialog primitive or a sonner toast. Native dialogs block the thread, ignore the theme, and are unstyleable on mobile Safari.');
    }

    const silent = [];
    for (const file of APP_FILES) {
        const text = read(file);
        let i = 0;
        while ((i = text.indexOf('catch', i)) !== -1) {
            const block = balancedBlock(text, i);
            i += 5;
            if (!block || block.start - i > 40) continue;
            const body = block.body;
            if (/toast|setError|setStatus|throw|notify|showError/.test(body)) continue;
            if (body.trim() === '' || /^[\s\S]{0,200}$/.test(body) && !/[a-z]/i.test(body.replace(/console\.[a-z]+\([^)]*\);?/g, ''))) {
                silent.push({ file, line: lineOf(text, block.start), snippet: body.trim().replace(/\s+/g, ' ').slice(0, 70) || '(empty)' });
            }
        }
    }
    if (silent.length) {
        report('ui', 'silent-catch', 'WARN',
            `${silent.length} catch block(s) that neither tell the user nor rethrow`, silent,
            'A coach on the touchline gets no feedback that the action failed. Add a toast.error, or state why swallowing is right in a comment.');
    }

    const clickable = [];
    for (const file of APP_FILES) {
        const text = read(file);
        const re = /<(div|span|tr|td|li|p)\b/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const tag = openingTag(text, m.index);
            if (!/\bonClick=/.test(tag)) continue;
            if (/\brole=|\bonKeyDown=|\bonKeyUp=|\btabIndex=/.test(tag)) continue;
            clickable.push({ file, line: lineOf(text, m.index), snippet: `<${m[1]} onClick …>` });
        }
    }
    if (clickable.length) {
        report('ui', 'click-without-keyboard', 'WARN',
            `${clickable.length} onClick on a non-interactive element with no keyboard path`, clickable,
            'Add role="button" + tabIndex={0} + onKeyDown (Enter/Space), or use <Button variant="ghost">. Drag rows in LineupSection are the ones that matter most.');
    }

    const iconOnly = [];
    for (const file of APP_FILES) {
        const text = read(file);
        const re = /<Button\b/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const tag = openingTag(text, m.index);
            if (/aria-label=|title=/.test(tag)) continue;
            if (tag.trim().endsWith('/>')) continue;
            const close = text.indexOf('</Button>', m.index);
            if (close === -1 || close - m.index > 1200) continue;
            const inner = text.slice(m.index + tag.length, close).trim();
            const isSingleElement = /^<[A-Za-z][\w.]*[^>]*\/>$/.test(inner) || /^\{\s*<[A-Za-z][\w.]*[^>]*\/>\s*\}$/.test(inner);
            if (isSingleElement) {
                iconOnly.push({ file, line: lineOf(text, m.index), snippet: inner.slice(0, 60) });
            }
        }
    }
    if (iconOnly.length) {
        report('ui', 'icon-button-unlabelled', 'WARN',
            `${iconOnly.length} icon-only Button(s) with no aria-label or title`, iconOnly,
            'Screen readers announce these as "button". Add aria-label; add title too so a hover tooltip explains it on desktop.');
    }
}

/* ============================================================ LANE: mobile */

function laneMobile() {
    const html = read('index.html');
    const viewport = /name="viewport"\s+content="([^"]*)"/.exec(html);
    const translucent = /apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/.test(html);
    if (viewport && !/viewport-fit=cover/.test(viewport[1]) && translucent) {
        report('mobile', 'viewport-fit', 'FAIL',
            'index.html asks for a black-translucent iOS status bar but omits viewport-fit=cover',
            [{ file: 'index.html', line: lineOf(html, viewport.index), snippet: viewport[1] }],
            'Installed on an iPhone the app draws under the status bar and notch without reserving room. Add viewport-fit=cover AND the safe-area padding below — one without the other is worse than neither.');
    }

    const css = read('src/index.css');
    if (!/env\(safe-area-inset/.test(css)) {
        report('mobile', 'safe-area', 'WARN',
            'No env(safe-area-inset-*) anywhere in src/index.css',
            [{ file: 'src/index.css', line: 1, snippet: 'no safe-area padding' }],
            'The PWA is installable (manifest.json) so the header and any bottom-anchored bar sit under the notch and home indicator. Pad body/header with max(1rem, env(safe-area-inset-top)) etc.');
    }

    /* Once index.css clamps every control at the phone breakpoint, a scan of
       JSX class names can no longer answer this question: `h-7` on a Button is
       still there in the source and still says 28px, but min-height wins at
       runtime. Reading class names would report 46 problems that do not exist.
       So when the clamp is present the checks below stand down and point at
       the spec that measures the rendered box instead. */
    const clampedCss = /min-height:\s*44px/.test(css) && /max-width:\s*767px/.test(css);
    const clampSpec = 'tests/e2e/mobile-tap-targets.spec.js';

    const small = [];
    for (const file of SCREEN_FILES) {
        const text = read(file);
        const re = /<(Button|button|a|DropdownMenuTrigger|SelectTrigger)\b/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const tag = openingTag(text, m.index);
            const cls = /className=["'`{]([\s\S]{0,400}?)["'`}]/.exec(tag);
            if (!cls) continue;
            const size = /\bh-([4-8])\b/.exec(cls[1]);
            if (size && !/min-h-\[?4[4-9]/.test(cls[1])) {
                small.push({ file, line: lineOf(text, m.index), snippet: `<${m[1]} … h-${size[1]} (${Number(size[1]) * 4}px)` });
            }
        }
    }
    if (small.length && !clampedCss) {
        report('mobile', 'touch-target', 'WARN',
            `${small.length} tap target(s) under the 44px iOS / 48dp Android minimum`, small,
            'This app is used one-handed, outdoors, at a game. Clamp with min-height at the phone breakpoint rather than editing every call site, so desktop density survives.');
    } else if (small.length) {
        report('mobile', 'touch-target', exists(clampSpec) ? 'OK' : 'PARTIAL',
            `index.css clamps controls to 44px below 767px; ${small.length} call site(s) still declare a smaller height in JSX`,
            small,
            `Not a defect while the clamp holds — but the source reads as 28px where it renders 44px, so trust ${clampSpec} over the class names. ${exists(clampSpec) ? 'That spec exists and measures the rendered box.' : 'That spec is MISSING: nothing is proving the clamp still works.'}`);
    }

    const zoomers = [];
    for (const file of SCREEN_FILES) {
        const text = read(file);
        const re = /<(Input|Textarea|input|textarea|select)\b/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const tag = openingTag(text, m.index);
            const px = /text-\[(\d+)px\]/.exec(tag);
            const tooSmall = /\btext-(xs|sm)\b/.test(tag) || (px && Number(px[1]) < 16);
            if (tooSmall) zoomers.push({ file, line: lineOf(text, m.index), snippet: `<${m[1]} … ${px ? px[0] : /text-(xs|sm)/.exec(tag)[0]}` });
        }
    }
    const clampedFont = /font-size:\s*16px\s*!important/.test(css) && /max-width:\s*767px/.test(css);
    if (zoomers.length && clampedFont) {
        report('mobile', 'ios-input-zoom', exists(clampSpec) ? 'OK' : 'PARTIAL',
            `index.css raises inputs to 16px below 767px; ${zoomers.length} call site(s) still declare text-xs/text-sm`,
            zoomers,
            `Same caveat as the tap targets: the class names no longer describe what renders. ${clampSpec} is what checks it.`);
    } else if (zoomers.length) {
        report('mobile', 'ios-input-zoom', 'WARN',
            `${zoomers.length} text input(s) below 16px font-size`, zoomers,
            'Mobile Safari zooms the whole page when a field under 16px is focused, and does not zoom back out. Use text-base on inputs at the mobile breakpoint.');
    }

    const hoverOnly = scan(SCREEN_FILES, /opacity-0[^"'`]{0,80}group-hover:opacity-100|invisible[^"'`]{0,60}group-hover:visible/);
    if (hoverOnly.length) {
        report('mobile', 'hover-only-affordance', 'WARN',
            `${hoverOnly.length} control(s) revealed only on hover`, hoverOnly,
            'There is no hover on a phone, so these are invisible where the app is actually used. Show them always below sm:, or move them into a long-press / overflow menu.');
    }

    const tables = [];
    for (const file of SCREEN_FILES) {
        const text = read(file);
        if (!/<Table\b|<table\b/.test(text)) continue;
        if (/overflow-x-auto|overflow-auto|overflow-x-scroll/.test(text)) continue;
        const idx = text.search(/<Table\b|<table\b/);
        tables.push({ file, line: lineOf(text, idx), snippet: 'table with no horizontal scroll container' });
    }
    if (tables.length) {
        report('mobile', 'table-overflow', 'WARN',
            `${tables.length} table(s) with no overflow-x container`, tables,
            'A wide table makes the whole page scroll sideways on a phone. Wrap in <div className="overflow-x-auto">, or switch to stacked cards below sm:.');
    }
}

/* ================================================================ LANE: db */

function laneDb() {
    const indexed = new Set();
    const fks = [];
    const badNames = [];

    for (const file of MIGRATIONS) {
        if (!/^migrations\/\d{14}_[\w-]+\.sql$/.test(file)) {
            badNames.push({ file, line: 1, snippet: path.basename(file) });
        }
        const text = read(file);
        const lines = text.split('\n');
        let table = null;
        lines.forEach((line, i) => {
            const create = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"?(\w+)"?/i.exec(line);
            if (create) table = create[1];
            const idx = /CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+CONCURRENTLY)?(?:\s+IF NOT EXISTS)?\s+"?[\w]+"?\s+ON\s+"?(\w+)"?\s*\(\s*"?(\w+)"?/i.exec(line);
            if (idx) indexed.add(`${idx[1]}.${idx[2]}`.toLowerCase());
            const alterUnique = /ALTER TABLE\s+"?(\w+)"?[\s\S]*?UNIQUE\s*\(\s*"?(\w+)"?/i.exec(line);
            if (alterUnique) indexed.add(`${alterUnique[1]}.${alterUnique[2]}`.toLowerCase());
            if (table) {
                const constraint = /^\s*(?:CONSTRAINT\s+\w+\s+)?(?:UNIQUE|PRIMARY KEY)\s*\(\s*"?(\w+)"?/i.exec(line);
                if (constraint) indexed.add(`${table}.${constraint[1]}`.toLowerCase());
                const col = /^\s*"?(\w+)"?\s+[A-Z]/.exec(line);
                if (col && /\b(PRIMARY KEY|UNIQUE)\b/i.test(line)) indexed.add(`${table}.${col[1]}`.toLowerCase());
                const fk = /^\s*"?(\w+)"?\s+\w+[^,]*?REFERENCES\s+"?(\w+)"?/i.exec(line);
                if (fk) {
                    fks.push({
                        table, column: fk[1], target: fk[2],
                        onDelete: /ON DELETE/i.test(line),
                        file, line: i + 1, snippet: line.trim().slice(0, 90),
                    });
                }
            }
            if (/^\s*\)\s*;/.test(line)) table = null;
        });
    }

    if (badNames.length) {
        report('db', 'migration-filename', 'FAIL',
            `${badNames.length} migration(s) not in the 14-digit YYYYMMDDHHMMSS_name.sql form`, badNames,
            'node-pg-migrate reads a 17-digit prefix as a date and 14 as a plain number, so a generated name sorts before every existing migration and the next `npm run migrate` aborts. Rename by hand — see CLAUDE.md.');
    }

    const unindexed = fks.filter((f) => !indexed.has(`${f.table}.${f.column}`.toLowerCase()));
    if (unindexed.length) {
        report('db', 'fk-unindexed', 'WARN',
            `${unindexed.length} foreign key column(s) with no index leading on them`,
            unindexed.map((f) => ({ ...f, snippet: `${f.table}.${f.column} → ${f.target}` })),
            'Every cascade delete and every join on this column is a sequential scan. Add CREATE INDEX in a NEW migration — never edit the baseline.');
    }

    const noOnDelete = fks.filter((f) => !f.onDelete);
    if (noOnDelete.length) {
        report('db', 'fk-no-on-delete', 'WARN',
            `${noOnDelete.length} foreign key(s) with no ON DELETE clause`,
            noOnDelete.map((f) => ({ ...f, snippet: `${f.table}.${f.column} → ${f.target}` })),
            'Defaults to NO ACTION, so deleting the parent fails with a 500 rather than cascading or nulling. Decide which it should be and say so explicitly.');
    }

    const interpolated = scan(SERVER_JS, /\.query\(\s*`[^`]*\$\{/, ({ file, text, index }) => ({
        file, line: lineOf(text, index), snippet: text.slice(index, index + 80).replace(/\s+/g, ' '),
    }));
    if (interpolated.length) {
        report('db', 'sql-interpolation', 'WARN',
            `${interpolated.length} query built with template interpolation — read each one`, interpolated,
            'This repo legitimately interpolates generated column lists and $1,$2… placeholder runs (GAME_COLUMNS, setClauses). That is fine. Interpolating a request VALUE is injection. Only report the ones you have read and confirmed carry a value.');
    }

    const noTx = [];
    for (const file of ROUTES) {
        const text = read(file);
        const re = /router\.(post|put|patch|delete)\s*\(/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const block = balancedBlock(text, m.index);
            if (!block) continue;
            const writes = (block.body.match(/\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/gi) || []).length;
            if (writes >= 2 && !/BEGIN/.test(block.body)) {
                noTx.push({ file, line: lineOf(text, m.index), snippet: `${m[1].toUpperCase()} handler, ${writes} write statements, no BEGIN` });
            }
            re.lastIndex = block.end;
        }
    }
    if (noTx.length) {
        report('db', 'multi-write-no-transaction', 'WARN',
            `${noTx.length} route handler(s) issuing several writes outside a transaction`, noTx,
            'A failure between them leaves the row set half-applied — exactly the class of bug tests/integration/ exists to catch. Wrap in BEGIN/COMMIT on a single checked-out client.');
    }

    const nPlusOne = [];
    for (const file of SERVER_JS) {
        const text = read(file);
        const re = /\b(for\s*\(|\.forEach\(|\bfor await\s*\()/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const window = text.slice(m.index, m.index + 700);
            if (/await\s+[\w.]*\.query\(/.test(window)) {
                nPlusOne.push({ file, line: lineOf(text, m.index), snippet: window.split('\n')[0].trim().slice(0, 70) });
            }
        }
    }
    if (nPlusOne.length) {
        report('db', 'query-in-loop', 'WARN',
            `${nPlusOne.length} awaited query inside a loop`, nPlusOne,
            'One round trip per row. A roster of 18 becomes 18 sequential queries. Collapse into one statement with unnest()/ANY($1), or a single multi-row INSERT.');
    }

    if (!process.env.TEST_DATABASE_URL) {
        notMeasured.push('Schema against a live PostgreSQL — TEST_DATABASE_URL is unset, so `npm run test:db` reports every integration test as skipped. Anything about what the database actually accepts is unverified.');
    }
}

/* ========================================================== LANE: features */

function laneFeatures() {
    const todos = scan([...SRC_JS, ...SERVER_JS], /\/\/\s*(TODO|FIXME|HACK|XXX)\b[^\n]*/);
    if (todos.length) {
        report('features', 'todo', 'INFO', `${todos.length} TODO/FIXME marker(s)`, todos,
            'Each is a decision someone deferred. Read them before proposing new work — one of them may already be the highest-value change.');
    }

    const testText = TEST_FILES.map(read).join('\n');
    const untestedModules = MODULES.filter((m) => {
        const name = path.basename(m, '.js');
        return !new RegExp(`modules/${name}(\\.js)?['"\`]`).test(testText);
    });
    if (untestedModules.length) {
        report('features', 'module-untested', 'WARN',
            `${untestedModules.length} src/modules file(s) imported by no test`,
            untestedModules.map((f) => ({ file: f, line: 1, snippet: path.basename(f) })),
            'src/modules is the framework-free logic the unit suite exists to cover. An untested module is where the next silent regression lands.');
    }

    const serverTests = TEST_FILES.filter((f) => f.startsWith('tests/server') || f.startsWith('tests/integration')).map(read).join('\n');
    const untestedRoutes = ROUTES.filter((r) => {
        const name = path.basename(r, '.js');
        return !new RegExp(`routes/${name}(\\.js)?['"\`]`).test(serverTests);
    });
    if (untestedRoutes.length) {
        report('features', 'route-untested', 'WARN',
            `${untestedRoutes.length} route module(s) with no server or integration test`,
            untestedRoutes.map((f) => ({ file: f, line: 1, snippet: path.basename(f) })),
            'tests/server/ proves the SQL is built; tests/integration/ proves PostgreSQL accepts it. A route wants both.');
    }

    const e2eText = walk('tests/e2e', ['.js']).map(read).join('\n');
    notMeasured.push(`Feature behaviour end to end — this script reads source only. ${walk('tests/e2e', ['.js']).length} Playwright specs exist (${e2eText.length ? 'run `npm run test:e2e` to know whether they pass' : 'none readable'}).`);
}

/* ============================================================== LANE: perf */

function lanePerf() {
    const distAssets = walk('dist/assets', ['.js', '.css']).filter((f) => !f.endsWith('.map'));
    if (!distAssets.length) {
        notMeasured.push('Bundle size — dist/ has no built assets. Run `npm run build` and re-run this audit.');
        return;
    }

    const html = read('dist/index.html');
    const entry = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    const sizes = distAssets.map((f) => {
        const buf = fs.readFileSync(abs(f));
        return { file: f, raw: buf.length, gz: zlib.gzipSync(buf).length, entry: entry.includes('/' + f.replace(/^dist\//, '')) };
    }).sort((a, b) => b.gz - a.gz);

    const initialGz = sizes.filter((s) => s.entry).reduce((n, s) => n + s.gz, 0);
    const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
    report('perf', 'bundle-size', initialGz > 300 * 1024 ? 'WARN' : 'OK',
        `Initial payload ${kb(initialGz)} gzipped across ${sizes.filter((s) => s.entry).length} entry asset(s)`,
        sizes.map((s) => ({ file: s.file, line: 1, snippet: `${kb(s.raw)} raw / ${kb(s.gz)} gz${s.entry ? '  [entry]' : ''}` })),
        'Coaches load this on stadium LTE. Anything not needed to render the roster tab belongs behind a dynamic import.');

    const maps = walk('dist/assets', ['.map']);
    if (maps.length) {
        const total = maps.reduce((n, f) => n + fs.statSync(abs(f)).size, 0);
        report('perf', 'sourcemaps-deployed', 'INFO',
            `${maps.length} source map(s), ${kb(total)}, are in dist/ and therefore served in production`,
            maps.map((f) => ({ file: f, line: 1, snippet: kb(fs.statSync(abs(f)).size) })),
            'Not fetched unless devtools is open, so this is a disclosure and deploy-size question, not a load-time one. vite.config.js sets sourcemap: true — "hidden" keeps them for local debugging without shipping.');
    }

    /* Two ways this codebase defers a heavy dependency: a dynamic import(), or
       loadScript() injecting a <script> for a UMD build out of /vendor/ —
       which is how evaluation-pdf.js keeps pdf-lib off the first paint. */
    const dyn = scan(SRC_JS, /await import\(|[^.\w]import\(\s*['"`]|loadScript\(|createElement\(['"`]script/);
    report('perf', 'deferred-loading', dyn.length ? 'OK' : 'WARN',
        `${dyn.length} deferred load(s) of a heavy dependency in src/`, dyn,
        'pdf-lib, fontkit and the evaluation template are the heavy things; they should load when a coach opens that feature, not on first paint. Check any NEW heavy dependency follows the same pattern.');

    const sw = read('dist/sw.js') || read('public/sw.js');
    const arr = /ASSETS_TO_CACHE\s*=\s*\[([\s\S]*?)\]/.exec(sw);
    if (arr) {
        const listed = [...arr[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
        const missing = listed.filter((p) => p !== '/' && !exists(path.join('dist', p)) && !exists(path.join('public', p)));
        if (missing.length) {
            report('perf', 'precache-drift', 'WARN',
                `${missing.length} precached path(s) that no built file matches`,
                missing.map((p) => ({ file: 'public/sw.js', line: lineOf(sw, sw.indexOf(p)), snippet: p })),
                'The install handler tolerates a 404 per asset, so this fails silently and the app is simply less available offline than it claims.');
        }
    }

    const newestSrc = Math.max(...SRC_JS.map((f) => fs.statSync(abs(f)).mtimeMs));
    const builtAt = exists('dist/index.html') ? fs.statSync(abs('dist/index.html')).mtimeMs : 0;
    if (newestSrc > builtAt) {
        notMeasured.push('dist/ is older than src/ — the bundle numbers above describe a stale build. `npm run build` before quoting them.');
    }
}

/* ============================================================ LANE: polish */

function lanePolish() {
    const big = [...APP_FILES, ...MODULES, ...SERVER_JS]
        .map((f) => ({ file: f, lines: read(f).split('\n').length }))
        .filter((f) => f.lines > 600)
        .sort((a, b) => b.lines - a.lines);
    if (big.length) {
        report('polish', 'large-file', 'INFO',
            `${big.length} file(s) over 600 lines`,
            big.map((f) => ({ file: f.file, line: 1, snippet: `${f.lines} lines` })),
            'Extraction is only worth doing where it removes a real difficulty — a tab that re-renders the whole app, or state two components fight over. Do not split for the line count alone.');
    }

    const logs = scan([...APP_FILES, ...MODULES], /console\.(log|debug|info)\(/);
    if (logs.length) {
        report('polish', 'console-noise', 'INFO', `${logs.length} console.log/debug/info call(s) in shipped client code`, logs,
            'console.error and console.warn are worth keeping. The rest is debugging left behind.');
    }

    for (const [a, b] of DELIBERATE_MIRRORS) {
        if (exists(a) && exists(b)) {
            report('polish', 'deliberate-mirror', 'OK',
                `${a} and ${b} mirror each other on purpose — offline-first needs the same rewrite on both sides`,
                [{ file: a, line: 1, snippet: `mirrors ${b}` }],
                'Do NOT propose deduplicating this. Do check they still agree when either changes.');
        }
    }

    /* public/vendor/ is gitignored and written by scripts/copy-vendor.js on
       postinstall — third-party browser builds served from our own origin. */
    const publicJs = walk('public', ['.js'])
        .filter((f) => f !== 'public/sw.js' && !f.startsWith('public/vendor/'));
    if (publicJs.length) {
        report('polish', 'logic-in-public', 'FAIL',
            `${publicJs.length} JavaScript file(s) in public/ besides sw.js`,
            publicJs.map((f) => ({ file: f, line: 1, snippet: path.basename(f) })),
            'The pre-React app was deleted precisely because two sources of truth had silently diverged. Logic lives in src/modules/; public/ holds static files only.');
    }
}

/* ---------------------------------------------------------------- run/out */

const RUNNERS = { ui: laneUi, mobile: laneMobile, db: laneDb, features: laneFeatures, perf: lanePerf, polish: lanePolish };
for (const lane of lanes) RUNNERS[lane]();

const RANK = { FAIL: 0, WARN: 1, INFO: 2, OK: 3 };
const GLYPH = { FAIL: '🔴', WARN: '🟡', INFO: '⚪', OK: '🟢' };
findings.sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.lane.localeCompare(b.lane));

if (AS_JSON) {
    console.log(JSON.stringify({ root: ROOT, lanes, findings, notMeasured }, null, 2));
} else {
    console.log(`\n⚽ AYSO Roster Pro — polish audit`);
    console.log(`   repo: ${ROOT}`);
    console.log(`   lanes: ${lanes.join(', ')}`);
    const counts = findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] || 0) + 1 }), {});
    console.log(`   ${Object.entries(counts).map(([s, n]) => `${GLYPH[s]} ${n} ${s}`).join('   ') || 'no findings'}\n`);

    let lane = null;
    for (const f of findings) {
        if (f.lane !== lane) { lane = f.lane; console.log(`\n── ${lane.toUpperCase()} ${'─'.repeat(Math.max(0, 60 - lane.length))}`); }
        console.log(`\n${GLYPH[f.severity]} ${f.severity}  [${f.id}]  ${f.message}`);
        const shown = SHOW_ALL ? f.hits : f.hits.slice(0, 8);
        for (const h of shown) console.log(`     ${h.file}:${h.line}  ${h.snippet || ''}`);
        if (f.hits.length > shown.length) console.log(`     … ${f.hits.length - shown.length} more (--all to list)`);
        if (f.fix) console.log(`     ↳ ${f.fix}`);
    }

    console.log(`\n\n── NOT MEASURED ${'─'.repeat(48)}`);
    if (!notMeasured.length) console.log('  (nothing — every lane in this run took its measurement)');
    for (const n of notMeasured) console.log(`  • ${n}`);
    console.log('\nEvery hit above is a heuristic pointing at a line. Open the file and confirm');
    console.log('before reporting it as a finding.\n');
}

if (STRICT && findings.some((f) => f.severity === 'FAIL')) process.exit(1);
