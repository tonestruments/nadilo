// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import type { Lane } from '../game/levels';
import { allBars, barMarks, compare, newIn, sameStarts, visible, type Row } from './match';
import { changedIn } from './yours';
import { HOME_ROW, type Ladder } from './music';
import { BARS, PARTS, type Build, type Part, type Song } from './song';

/**
 * Nadilo School: hear a song, then rebuild it, part by part and bar by bar. The levels are made from the song
 * (`curriculum`), so a new song is new data, not new code.
 *
 * Every level is one move: a title, a goal that names what to touch, the instrument for one bar at a time, and the
 * real name of what was done, given only once it is done (do it, hear it, then name it). How much of the song is
 * marked on the instrument fades: traced, then started for you, then by ear.
 */

/** The instrument a level edits. The grid coarsens as the parts change: steps for drums, beats for the bass and the
 * tune, one block a bar for chords, sections for the arrangement. */
export type Editor =
  | { kind: 'drums'; lanes: readonly Lane[]; res: 4 | 8 | 16 }
  | { kind: 'notes'; ladder: Ladder; res: 4 | 8 }
  | { kind: 'chords' }
  | { kind: 'arr' };

/** What the loop plays while you work: the bar (or section) on screen, or all of it. */
export type Scope = 'one' | 'all';

/**
 * A Make it yours level (or a twist): it changes the player's own song (`own` in the save), which starts as the song,
 * instead of rebuilding it. Everything that differs from the song is the player's, drawn in gold. No stars: the
 * reference is the song, and the question is what the change did, not how close it came.
 */
export interface Yours {
  /** The sparring partner's takes (Busier, Emptier, Surprise) are offered. */
  takes: boolean;
  /** Rows that move with this level's part: a new colour takes the bass to its root. */
  carries: readonly Row[];
}

export interface Level {
  id: string;
  world: number;
  title: string;
  /** What to do, naming what to touch. Never a riddle. */
  goal: string;
  /** The real name of what was done. Shown once the goal is met. */
  name: string;
  /** One sentence: what was done in plain words, then its name. */
  named: string;
  editor: Editor;
  /** The rows this level rebuilds. */
  focus: readonly Row[];
  /** The bars the goal and the stars look at. */
  bars: readonly number[];
  /**
   * Marks on the instrument where the song's notes go, before the player has them: all of them, the first bar, the
   * first beat, or none (by ear; Hint marks the bar on screen).
   */
  holes: 'all' | 'bar1' | 'beat1' | 'none';
  /** The copy tools are out. */
  copy: boolean;
  /** Up close: what is heard with this level's part (Solo is the part alone). */
  partner: readonly Row[];
  /** The bar (or section) the level opens on. */
  open: number;
  scope: Scope;
  /** How the level is first listened to, if not The song. */
  listen?: 'mine';
  /** No Hint: the move is a copy, not a search by ear. */
  noHint?: true;
  /** A Make it yours level: it changes the player's own song, starting from the song. */
  yours?: Yours;
  /** The goal: the idea, kept lenient. The stars measure the match. */
  check(b: Build): boolean;
  /** How far along the goal is, as [done, of], when it can be counted without giving anything away. */
  count?(b: Build): [number, number];
}

export interface World { name: string; part: Part | 'arr'; color: string; end: string }
export const WORLDS: readonly World[] = [
  { name: 'Pulse', part: 'drums', color: 'oklch(64.5% 0.167 35.5)', end: 'Your drums' },
  { name: 'The Floor', part: 'bass', color: 'oklch(55.4% 0.154 321.1)', end: 'Your bass' },
  { name: 'Color', part: 'chords', color: 'oklch(58% 0.12 158.8)', end: 'Your chords' },
  { name: 'Voice', part: 'melody', color: 'oklch(47.1% 0.198 269.9)', end: 'Your tune' },
  { name: 'Story', part: 'arr', color: 'oklch(66% 0.14 72)', end: 'You rebuilt the whole song' },
];

const DRUMS: readonly Lane[] = ['hat', 'snare', 'kick'];

