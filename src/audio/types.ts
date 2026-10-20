// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import type { Lane } from '../game/levels';
import type { Pattern } from '../game/logic';
import type { SampleId, Voice } from './samples';

/**
 * What the engine is playing. The ear-training game plays drum patterns (`target`, `mine`, …); Nadilo School plays
 * the level (`school`), the whole track (`track`), the song the player is rebuilding (`song`), or one bar of the
 * player's song, looped, on its own screen (`bar`).
 */
export type Mode = 'target' | 'mine' | 'reveal' | 'test' | 'calibrate' | `solo:${Lane}` | 'school' | 'track' | 'song' | 'bar';

/** One sound to play. */
export interface Sound {
  voice: Voice;
  sample: SampleId;
  /** Loudness, 0–1, on top of the voice's level in the mix. */
  vel: number;
  /** The note, for pitched samples. The sample is played faster or slower from its root. */
  midi?: number;
  /** Seconds after the step's time: the kit's feel offsets, the flam of a stacked snare, a strum. */
  delay?: number;
  /** Seconds before the note is released. Without it, the sample plays out (drums). */
  hold?: number;
}

/**
 * A piece of music, step by step (sixteenth notes). Everything is read live as it plays, so an edit, a new tempo or
 * a switch between A and B lands on the next step without a restart.
 */
export interface Program {
  /** Steps in one pass. */
  steps: number;
  /** Passes before it ends on its own; 0 = until stopped. */
  loops: number;
  bpm(): number;
  /** How late the in-between sixteenths land, as a fraction of a step (swing). */
  lean(): number;
  /** The sounds on step `pos` (0 … steps − 1) of the pass. */
  at(pos: number, stepSeconds: number): Sound[];
  /**
   * For a playback that starts part-way through (a resume, a seek): what would still be ringing at `pos`, so the
   * music picks up whole instead of waiting for the next chord. Played with step `pos`.
   */
  resume?(pos: number, stepSeconds: number): Sound[];
}

export type EngineEvent =
  | { type: 'start'; mode: Mode; loops: number }
  /**
   * Fired on the animation frame closest to the moment this step is heard (plus the calibration offset).
   * `step` is the step in its bar (0–15) and `pos` the step in the pass. `heardAt` is that moment on the
   * performance.now() clock, before the calibration offset. `bar` counts bars since the playback started, so a
   * one-bar drum loop can show which bar of the four-bar phrase it is on.
   */
  | { type: 'step'; mode: Mode; step: number; pos: number; loop: number; bar: number; lanes: Lane[]; heardAt: number }
  /** `at`: the step in the pass after the last one shown, where a paused playback picks up again. */
  | { type: 'end'; mode: Mode; completed: boolean; at: number };

export interface TraceEntry {
  step: number;
  n: number;
  /** Audio-clock time the step was scheduled for. */
  scheduled: number;
  /** Seconds between scheduling and the step's time. Negative would mean the hit was scheduled late. */
  lead: number;
  latency: number;
  /** performance.now() at which the visual should run. */
  target: number;
  /** performance.now() when the visual update actually ran. */
  fired: number;
  /** performance.now() of the animation frame before the one that ran it. */
  prevFrame: number;
  /** Audio-clock time when the visual update ran (coarse in WebKit, which updates it about every 8 ms). */
  drawn: number;
}

/** Everything the app needs from audio. The real one is Tone.js; tests and `?fake-audio` use a silent fake. */
export interface AudioEngine {
  readonly started: boolean;
  /** Extra visual delay in ms, set by the sync calibration. */
  visualOffsetMs: number;
  trace: TraceEntry[] | null;
  /** Must be called from a click the first time. */
  unlock(): Promise<void>;
  /** Play a drum pattern for `loops` bars (0 = until stopped) at the game's tempo. Read every step. */
  play(mode: Mode, loops: number, pattern: () => Pattern): Promise<void>;
  /**
   * Play a program, from step `from` of its first pass (0: the top). Whatever was playing stops first, with a short
   * fade so nothing clicks.
   */
  playProgram(mode: Mode, program: Program, from?: number): Promise<void>;
  stop(): void;
  /** The step of the program playing that a pause would pick up from, or null when nothing plays. */
  position(): number | null;
  /** A lane's crowned sample, now. */
  audition(lane: Lane): Promise<void>;
  /** One sound, now (a pad click, a ladder height, a chord swatch). */
  hear(sounds: Sound[]): Promise<void>;
  /** Output level, 0..1. */
  level(): number;
  subscribe(fn: (e: EngineEvent) => void): () => void;
}
