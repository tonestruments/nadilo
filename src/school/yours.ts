import { LANE_ORDER, type Lane } from '../game/levels';
import type { Level } from './levels';
import { isLane, type Row } from './match';
import { HOME_ROW, LADDER, MOODS, type Ladder, type Mood } from './music';
import { BARS, STEPS, type Build, type Note, type Part, type Song } from './song';

/**
 * Make it yours: the player's own song (`own`), and what in it is theirs. It starts as the song, note for note; whatever
 * then differs from the song is the player's, and is drawn in gold. Pure, like the rest of School's rules.
 */

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const hits = (steps: readonly number[]) => range(STEPS).map((s) => steps.includes(s));
const sameNote = (a: Note, b: Note) => a.at === b.at && a.len === b.len && a.row === b.row;

/** The player's own song before any change: the song itself. */
export const ownFrom = (song: Song): Build => clone(song.parts);

// ── gold: what differs from the song ──

/** A hit the player added (the song has none there). */
export const hitGold = (song: Song, b: Build, bar: number, lane: Lane, step: number) => b.drums[bar][lane][step] && !song.parts.drums[bar][lane][step];
/** A hit of the song's the player took out. */
export const hitGone = (song: Song, b: Build, bar: number, lane: Lane, step: number) => !b.drums[bar][lane][step] && song.parts.drums[bar][lane][step];
/** A note the song does not have in this bar. */
export const noteGold = (song: Song, ladder: Ladder, bar: number, n: Note) => !song.parts[ladder][bar].some((x) => sameNote(x, n));
/** The song's notes the player took out of this bar. */
export const notesGone = (song: Song, b: Build, ladder: Ladder, bar: number) =>
  song.parts[ladder][bar].filter((x) => !b[ladder][bar].some((y) => sameNote(x, y)));

/** One row of one bar differs from the song. */
export function rowChanged(song: Song, b: Build, row: Row, bar: number): boolean {
  if (isLane(row)) return b.drums[bar][row].some((v, s) => v !== song.parts.drums[bar][row][s]);
  if (row === 'chords') return b.chords[bar] !== song.parts.chords[bar];
  if (row === 'arr') return false;
  const mine = b[row][bar], theirs = song.parts[row][bar];
  return mine.length !== theirs.length || mine.some((n, i) => !sameNote(n, theirs[i]));
}
/** The rows that change with a part's change: a new colour moves the bass with it (see `followRoot`). */
export const rowsWith = (part: Part): Row[] => (part === 'chords' ? ['chords', 'bass'] : rowsOfPart(part));
/** The rows a part is made of: its three drum lanes, or itself. */
export const rowsOfPart = (part: Part): Row[] => (part === 'drums' ? [...LANE_ORDER] : [part]);
/** A part of one bar differs from the song. */
export const changedIn = (song: Song, b: Build, part: Part, bar: number) => rowsOfPart(part).some((r) => rowChanged(song, b, r, bar));
/** Anything in this bar differs from the song. */
export const barChanged = (song: Song, b: Build, bar: number) => (['drums', 'bass', 'chords', 'melody'] as Part[]).some((p) => changedIn(song, b, p, bar));
/** The rows that differ from the song anywhere: these play the player's own notes. */
export function rowsChanged(song: Song, b: Build): Set<Row> {
  const out = new Set<Row>();
  for (const r of [...LANE_ORDER, 'bass', 'chords', 'melody'] as Row[]) if (range(BARS).some((bar) => rowChanged(song, b, r, bar))) out.add(r);
  return out;
}

/** How many changes a level's bars hold: a hit or a note added or taken out, a chord. */
export function changes(song: Song, b: Build, level: Pick<Level, 'focus' | 'bars'>): number {
  let n = 0;
  for (const bar of level.bars) {
    for (const row of level.focus) {
      if (isLane(row)) n += b.drums[bar][row].filter((v, s) => v !== song.parts.drums[bar][row][s]).length;
      else if (row === 'chords') n += b.chords[bar] !== song.parts.chords[bar] ? 1 : 0;
      else if (row === 'bass' || row === 'melody') {
        n += b[row][bar].filter((x) => noteGold(song, row, bar, x)).length + notesGone(song, b, row, bar).length;
      }
    }
  }
  return n;
}

// ── moves only Make it yours has ──

/** The bass row of a chord's root, or -1 if the ladder has none. */
export const rootRow = (mood: Mood) => LADDER.bass.findIndex((m) => m % 12 === MOODS[mood].pcs[0]);

/**
 * A new colour takes the floor with it: the bass notes that sat on the old chord's root move to the new root, the
 * rhythm unchanged, so the change sounds right. Back to the song's colour, the bar's bass is the song's again.
 */
export function followRoot(song: Song, b: Build, bar: number, mood: Mood): Build {
  const bass = b.bass.map((ns, i) => {
    if (i !== bar) return ns;
    if (mood === song.parts.chords[bar]) return clone(song.parts.bass[bar]);
    const old = b.chords[bar];
    const from = old ? rootRow(old) : -1;
    const to = rootRow(mood);
    if (to < 0) return ns;
    return ns.map((n) => (n.row === from ? { ...n, row: to } : n));
  });
  return { ...b, chords: b.chords.map((m, i) => (i === bar ? mood : m)), bass };
}

