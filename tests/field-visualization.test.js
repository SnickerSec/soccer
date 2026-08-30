/**
 * SVG pitch diagram generation for quarter lineups.
 *
 * Covers initial extraction, coordinate mapping, and DOM SVG assembly.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
    getPlayerInitials,
    createFieldVisualization
} from '../src/modules/field-visualization.js';

describe('getPlayerInitials', () => {
    test('extracts first and last initial for two-part names', () => {
        expect(getPlayerInitials('Alex Kim')).toBe('AK');
        expect(getPlayerInitials('Ben Ortiz')).toBe('BO');
    });

    test('extracts first and last initial for multi-part names', () => {
        expect(getPlayerInitials('Mary Jane Watson')).toBe('MW');
    });

    test('uses first two letters capitalized for single-word names', () => {
        expect(getPlayerInitials('Alex')).toBe('AL');
        expect(getPlayerInitials('sam')).toBe('SA');
    });

    test('handles single character names', () => {
        expect(getPlayerInitials('A')).toBe('A');
    });
});

describe('createFieldVisualization', () => {
    const originalDocument = globalThis.document;

    // Lightweight mock DOM node for document / documentNS elements
    class MockElement {
        constructor(tag, isSvg = false) {
            this.tagName = tag;
            this.isSvg = isSvg;
            this.attributes = {};
            this.children = [];
            this.className = '';
            this.textContent = '';
        }

        setAttribute(key, value) {
            this.attributes[key] = String(value);
            if (key === 'class') this.className = String(value);
        }

        getAttribute(key) {
            return this.attributes[key] || null;
        }

        appendChild(child) {
            this.children.push(child);
            return child;
        }
    }

    beforeEach(() => {
        globalThis.document = {
            createElement: (tag) => new MockElement(tag, false),
            createElementNS: (_ns, tag) => new MockElement(tag, true),
            createTextNode: (text) => ({ textContent: text })
        };
    });

    afterEach(() => {
        globalThis.document = originalDocument;
    });

    test('builds a field container with accessible role and aria-label', () => {
        const quarter = {
            quarter: 1,
            positions: {
                Keeper: 'Alex Kim',
                'Left Back': 'Ben Ortiz'
            }
        };
        const positionOrder = ['Keeper', 'Left Back'];
        const players = [
            { name: 'Alex Kim', number: '1' },
            { name: 'Ben Ortiz', number: '' }
        ];

        const container = createFieldVisualization(quarter, positionOrder, players);

        expect(container.className).toBe('field-container');
        expect(container.getAttribute('role')).toBe('img');
        expect(container.getAttribute('aria-label')).toMatch(/Quarter 1/);

        // Container should contain the SVG field and the legend
        expect(container.children).toHaveLength(2);
        const svg = container.children[0];
        const legend = container.children[1];

        expect(svg.getAttribute('viewBox')).toBe('0 0 400 600');
        expect(legend.className).toBe('field-legend');
    });

    test('renders player markers with numbers when present and initials when absent', () => {
        const quarter = {
            quarter: 2,
            positions: {
                Keeper: 'Alex Kim',
                'Left Back': 'Ben Ortiz',
                Striker: 'Cleo Davis'
            }
        };
        const positionOrder = ['Keeper', 'Left Back', 'Striker'];
        const players = [
            { name: 'Alex Kim', number: '7' },
            { name: 'Ben Ortiz' },
            { name: 'Cleo Davis', number: '10' }
        ];

        const container = createFieldVisualization(quarter, positionOrder, players);
        const svg = container.children[0];

        // Marker groups in SVG
        const markers = svg.children.filter(c => c.className === 'player-marker');
        expect(markers).toHaveLength(3);

        // First marker (Keeper - numbered 7, yellow fill)
        const keeperCircle = markers[0].children[0];
        const keeperText = markers[0].children[1];
        expect(keeperCircle.getAttribute('fill')).toBe('#ffcc00');
        expect(keeperText.textContent).toBe('7');

        // Second marker (Left Back - unnumbered initials BO, blue fill)
        const defCircle = markers[1].children[0];
        const defText = markers[1].children[1];
        expect(defCircle.getAttribute('fill')).toBe('#3498db');
        expect(defText.textContent).toBe('BO');

        // Third marker (Striker - numbered 10, red fill)
        const fwdCircle = markers[2].children[0];
        const fwdText = markers[2].children[1];
        expect(fwdCircle.getAttribute('fill')).toBe('#e74c3c');
        expect(fwdText.textContent).toBe('10');
    });
});
