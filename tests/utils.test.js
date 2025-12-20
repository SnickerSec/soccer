// Tests for utility functions
import {
    escapeHtml,
    shuffleArray,
    shuffleWithinSimilarGroups,
    deepClone
} from '../public/modules/utils.js';

describe('escapeHtml', () => {
    test('should escape < and >', () => {
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    test('should escape &', () => {
        expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    test('should handle normal strings', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    test('should handle empty string', () => {
        expect(escapeHtml('')).toBe('');
    });
});

describe('shuffleArray', () => {
    test('should maintain array length', () => {
        const arr = [1, 2, 3, 4, 5];
        shuffleArray(arr);
        expect(arr).toHaveLength(5);
    });

    test('should contain all original elements', () => {
        const arr = [1, 2, 3, 4, 5];
        shuffleArray(arr);
        expect(arr).toContain(1);
        expect(arr).toContain(2);
        expect(arr).toContain(3);
        expect(arr).toContain(4);
        expect(arr).toContain(5);
    });

    test('should handle empty array', () => {
        const arr = [];
        shuffleArray(arr);
        expect(arr).toHaveLength(0);
    });

    test('should handle single element', () => {
        const arr = [1];
        shuffleArray(arr);
        expect(arr).toEqual([1]);
    });
});

describe('deepClone', () => {
    test('should create a copy', () => {
        const obj = { a: 1, b: 2 };
        const clone = deepClone(obj);
        expect(clone).toEqual(obj);
    });

    test('should not be same reference', () => {
        const obj = { a: 1 };
        const clone = deepClone(obj);
        obj.a = 2;
        expect(clone.a).toBe(1);
    });

    test('should handle nested objects', () => {
        const obj = { a: { b: { c: 1 } } };
        const clone = deepClone(obj);
        expect(clone.a.b.c).toBe(1);
    });

    test('should handle arrays', () => {
        const arr = [1, [2, 3], { a: 4 }];
        const clone = deepClone(arr);
        expect(clone).toEqual(arr);
    });
});

describe('shuffleWithinSimilarGroups', () => {
    test('should maintain array length', () => {
        const arr = [
            { name: 'a', value: 1 },
            { name: 'b', value: 1 },
            { name: 'c', value: 2 }
        ];
        shuffleWithinSimilarGroups(arr, x => x.value);
        expect(arr).toHaveLength(3);
    });

    test('should keep groups together by value', () => {
        const arr = [
            { name: 'a', value: 1 },
            { name: 'b', value: 1 },
            { name: 'c', value: 2 },
            { name: 'd', value: 2 }
        ];
        shuffleWithinSimilarGroups(arr, x => x.value);

        // First two should have value 1, last two should have value 2
        expect(arr[0].value).toBe(1);
        expect(arr[1].value).toBe(1);
        expect(arr[2].value).toBe(2);
        expect(arr[3].value).toBe(2);
    });

    test('should handle single element', () => {
        const arr = [{ name: 'a', value: 1 }];
        shuffleWithinSimilarGroups(arr, x => x.value);
        expect(arr).toHaveLength(1);
    });

    test('should handle empty array', () => {
        const arr = [];
        shuffleWithinSimilarGroups(arr, x => x.value);
        expect(arr).toHaveLength(0);
    });
});