/** Put a level's bars back to the song's: its part, and what that part carries. */
export function backToSong(song: Song, b: Build, level: Pick<Level, 'focus' | 'bars' | 'yours'>): Build {
  const out = clone(b);
  const rows = [...level.focus, ...(level.yours?.carries ?? [])];
  for (const bar of level.bars) {
    for (const row of rows) {
      if (isLane(row)) out.drums[bar][row] = [...song.parts.drums[bar][row]];
      else if (row === 'chords') out.chords[bar] = song.parts.chords[bar];
      else if (row === 'bass' || row === 'melody') out[row][bar] = clone(song.parts[row][bar]);
    }
  }
  return out;
}

// ── the sparring partner: three takes on the bar on screen, made from what is there now ──

export type Take = 'busier' | 'emptier' | 'surprise';
export const TAKES: readonly { id: Take; label: string }[] = [
  { id: 'busier', label: 'Busier' },
  { id: 'emptier', label: 'Emptier' },
  { id: 'surprise', label: 'Surprise' },
];

/** Fills Surprise goes through in turn, so a take is never random and can be heard again with Undo. */
const FILLS = [
  { snare: [4, 10, 13, 14, 15], kick: [0, 4, 8, 11] },
  { snare: [4, 12, 13], kick: [0, 4, 8, 10, 14] },
  { snare: [4, 9, 12, 15], kick: [0, 4, 6, 8, 14] },
  { snare: [4, 12, 14], kick: [0, 3, 8, 11, 15] },
];
/** Tune shapes for Surprise: [start, length] in steps, on the beat. */
const SHAPES = [[[0, 4], [4, 4], [8, 8]], [[4, 8], [12, 4]], [[0, 8], [8, 4], [12, 4]], [[0, 4], [8, 8]]];
const HEIGHT_MOVES = [[1, -1, 0], [0, 1, -1], [-1, 0, 1], [1, 1, -2]];

/** The last bar of the loop ends the song: a tune there lands home. */
function land(notes: Note[], bar: number): Note[] {
  if (bar !== BARS - 1 || notes.length === 0) return notes;
  const last = notes[notes.length - 1];
  return [...notes.slice(0, -1), { ...last, row: HOME_ROW.melody }];
}

/**
 * A take on one bar of the level's part. `n` counts the takes asked for in this visit, so Surprise moves on each time.
 * Returns the new build, or null where the level has no takes.
 */
export function takeOn(level: Level, b: Build, bar: number, take: Take, n: number): Build | null {
  const ed = level.editor;
  if (!level.yours?.takes || !level.bars.includes(bar)) return null;
  if (ed.kind === 'drums') {
    const d = { ...b.drums[bar] };
    if (take === 'busier') { d.hat = hits([0, 2, 4, 6, 8, 10, 12, 13, 14, 15]); d.snare = hits([4, 11, 12, 13, 14, 15]); }
    else if (take === 'emptier') { d.hat = hits([0, 4, 8, 12]); d.snare = hits([4]); d.kick = hits([0, 8]); }
    else { const f = FILLS[n % FILLS.length]; d.snare = hits(f.snare); d.kick = hits(f.kick); d.hat = hits([0, 2, 4, 6, 8, 10, 12]); }
    return { ...b, drums: b.drums.map((x, i) => (i === bar ? d : x)) };
  }
  if (ed.kind === 'notes') {
    const ns = b[ed.ladder][bar];
    let out: Note[];
    if (take === 'busier') {
      out = ns.flatMap((x) => (x.len >= 8 ? [{ ...x, len: 4 }, { at: x.at + 4, len: x.len - 4, row: Math.max(0, x.row - 1) }] : [x]));
      if (out.length === ns.length) out = ns.length ? [...ns.slice(0, -1), ...splitLast(ns[ns.length - 1])] : [{ at: 0, len: 4, row: HOME_ROW[ed.ladder] }];
    } else if (take === 'emptier') {
      out = [{ at: 4, len: 12, row: ns.length ? ns[0].row : HOME_ROW[ed.ladder] + 1 }];
    } else {
      const shape = SHAPES[n % SHAPES.length], moves = HEIGHT_MOVES[n % HEIGHT_MOVES.length];
      let row = ns.length ? ns[0].row : HOME_ROW[ed.ladder] + 1;
      out = shape.map(([at, len], i) => { row = Math.max(0, Math.min(5, row + moves[i % moves.length])); return { at, len, row }; });
    }
    if (ed.ladder === 'melody') out = land(out, bar);
    return { ...b, [ed.ladder]: b[ed.ladder].map((x, i) => (i === bar ? out : x)) };
  }
  return null;
}
/** A note of one beat cannot split into two on the beat grid: a busier take adds the next beat instead. */
function splitLast(n: Note): Note[] {
  if (n.len >= 8) return [{ ...n, len: 4 }, { at: n.at + 4, len: n.len - 4, row: Math.max(0, n.row - 1) }];
  return n.at + n.len + 4 <= STEPS ? [n, { at: n.at + n.len, len: 4, row: Math.min(5, n.row + 1) }] : [n];
}
