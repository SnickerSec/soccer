/**
 * The font embedded in the Player Evaluation PDF.
 *
 * The form used to draw its text with StandardFonts.Helvetica, and pdf-lib
 * throws on drawText for anything WinAnsi cannot encode — so one player named
 * Łukasz aborted the whole document and nobody on the team got a form.
 *
 * What replaced it has to keep covering the alphabets a roster actually
 * contains, which is what this checks. A font swapped for a smaller one, or a
 * path that stops matching the module, fails here rather than on a coach's
 * screen at the end of the season.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fontkit from '@pdf-lib/fontkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

/** The URL the module fetches, read out of the source. */
function bodyFontUrl() {
    const source = fs.readFileSync(
        path.join(projectRoot, 'src', 'modules', 'evaluation-pdf.js'), 'utf8');
    const match = source.match(/const BODY_FONT_URL = '([^']+)'/);
    expect(match).not.toBeNull();
    return match[1];
}

let font;

beforeAll(() => {
    const url = bodyFontUrl();
    const file = path.join(projectRoot, 'public', url.replace(/^\//, ''));
    font = fontkit.create(fs.readFileSync(file));
});

const covers = (text) =>
    [...text].every(ch => font.hasGlyphForCodePoint(ch.codePointAt(0)));

describe('the body font file', () => {
    test('exists where the module looks for it', () => {
        const file = path.join(projectRoot, 'public', bodyFontUrl().replace(/^\//, ''));
        expect(fs.existsSync(file)).toBe(true);
    });

    test('is served from a path the service worker caches as immutable', () => {
        // sw.js: IMMUTABLE_PATHS. Otherwise it is re-fetched on every form.
        expect(bodyFontUrl().startsWith('/assets/')).toBe(true);
    });

    test('ships its licence alongside it', () => {
        // SIL OFL 1.1 requires the licence travel with the font
        const dir = path.dirname(path.join(projectRoot, 'public', bodyFontUrl().replace(/^\//, '')));
        const licences = fs.readdirSync(dir).filter(name => /licen[cs]e/i.test(name));
        expect(licences.length).toBeGreaterThan(0);
    });

    test('parses as a font', () => {
        expect(font.numGlyphs).toBeGreaterThan(0);
    });
});

describe('coverage', () => {
    test.each([
        ['plain ASCII', 'The quick brown fox 0123456789'],
        ['Latin-1 accents', 'Núñez Müller Renée Þórsdóttir'],
        ['the punctuation a phone types', '’‘“”–—'],
        ['Polish', 'Łukasz Wiśniewski Kaczyński'],
        ['Czech and Slovak', 'Čech Dvořák Škoda Žižka'],
        ['Hungarian', 'Gőz Fűzfa Örkény'],
        ['Romanian', 'Ștefan Țăran Ăsta'],
        ['Turkish', 'İstanbul Gökçe Şahin'],
        ['Baltic', 'Kęstutis Jānis Ūla'],
        ['Cyrillic', 'Анна Иванова Šešelj'],
        ['Greek', 'Παπαδόπουλος'],
        ['Hebrew', 'שלום']
    ])('covers %s', (_label, text) => {
        expect(covers(text)).toBe(true);
    });

    test('covers every character in the demo roster', () => {
        const source = fs.readFileSync(path.join(projectRoot, 'src', 'App.jsx'), 'utf8');
        const names = source.match(/const demoNames = \[([\s\S]*?)\]/)[1];
        expect(covers(names.replace(/[\s',]/g, ''))).toBe(true);
    });
});

describe('what it does not cover', () => {
    /**
     * Recorded rather than lamented. A name outside this font draws as an empty
     * box, so generateEvaluationPdf checks for exactly this and reports the
     * names it could not print instead of handing over a form that looks
     * finished. If a future font does cover these, that reporting stops firing
     * for them, which is a change worth noticing here.
     */
    test.each([
        ['CJK', '田中'],
        ['Arabic', 'محمد'],
        ['Devanagari', 'नमस्ते']
    ])('%s is outside it', (_label, text) => {
        expect(covers(text)).toBe(false);
    });
});
