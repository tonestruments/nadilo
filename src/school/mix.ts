import { LANE_ORDER, type Lane } from '../game/levels';
import { KIT, MAX_LEAN, STACK_FLAM } from '../audio/schedule';
import type { Program, Sound } from '../audio/types';
import type { Level, Scope } from './levels';
import type { Row } from './match';
import { LADDER, voicing, type Ladder, type Mood } from './music';
import type { Listen } from './rules';
import { BARS, PARTS, STEPS, sectionAt, sectionStart, songBars, type Build, type Part, type Song } from './song';

/**
 * What School plays, step by step. Pure, so tests can listen without a sound card: the engine asks a program for
 * each step as it plays, and the program reads the live state, so an edit, a switch between The song and Yours, Up
 * close, a new bar on screen or Slow all land on the next step without a restart.
 */

/** Rows that sound: the drum lanes, the bass, the chords and the tune. */
export type Voiced = Lane | 'bass' | 'chords' | 'melody';
export const VOICED: readonly Voiced[] = [...LANE_ORDER, 'bass', 'chords', 'melody'];
/** Whose notes each row plays: the song's, the player's rebuild, the player's own song (Make it yours), or nothing. */
export type Source = 'song' | 'mine' | 'own';
export type Sources = Record<Voiced, Source | null>;
/** The player's two builds: the rebuild, and their own song (the song itself until they change it). */
export interface Builds { mine: Build; own?: Build }

/** Slow plays at three quarters of the tempo: slow enough to pick a line apart, still a groove. */
export const SLOW = 0.75;

/**
 * Who plays each row in a level. The rows this level rebuilds are the song's in The song, and the player's in Yours.
 * Rows rebuilt in earlier levels are the player's. Rows not reached yet are the song's: heard, never drawn. Up close
 * keeps only this level's rows and their partner, in either.
 *
 * Rows the player has made their own (`yours`: they differ from the song in their own song) play their own notes. In
 * Make it yours, this level's rows are the song's in The song and the player's own in Yours, so the A and the B differ
 * by exactly what the player changed.
 */
export function sourcesFor(level: Level, owned: ReadonlySet<Row>, listen: Listen, close = false, yours: ReadonlySet<Row> = new Set()): Sources {
  const out = {} as Sources;
  const arr = level.focus.includes('arr');
  const rows = [...level.focus, ...(level.yours?.carries ?? [])];
  const theirs: Source = level.yours ? 'own' : 'mine';
  for (const r of VOICED) {
    const focus = rows.includes(r);
    let src: Source | null = focus ? (listen === 'mine' ? theirs : 'song') : yours.has(r) ? 'own' : owned.has(r) || arr ? 'mine' : 'song';
    if (close && !focus && !level.partner.includes(r)) src = null;
    out[r] = src;
  }
  return out;
}

/**
 * The whole song as the player has it so far: their own notes where they changed the song, their rebuild where they
 * have rebuilt it, the song's everywhere else.
 */
export function sourcesOwned(owned: ReadonlySet<Row>, yours: ReadonlySet<Row> = new Set()): Sources {
  return Object.fromEntries(VOICED.map((r) => [r, yours.has(r) ? 'own' : owned.has(r) ? 'mine' : 'song'])) as Sources;
}
/** Only the song's own notes: the reference, as it was first heard. */
export const sourcesSong = (): Sources => Object.fromEntries(VOICED.map((r) => [r, 'song'])) as Sources;
/** Only the player's own song: the song with the changes they made their own. */
export const sourcesOwn = (): Sources => Object.fromEntries(VOICED.map((r) => [r, 'own'])) as Sources;

/** The sounds on one step of one bar of the loop. `on` says which parts the arrangement lets play (all, in a loop). */
export function soundsAt(song: Song, b: Builds, src: Sources, bar: number, step: number, stepSec: number, on: (p: Part) => boolean = () => true): Sound[] {
  const pick = picker(song, b, src);
  const out: Sound[] = [];
  if (on('drums')) {
    const kick = pick('kick')?.drums[bar].kick[step] ?? false;
    for (const lane of LANE_ORDER) {
      if (!pick(lane)?.drums[bar][lane][step]) continue;
      out.push({ voice: lane, sample: lane, vel: 1, delay: lane === 'snare' && kick ? STACK_FLAM : KIT[lane].offset });
    }
  }
  if (step === 0 && on('chords')) {
    const mood = pick('chords')?.chords[bar];
    if (mood) out.push(...chord(mood, STEPS * stepSec));
  }
  for (const ladder of ['bass', 'melody'] as const) {
    if (!on(ladder)) continue;
    const n = pick(ladder)?.[ladder][bar].find((x) => x.at === step);
    if (n) out.push(line(ladder, n.row, n.len * stepSec));
  }
  return out;
}

/** What is still ringing at `step` of a bar from notes that started before it: picked up whole after a seek. */
export function ringingAt(song: Song, b: Builds, src: Sources, bar: number, step: number, stepSec: number, on: (p: Part) => boolean = () => true): Sound[] {
  if (step === 0) return [];
  const pick = picker(song, b, src);
  const out: Sound[] = [];
  const left = (STEPS - step) * stepSec;
  const mood = on('chords') ? pick('chords')?.chords[bar] : null;
  if (mood && left > 0.1) out.push(...chord(mood, left));
  for (const ladder of ['bass', 'melody'] as const) {
    if (!on(ladder)) continue;
    const n = pick(ladder)?.[ladder][bar].find((x) => x.at < step && x.at + x.len > step);
    if (n && (n.at + n.len - step) * stepSec > 0.1) out.push(line(ladder, n.row, (n.at + n.len - step) * stepSec));
  }
  return out;
}

