// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import type { Lane } from '../game/levels';
import built from './samples.json';

/**
 * Every sample the engine can play, all recordings from CC0 libraries, made and measured by scripts/samples/cc0.py
 * (docs/SOUNDS.md). The kit's kick, snare and hi-hat live in src/assets/audio/, with three more takes each; School's
 * other sounds in src/assets/audio/school/. The URLs are in sampleUrls.ts, which only the real engine imports.
 */

/** The kit's other takes: the same drum hit again, a little differently, as a drummer would. */
type Take = `${'kick' | 'snare' | 'hat'}-${2 | 3 | 4}`;

export type SampleId =
  | 'kick' | 'snare' | 'hat'
  | 'kick-round' | 'kick-deep' | 'snare-snap' | 'snare-rim' | 'hat-bright' | 'hat-shaker'
  | 'bass' | 'keys' | 'pad' | 'kalimba'
  | Take;

/** Takes of a sample, played in turn (see `trigger` in voices.ts). The first is the sample itself. */
export const TAKES: Partial<Record<SampleId, readonly SampleId[]>> = {
  kick: ['kick', 'kick-2', 'kick-3', 'kick-4'],
  snare: ['snare', 'snare-2', 'snare-3', 'snare-4'],
  hat: ['hat', 'hat-2', 'hat-3', 'hat-4'],
};

export type Voice = Lane | 'bass' | 'keys' | 'pad' | 'lead';

type Built = { role: string; label: string; file: string; root?: number };
const SOUNDS = built.sounds as Record<string, Built>;

/** The note each pitched sample was recorded at. */
export const ROOT: Partial<Record<SampleId, number>> = Object.fromEntries(
  Object.entries(SOUNDS).filter(([, s]) => s.root !== undefined).map(([id, s]) => [id, s.root]),
);

/** No note may sound with a fundamental below this (laptop speakers break up). See docs/SOUNDS.md. */
export const MIN_FUNDAMENTAL_HZ = built.minFundamentalHz;

/** The sound drawer: three options per lane. The first is the kit's own. */
export const KIT_OPTIONS: Record<Lane, readonly { id: SampleId; label: string }[]> = {
  hat: [{ id: 'hat', label: 'Closed' }, { id: 'hat-bright', label: SOUNDS['hat-bright'].label }, { id: 'hat-shaker', label: SOUNDS['hat-shaker'].label }],
  snare: [{ id: 'snare', label: 'Muted' }, { id: 'snare-snap', label: SOUNDS['snare-snap'].label }, { id: 'snare-rim', label: SOUNDS['snare-rim'].label }],
  kick: [{ id: 'kick', label: 'Kit' }, { id: 'kick-round', label: SOUNDS['kick-round'].label }, { id: 'kick-deep', label: SOUNDS['kick-deep'].label }],
};

export const kitSample = (lane: Lane, option: number): SampleId => (KIT_OPTIONS[lane][option] ?? KIT_OPTIONS[lane][0]).id;

/**
 * The mix, in dB, by voice. The drums keep the levels tuned by ear for the web app and lead the mix. The others were
 * balanced against them as a laptop's speakers hear them (little below 150 Hz; tests/e2e/school-audio.spec.ts):
 * the tune on top, the bass just under the drums, the chords a bed underneath. A chord is three piano notes plus
 * three soft organ notes, so each note is quiet. The piano and the organ reach their loudness only 1 and 1.7 dB short
 * of the -3 dBFS ceiling (cc0.py), so they are made up for here.
 */
export const VOICE_DB: Record<Voice, number> = { kick: 0, snare: -2, hat: -7, bass: -10.5, keys: -17, pad: -23.3, lead: -9 };
