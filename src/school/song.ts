import { LANE_ORDER, type Lane } from '../game/levels';
import { ROWS, isMood, type Ladder, type Mood } from './music';

/**
 * A song, and the player's rebuild of it, in one shape (`Build`). Everything is per bar: the loop is four bars, and
 * every bar has its own drums, bass, chord and tune, so changing one bar never changes another. Copying a bar is
 * an explicit move (`copyBar`), never a side effect.
 *
 * Time is counted in steps, sixteen to a bar. Drums are hits on steps. Bass and tune notes have a start and a length
 * (`Note`), so they can ring: a note four steps long is one beat, sixteen is the whole bar. A chord is one per bar.
 */

export { LANE_ORDER, type Lane };
export const STEPS = 16;
export const BARS = 4;
export const BEAT = 4;

export type Part = 'drums' | 'bass' | 'chords' | 'melody';
export const PARTS: readonly Part[] = ['drums', 'bass', 'chords', 'melody'];

/** One bar of drums: a hit (true) or not on each of the sixteen steps, per lane. */
export type DrumBar = Record<Lane, boolean[]>;
/** A bass or tune note inside one bar: it starts on step `at`, lasts `len` steps, at ladder height `row`. */
export interface Note { at: number; len: number; row: number }

export interface Section { id: string; name: string; bars: number }