/** The bars where every mark of the song's `row` (at `res`) is in the player's: lenient, extras allowed. */
function barsWith(b: Build, song: Song, row: Row, bars: readonly number[], res: number): number {
  return bars.filter((bar) => {
    const have = new Set(barMarks(b, row, bar, res));
    return barMarks(song.parts, row, bar, res).every((m) => have.has(m));
  }).length;
}

/** The levels for a song. A level whose idea the song does not have (no bar that changes, no repeated phrase) is
 * left out. */
export function curriculum(song: Song): Level[] {
  const s = song.parts;
  const turn = allBars.find((bar) => bar > 0 && newIn(song, DRUMS, bar).length > 0);
  const echo = allBars.find((bar) => bar > 0 && s.melody[bar].length > 0 && JSON.stringify(s.melody[bar]) === JSON.stringify(s.melody[0]));
  const others = (bar: number) => allBars.filter((b) => b !== bar);
  const eighthHats = (b: Build, bar: number) => visible(8).filter((st) => b.drums[bar].hat[st]).length;
  const notesIn = (ladder: Ladder) => (b: Build, bar: number) => sameStarts(b, song.parts, ladder, bar) && b[ladder][bar].length > 0;
  /** The bar Make it yours changes in Pulse: the fill, or the last bar. */
  const fill = turn ?? BARS - 1;
  /** The bars that answer the song's call: neither bar 1 nor its echo. Bar 4 ends the song, so it is always one. */
  const answers = others(echo ?? 0).filter((bar) => bar !== 0);

  const levels: (Level | null)[] = [
    // ── Pulse: the drums, on a grid of steps that gets finer ──
    {
      id: 'heartbeat', world: 0, title: 'Heartbeat', goal: 'Tap a Boom on 1, 2, 3 and 4.',
      name: 'The beat', named: 'That thump is a kick drum. 1, 2, 3, 4 are beats; four make a bar.',
      editor: { kind: 'drums', lanes: ['kick'], res: 4 }, focus: ['kick'], bars: [0], holes: 'all', copy: false,
      partner: ['bass'], open: 0, scope: 'one',
      check: (b) => barsWith(b, song, 'kick', [0], 4) === 1,
      count: (b) => [compare(b, song, ['kick'], [0], 4).right, compare(song.parts, song, ['kick'], [0], 4).of],
    },
    {
      id: 'copy', world: 0, title: 'Copy it on', goal: 'Copy bar 1 into bars 2, 3 and 4.',
      name: 'The loop', named: 'The same bar, four times over, makes a phrase. Played again and again, it is a loop.',
      editor: { kind: 'drums', lanes: ['kick'], res: 4 }, focus: ['kick'], bars: [1, 2, 3], holes: 'none', copy: true,
      // It opens on Yours, all four bars: one bar of kicks, then three of nothing. That is what copying is for.
      partner: ['bass'], open: 0, scope: 'all', listen: 'mine', noHint: true,
      check: (b) => barsWith(b, song, 'kick', [1, 2, 3], 4) === 3,
      count: (b) => [barsWith(b, song, 'kick', [1, 2, 3], 4), 3],
    },
    {
      id: 'clapback', world: 0, title: 'Clap back', goal: 'Add a Crack on 2 and 4, every bar.',
      name: 'The backbeat', named: 'The crack is a snare drum, on 2 and 4: boom, crack, boom, crack.',
      editor: { kind: 'drums', lanes: ['snare', 'kick'], res: 4 }, focus: ['snare'], bars: allBars, holes: 'bar1', copy: true,
      partner: ['kick'], open: 0, scope: 'one',
      check: (b) => barsWith(b, song, 'snare', allBars, 4) === BARS,
      count: (b) => [barsWith(b, song, 'snare', allBars, 4), BARS],
    },
    {
      id: 'zoomin', world: 0, title: 'Zoom in', goal: 'Put a Tick on every number and every &.',
      name: 'Eighth notes', named: 'The tick is a hi-hat. Each beat splits in two, 1 &, so a bar holds eight: eighth notes.',
      editor: { kind: 'drums', lanes: DRUMS, res: 8 }, focus: ['hat'], bars: allBars, holes: 'beat1', copy: true,
      partner: ['kick', 'snare'], open: 0, scope: 'one',
      check: (b) => allBars.every((bar) => eighthHats(b, bar) >= 6),
      count: (b) => [allBars.filter((bar) => eighthHats(b, bar) >= 6).length, BARS],
    },
    turn === undefined ? null : {
      id: 'turn', world: 0, title: 'The turn', goal: `Bar ${turn + 1} is different. Find what changed.`,
      name: 'A fill', named: `Bar ${turn + 1} changes to lead back to bar 1. Each step is now a sixteenth note.`,
      editor: { kind: 'drums', lanes: DRUMS, res: 16 }, focus: DRUMS, bars: [turn], holes: 'none', copy: true,
      partner: [], open: turn, scope: 'one',
      check: (b) => { const have = new Set(barMarks(b, 'snare', turn).concat(barMarks(b, 'kick', turn), barMarks(b, 'hat', turn))); return newIn(song, DRUMS, turn).some((m) => have.has(m)); },
    },
    // Make it yours: the bar that was found by ear, now changed on purpose. The song stays the reference.
    {
      id: 'yours-pulse', world: 0, title: 'Your fill', goal: `Make bar ${fill + 1} lead back your way.`,
      name: 'A variation', named: 'The same turn, played your way. Gold is yours.',
      editor: { kind: 'drums', lanes: DRUMS, res: 16 }, focus: DRUMS, bars: [fill], holes: 'none', copy: false,
      partner: [], open: fill, scope: 'one', listen: 'mine', noHint: true, yours: { takes: true, carries: [] },
      check: (b) => changedIn(song, b, 'drums', fill),
    },

    // ── The Floor: the steps fall away; a note now starts on a beat and lasts ──
    {
      id: 'floor', world: 1, title: 'Under the boom', goal: 'Trace the marked notes. Drag to hold one.',
      name: 'The bass line', named: 'That low line is the bass. Two beats long is a half note; one beat, a quarter note.',
      editor: { kind: 'notes', ladder: 'bass', res: 4 }, focus: ['bass'], bars: [0], holes: 'all', copy: false,
      partner: ['kick'], open: 0, scope: 'one',
      check: (b) => notesIn('bass')(b, 0) && b.bass[0].some((n) => n.len >= 8),
      count: (b) => [compare(b, song, ['bass'], [0], 4).right, s.bass[0].length],
    },
    {
      id: 'moods', world: 1, title: 'Moods move', goal: 'Bars 2 to 4: same rhythm, new heights.',
      name: 'Roots', named: 'The bass starts each bar on its root, the note that bar is built on.',
      editor: { kind: 'notes', ladder: 'bass', res: 4 }, focus: ['bass'], bars: [1, 2, 3], holes: 'none', copy: true,
      partner: ['chords'], open: 1, scope: 'one',
      check: (b) => [1, 2, 3].every((bar) => notesIn('bass')(b, bar)),
      count: (b) => [[1, 2, 3].filter((bar) => notesIn('bass')(b, bar)).length, 3],
    },

    // ── Color: one block fills the bar ──
    {
      id: 'colors', world: 2, title: 'Paint the bars', goal: 'Give each bar the colour you hear.',
      name: 'Chords', named: 'Each colour is a chord, three notes at once. It lasts the whole bar: a whole note.',
      editor: { kind: 'chords' }, focus: ['chords'], bars: allBars, holes: 'bar1', copy: false,
      partner: ['bass'], open: 0, scope: 'one',
      check: (b) => b.chords.every(Boolean) && b.chords[0] === s.chords[0],
      count: (b) => [b.chords.filter(Boolean).length, BARS],
    },
    {
      id: 'yours-color', world: 2, title: 'Your colours', goal: 'Change a bar’s colour. Hear the mood move.',
      name: 'A new mood', named: 'Your colour has its own root, and the bass moved to it.',
      editor: { kind: 'chords' }, focus: ['chords'], bars: allBars, holes: 'none', copy: false,
      partner: ['bass'], open: 2, scope: 'one', listen: 'mine', noHint: true, yours: { takes: false, carries: ['bass'] },
      check: (b) => allBars.some((bar) => changedIn(song, b, 'chords', bar)),
    },

    // ── Voice: beats again, higher up ──
    {
      id: 'tune', world: 3, title: 'A tune', goal: 'Trace the marked Voice notes in bar 1.',
      name: 'A melody', named: 'A line of single notes you could hum is a melody, or a tune.',
      editor: { kind: 'notes', ladder: 'melody', res: 4 }, focus: ['melody'], bars: [0], holes: 'all', copy: false,
      partner: ['chords'], open: 0, scope: 'one',
      check: (b) => notesIn('melody')(b, 0),
      count: (b) => [compare(b, song, ['melody'], [0], 4).right, s.melody[0].length],
    },
    echo === undefined ? null : {
      id: 'echo', world: 3, title: 'Echo', goal: `Make bar ${echo + 1} sing bar 1 again.`,
      name: 'A motif', named: `Bar ${echo + 1} repeats bar 1. A short idea that comes back is a motif.`,
      editor: { kind: 'notes', ladder: 'melody', res: 4 }, focus: ['melody'], bars: [echo], holes: 'none', copy: true,
      partner: ['chords'], open: 0, scope: 'all', noHint: true,
      check: (b) => b.melody[0].length > 0 && JSON.stringify(b.melody[echo]) === JSON.stringify(b.melody[0]),
    },
    {
      id: 'land', world: 3, title: 'Answer it', goal: 'Find the other bars. End on the ring.',
      name: 'Coming home', named: 'Each bar answers the one before, and the last lands home: call and response.',
      editor: { kind: 'notes', ladder: 'melody', res: 4 }, focus: ['melody'], bars: others(echo ?? 0).filter((bar) => bar !== 0),
      holes: 'none', copy: true, partner: ['chords'], open: 1, scope: 'one',
      check: (b) => {
        const last = b.melody[BARS - 1].at(-1);
        return allBars.every((bar) => b.melody[bar].length > 0) && last?.row === HOME_ROW.melody;
      },
    },
    // The song asks in bars 1 and 3; the player answers in the others, over the song's own chords.
    {
      id: 'yours-voice', world: 3, title: 'Your answer', goal: 'Answer bar 1 your way. End on the ring.',
      name: 'A tune of your own', named: 'The song asks, you answer, and it still lands home.',
      editor: { kind: 'notes', ladder: 'melody', res: 4 }, focus: ['melody'], bars: answers, holes: 'none', copy: false,
      partner: ['chords'], open: answers[0], scope: 'one', listen: 'mine', noHint: true, yours: { takes: true, carries: [] },
      check: (b) => {
        const last = b.melody[BARS - 1].at(-1);
        return answers.some((bar) => changedIn(song, b, 'melody', bar)) && answers.every((bar) => b.melody[bar].length > 0) && last?.row === HOME_ROW.melody;
      },
    },

    // ── Story: the song, section by section ──
    {
      id: 'story', world: 4, title: 'The whole song', goal: 'Switch parts on and off in each section.',
      name: 'Arrangement', named: 'Which parts play where. Taking parts out and bringing them back tells a story.',
      editor: { kind: 'arr' }, focus: ['arr'], bars: allBars, holes: 'none', copy: false,
      partner: [], open: 0, scope: 'one',
      // The idea: take parts out where the song does. Most of them, and not many elsewhere.
      check: (b) => { const m = compare(b, song, ['arr'], allBars); return m.right >= Math.ceil(m.of * 0.6) && m.extra <= 1; },
    },
  ];
  return levels.filter((l): l is Level => l !== null);
}

/** The rows a part's world rebuilds, for the end of a world. */
export const rowsOf = (part: Part | 'arr'): Row[] => (part === 'drums' ? [...DRUMS] : [part]);
export { PARTS };
