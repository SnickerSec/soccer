/**
 * Match Card PDF Generator tests.
 *
 * Tests the AYSO match card generation including quarter matrix positioning,
 * goalkeeper identification, captain indicators, fair play section, and PDF download triggering.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

describe('generateMatchCardPdf', () => {
    let mockPage;
    let mockPdfDoc;
    let mockPDFLib;
    let mockAppendChild;
    let mockRemoveChild;
    let mockClick;
    let createdElements;
    let blobConstructed;
    let revokedUrls;

    beforeEach(() => {
        mockPage = {
            drawRectangle: jest.fn(),
            drawText: jest.fn(),
            drawLine: jest.fn(),
        };

        mockPdfDoc = {
            addPage: jest.fn().mockReturnValue(mockPage),
            embedFont: jest.fn().mockResolvedValue('mock-font'),
            save: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        };

        mockPDFLib = {
            PDFDocument: {
                create: jest.fn().mockResolvedValue(mockPdfDoc),
            },
            rgb: jest.fn((r, g, b) => ({ r, g, b })),
            StandardFonts: {
                Helvetica: 'Helvetica',
                HelveticaBold: 'Helvetica-Bold',
            },
        };

        // Mock window.PDFLib
        global.window = global.window || {};
        global.window.PDFLib = mockPDFLib;

        // Mock Blob and URL
        blobConstructed = [];
        global.Blob = class {
            constructor(parts, options) {
                this.parts = parts;
                this.options = options;
                blobConstructed.push(this);
            }
        };

        revokedUrls = [];
        global.URL = {
            createObjectURL: jest.fn(() => 'blob:https://mock-url/match-card-123'),
            revokeObjectURL: jest.fn((url) => revokedUrls.push(url)),
        };

        // Mock DOM document and anchor element
        createdElements = [];
        mockClick = jest.fn();
        mockAppendChild = jest.fn();
        mockRemoveChild = jest.fn();

        global.document = {
            createElement: jest.fn((tag) => {
                const el = {
                    tagName: tag.toUpperCase(),
                    href: '',
                    download: '',
                    click: mockClick,
                };
                createdElements.push(el);
                return el;
            }),
            body: {
                appendChild: mockAppendChild,
                removeChild: mockRemoveChild,
            },
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('generates a letter-sized PDF document with header and match details', async () => {
        // Mock loadPdfLibraries
        jest.unstable_mockModule('../src/modules/evaluation-pdf.js', () => ({
            loadPdfLibraries: jest.fn().mockResolvedValue(),
        }));

        const { generateMatchCardPdf } = await import('../src/modules/match-card-pdf.js');

        await generateMatchCardPdf({
            lineup: {
                formation: '3-3-2',
                quarters: [],
            },
            players: [],
            teamName: 'Strikers FC',
            opponentName: 'Tornadoes',
            ageDivision: '12U',
            coachName: 'Coach Dave',
            field: 'Field 4',
            date: '10/24/2026',
        });

        expect(mockPDFLib.PDFDocument.create).toHaveBeenCalledTimes(1);
        expect(mockPdfDoc.addPage).toHaveBeenCalledWith([612, 792]);
        expect(mockPdfDoc.embedFont).toHaveBeenCalledWith('Helvetica');
        expect(mockPdfDoc.embedFont).toHaveBeenCalledWith('Helvetica-Bold');

        // Check header text
        const textCalls = mockPage.drawText.mock.calls;
        const textStrings = textCalls.map(([txt]) => txt);

        expect(textStrings).toContain('AYSO OFFICIAL MATCH LINEUP CARD');
        expect(textStrings).toContain('EVERYONE PLAYS® • SAFE, FAIR, FUN');
        expect(textStrings).toContain('Division: 12U');
        expect(textStrings).toContain('Strikers FC');
        expect(textStrings).toContain('Tornadoes');
        expect(textStrings).toContain('Coach Dave');
        expect(textStrings).toContain('Field 4');
        expect(textStrings).toContain('3-3-2');
    });

    test('renders quarter positions, identifies keepers, marks captains, and calculates play counts', async () => {
        const { generateMatchCardPdf } = await import('../src/modules/match-card-pdf.js');

        const testPlayers = [
            { name: 'Alex M', number: 10 },
            { name: 'Sam J', number: 7 },
        ];

        const testLineup = {
            formation: '2-3-1',
            quarters: [
                {
                    positions: {
                        Keeper: 'Alex M',
                        LeftBack: 'Sam J',
                    },
                },
                {
                    positions: {
                        Keeper: 'Sam J',
                        Forward: 'Alex M',
                    },
                },
                {
                    positions: {
                        LeftMid: 'Alex M',
                        // Sam sits Q3
                    },
                },
                {
                    positions: {
                        // Alex sits Q4
                        RightBack: 'Sam J',
                    },
                },
            ],
        };

        await generateMatchCardPdf({
            lineup: testLineup,
            players: testPlayers,
            captains: ['Alex M'],
            teamName: 'Hawks',
        });

        const textCalls = mockPage.drawText.mock.calls;
        const textStrings = textCalls.map(([txt]) => txt);

        // Captain badge
        expect(textStrings).toContain('[CAPT]');

        // Keeper indicator
        expect(textStrings).toContain('GK [K]');

        // Bench indicator
        expect(textStrings).toContain('Rest');

        // Total played counts: Alex played Q1, Q2, Q3 (3/4); Sam played Q1, Q2, Q4 (3/4)
        expect(textStrings).toContain('3 / 4');

        // Jersey numbers
        expect(textStrings).toContain('10');
        expect(textStrings).toContain('7');
    });

    test('draws fair play compliance seal and referee sign-off section', async () => {
        const { generateMatchCardPdf } = await import('../src/modules/match-card-pdf.js');

        await generateMatchCardPdf({
            lineup: { formation: '3-3', quarters: [] },
            players: [{ name: 'Player 1', number: 1 }],
            teamName: 'Blue Waves',
            opponentName: 'Red Dragons',
        });

        const textCalls = mockPage.drawText.mock.calls;
        const textStrings = textCalls.map(([txt]) => txt);

        // Fair play compliance
        expect(textStrings).toContain('AYSO FAIR PLAY COMPLIANCE VERIFICATION');

        // Referee section
        expect(textStrings).toContain('OFFICIAL REFEREE MATCH REPORT');
        expect(textStrings).toContain('FINAL SCORE:');
        expect(textStrings).toContain('Blue Waves: _____');
        expect(textStrings).toContain('Red Dragons: _____');
        expect(textStrings).toContain('Center Referee Signature:');
        expect(textStrings).toContain('Coach Signature:');
    });

    test('triggers automatic download with sanitized filename and cleans up created URL', async () => {
        const { generateMatchCardPdf } = await import('../src/modules/match-card-pdf.js');

        await generateMatchCardPdf({
            lineup: { formation: '3-3', quarters: [] },
            players: [{ name: 'Player 1', number: 1 }],
            teamName: 'Blue Lightning #10!',
        });

        expect(mockPdfDoc.save).toHaveBeenCalledTimes(1);
        expect(blobConstructed.length).toBe(1);
        expect(blobConstructed[0].options).toEqual({ type: 'application/pdf' });

        expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(mockAppendChild).toHaveBeenCalledTimes(1);
        expect(mockClick).toHaveBeenCalledTimes(1);
        expect(mockRemoveChild).toHaveBeenCalledTimes(1);
        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://mock-url/match-card-123');

        const linkEl = createdElements[0];
        expect(linkEl.download).toBe('Blue_Lightning__10__Match_Card.pdf');
    });
});