export interface Build {
  drums: DrumBar[];
  bass: Note[][];
  /** One chord per bar; null where the player has not painted one yet. */
  chords: (Mood | null)[];
  melody: Note[][];
  /** Which parts play in each section of the whole song. */
  arr: Record<Part, boolean[]>;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  /** How far the in-between sixteenths lean late, 0–1. */
  swing: number;
  sections: readonly Section[];
  parts: Build;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const hits = (steps: readonly number[]) => range(STEPS).map((s) => steps.includes(s));

export function emptyDrumBar(): DrumBar {
  return { hat: hits([]), snare: hits([]), kick: hits([]) };
}

export function emptyBuild(sections: number): Build {
  return {
    drums: range(BARS).map(emptyDrumBar),
    bass: range(BARS).map(() => []),
    chords: range(BARS).map(() => null),
    melody: range(BARS).map(() => []),
    arr: Object.fromEntries(PARTS.map((p) => [p, range(sections).map(() => true)])) as Build['arr'],
  };
}

export const songBars = (song: Pick<Song, 'sections'>) => song.sections.reduce((n, s) => n + s.bars, 0);

/** The section a bar of the whole song belongs to, and the bar it starts on. */
export function sectionAt(song: Pick<Song, 'sections'>, bar: number): { index: number; start: number } {
  let start = 0;
  for (let i = 0; i < song.sections.length; i++) {
    if (bar < start + song.sections[i].bars) return { index: i, start };
    start += song.sections[i].bars;
  }
  return { index: song.sections.length - 1, start: start - song.sections[song.sections.length - 1].bars };
}
export const sectionStart = (song: Pick<Song, 'sections'>, index: number) =>
  song.sections.slice(0, index).reduce((n, s) => n + s.bars, 0);

// ── edits: each one changes exactly what it names, in exactly one bar ──

const setBar = <T>(xs: readonly T[], bar: number, x: T): T[] => xs.map((y, i) => (i === bar ? x : y));

/** Turn one step of one lane of one bar on or off. Nothing else changes. */
export function toggleHit(b: Build, bar: number, lane: Lane, step: number): Build {
  const row = b.drums[bar][lane].map((v, i) => (i === step ? !v : v));
  return { ...b, drums: setBar(b.drums, bar, { ...b.drums[bar], [lane]: row }) };
}

/** The longest a note starting at `at` can be: to the end of the bar, or to the next note on the same line. */
export function roomFor(notes: readonly Note[], at: number): number {
  const next = notes.filter((n) => n.at > at).reduce((m, n) => Math.min(m, n.at), STEPS);
  return next - at;
}

/** A line plays one note at a time, so a note starting under a longer earlier one cuts that one short. */
const sorted = (notes: Note[]) => notes.sort((a, b) => a.at - b.at);

/** Place a note. One starting on the same step is replaced; an earlier one still ringing there stops where it starts. */
export function placeNote(notes: readonly Note[], at: number, len: number, row: number): Note[] {
  const others = notes.filter((n) => n.at !== at).map((n) => (n.at < at && n.at + n.len > at ? { ...n, len: at - n.at } : n));
  return sorted([...others, { at, len: Math.max(1, Math.min(len, roomFor(others, at))), row }]);
}
export function resizeNote(notes: readonly Note[], at: number, len: number): Note[] {
  const room = roomFor(notes, at);
  return notes.map((n) => (n.at === at ? { ...n, len: Math.max(1, Math.min(len, room)) } : n));
}
export function moveNote(notes: readonly Note[], at: number, row: number): Note[] {
  return notes.map((n) => (n.at === at ? { ...n, row: Math.max(0, Math.min(ROWS - 1, row)) } : n));
}
export const removeNote = (notes: readonly Note[], at: number): Note[] => notes.filter((n) => n.at !== at);

export function editLine(b: Build, ladder: Ladder, bar: number, f: (notes: readonly Note[]) => Note[]): Build {
  return { ...b, [ladder]: setBar(b[ladder], bar, f(b[ladder][bar])) };
}
export const setChord = (b: Build, bar: number, mood: Mood | null): Build => ({ ...b, chords: setBar(b.chords, bar, mood) });

export function toggleSection(b: Build, part: Part, section: number): Build {
  return { ...b, arr: { ...b.arr, [part]: b.arr[part].map((v, i) => (i === section ? !v : v)) } };
}

/** Copy one part (or some drum lanes) of bar `from` onto bar `to`, replacing what was there. */
export function copyBar(b: Build, part: Part, from: number, to: number, lanes: readonly Lane[] = LANE_ORDER): Build {
  if (from === to) return b;
  if (part === 'drums') {
    const bar = { ...b.drums[to] };
    for (const l of lanes) bar[l] = [...b.drums[from][l]];
    return { ...b, drums: setBar(b.drums, to, bar) };
  }
  if (part === 'chords') return setChord(b, to, b.chords[from]);
  return { ...b, [part]: setBar(b[part], to, b[part][from].map((n) => ({ ...n }))) };
}

/** Empty one part (or some drum lanes) of one bar. */
export function clearBar(b: Build, part: Part, bar: number, lanes: readonly Lane[] = LANE_ORDER): Build {
  if (part === 'drums') {
    const d = { ...b.drums[bar] };
    for (const l of lanes) d[l] = hits([]);
    return { ...b, drums: setBar(b.drums, bar, d) };
  }
  if (part === 'chords') return setChord(b, bar, null);
  return { ...b, [part]: setBar(b[part], bar, []) };
}

// ── reading a saved build back ──

function sanitizeNotes(x: unknown): Note[] {
  if (!Array.isArray(x)) return [];
  let out: Note[] = [];
  for (const n of x) {
    if (!n || typeof n !== 'object') continue;
    const { at, len, row } = n as Note;
    if (![at, len, row].every(Number.isInteger) || at < 0 || at >= STEPS || len < 1 || row < 0 || row >= ROWS) continue;
    out = placeNote(out, at, len, row);
  }
  return out;
}

/** A build read from disk: anything missing or malformed falls back to an empty bar. */
export function sanitizeBuild(x: unknown, sections: number): Build {
  const fresh = emptyBuild(sections);
  if (!x || typeof x !== 'object') return fresh;
  const b = x as Partial<Build>;
  const perBar = <T>(src: unknown, f: (v: unknown, i: number) => T, empty: T[]): T[] =>
    Array.isArray(src) && src.length === BARS ? src.map(f) : empty;
  const drums = perBar(b.drums, (bar, i) => {
    const d = { ...fresh.drums[i] };
    for (const l of LANE_ORDER) {
      const row = (bar as Partial<DrumBar> | null)?.[l];
      if (Array.isArray(row) && row.length === STEPS) d[l] = row.map((v) => v === true);
    }
    return d;
  }, fresh.drums);
  const arr = { ...fresh.arr };
  for (const p of PARTS) {
    const a = b.arr?.[p];
    if (Array.isArray(a) && a.length === sections) arr[p] = a.map((v) => v === true);
  }
  return {
    drums,
    bass: perBar(b.bass, sanitizeNotes, fresh.bass),
    melody: perBar(b.melody, sanitizeNotes, fresh.melody),
    chords: perBar(b.chords, (m) => (isMood(m) ? m : null), fresh.chords),
    arr,
  };
}

// ── the first song ──

const note = (at: number, len: number, row: number): Note => ({ at, len, row });
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
const GROOVE: DrumBar = { kick: hits([0, 4, 8, 12]), snare: hits([4, 12]), hat: hits(EIGHTHS) };
/** Bar 4 leads back to bar 1: two quick cracks after the last one. */
const TURN: DrumBar = { ...GROOVE, snare: hits([4, 12, 14, 15]) };
const SECTIONS: readonly Section[] = [
  { id: 'intro', name: 'Intro', bars: 4 },
  { id: 'verse', name: 'Verse', bars: 8 },
  { id: 'break', name: 'Break', bars: 4 },
  { id: 'chorus', name: 'Chorus', bars: 8 },
  { id: 'outro', name: 'Outro', bars: 4 },
];
/** Ladder rows by note name (see LADDER in music.ts). */
const B = { C: 0, Eb: 1, F: 2, G: 3, Ab: 4, Bb: 5 };
const T = { G: 0, Bb: 1, C: 2, Eb: 3, F: 4 };

/**
 * Nadilo's first song, four bars long and played as a whole song of 28 bars. The drums: a kick on every beat, the
 * backbeat, ticks on every half beat, and a turn in bar 4. The bass holds each bar's root for two beats, plays it
 * again, then steps toward the next bar. Four chords, one per bar. The tune: a phrase, an answer, the phrase again,
 * and a landing on home.
 */
export const FIRST_SONG: Song = {
  id: 'first',
  title: 'First light',
  bpm: 88,
  swing: 0,
  sections: SECTIONS,
  parts: {
    drums: [GROOVE, GROOVE, GROOVE, TURN],
    bass: [
      [note(0, 8, B.C), note(8, 4, B.C), note(12, 4, B.G)],
      [note(0, 8, B.Ab), note(8, 4, B.Ab), note(12, 4, B.G)],
      [note(0, 8, B.Eb), note(8, 4, B.Eb), note(12, 4, B.F)],
      [note(0, 8, B.Bb), note(8, 4, B.Bb), note(12, 4, B.G)],
    ],
    chords: ['home', 'warm', 'bright', 'lift'],
    melody: [
      [note(0, 4, T.C), note(4, 8, T.Eb), note(12, 4, T.F)],
      [note(4, 4, T.Eb), note(8, 8, T.Bb)],
      [note(0, 4, T.C), note(4, 8, T.Eb), note(12, 4, T.F)],
      [note(4, 4, T.Eb), note(8, 8, T.C)],
    ],
    arr: {
      drums: [false, true, false, true, true],
      bass: [true, true, true, true, false],
      chords: [true, true, true, true, true],
      melody: [false, true, true, true, false],
    },
  },
};

/** Every song School can teach. A new song is data: the levels are made from it (src/school/levels.ts). */
export const SONGS: readonly Song[] = [FIRST_SONG];
export const songById = (id: string) => SONGS.find((s) => s.id === id) ?? FIRST_SONG;
