import { LANE_ORDER, STEPS, type Lane } from '../game/levels';
import type { Pattern } from '../game/logic';
import type { Program, Sound } from './types';

/**
 * What sounds on each step, and exactly when. Pure: the real engine, the offline renderer and the tests
 * all use this, so there is one definition of the kit's timing.
 */

export const BPM = 96;
export const STEP_SECONDS = 60 / BPM / 4;

/** Mix and feel, tuned by ear on the web app. */
export const KIT: Record<Lane, { db: number; offset: number }> = {
  kick: { db: 0, offset: 0 },
  snare: { db: -2, offset: 0.004 },
  hat: { db: -7, offset: 0.009 },
};

/** When the snare shares a step with the kick it lands this much later, so the ear hears two sounds. */
export const STACK_FLAM = 0.03;

/** The furthest the in-between sixteenths lean late, as a fraction of a step. Two thirds of this is a triplet feel. */
export const MAX_LEAN = 0.5;

export const dbToGain = (db: number) => Math.pow(10, db / 20);

export interface Hit {
  lane: Lane;
  /** Seconds after the step's grid time. */
  delay: number;
}

/** The hits on one step of a pattern, with their feel offsets (and the flam for a stacked snare). */
export function hitsAtStep(pattern: Pattern, step: number): Hit[] {
  return LANE_ORDER.filter((l) => pattern[l].has(step)).map((lane) => ({
    lane,
    delay: lane === 'snare' && pattern.kick.has(step) ? STACK_FLAM : KIT[lane].offset,
  }));
}

/** Grid time of the n-th step after `start` (n counts across loops). */
export const stepTime = (start: number, n: number) => start + n * STEP_SECONDS;

/** Seconds a step lasts at `bpm`. */
export const stepSeconds = (bpm: number) => 60 / bpm / 4;

/** How late step `pos` lands: only the in-between (odd) sixteenths lean. */
export const leanDelay = (pos: number, lean: number, stepSec: number) => (pos % 2 === 1 ? lean * stepSec : 0);

/** A drum pattern as a program: the ear-training game's beats, at its fixed tempo, with the crowned kit. */
export function drumProgram(pattern: () => Pattern, loops: number): Program {
  return {
    steps: STEPS,
    loops,
    bpm: () => BPM,
    lean: () => 0,
    at: (pos) => hitsAtStep(pattern(), pos % STEPS).map<Sound>((h) => ({ voice: h.lane, sample: h.lane, vel: 1, delay: h.delay })),
  };
}
