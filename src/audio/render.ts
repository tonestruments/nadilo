// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { LANE_ORDER, STEPS, type Lane } from '../game/levels';
import type { Pattern } from '../game/logic';
import { KIT, dbToGain, hitsAtStep, stepTime } from './schedule';

/**
 * Schedule `bars` of a pattern into any audio context, using exactly the same hit timing as the engine.
 * The timing tests use it with an OfflineAudioContext, which renders into memory and never plays.
 */
export function renderInto(ctx: BaseAudioContext, buffers: Record<Lane, AudioBuffer>, pattern: Pattern, bars: number, start = 0) {
  const gains = Object.fromEntries(LANE_ORDER.map((l) => {
    const g = ctx.createGain();
    g.gain.value = dbToGain(KIT[l].db);
    g.connect(ctx.destination);
    return [l, g];
  })) as Record<Lane, GainNode>;
  for (let n = 0; n < bars * STEPS; n++) {
    for (const h of hitsAtStep(pattern, n % STEPS)) {
      const src = ctx.createBufferSource();
      src.buffer = buffers[h.lane];
      src.connect(gains[h.lane]);
      src.start(stepTime(start, n) + h.delay);
    }
  }
}

/** Sample indices where a sound starts: the signal crosses `threshold` after at least `quietMs` of near-silence. */
export function findOnsets(data: Float32Array, sampleRate: number, threshold = 0.02, quietMs = 25): number[] {
  const quiet = Math.round((quietMs / 1000) * sampleRate);
  const out: number[] = [];
  let lastLoud = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) >= threshold) {
      if (i - lastLoud > quiet) out.push(i);
      lastLoud = i;
    }
  }
  return out;
}
