import { LANE_ORDER } from '../game/levels';
import type { Editor, Level } from './levels';
import type { Row } from './match';
import { HOME_ROW } from './music';
import { STEPS, type Build, type Part, type Song } from './song';
import { changedIn } from './yours';

/**
 * Today's twist: a reason to come back that is not guilt. Once a player has made something their own, School offers
 * one small change a day to their own song: one bar, one part, one rule that can be checked (keep the backbeat, end on
 * home). It is the same twist all day (like a daily puzzle), it is done in a few minutes, and what it changes stays in
 * the player's song, which is the point of coming back: the song grows. A twist done is a stitch in the sampler. There
 * is no streak to lose, and a missed day costs nothing (VISION.md: good reasons to come back, not guilt).
 *
 * Each twist is checked against the song as it was when the twist was started (`from`), so a change made earlier
 * never counts for today.
 */

export interface TwistDef {
  id: string;
  part: Part;
  /** The bars it changes. */
  bars: readonly number[];
  /** What to do, naming what to touch. At most nine words. */
  goal: string;
  name: string;
  named: string;
  /** It can be done from this song: the change it asks for is not already there. */
  possible(from: Build): boolean;
  check(from: Build, b: Build): boolean;
}

const count = (b: Build, bar: number) => LANE_ORDER.reduce((n, l) => n + b.drums[bar][l].filter(Boolean).length, 0);
const same = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
const lastRow = (b: Build, bar: number) => b.melody[bar].at(-1)?.row;
const only = (steps: readonly number[]) => Array.from({ length: STEPS }, (_, s) => steps.includes(s));
const leaps = (b: Build, bar: number) => b.melody[bar].some((n, i, ns) => i > 0 && Math.abs(n.row - ns[i - 1].row) >= 3);
const quarters = (b: Build, bar: number) => b.bass[bar].length === 4 && b.bass[bar].every((n, i) => n.at === i * 4 && n.len === 4);
const allHome = (b: Build, bar: number) => b.bass[bar].length > 0 && b.bass[bar].every((n) => n.row === HOME_ROW.bass);

/** The day the calendar starts: day n after it offers the n-th twist of the list, if the player's song allows it. */
export const FIRST_DAY = '2026-10-14';

/**
 * Every twist there is, as a calendar: a player who has rebuilt every part gets each of them once, in this order, from
 * 14 October (so a new one every day to the end of October and two days past it), then the list starts again. The parts
 * take turns down the list. See `twistOn`.
 */
