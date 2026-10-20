// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { LANE_ORDER, type Lane, type Level } from './levels';

export type Placed = Record<Lane, ReadonlySet<number>>;
export type Pattern = Record<Lane, ReadonlySet<number>>;
export type CellState = 'empty' | 'given' | 'placed' | 'correct' | 'missed' | 'extra';
export type Reveal = null | 'solved' | 'answer';

export interface CheckResult {
  lanes: Partial<Record<Lane, boolean>>;
  ok: boolean;
}

export const emptyPlaced = (): Placed => ({ hat: new Set(), snare: new Set(), kick: new Set() });

export function targetOf(level: Level, lane: Lane): readonly number[] {
  return level.target[lane] ?? [];
}

export function givenOf(level: Level, lane: Lane): ReadonlySet<number> {
  const g = level.given[lane];
  return new Set(g === 'all' ? targetOf(level, lane) : g ?? []);
}

export function laneFullyGiven(level: Level, lane: Lane): boolean {
  return givenOf(level, lane).size === targetOf(level, lane).length;
}

/** What the player can see in a cell. Hidden target notes read as 'empty' until revealed. */
export function cellState(level: Level, lane: Lane, step: number, placed: Placed, reveal: Reveal): CellState {
  if (givenOf(level, lane).has(step)) return 'given';
  const inTarget = targetOf(level, lane).includes(step);
  const mine = placed[lane].has(step);
  if (reveal) return mine && inTarget ? 'correct' : inTarget ? 'missed' : mine ? 'extra' : 'empty';
  return mine ? 'placed' : 'empty';
}

export function placedCount(level: Level, placed: Placed): number {
  return level.lanes.reduce((n, l) => n + placed[l].size, 0);
}

export function checkBeat(level: Level, placed: Placed): CheckResult {
  const lanes: Partial<Record<Lane, boolean>> = {};
  for (const l of level.lanes) {
    const full = new Set([...givenOf(level, l), ...placed[l]]);
    const t = targetOf(level, l);
    lanes[l] = full.size === t.length && t.every((s) => full.has(s));
  }
  return { lanes, ok: level.lanes.every((l) => lanes[l]) };
}

export function wrongLanes(level: Level, result: CheckResult | null): Lane[] {
  return result ? level.lanes.filter((l) => !result.lanes[l]) : [];
}

export const toPattern = (p: Partial<Record<Lane, Iterable<number>>>): Pattern => ({
  hat: new Set(p.hat ?? []), snare: new Set(p.snare ?? []), kick: new Set(p.kick ?? []),
});

export function targetPattern(level: Level): Pattern {
  return toPattern(level.target);
}

export function soloPattern(level: Level, lane: Lane): Pattern {
  return toPattern({ [lane]: targetOf(level, lane) });
}

/** Given notes plus the player's, restricted to the lanes this level uses. */
export function minePattern(level: Level, placed: Placed): Pattern {
  const out: Partial<Record<Lane, number[]>> = {};
  for (const l of level.lanes) out[l] = [...givenOf(level, l), ...placed[l]];
  return toPattern(out);
}

/** A canonical string for a level's full pattern, used to guarantee no two levels repeat. */
export function patternKey(level: Level): string {
  return LANE_ORDER.map((l) => `${l}:${[...targetOf(level, l)].sort((a, b) => a - b).join(',')}`).join('|');
}
