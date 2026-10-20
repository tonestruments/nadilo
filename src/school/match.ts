// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { LANE_ORDER, type Lane } from '../game/levels';
import type { Ladder } from './music';
import { BARS, PARTS, STEPS, type Build, type Part, type Song } from './song';

/**
 * How close the player's build is to the song, as sets of marks that can be compared. A mark is one thing a level
 * can ask for: a hit on a step, a note (start, height and length), a bar's chord, a part's switch in a section.
 * Only what the level's grid can show counts: at four pads a bar, a hit between the beats is not asked for.
 */

/** Something a level rebuilds: a drum lane, the bass, the chords, the tune, or the arrangement. */
export type Row = Lane | 'bass' | 'chords' | 'melody' | 'arr';
export const DRUM_ROWS: readonly Row[] = LANE_ORDER;
export const isLane = (r: Row): r is Lane => (LANE_ORDER as readonly string[]).includes(r);
export const partOf = (r: Row): Part | 'arr' => (isLane(r) ? 'drums' : r);

/** Steps a grid of `res` pads a bar can show. */
export const visible = (res: number) => Array.from({ length: res }, (_, i) => (i * STEPS) / res);

/** The marks of one row in one bar. */
export function barMarks(b: Build, row: Row, bar: number, res = STEPS): string[] {
  if (isLane(row)) return visible(res).filter((s) => b.drums[bar][row][s]).map((s) => `${row}:${bar}:${s}`);
  if (row === 'chords') return b.chords[bar] ? [`chords:${bar}:${b.chords[bar]}`] : [];
  if (row === 'arr') return [];
  const step = STEPS / res;
  return b[row as Ladder][bar].filter((n) => n.at % step === 0).map((n) => `${row}:${bar}:${n.at}:${n.row}:${n.len}`);
}

/**
 * The arrangement's marks: where a part rests. Every part plays everywhere until it is taken out, so what an
 * arrangement says is where the parts drop out.
 */
const arrMarks = (b: Build) => PARTS.flatMap((p) => b.arr[p].flatMap((on, i) => (on ? [] : [`arr:${p}:${i}`])));

export function marks(b: Build, rows: readonly Row[], bars: readonly number[], res = STEPS): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (row === 'arr') { arrMarks(b).forEach((m) => out.add(m)); continue; }
    for (const bar of bars) barMarks(b, row, bar, res).forEach((m) => out.add(m));
  }
  return out;
}

export interface Match {
  /** The song's marks the player has. */
  right: number;
  /** The song's marks. */
  of: number;
  /** The player's marks the song does not have. */
  extra: number;
}

export function compare(mine: Build, song: Song, rows: readonly Row[], bars: readonly number[], res = STEPS): Match {
  const want = marks(song.parts, rows, bars, res);
  const have = marks(mine, rows, bars, res);
  let right = 0;
  for (const m of have) if (want.has(m)) right++;
  return { right, of: want.size, extra: have.size - right };
}

/** Exactly the song: every mark there, nothing extra. */
export const exact = (m: Match) => m.right === m.of && m.extra === 0;

/** ★ the goal is met, ★★ three quarters of the way to the song (extras count against it), ★★★ exactly the song. */
export function starsFor(goal: boolean, m: Match): 0 | 1 | 2 | 3 {
  if (!goal) return 0;
  if (exact(m)) return 3;
  return m.right - m.extra >= 0.75 * m.of ? 2 : 1;
}

/** Note starts in a bar, whatever their height and length: the rhythm of a line. */
export const starts = (b: Build, ladder: Ladder, bar: number) => b[ladder][bar].map((n) => n.at);
export const sameStarts = (a: Build, b: Build, ladder: Ladder, bar: number) => {
  const x = starts(a, ladder, bar), y = starts(b, ladder, bar);
  return y.every((s) => x.includes(s));
};

/** The song's marks in a bar that no earlier bar of the loop has: what makes that bar different. */
export function newIn(song: Song, rows: readonly Row[], bar: number): string[] {
  const strip = (m: string) => m.replace(/:\d+:/, ':_:');
  const before = new Set(Array.from({ length: bar }, (_, i) => i).flatMap((i) => [...marks(song.parts, rows, [i])].map(strip)));
  return [...marks(song.parts, rows, [bar])].filter((m) => !before.has(strip(m)));
}

export const allBars = Array.from({ length: BARS }, (_, i) => i);
