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
 */
export async function generateEvaluationPdf({ players, coachName, assistantCoach, division, gender }) {
    const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
    const black = rgb(0, 0, 0);

    const pdfDoc = await PDFDocument.load(await loadTemplate());

    // fontkit is what allows the custom signature font to be embedded
    pdfDoc.registerFontkit(window.fontkit);

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const signatureFontBytes = await fetch(SIGNATURE_FONT_URL).then(res => res.arrayBuffer());
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
        [coachName, header.coach, helvetica],
        [division, header.division, helvetica],
        [genderAbbrev, header.gender, helvetica],
        [assistantCoach, header.assistant, helvetica],
        [coachName, header.signature, signatureFont],
        [dateStr, header.date, helvetica]
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
            x: layout.nameX, y, font: helvetica, size: layout.fontSize, color: black
        });

        if (player.rating) {
            drawCentered(currentPage, String(player.rating), {
                x: layout.ratingX, y, font: helvetica, size: layout.fontSize, color: black
            });
        }

        if (player.comment) {
            const comment = player.comment.length > layout.maxCommentLength
                ? player.comment.substring(0, layout.maxCommentLength - 3) + '...'
                : player.comment;
            drawCentered(currentPage, comment, {
                x: layout.commentsX, y, font: helvetica, size: layout.commentFontSize, color: black
            });
        }
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `Player_Evaluation_${division}_${gender}_${new Date().getFullYear()}.pdf`;
    link.click();

    URL.revokeObjectURL(url);
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
