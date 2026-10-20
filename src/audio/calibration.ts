// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Sync calibration, the way rhythm games do it: the player taps along to what they hear, and the gap
 * between their taps and when the beats were due tells us how late the sound reaches them.
 * Browsers built on WebKit (Safari, and the Mac app) do not report output latency, so on Bluetooth
 * headphones (often 150–250 ms) this is the only way to line the playhead up with the sound.
 */

export interface Estimate {
  /** How much later the visuals should run, in ms. */
  offsetMs: number;
  /** Median distance of the taps from that offset: small means the taps were consistent. */
  spreadMs: number;
  used: number;
}

export const MIN_TAPS = 6;
/** Taps further than this from the offset are treated as mistakes. */
const MAX_SPREAD_MS = 60;
/**
 * People tap a little late on their own; below this, assume no correction is needed. Tapping *early* is more common
 * still: most people run slightly ahead of a beat they can predict. Sound can only reach the player late, never early,
 * so early taps never move the playhead earlier; only the nudge slider can.
 */
const DEAD_ZONE_MS = 20;
/** The slider's range. Measuring alone never goes below 0. */
const LIMITS = { min: -60, max: 400 };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * `taps` and `beats` are performance.now() times. Each beat time is when that beat is heard according to
 * the browser (already including any latency it reports). Returns null if there are too few taps or they
 * are too inconsistent to trust.
 */
export function estimateOffset(taps: number[], beats: number[], beatMs: number): Estimate | null {
  if (!beats.length) return null;
  const diffs = taps.map((t) => {
    let best = Infinity;
    for (const b of beats) if (Math.abs(t - b) < Math.abs(best)) best = t - b;
    return best;
  }).filter((d) => Math.abs(d) <= beatMs / 2);
  if (diffs.length < MIN_TAPS) return null;
  const mid = median(diffs);
  const kept = diffs.filter((d) => Math.abs(d - mid) <= MAX_SPREAD_MS * 2);
  if (kept.length < MIN_TAPS) return null;
  const offset = median(kept);
  const spread = median(kept.map((d) => Math.abs(d - offset)));
  if (spread > MAX_SPREAD_MS) return null;
  const snapped = offset < DEAD_ZONE_MS ? 0 : offset;
  return { offsetMs: Math.round(Math.min(LIMITS.max, snapped)), spreadMs: Math.round(spread), used: kept.length };
}

export const clampOffset = (ms: number) => Math.round(Math.min(LIMITS.max, Math.max(LIMITS.min, ms)));
export const OFFSET_LIMITS = LIMITS;
