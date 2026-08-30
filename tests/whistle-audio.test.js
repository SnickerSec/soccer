/**
 * Synthesized referee whistle audio.
 *
 * Plays two short whistle blasts using Web Audio API with zero external assets.
 * Must gracefully do nothing in environments without AudioContext (SSR, Node,
 * blocked audio autoplay permissions).
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { playWhistleSound } from '../src/modules/whistle-audio.js';

describe('playWhistleSound', () => {
    const originalWindow = globalThis.window;

    afterEach(() => {
        globalThis.window = originalWindow;
    });

    test('does not throw when window is undefined', () => {
        delete globalThis.window;
        expect(() => playWhistleSound()).not.toThrow();
    });

    test('does not throw when AudioContext is missing on window', () => {
        globalThis.window = {};
        expect(() => playWhistleSound()).not.toThrow();
    });

    test('catches and suppresses errors if AudioContext construction fails', () => {
        globalThis.window = {
            AudioContext: class {
                constructor() {
                    throw new Error('Autoplay blocked');
                }
            }
        };
        expect(() => playWhistleSound()).not.toThrow();
    });

    test('creates and plays two whistle blasts via AudioContext', () => {
        const oscillators = [];
        const gains = [];
        let resumed = false;

        class MockAudioParam {
            constructor() {
                this.value = 0;
                this.setValueAtTime = jest.fn();
                this.exponentialRampToValueAtTime = jest.fn();
                this.linearRampToValueAtTime = jest.fn();
            }
        }

        class MockOscillator {
            constructor() {
                this.type = 'sine';
                this.frequency = new MockAudioParam();
                this.connect = jest.fn();
                this.start = jest.fn();
                this.stop = jest.fn();
                oscillators.push(this);
            }
        }

        class MockGain {
            constructor() {
                this.gain = new MockAudioParam();
                this.connect = jest.fn();
                gains.push(this);
            }
        }

        class MockAudioContext {
            constructor() {
                this.state = 'suspended';
                this.currentTime = 10;
                this.destination = {};
            }
            resume() {
                resumed = true;
                this.state = 'running';
            }
            createOscillator() {
                return new MockOscillator();
            }
            createGain() {
                return new MockGain();
            }
        }

        globalThis.window = { AudioContext: MockAudioContext };

        playWhistleSound();

        expect(resumed).toBe(true);
        expect(oscillators).toHaveLength(2);
        expect(gains).toHaveLength(2);

        // First blast
        expect(oscillators[0].type).toBe('triangle');
        expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(2600, 10);
        expect(oscillators[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(2900, 10.12);
        expect(oscillators[0].connect).toHaveBeenCalledWith(gains[0]);
        expect(gains[0].connect).toHaveBeenCalled();
        expect(oscillators[0].start).toHaveBeenCalledWith(10);
        expect(oscillators[0].stop).toHaveBeenCalledWith(10.15);

        // Second blast
        expect(oscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(2600, 10.18);
        expect(oscillators[1].start).toHaveBeenCalledWith(10.18);
    });
});
