// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import type { SampleId } from './samples';
import { leanDelay, stepSeconds } from './schedule';
import type { Program } from './types';
import { fadeOut, masterChain, newBus, trigger } from './voices';

/**
 * Render a program into any audio context (an OfflineAudioContext renders into memory and never plays), with exactly
 * the engine's scheduling: the same tempo per step, the same swing, the same voices and the same master chain.
 * `stopAt` stops it the way the Stop button does, to check that stopping is clean.
 */
export function renderProgram(
  ctx: BaseAudioContext,
  buffers: ReadonlyMap<SampleId, AudioBuffer>,
  program: Program,
  { passes = program.loops || 1, start = 0.05, stopAt }: { passes?: number; start?: number; stopAt?: number } = {},
): { end: number } {
  const { input } = masterChain(ctx);
  const bus = newBus(ctx, input);
  let t = start;
  for (let n = 0; n < passes * program.steps; n++) {
    const sec = stepSeconds(program.bpm());
    // Like the engine, which schedules 100 ms ahead: some notes are already scheduled past the moment of the stop.
    if (stopAt !== undefined && t >= stopAt + 0.1) break;
    const pos = n % program.steps;
    const at = t + leanDelay(pos, program.lean(), sec);
    for (const s of program.at(pos, sec)) trigger(ctx, buffers, s, at + (s.delay ?? 0), bus);
    t += sec;
  }
  if (stopAt !== undefined) fadeOut(bus, stopAt);
  return { end: t };
}
