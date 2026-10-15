import type { Lane } from '../game/levels';
import built from './samples.json';

/**
 * Every sample the engine can play. The crowned kick, snare and hi-hat live in src/assets/audio/; everything else is
 * built from the sound library by scripts/samples/prepare.py, which also measured it (docs/SOUNDS.md).
 * The URLs are in sampleUrls.ts, which only the real engine imports.
 */

export type SampleId =
  | 'kick' | 'snare' | 'hat'
  | 'kick-round' | 'kick-deep' | 'snare-snap' | 'snare-rim' | 'hat-bright' | 'hat-shaker'
  | 'bass' | 'keys' | 'pad' | 'kalimba';

export type Voice = Lane | 'bass' | 'keys' | 'pad' | 'lead';

type Built = { role: string; label: string; file: string; root?: number };
const SOUNDS = built.sounds as Record<string, Built>;

/** The note each pitched sample was recorded at. */
export const ROOT: Partial<Record<SampleId, number>> = Object.fromEntries(
  Object.entries(SOUNDS).filter(([, s]) => s.root !== undefined).map(([id, s]) => [id, s.root]),
);

/** No note may sound with a fundamental below this (laptop speakers break up). See docs/SOUNDS.md. */
export const MIN_FUNDAMENTAL_HZ = built.minFundamentalHz;

/** The sound drawer: three options per lane. The first is the crowned sample. */
export const KIT_OPTIONS: Record<Lane, readonly { id: SampleId; label: string }[]> = {
  hat: [{ id: 'hat', label: 'Tight' }, { id: 'hat-bright', label: SOUNDS['hat-bright'].label }, { id: 'hat-shaker', label: SOUNDS['hat-shaker'].label }],
  snare: [{ id: 'snare', label: 'Dusty' }, { id: 'snare-snap', label: SOUNDS['snare-snap'].label }, { id: 'snare-rim', label: SOUNDS['snare-rim'].label }],
  kick: [{ id: 'kick', label: 'Punchy' }, { id: 'kick-round', label: SOUNDS['kick-round'].label }, { id: 'kick-deep', label: SOUNDS['kick-deep'].label }],
};

export const kitSample = (lane: Lane, option: number): SampleId => (KIT_OPTIONS[lane][option] ?? KIT_OPTIONS[lane][0]).id;

/**
 * The mix, in dB, by voice. The drums keep the levels tuned by ear for the web app and lead the mix. The others were
 * balanced against them as a laptop's speakers hear them (little below 150 Hz; tests/e2e/school-audio.spec.ts):
 * the tune on top, the bass just under the drums, the chords a bed underneath. A chord is three guitar notes plus
 * three soft pad notes, so each note is quiet.
 */
export const VOICE_DB: Record<Voice, number> = { kick: 0, snare: -2, hat: -7, bass: -10.5, keys: -18, pad: -25, lead: -9 };