export const TWISTS: readonly TwistDef[] = [
  {
    id: 'less', part: 'drums', bars: [2], goal: 'Bar 3 with less. Keep the backbeat.',
    name: 'Space', named: 'Fewer hits let the others breathe: space is part of a groove.',
    possible: (f) => count(f, 2) > 2,
    check: (f, b) => count(b, 2) < count(f, 2) && [4, 12].every((s) => !f.drums[2].snare[s] || b.drums[2].snare[s]),
  },
  {
    id: 'swap', part: 'chords', bars: [1, 2], goal: 'Swap the colours of bars 2 and 3.',
    name: 'A new progression', named: 'The same colours in a new order: a new chord progression.',
    possible: (f) => !!f.chords[1] && !!f.chords[2] && f.chords[1] !== f.chords[2],
    check: (f, b) => b.chords[1] === f.chords[2] && b.chords[2] === f.chords[1],
  },
  {
    id: 'long', part: 'melody', bars: [1], goal: 'Bar 2: answer with one long note.',
    name: 'Space in a tune', named: 'One held note answers too: a long note leaves the tune room.',
    possible: (f) => !(f.melody[1].length === 1 && f.melody[1][0].len >= 8),
    check: (_f, b) => b.melody[1].length === 1 && b.melody[1][0].len >= 8,
  },
  {
    id: 'offbeat', part: 'drums', bars: [1], goal: 'Move a Boom off the beat in bar 2.',
    name: 'Syncopation', named: 'A kick between the beats pulls against the count: syncopation.',
    possible: () => true,
    check: (f, b) => b.drums[1].kick.some((on, s) => on && s % 4 !== 0 && !f.drums[1].kick[s]),
  },
  {
    id: 'whole', part: 'bass', bars: [2], goal: 'Hold one bass note for all of bar 3.',
    name: 'A whole note', named: 'One bass note held for the whole bar is a whole note.',
    possible: (f) => !f.bass[2].some((n) => n.len === STEPS),
    check: (_f, b) => b.bass[2].some((n) => n.len === STEPS),
  },
  {
    id: 'new', part: 'chords', bars: [2], goal: 'Bar 3: a colour the song never plays.',
    name: 'A new chord', named: 'A colour from outside the song changes the bars around it.',
    possible: () => true,
    check: (f, b) => b.chords[2] !== f.chords[2] && (b.chords[2] === 'longing' || b.chords[2] === 'restless'),
  },
  {
    id: 'more', part: 'drums', bars: [0], goal: 'Bar 1, busier. Keep every Boom.',
    name: 'A busier bar', named: 'More hits over the same kicks: the groove gets busier, the floor stays.',
    possible: (f) => count(f, 0) < 40,
    check: (f, b) => count(b, 0) > count(f, 0) && same(b.drums[0].kick, f.drums[0].kick),
  },
  {
    id: 'rhythm', part: 'melody', bars: [2], goal: 'Bar 3: the same heights, a new rhythm.',
    name: 'Rhythm', named: 'The same heights at new times: rhythm changes a tune as much as height.',
    possible: (f) => f.melody[2].length > 0,
    check: (f, b) => same(b.melody[2].map((n) => n.row), f.melody[2].map((n) => n.row)) && !same(b.melody[2], f.melody[2]),
  },
  {
    id: 'climb', part: 'bass', bars: [3], goal: 'Bar 4: walk the bass up, note by note.',
    name: 'A walking line', named: 'A bass that steps up from note to note walks: a walking line.',
    possible: () => true,
    check: (f, b) => {
      const ns = b.bass[3];
      return !same(ns, f.bass[3]) && ns.length >= 3 && ns.every((n, i) => i === 0 || n.row > ns[i - 1].row);
    },
  },
  {
    id: 'fall', part: 'melody', bars: [3], goal: 'Start bar 4 at the top. End home.',
    name: 'A falling line', named: 'From the top down to home: a falling line lands hard.',
    possible: (f) => f.melody[3][0]?.row !== 5,
    check: (_f, b) => b.melody[3][0]?.row === 5 && lastRow(b, 3) === HOME_ROW.melody,
  },
  {
    id: 'drop', part: 'drums', bars: [3], goal: 'Bar 4 without Booms. Keep the Cracks.',
    name: 'A kick drop', named: 'Taking the kick out of a bar makes the bar after it land harder.',
    possible: (f) => f.drums[3].kick.some(Boolean),
    check: (f, b) => !b.drums[3].kick.some(Boolean) && f.drums[3].snare.every((on, s) => !on || b.drums[3].snare[s]),
  },
  {
    id: 'hold', part: 'chords', bars: [1], goal: 'Bar 2: the same colour as bar 1.',
    name: 'A held chord', named: 'One chord across two bars slows the harmony and gives the tune room.',
    possible: (f) => f.chords[1] !== f.chords[0],
    check: (f, b) => b.chords[1] === f.chords[0],
  },
  {
    id: 'peak', part: 'melody', bars: [0], goal: 'Bar 1: reach the top height once.',
    name: 'A peak', named: 'The highest note of a tune is its peak, and the ear waits for it.',
    possible: (f) => !f.melody[0].some((n) => n.row === 5),
    check: (_f, b) => b.melody[0].some((n) => n.row === 5),
  },
  {
    id: 'pedal', part: 'bass', bars: [1], goal: 'Bar 2: keep the bass on home.',
    name: 'A pedal note', named: 'A bass that stays home while the chord moves is a pedal note.',
    possible: (f) => !allHome(f, 1),
    check: (_f, b) => allHome(b, 1),
  },
  {
    id: 'offhats', part: 'drums', bars: [1], goal: 'Bar 2: Ticks on the ands, nowhere else.',
    name: 'Offbeat hats', named: 'Ticks only between the beats give a groove its bounce: offbeat hats.',
    possible: (f) => !same(f.drums[1].hat, only([2, 6, 10, 14])),
    check: (_f, b) => same(b.drums[1].hat, only([2, 6, 10, 14])),
  },
  {
    id: 'leap', part: 'melody', bars: [2], goal: 'Bar 3: one jump of three heights or more.',
    name: 'A leap', named: 'A jump between two notes catches the ear: a leap.',
    possible: (f) => !leaps(f, 2),
    check: (_f, b) => leaps(b, 2),
  },
  {
    id: 'short', part: 'bass', bars: [0], goal: 'Bar 1: four bass notes, one beat each.',
    name: 'Quarter notes', named: 'A note on every beat, each one beat long: quarter notes.',
    possible: (f) => !quarters(f, 0),
    check: (_f, b) => quarters(b, 0),
  },
  {
    id: 'cadence', part: 'chords', bars: [3], goal: 'Bar 4: the colour of bar 1.',
    name: 'Coming home', named: 'Ending on the chord the loop started from makes it sound finished.',
    possible: (f) => f.chords[3] !== f.chords[0],
    check: (f, b) => b.chords[3] === f.chords[0],
  },
  {
    id: 'halftime', part: 'drums', bars: [2], goal: 'Bar 3: one Crack, on beat 3.',
    name: 'Half time', named: 'One crack on beat 3 makes the same speed feel half as fast: half time.',
    possible: (f) => !same(f.drums[2].snare, only([8])),
    check: (_f, b) => same(b.drums[2].snare, only([8])),
  },
  {
    id: 'open', part: 'melody', bars: [3], goal: 'Bar 4: end where bar 2 ends.',
    name: 'An open ending', named: 'A tune that does not end on home leaves the loop asking a question.',
    possible: (f) => lastRow(f, 1) !== undefined && lastRow(f, 1) !== HOME_ROW.melody && lastRow(f, 3) !== lastRow(f, 1),
    check: (f, b) => lastRow(b, 3) === lastRow(f, 1),
  },
];
export const twistById = (id: string) => TWISTS.find((t) => t.id === id);

