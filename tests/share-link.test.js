/**
 * Packing a lineup into a URL.
 *
 * The share link used to be btoa(JSON.stringify(data)), which throws on any
 * code point above U+00FF — and the throw escaped uncaught out of the click
 * handler, so Share did nothing at all and said nothing about why. An iPhone
 * types U+2019 for the apostrophe in "D'Angelo" by default, so this was
 * reachable by typing a name normally.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import {
    encodeShareData, decodeShareData, buildShareUrl
} from '../public/modules/share-link.js';

// btoa/atob exist in browsers and in Node 16+, but not in every environment
// this suite might run in.
beforeAll(() => {
    if (typeof globalThis.btoa !== 'function') {
        globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
        globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
    }
});

const roster = (...names) => ({
    players: names.map(name => ({ name })),
    lineup: [{ quarter: 1, positions: { Keeper: names[0] } }],
    settings: { ageDivision: '10U', playersOnField: 7, formation: '2-3-1' }
});

const roundTrip = (data) => decodeShareData(encodeShareData(data));

describe('encode and decode', () => {
    test('an ordinary roster survives', () => {
        const data = roster('Ana', 'Ben', 'Cleo');
        expect(roundTrip(data)).toEqual(data);
    });

    test('a curly apostrophe survives — what a phone types for D’Angelo', () => {
        const data = roster('D’Angelo');
        expect(roundTrip(data).players[0].name).toBe('D’Angelo');
    });

    test.each([
        ['straight apostrophe', "O'Brien"],
        ['Latin-1 accents', 'Núñez'],
        ['beyond Latin-1', 'Łukasz Ștefan Gőz'],
        ['non-Latin script', '田中 さくら'],
        ['Cyrillic', 'Анна Иванова'],
        ['emoji', 'Sam 🐐']
    ])('%s survives', (_label, name) => {
        expect(roundTrip(roster(name)).players[0].name).toBe(name);
    });

    test('a large roster does not blow the stack', () => {
        const names = Array.from({ length: 100 }, (_, i) => `Player Number ${i} ünïcødé`);
        expect(roundTrip(roster(...names)).players).toHaveLength(100);
    });
});

describe('the encoded value is safe in a query string', () => {
    const names = ['Ana>Ben', 'Cleo?Dee', '~Tilde~', 'Łukasz', 'Sam 🐐'];

    test.each(names)('%s produces no + or /', (name) => {
        const encoded = encodeShareData(roster(name));
        // '+' decodes as a space in a query string, and '/' needs escaping
        expect(encoded).not.toMatch(/[+/]/);
    });

    test.each(names)('%s survives URLSearchParams', (name) => {
        const data = roster(name);
        const url = buildShareUrl(data, { origin: 'https://example.test', pathname: '/' });
        const value = new URLSearchParams(new URL(url).search).get('lineup');

        expect(decodeShareData(value)).toEqual(data);
    });

    test('no padding is left to be mistaken for a parameter separator', () => {
        expect(encodeShareData(roster('Ana'))).not.toMatch(/=/);
    });
});

describe('links made before this changed', () => {
    test('a plain base64 payload still opens', () => {
        // What the old code produced: btoa of JSON, ASCII only
        const data = roster('Ana', 'Ben');
        const legacy = btoa(JSON.stringify(data));

        expect(decodeShareData(legacy)).toEqual(data);
    });

    test('a legacy payload with Latin-1 accents still opens', () => {
        const data = roster('Núñez');
        const legacy = btoa(JSON.stringify(data));

        expect(decodeShareData(legacy)).toEqual(data);
    });
});

describe('a payload that cannot be read', () => {
    test.each([
        ['nonsense', 'not-base64-at-all!!'],
        ['valid base64, not JSON', 'aGVsbG8gd29ybGQ'],
        ['empty', ''],
        ['null', null]
    ])('%s returns null rather than throwing', (_label, value) => {
        expect(decodeShareData(value)).toBeNull();
    });
});

describe('buildShareUrl', () => {
    test('hangs the payload off the page the app is served from', () => {
        const url = buildShareUrl(roster('Ana'), {
            origin: 'https://roster.example',
            pathname: '/app/'
        });

        expect(url.startsWith('https://roster.example/app/?lineup=')).toBe(true);
    });
});
