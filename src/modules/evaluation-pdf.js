/**
 * AYSO Player Evaluation Form PDF generation.
 *
 * Fills the template at /assets/Player Evaluation Form 2025.pdf with the roster,
 * ratings and comments, then triggers a download.
 *
 * This module owns the pdf-lib interaction and nothing about the UI: it throws
 * on failure and leaves notifications to the caller.
 */

// pdf-lib and fontkit are ~1.2MB combined and only this module needs them, so
// they are fetched on first use rather than at page load.
let pdfLibrariesPromise = null;

// The blank template, kept after the first fetch so repeat exports skip it.
let pdfTemplateCache = null;

const PDF_LIB_URL = '/vendor/pdf-lib.min.js';
const FONTKIT_URL = '/vendor/fontkit.umd.min.js';
const TEMPLATE_URL = '/assets/Player Evaluation Form 2025.pdf';
const SIGNATURE_FONT_URL = '/assets/Autography-DOLnW.otf';

/**
 * The body font, embedded rather than using StandardFonts.Helvetica.
 *
 * The PDF standard fonts are WinAnsi-encoded, and pdf-lib throws on drawText
 * for anything that encoding cannot represent — so one player named Łukasz
 * aborted the whole document and nobody on the team got a form. WinAnsi covers
 * Latin-1 and the CP1252 extras, so accents and curly quotes were fine and
 * Central European, Turkish and every non-Latin name was not.
 *
 * Liberation Sans is metric-compatible with Arial, and so with the Helvetica it
 * replaces, which is why the layout did not have to move. It covers Latin
 * Extended, Greek and Cyrillic.
 */
const BODY_FONT_URL = '/assets/fonts/LiberationSans-Regular.ttf';

/** Layout measured against the 2025 template. PDF origin is bottom-left. */
const LAYOUT = {
    fontSize: 11,
    header: {
        coach: { x: 266, y: 714 },
        division: { x: 443, y: 714 },
        gender: { x: 531, y: 714 },
        assistant: { x: 314, y: 686 },
        signature: { x: 241, y: 81 },
        date: { x: 448, y: 81 }
    },
    players: {
        nameX: 164,
        ratingX: 326,
        commentsX: 460,
        firstY: 390,
        lineHeight: 28.8,
        perPage: 10,
        fontSize: 10,
        commentFontSize: 9,
        maxCommentLength: 50
    }
};

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            existing.addEventListener('load', resolve);
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

/**
 * Loads pdf-lib and fontkit on demand.
 *
 * They are served from our own origin (see scripts/copy-vendor.js) so PDF export
 * keeps working offline once the service worker has cached them.
 *
 * Concurrent calls share one in-flight promise; a failure clears it so a later
 * attempt can retry. `onLoadStart`/`onLoadEnd` fire only around a real load, not
 * when the libraries are already present.
 */
export function loadPdfLibraries({ onLoadStart, onLoadEnd } = {}) {
    if (window.PDFLib && window.fontkit) {
        return Promise.resolve();
    }

    if (!pdfLibrariesPromise) {
        onLoadStart?.();
        pdfLibrariesPromise = Promise.all([loadScript(PDF_LIB_URL), loadScript(FONTKIT_URL)])
            .then(() => {
                if (!window.PDFLib || !window.fontkit) {
                    throw new Error('PDF libraries loaded but did not register globals');
                }
            })
            .catch((error) => {
                // Allow a retry on the next attempt
                pdfLibrariesPromise = null;
                throw error;
            })
            .finally(() => onLoadEnd?.());
    }

    return pdfLibrariesPromise;
}

/**
 * Draws a coordinate grid over a page, for measuring template positions.
 *
 * To use: call this on the first page inside generateEvaluationPdf(), generate a
 * PDF, and read positions off the grid. 50pt spacing, labelled every 100pt.
 *
 * PDF coordinates run from the BOTTOM-LEFT: x increases rightwards, y upwards.
 * US Letter is 612 x 792 points, at 72 points per inch.
 */
export function drawCoordinateGrid(page, width, height) {
    const { rgb } = window.PDFLib;
    const gridColor = rgb(0.7, 0.7, 0.7);
    const labelColor = rgb(1, 0, 0);

    for (let x = 0; x <= width; x += 50) {
        page.drawLine({
            start: { x, y: 0 },
            end: { x, y: height },
            thickness: x % 100 === 0 ? 0.5 : 0.2,
            color: gridColor,
            opacity: 0.5
        });
        if (x % 100 === 0) {
            page.drawText(`${x}`, { x: x + 2, y: height - 20, size: 8, color: labelColor });
        }
    }

    for (let y = 0; y <= height; y += 50) {
        page.drawLine({
            start: { x: 0, y },
            end: { x: width, y },
            thickness: y % 100 === 0 ? 0.5 : 0.2,
            color: gridColor,
            opacity: 0.5
        });
        if (y % 100 === 0) {
            page.drawText(`${y}`, { x: 5, y: y + 2, size: 8, color: labelColor });
        }
    }
}

/** Fetches the blank template, reusing the cached copy when there is one. */
async function loadTemplate() {
    if (pdfTemplateCache) return pdfTemplateCache;

    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) {
        throw new Error(`Failed to load PDF template: ${response.status} ${response.statusText}`);
    }
    pdfTemplateCache = await response.arrayBuffer();
    return pdfTemplateCache;
}

/**
 * Fetches a font file.
 *
 * Cached for the life of the page like the template, so generating several
 * forms in a row does not re-download them. Reports the URL on failure: the two
 * fonts fail the same way otherwise, and one of them is optional-looking while
 * the other carries every name on the form.
 */
const fontCache = new Map();