/** The world each part is rebuilt in: a twist is offered on a part once its world is rebuilt. */
const WORLD_OF: Record<Part, number> = { drums: 0, bass: 1, chords: 2, melody: 3 };
const EDITOR: Record<Part, Editor> = {
  drums: { kind: 'drums', lanes: LANE_ORDER, res: 16 },
  bass: { kind: 'notes', ladder: 'bass', res: 4 },
  chords: { kind: 'chords' },
  melody: { kind: 'notes', ladder: 'melody', res: 4 },
};
const FOCUS: Record<Part, readonly Row[]> = { drums: LANE_ORDER, bass: ['bass'], chords: ['chords'], melody: ['melody'] };
const PARTNER: Record<Part, readonly Row[]> = { drums: ['bass'], bass: ['kick'], chords: ['bass'], melody: ['chords'] };

/** Days since 1970-01-01 for a local date written YYYY-MM-DD. */
export function dayNumber(on: string): number {
  const [y, m, d] = on.split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
}
export const isDay = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

/**
 * The twist for a day, given the parts whose worlds are rebuilt, the player's song now, and the twists already sewn.
 * Day n of the calendar offers the n-th of the twists the song allows, leaving out the ones already sewn while any
 * other is left; so a player who comes back every day never meets a twist twice until they have done them all. The
 * same all day for the same song, and never the same twist two days running when there is more than one to offer.
 */
export function twistOn(on: string, worldsDone: ReadonlySet<number>, own: Build, sewn: ReadonlySet<string> = new Set()): TwistDef | null {
  const open = TWISTS.filter((t) => worldsDone.has(WORLD_OF[t.part]) && t.possible(own));
  const fresh = open.filter((t) => !sewn.has(t.id));
  const pool = fresh.length ? fresh : open;
  if (!pool.length) return null;
  const n = dayNumber(on) - dayNumber(FIRST_DAY);
  return pool[((n % pool.length) + pool.length) % pool.length];
}

/** A twist as a level, so School's instrument, strip and dock work on it unchanged. */
export function twistLevel(def: TwistDef, song: Song, from: Build): Level {
  const part = def.part;
  return {
    id: `twist-${def.id}`, world: WORLD_OF[part], title: 'Today’s twist', goal: def.goal, name: def.name, named: def.named,
    editor: EDITOR[part], focus: FOCUS[part], bars: def.bars, holes: 'none', copy: false, partner: PARTNER[part],
    open: def.bars[0], scope: 'one', listen: 'mine', noHint: true,
    yours: { takes: part === 'drums' || part === 'melody', carries: part === 'chords' ? ['bass'] : [] },
    // Something changed today, and it is the change the twist asks for.
    check: (b) => def.bars.some((bar) => changedIn({ ...song, parts: from }, b, part, bar)) && def.check(from, b),
  };
}