/** The build each row reads from. */
function picker(song: Song, b: Builds, src: Sources) {
  return (r: Voiced): Build | null => {
    const s = src[r];
    return s === 'song' ? song.parts : s === 'mine' ? b.mine : s === 'own' ? b.own ?? song.parts : null;
  };
}

/** A chord: a soft strum, lowest string first, over a pad that holds. */
export function chord(mood: Mood, hold: number): Sound[] {
  return voicing(mood).flatMap((midi, i) => [
    { voice: 'keys' as const, sample: 'keys' as const, vel: 1, midi, delay: i * 0.014, hold: hold - 0.04 },
    { voice: 'pad' as const, sample: 'pad' as const, vel: 1, midi, hold },
  ]);
}
/** A bass or tune note held for `hold` seconds. */
export function line(ladder: Ladder, row: number, hold: number): Sound {
  return ladder === 'bass'
    ? { voice: 'bass', sample: 'bass', vel: 1, midi: LADDER.bass[row], hold: hold - 0.02 }
    : { voice: 'lead', sample: 'kalimba', vel: 1, midi: LADDER.melody[row], hold: hold - 0.02 };
}
export const hit = (lane: Lane): Sound[] => [{ voice: lane, sample: lane, vel: 1 }];

/** Everything a level's loop reads, live. */
export interface LoopView {
  song: Song;
  mine: Build;
  /** The player's own song (the song itself if not given). */
  own?: Build;
  level: Level;
  owned: ReadonlySet<Row>;
  /** Rows of the player's own song that differ from the song: they play the player's own notes. */
  yours?: ReadonlySet<Row>;
  listen: Listen;
  close: boolean;
  scope: Scope;
  /** The bar (or section) on screen. */
  unit: number;
  slow: boolean;
}

export const tempo = (song: Song, slow: boolean) => (slow ? Math.round(song.bpm * SLOW) : song.bpm);

/** The bar of the whole song that step `pos` of a level's loop plays. */
export function loopBar(v: Pick<LoopView, 'song' | 'level' | 'scope' | 'unit'>, pos: number): number {
  const n = Math.floor(pos / STEPS);
  if (v.level.editor.kind !== 'arr') return v.scope === 'one' ? v.unit : n % BARS;
  if (v.scope === 'all') return n;
  const sec = v.song.sections[v.unit];
  return sectionStart(v.song, v.unit) + (n % sec.bars);
}

/**
 * A level's loop. Bars levels loop the four bars, or the bar on screen; the Story world loops the whole song, or the
 * section on screen, in its arrangement: the song's in The song, the player's in Yours.
 */
export function loopProgram(view: () => LoopView): Program {
  const v0 = view();
  const steps = v0.level.editor.kind === 'arr' ? songBars(v0.song) * STEPS : BARS * STEPS;
  return {
    steps,
    loops: 0,
    bpm: () => { const v = view(); return tempo(v.song, v.slow); },
    lean: () => view().song.swing * MAX_LEAN,
    at: (pos, stepSec) => {
      const v = view();
      const bar = loopBar(v, pos);
      const arrange = v.level.editor.kind === 'arr';
      // The Story world has no Up close: its part is the arrangement itself.
      const src = sourcesFor(v.level, v.owned, v.listen, v.close && !arrange, v.yours);
      const b = { mine: v.mine, own: v.own };
      if (!arrange) return soundsAt(v.song, b, src, bar, pos % STEPS, stepSec);
      const arr = (v.listen === 'mine' ? v.mine : v.song.parts).arr;
      const section = sectionAt(v.song, bar).index;
      const on = (p: Part) => arr[p][section];
      return soundsAt(v.song, b, src, bar % BARS, pos % STEPS, stepSec, on);
    },
  };
}

export interface SongView {
  song: Song;
  mine: Build;
  own?: Build;
  src: Sources;
  /** Play the player's arrangement instead of the song's. */
  ownArr: boolean;
}

/** The whole song, once, in its arrangement. It can start anywhere (a resume, a seek). */
export function songProgram(view: () => SongView): Program {
  const v0 = view();
  const at = (pos: number, stepSec: number, ring: boolean) => {
    const v = view();
    const bar = Math.floor(pos / STEPS);
    const section = sectionAt(v.song, bar).index;
    const arr = (v.ownArr ? v.mine : v.song.parts).arr;
    const on = (p: Part) => arr[p][section];
    return (ring ? ringingAt : soundsAt)(v.song, { mine: v.mine, own: v.own }, v.src, bar % BARS, pos % STEPS, stepSec, on);
  };
  return {
    steps: songBars(v0.song) * STEPS,
    loops: 1,
    bpm: () => view().song.bpm,
    lean: () => view().song.swing * MAX_LEAN,
    at: (pos, stepSec) => at(pos, stepSec, false),
    resume: (pos, stepSec) => at(pos, stepSec, true),
  };
}

export interface BarView {
  song: Song;
  mine: Build;
  own: Build;
  src: Sources;
  /** The bar of the four-bar loop. */
  bar: number;
}

/** One bar of the player's song, looped: what a cell on the song's screen plays. Every part plays, as in the song. */
export function barProgram(view: () => BarView): Program {
  return {
    steps: STEPS,
    loops: 0,
    bpm: () => view().song.bpm,
    lean: () => view().song.swing * MAX_LEAN,
    at: (pos, stepSec) => { const v = view(); return soundsAt(v.song, { mine: v.mine, own: v.own }, v.src, v.bar, pos % STEPS, stepSec); },
  };
}

export { PARTS };