async function loadFont(url) {
    if (fontCache.has(url)) return fontCache.get(url);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load font ${url}: ${response.status} ${response.statusText}`);
    }

    const bytes = await response.arrayBuffer();
    fontCache.set(url, bytes);
    return bytes;
}

/**
 * Names the font has no glyph for.
 *
 * Liberation Sans covers Latin, Greek and Cyrillic but not CJK or Arabic, and a
 * character it lacks is drawn as an empty box rather than raising anything — so
 * without this the form comes out looking complete with a name missing from it.
 * The form is still produced; the caller says which names did not make it.
 */
function namesTheFontCannotDraw(fontBytes, names) {
    let font;
    try {
        font = window.fontkit.create(new Uint8Array(fontBytes));
    } catch {
        // The check is a courtesy; failing it must not stop the form
        return [];
    }

    return names.filter(name =>
        [...String(name)].some(character =>
            !/\s/.test(character) && !font.hasGlyphForCodePoint(character.codePointAt(0))
        )
    );
}

/** Draws `text` horizontally centred on `x`. */
function drawCentered(page, text, { x, y, font, size, color }) {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: x - textWidth / 2, y, size, font, color });
}

function sortByLastName(players) {
    return [...players].sort((a, b) => {
        const lastNameA = a.name.split(' ').pop().toLowerCase();
        const lastNameB = b.name.split(' ').pop().toLowerCase();
        return lastNameA.localeCompare(lastNameB);
    });
}

/**
 * Builds the evaluation form and downloads it.
 *
 * Requires loadPdfLibraries() to have resolved first. Throws if the template,
 * fonts or PDF generation fail — the caller decides how to report that.
 *
 * Returns `{ undrawableNames }`: names the embedded font has no glyph for, drawn
 * as empty boxes. The form is still produced, since one such name should not
 * cost the rest of the team their forms, but the caller has to say so — a form
 * that looks complete with a name missing is worse than one that reports it.
 */
export async function generateEvaluationPdf({ players, coachName, assistantCoach, division, gender }) {
    await loadPdfLibraries();
    const { PDFDocument, rgb } = window.PDFLib;
    const black = rgb(0, 0, 0);

    const pdfDoc = await PDFDocument.load(await loadTemplate());

    // fontkit is what allows both custom fonts to be embedded
    pdfDoc.registerFontkit(window.fontkit);

    const [bodyFontBytes, signatureFontBytes] = await Promise.all([
        loadFont(BODY_FONT_URL),
        loadFont(SIGNATURE_FONT_URL)
    ]);

    // subset, so only the glyphs actually used are written into the file — the
    // form stays the size it was rather than carrying a whole font
    const bodyFont = await pdfDoc.embedFont(bodyFontBytes, { subset: true });
    const signatureFont = await pdfDoc.embedFont(signatureFontBytes);

    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { fontSize, header, players: layout } = LAYOUT;

    // To measure positions against the template, uncomment:
    // const { width, height } = firstPage.getSize();
    // drawCoordinateGrid(firstPage, width, height);

    const genderAbbrev = gender === 'Boys' ? 'B' : gender === 'Girls' ? 'G' : gender.charAt(0);
    const today = new Date();
    const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

    const headerFields = [
        [coachName, header.coach, bodyFont],
        [division, header.division, bodyFont],
        [genderAbbrev, header.gender, bodyFont],
        [assistantCoach, header.assistant, bodyFont],
        [coachName, header.signature, signatureFont],
        [dateStr, header.date, bodyFont]
    ];

    for (const [text, position, font] of headerFields) {
        drawCentered(firstPage, text, { ...position, font, size: fontSize, color: black });
    }

    // The template has two pages of ten slots each
    const sortedPlayers = sortByLastName(players);
    const maxPlayers = layout.perPage * Math.min(pages.length, 2);

    for (let i = 0; i < sortedPlayers.length && i < maxPlayers; i++) {
        const player = sortedPlayers[i];
        const currentPage = pages[Math.floor(i / layout.perPage)];
        const y = layout.firstY - (i % layout.perPage) * layout.lineHeight;

        const playerName = player.number ? `${player.name} #${player.number}` : player.name;
        drawCentered(currentPage, playerName, {
            x: layout.nameX, y, font: bodyFont, size: layout.fontSize, color: black
        });

        if (player.rating) {
            drawCentered(currentPage, String(player.rating), {
                x: layout.ratingX, y, font: bodyFont, size: layout.fontSize, color: black
            });
        }

        if (player.comment) {
            const comment = player.comment.length > layout.maxCommentLength
                ? player.comment.substring(0, layout.maxCommentLength - 3) + '...'
                : player.comment;
            drawCentered(currentPage, comment, {
                x: layout.commentsX, y, font: bodyFont, size: layout.commentFontSize, color: black
            });
        }
    }

    const undrawable = namesTheFontCannotDraw(
        bodyFontBytes,
        sortedPlayers.slice(0, maxPlayers).map(p => p.name)
    );

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `Player_Evaluation_${division}_${gender}_${new Date().getFullYear()}.pdf`;
    link.click();

    URL.revokeObjectURL(url);

    return { undrawableNames: undrawable };
}

/** Maps a generation failure to something a coach can act on. */
export function describePdfError(error) {
    const message = error?.message ?? '';

    if (message.includes('Failed to load PDF template')) {
        return 'Could not load the template file. Please check your internet connection.';
    }
    if (message.includes('font')) {
        return 'Font loading error. Please refresh the page and try again.';
    }
    if (error?.name === 'TypeError') {
        return 'Invalid data format. Please check player information.';
    }
    return message || 'Unknown error occurred.';
}
