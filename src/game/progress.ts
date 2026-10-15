import { LEVELS } from './levels';

/** Where a player is: the level they are on, and the ids of the levels they have solved. */
export interface Place {
  levelIdx: number;
  solved: readonly number[];
}

export const clampLevel = (i: number) => Math.max(0, Math.min(LEVELS.length - 1, Math.trunc(i) || 0));

/** The first unsolved level after `from`, going round; with `andFrom`, `from` itself counts first. */
function firstUnsolved(p: Place, from: number, andFrom: boolean): number | null {
  for (let k = andFrom ? 0 : 1; k < LEVELS.length; k++) {
    const i = (from + k) % LEVELS.length;
    if (!p.solved.includes(LEVELS[i].id)) return i;
  }
  return null;
}

/**
 * The level Continue opens: the one you were on, unless it is solved, then the next unsolved one after it.
 * With every level solved, the one you were on.
 */
export function continueIndex(p: Place): number {
  const from = clampLevel(p.levelIdx);
  return firstUnsolved(p, from, true) ?? from;
}

/**
 * Where Next (and Skip) go: the next unsolved level after this one, so a skipped level is never left behind.
 * With nothing else left to solve, simply the next level.
 */
export function nextIndex(p: Place): number {
  const from = clampLevel(p.levelIdx);
  return firstUnsolved(p, from, false) ?? (from + 1) % LEVELS.length;
}

export const allSolved = (solved: readonly number[]) => LEVELS.every((l) => solved.includes(l.id));
