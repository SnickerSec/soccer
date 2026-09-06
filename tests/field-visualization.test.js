/**
 * Marker labelling for the pitch diagram.
 *
 * The diagram is rendered by src/components/FieldVisualization.jsx and covered
 * by tests/e2e/field-visualization.spec.js, which is also where the marker
 * contrast is asserted. What is left here is the initials fallback.
 */

import { describe, test, expect } from '@jest/globals';
import { getPlayerInitials } from '../src/modules/field-visualization.js';

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
