// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import type { Mode } from '../audio/types';
import { LANE_WORD, LEVELS, STEPS, type Lane, type Level } from './levels';
import { givenOf, laneFullyGiven, placedCount, targetOf, wrongLanes, type CheckResult, type Placed, type Reveal } from './logic';
import { allSolved, nextIndex, type Place } from './progress';

/** The words on the button that moves on from a solved level. It names a skipped level when it goes back to one. */
export function nextLabel(p: Place): string {
  const to = nextIndex(p);
  if (allSolved(p.solved)) return to === 0 ? 'Start again from level 1' : 'Next level';
  return to === p.levelIdx + 1 ? 'Next level' : `Next: level ${LEVELS[to].id}`;
}

interface View {
  level: Level;
  placed: Placed;
  listens: number;
  result: (CheckResult & { stale: boolean }) | null;
  reveal: Reveal;
  playing: Mode | null;
}

/** The single line under the task. Short on purpose. */
export function statusLine(v: View): { tone: '' | 'warn' | 'win'; text: string } {
  if (v.reveal === 'solved') return { tone: 'win', text: 'You heard it. Every lane matches.' };
  if (v.reveal === 'answer') return { tone: '', text: 'Here’s the hidden beat. Dashed is missed, × is extra.' };
  if (v.playing?.startsWith('solo:')) return { tone: '', text: `Just the ${LANE_WORD[v.playing.slice(5) as Lane]}, on its own…` };
  // The answer to a check shows at once, even while a beat is still playing.
  if (v.result && !v.result.ok && !v.result.stale) {
    const bad = wrongLanes(v.level, v.result);
    return { tone: 'warn', text: bad.length === 1 ? `Almost. Your ${LANE_WORD[bad[0]]} is off.` : `Your ${bad.map((l) => LANE_WORD[l]).join(' and ')} need another listen.` };
  }
  if (v.playing === 'target') return { tone: '', text: 'Listening to the hidden beat…' };
  if (v.playing === 'mine') return { tone: '', text: 'Playing yours. Edits land on the next loop.' };
  if (v.result?.stale) return { tone: '', text: 'Check again when it sounds right.' };
  if (v.listens === 0) return { tone: '', text: v.level.hint };
  if (placedCount(v.level, v.placed) === 0) return { tone: '', text: 'Now place what you heard.' };
  return { tone: '', text: 'Check when it sounds right.' };
}

const CUES: Record<Lane, string> = {
  kick: 'Say “boom” on each low thump. Where does your foot tap?',
  snare: 'Clap where it feels sharpest: the “tak” after the “boom”.',
  hat: 'Count along, “1 and 2 and”. Every tick is a hi-hat.',
};
/** What to say for each sound, out loud, while the beat plays. */
const SAY: Record<Lane, string> = { kick: 'boom', snare: 'tak', hat: 'ts' };

/** The lane's notes as the player has it: what is given, and what they placed. */
const mineIn = (v: View, lane: Lane) => [...new Set([...givenOf(v.level, lane), ...v.placed[lane]])].sort((a, b) => a - b);

/** Evenly spaced round the bar, or the same in both halves: the shapes a grid pulls the eye toward. */
function neat(steps: readonly number[]): boolean {
  if (steps.length < 2) return false;
  const gaps = steps.map((s, i) => (i ? s - steps[i - 1] : s + STEPS - steps[steps.length - 1]));
  if (steps.length >= 3 && gaps.every((g) => g === gaps[0])) return true;
  return steps.every((s) => steps.includes((s + STEPS / 2) % STEPS));
}

/** A step where this lane and another hit together, which the player has not got for this lane. */
function missedStack(v: View, lane: Lane): boolean {
  const mine = new Set(mineIn(v, lane));
  return targetOf(v.level, lane).some((s) => !mine.has(s)
    && v.level.lanes.some((other) => other !== lane && targetOf(v.level, other).includes(s)));
}

/** Say it out loud while it plays: one word per sound still to find. */
function sayIt(v: View): string {
  const find = v.level.lanes.filter((l) => !laneFullyGiven(v.level, l));
  if (find.length === 1) return `Say “${SAY[find[0]]}” on every ${LANE_WORD[find[0]]} as it plays.`;
  return `Say it as it plays: ${find.map((l) => `“${SAY[l]}” for the ${LANE_WORD[l]}`).join(', ')}.`;
}

/**
 * The coach: one short tip, chosen from what the player has just done. Like the partner in Make it yours it is fixed
 * rules, not a model, and it never names a step. It speaks up on its own when it has a reason (Coach tips on), or only
 * when asked (off); `asked` then always gets an answer.
 *
 * A lane that stays off gets more specific help each check: first a way to hear it (say it, clap it, count it), then
 * what is likely wrong (two sounds on one step, a pattern that looks tidier than it sounds, too many or too few hits),
 * then the lane on its own. The tidy pattern and saying a beat out loud come from the music teachers' notes; the
 * stacked hit from the first daily beats.
 */
export function coachTip(v: View & { misses?: Partial<Record<Lane, number>> }, asked = false): string | null {
  if (v.reveal) return null;
  if (v.result && !v.result.ok && !v.result.stale) {
    const lane = wrongLanes(v.level, v.result)[0];
    const n = v.misses?.[lane] ?? 1;
    const word = LANE_WORD[lane];
    if (n <= 1) return CUES[lane];
    if (n >= 3) return `Press “Hear the ${word} alone”, and say “${SAY[lane]}” with every hit.`;
    if (lane !== 'hat' && missedStack(v, lane)) return 'Two sounds can land on one step. Listen for one bigger hit.';
    const mine = mineIn(v, lane);
    const target = targetOf(v.level, lane).length;
    if (mine.length > target) return `There are fewer ${word} hits than that. Which one is extra?`;
    if (mine.length < target) return `There are more ${word} hits than that. Listen between the ones you have.`;
    if (neat(mine)) return 'Tidy on the grid isn’t always what plays. Trust your ear over the pattern.';
    return `You have the right number of ${word} hits, but not all in the right places.`;
  }
  if (v.result?.stale && !asked) return null;
  if (v.listens === 0) return v.level.tip ?? (asked || v.level.id === 1 ? 'Listen all the way through before you place anything.' : null);
  const none = placedCount(v.level, v.placed) === 0;
  if (none && v.playing === 'target') return sayIt(v);
  if (none && v.listens >= 3) return 'Place the one hit you’re surest of first. You can move it later.';
  return asked ? sayIt(v) : null;
}

