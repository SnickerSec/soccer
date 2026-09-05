/**
 * AYSO Player Evaluation Form PDF generation tests.
 *
 * Tests the evaluation PDF module:
 * - describePdfError error mapping
 * - loadPdfLibraries dynamic script loading and deduplication
 * - drawCoordinateGrid coordinate drawing
 * - generateEvaluationPdf document assembly, font embedding, player sorting,
 *   field formatting, undrawable character detection, and download triggering.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

describe('evaluation-pdf module', () => {
    let mockPage1;
    let mockPage2;
    let mockPages;
    let mockFont;
    let mockPdfDoc;
    let mockPDFLib;
    let mockFontkit;
    let mockCreatedElements;
    let mockBlobParts;
    let mockRevokedUrls;
    let mockClick;
    let mockAppendChild;
    let mockHeadAppendChild;

    beforeEach(() => {
        mockPage1 = {
            getSize: jest.fn().mockReturnValue({ width: 612, height: 792 }),
            drawLine: jest.fn(),
            drawText: jest.fn(),
        };
        mockPage2 = {
            getSize: jest.fn().mockReturnValue({ width: 612, height: 792 }),
            drawLine: jest.fn(),
            drawText: jest.fn(),
        };
        mockPages = [mockPage1, mockPage2];

        mockFont = {
            widthOfTextAtSize: jest.fn((text, size) => (text ? text.length * 6 : 0)),
        };

        mockPdfDoc = {
            getPages: jest.fn().mockReturnValue(mockPages),
            registerFontkit: jest.fn(),
            embedFont: jest.fn().mockResolvedValue(mockFont),
            save: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])), // %PDF
        };

        mockPDFLib = {
            PDFDocument: {
                load: jest.fn().mockResolvedValue(mockPdfDoc),
            },
            rgb: jest.fn((r, g, b) => ({ r, g, b })),
        };

        mockFontkit = {
            create: jest.fn().mockReturnValue({
                hasGlyphForCodePoint: jest.fn((cp) => cp < 0x2000), // Standard Latin/Greek/Cyrillic ok
            }),
        };

        // Window globals
        global.window = global.window || {};
        global.window.PDFLib = mockPDFLib;
        global.window.fontkit = mockFontkit;

        // DOM mocks
        mockCreatedElements = [];
        mockClick = jest.fn();
        mockHeadAppendChild = jest.fn((script) => {
            if (script.onload) {
                setTimeout(script.onload, 0);
            }
        });
        mockAppendChild = jest.fn();

        global.document = {
            querySelector: jest.fn().mockReturnValue(null),
            createElement: jest.fn((tag) => {
                const el = {
                    tagName: tag.toUpperCase(),
                    src: '',
                    href: '',
                    download: '',
                    onload: null,
                    onerror: null,
                    click: mockClick,
                };
                mockCreatedElements.push(el);
                return el;
            }),
            head: {
                appendChild: mockHeadAppendChild,
            },
            body: {
                appendChild: mockAppendChild,
                removeChild: jest.fn(),
            },
        };

        // Blob & URL
        mockBlobParts = [];
        mockRevokedUrls = [];
        global.Blob = class {
            constructor(parts, options) {
                this.parts = parts;
                this.options = options;
                mockBlobParts.push({ parts, options });
            }
        };

        global.URL = {
            createObjectURL: jest.fn(() => 'blob:http://localhost/eval-pdf-123'),
            revokeObjectURL: jest.fn((url) => mockRevokedUrls.push(url)),
        };

        // Fetch mock
        global.fetch = jest.fn((url) => {
            return Promise.resolve({
                ok: true,
                status: 200,
                statusText: 'OK',
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(64)),
            });
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('describePdfError', () => {
        test('maps template load error to network advice', async () => {
            const { describePdfError } = await import('../src/modules/evaluation-pdf.js');
            const err = new Error('Failed to load PDF template: 404 Not Found');
            expect(describePdfError(err)).toBe('Could not load the template file. Please check your internet connection.');
        });

        test('maps font loading error to refresh advice', async () => {
            const { describePdfError } = await import('../src/modules/evaluation-pdf.js');
            const err = new Error('Failed to load font /assets/fonts/LiberationSans-Regular.ttf');
            expect(describePdfError(err)).toBe('Font loading error. Please refresh the page and try again.');
        });

        test('maps TypeError to invalid data format advice', async () => {
            const { describePdfError } = await import('../src/modules/evaluation-pdf.js');
            const err = new TypeError('Cannot read properties of undefined');
            expect(describePdfError(err)).toBe('Invalid data format. Please check player information.');
        });

        test('returns raw error message when unmapped', async () => {
            const { describePdfError } = await import('../src/modules/evaluation-pdf.js');
            const err = new Error('Disk quota exceeded');
            expect(describePdfError(err)).toBe('Disk quota exceeded');
        });

        test('falls back gracefully when error is null or has no message', async () => {
            const { describePdfError } = await import('../src/modules/evaluation-pdf.js');
            expect(describePdfError(null)).toBe('Unknown error occurred.');
            expect(describePdfError({})).toBe('Unknown error occurred.');
        });
    });

    describe('drawCoordinateGrid', () => {
        test('draws vertical and horizontal grid lines with labels', async () => {
            const { drawCoordinateGrid } = await import('../src/modules/evaluation-pdf.js');
            const page = {
                drawLine: jest.fn(),
                drawText: jest.fn(),
            };

            drawCoordinateGrid(page, 200, 200);

            // Step size is 50, so for x in [0, 50, 100, 150, 200] and y in [0, 50, 100, 150, 200]:
            // 5 vertical + 5 horizontal = 10 lines
            expect(page.drawLine).toHaveBeenCalledTimes(10);

            // Labels at 0, 100, 200 for both x and y = 3 + 3 = 6
            expect(page.drawText).toHaveBeenCalledTimes(6);
        });
    });

    describe('loadPdfLibraries', () => {
        test('resolves immediately if window.PDFLib and window.fontkit exist', async () => {
            const { loadPdfLibraries } = await import('../src/modules/evaluation-pdf.js');
            const onLoadStart = jest.fn();
            const onLoadEnd = jest.fn();

            await expect(loadPdfLibraries({ onLoadStart, onLoadEnd })).resolves.toBeUndefined();
            expect(onLoadStart).not.toHaveBeenCalled();
            expect(onLoadEnd).not.toHaveBeenCalled();
            expect(document.createElement).not.toHaveBeenCalled();
        });

        test('loads scripts and triggers callbacks when libraries are missing', async () => {
            delete global.window.PDFLib;
            delete global.window.fontkit;

            // Reset module cache so promise is fresh
            jest.resetModules();
            const { loadPdfLibraries } = await import('../src/modules/evaluation-pdf.js');

            const onLoadStart = jest.fn();
            const onLoadEnd = jest.fn();

            // When script is created, simulate it attaching globals
            global.document.head.appendChild = jest.fn((script) => {
                global.window.PDFLib = mockPDFLib;
                global.window.fontkit = mockFontkit;
                if (script.onload) script.onload();
            });

            await loadPdfLibraries({ onLoadStart, onLoadEnd });

            expect(onLoadStart).toHaveBeenCalled();
            expect(onLoadEnd).toHaveBeenCalled();
            expect(document.head.appendChild).toHaveBeenCalledTimes(2);
        });
    });

    describe('generateEvaluationPdf', () => {
        test('builds evaluation PDF with sorted players and triggers download', async () => {
            const { generateEvaluationPdf } = await import('../src/modules/evaluation-pdf.js');

            const players = [
                { name: 'Sam Taylor', number: 9, rating: 5, comment: 'Great striker' },
                { name: 'Alex Adams', number: 1, rating: 4, comment: 'Solid keeper' },
                { name: 'Jordan Baker', number: 10, rating: 5, comment: 'Excellent playmaker' },
            ];

            const result = await generateEvaluationPdf({
                players,
                coachName: 'Coach Smith',
                assistantCoach: 'Asst Johnson',
                division: '10U',
                gender: 'Boys',
            });

            // Fetched template and two custom fonts
            expect(global.fetch).toHaveBeenCalledWith('/assets/Player Evaluation Form 2025.pdf');
            expect(global.fetch).toHaveBeenCalledWith('/assets/fonts/LiberationSans-Regular.ttf');
            expect(global.fetch).toHaveBeenCalledWith('/assets/Autography-DOLnW.otf');

            // Embedded fonts with subsetting on body font
            expect(mockPdfDoc.registerFontkit).toHaveBeenCalledWith(mockFontkit);
            expect(mockPdfDoc.embedFont).toHaveBeenCalledWith(expect.any(ArrayBuffer), { subset: true });
            expect(mockPdfDoc.embedFont).toHaveBeenCalledWith(expect.any(ArrayBuffer));

            // Checked header drawing on first page (coach, division, gender 'B', assistant, signature, date)
            const drawnTextsPage1 = mockPage1.drawText.mock.calls.map((c) => c[0]);
            expect(drawnTextsPage1).toContain('Coach Smith');
            expect(drawnTextsPage1).toContain('10U');
            expect(drawnTextsPage1).toContain('B');
            expect(drawnTextsPage1).toContain('Asst Johnson');

            // Sorted by last name: Adams (Alex Adams #1) -> Baker (Jordan Baker #10) -> Taylor (Sam Taylor #9)
            const playerIndexAdams = drawnTextsPage1.indexOf('Alex Adams #1');
            const playerIndexBaker = drawnTextsPage1.indexOf('Jordan Baker #10');
            const playerIndexTaylor = drawnTextsPage1.indexOf('Sam Taylor #9');

            expect(playerIndexAdams).toBeGreaterThanOrEqual(0);
            expect(playerIndexBaker).toBeGreaterThan(playerIndexAdams);
            expect(playerIndexTaylor).toBeGreaterThan(playerIndexBaker);

            // Triggered download
            expect(global.URL.createObjectURL).toHaveBeenCalled();
            expect(mockClick).toHaveBeenCalled();
            expect(mockRevokedUrls).toContain('blob:http://localhost/eval-pdf-123');

            // No undrawable names
            expect(result.undrawableNames).toEqual([]);
        });

        test('abbreviates gender correctly for Girls and custom strings', async () => {
            const { generateEvaluationPdf } = await import('../src/modules/evaluation-pdf.js');

            await generateEvaluationPdf({
                players: [{ name: 'Mia Smith', number: 10 }],
                coachName: 'Coach Anna',
                assistantCoach: '',
                division: '12U',
                gender: 'Girls',
            });

            const drawnTexts = mockPage1.drawText.mock.calls.map((c) => c[0]);
            expect(drawnTexts).toContain('G');
        });

        test('truncates long comments exceeding 50 characters', async () => {
            const { generateEvaluationPdf } = await import('../src/modules/evaluation-pdf.js');

            const longComment = 'This player showed exceptional endurance, dribbling capability, and sportsmanship all season long';
            await generateEvaluationPdf({
                players: [{ name: 'Casey Stone', comment: longComment }],
                coachName: 'Coach Alex',
                assistantCoach: '',
                division: '10U',
                gender: 'Coed',
            });

            const drawnTexts = mockPage1.drawText.mock.calls.map((c) => c[0]);
            const truncated = longComment.substring(0, 47) + '...';
            expect(drawnTexts).toContain(truncated);
        });

        test('identifies undrawable names when font has no glyphs for them', async () => {
            const { generateEvaluationPdf } = await import('../src/modules/evaluation-pdf.js');

            // Fontkit mock returns false for code point >= 0x4E00 (CJK ideographs)
            mockFontkit.create.mockReturnValue({
                hasGlyphForCodePoint: jest.fn((cp) => cp < 0x4e00),
            });

            const result = await generateEvaluationPdf({
                players: [
                    { name: 'John Smith', number: 5 },
                    { name: '李明', number: 8 }, // Li Ming with CJK characters
                ],
                coachName: 'Coach John',
                assistantCoach: '',
                division: '10U',
                gender: 'Boys',
            });

            expect(result.undrawableNames).toEqual(['李明']);
        });

        test('throws descriptive error if template fetch fails', async () => {
            // Force fetch to reject or return 404 for template
            jest.resetModules();
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            const { generateEvaluationPdf } = await import('../src/modules/evaluation-pdf.js');

            await expect(
                generateEvaluationPdf({
                    players: [],
                    coachName: 'Coach',
                    assistantCoach: '',
                    division: '10U',
                    gender: 'Boys',
                })
            ).rejects.toThrow('Failed to load PDF template: 404 Not Found');
        });
    });
});
