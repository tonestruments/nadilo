import { FakeEngine } from './fakeEngine';
import { ToneEngine } from './toneEngine';
import type { AudioEngine } from './types';

/**
 * The app's one engine. `?fake-audio` swaps in the silent fake (used by the end-to-end UI tests),
 * so a test run never makes a sound.
 */
const fake = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fake-audio');

export const engine: AudioEngine = fake ? new FakeEngine() : new ToneEngine();
