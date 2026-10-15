import type { Lane } from '../game/levels';
import { curriculum, WORLDS, type Level, type Scope } from './levels';
import { compare, exact, isLane, marks, partOf, starsFor, type Row } from './match';
import type { Mood } from './music';
import {
  BARS, STEPS, clearBar, copyBar, editLine, emptyBuild, moveNote, placeNote, removeNote, resizeNote, sanitizeBuild,
  setChord, songById, toggleHit, toggleSection, type Build, type Part, type Song,
} from './song';
import { isDay, twistById, twistLevel, twistOn, type TwistDef } from './twists';
import { backToSong, followRoot, ownFrom, takeOn, type Take } from './yours';

/**
 * School's rules, as pure functions: what a press does, what a level shows, how close it is, which levels are open.
 * The statechart wires events to these and to the engine; it decides nothing about music itself.
 */

/** What is saved: the song being rebuilt, the player's build of it, and how far they are. */
export interface SchoolSaved {
  song: string;
  build: Build;
  /** The open level, by index. */
  level: number;
  /** Levels done, by id. */
  done: string[];
  /** Best stars, by level id. They never go down. */
  stars: Record<string, number>;
  /** The song has been met (its screen shown once). */
  met: boolean;
  /**
   * The player's own song: the song, note for note, with whatever they changed in Make it yours and the daily twists.
   * Kept apart from `build` (the rebuild), so a rebuild's near misses never count as the player's own.
   */
  own: Build;
  /** Today's twist once started: the day, which twist, and the player's song when it started (what it is checked against). */
  today: Today | null;
  /** Twists done, oldest first: the sampler. One a day at most. */
  sewn: Sewn[];
}
export interface Today { on: string; id: string; from: Build }
export interface Sewn { on: string; id: string }

/** What a cell of the player's song is on its own screen: one part of one bar of the loop. */
export interface Cell { part: Part; bar: number }

/**
 * Whose version the player is listening to while they work, an A and a B heard at the same moment of the bar:
 * - `song`: the song, with every part the player has rebuilt in place of the song's own;
 * - `mine`: the song with a hole where this part was, filled by the player's notes.
 * Either can be heard Up close (`Room.close`): this level's part with the one part it talks to. The song's part is
 * never heard on its own: that would hand over the answer. The player's own part can be, since it is theirs.
 */
export type Listen = 'song' | 'mine';

/** One visit to a level. Not saved: opening a level starts a fresh visit on its own bar. */
export interface Room {
  /** The bar on screen (the section, in the Story world). */
  bar: number;
  listen: Listen;
  /** Up close: only this level's part and its partner. */
  close: boolean;
  scope: Scope;
  slow: boolean;
  hint: boolean;
  /** Builds before each edit of this visit, for Undo. */
  history: Build[];
  /** The song has been heard in this level. Until then, The song asks to be pressed. */
  heard: boolean;
  /** This visit is today's twist, not a level of the journey. */
  twist: boolean;
  /** Takes asked for in this visit: Surprise moves on each time. */
  takes: number;
  /** On the player's song's screen: the part and bar looping, or picked last. */
  cell: Cell | null;
}

const cache = new Map<string, Level[]>();
export function levelsOf(song: Song): Level[] {
  if (!cache.has(song.id)) cache.set(song.id, curriculum(song));
  return cache.get(song.id)!;
}
export const songOf = (s: Pick<SchoolSaved, 'song'>) => songById(s.song);
export const levelsFor = (s: Pick<SchoolSaved, 'song'>) => levelsOf(songOf(s));
export const clampLevel = (s: Pick<SchoolSaved, 'song'>, i: number) => Math.max(0, Math.min(levelsFor(s).length - 1, Math.round(i) || 0));
export const levelOf = (s: Pick<SchoolSaved, 'song' | 'level'>) => levelsFor(s)[clampLevel(s, s.level)];

export function freshSchool(songId = 'first'): SchoolSaved {
  const song = songById(songId);
  return {
    song: song.id, build: emptyBuild(song.sections.length), level: 0, done: [], stars: {}, met: false,
    own: ownFrom(song), today: null, sewn: [],
  };
}

export function freshRoom(level: Level, twist = false): Room {
  return {
    bar: level.open, listen: level.listen ?? 'song', close: false, scope: level.scope, slow: false, hint: false, history: [],
    heard: false, twist, takes: 0, cell: null,
  };
}

/**
 * A level is open once every rebuilding level before it is done. Make it yours never stands in the way: it is the
 * next step after each world, but a player can go on rebuilding without it (and saves from before it existed keep
 * every level they had open).
 */
export function unlocked(s: Pick<SchoolSaved, 'song' | 'done'>, i: number): boolean {
  return levelsFor(s).slice(0, i).every((l) => l.yours || s.done.includes(l.id));
}
/** The first level not done yet from `from` on, then from the start (or the last one, when all are done). */
export function nextOpen(s: Pick<SchoolSaved, 'song' | 'done'>, from = 0): number {
  const ls = levelsFor(s);
  const open = (l: Level) => !s.done.includes(l.id);
  const i = ls.findIndex((l, k) => k >= from && open(l));
  const j = i === -1 ? ls.findIndex(open) : i;
  return j === -1 ? ls.length - 1 : j;
}
/** The whole song is rebuilt: every rebuilding level is done (Make it yours is not needed for that). */
export const allDone = (s: Pick<SchoolSaved, 'song' | 'done'>) => levelsFor(s).every((l) => l.yours || s.done.includes(l.id));
/** A world is rebuilt: every rebuilding level in it is done. */
export const worldRebuilt = (s: Pick<SchoolSaved, 'song' | 'done'>, world: number) =>
  levelsFor(s).filter((l) => l.world === world && !l.yours).every((l) => s.done.includes(l.id));
/** The player has made something their own: a Make it yours level is done. From then on, there is a twist each day. */
export const madeYours = (s: Pick<SchoolSaved, 'song' | 'done'>) => levelsFor(s).some((l) => l.yours && s.done.includes(l.id));
/** The last level of its world: finishing it ends the world, and the whole song plays with the player's part in it. */
export const endsWorld = (s: Pick<SchoolSaved, 'song'>, i: number) => {
  const ls = levelsFor(s);
  return i === ls.length - 1 || ls[i + 1].world !== ls[i].world;
};

/** Rows the player has rebuilt in levels already done: these are theirs, and play in place of the song's. */
export function ownedRows(s: Pick<SchoolSaved, 'song' | 'done'>): Set<Row> {
  return new Set(levelsFor(s).filter((l) => s.done.includes(l.id)).flatMap((l) => l.focus));
}

// ── the twist of the day ──

/** Today's twist: the one started today, or the one the day offers. Null before anything is the player's own. */
export function twistToday(s: SchoolSaved, on: string): TwistDef | null {
  if (!madeYours(s)) return null;
  if (s.today?.on === on) return twistById(s.today.id) ?? null;
  const worlds = new Set(WORLDS.map((_, i) => i).filter((i) => worldRebuilt(s, i)));
  return twistOn(on, worlds, s.own, new Set(s.sewn.map((x) => x.id)));
}
export const sewnOn = (s: Pick<SchoolSaved, 'sewn'>, on: string) => s.sewn.some((x) => x.on === on);

/** Start (or pick up) today's twist: the song as it is now is what it will be checked against. */
export function startTwist(s: SchoolSaved, on: string): SchoolSaved {
  if (s.today?.on === on) return s;
  const t = twistToday(s, on);
  return t ? { ...s, today: { on, id: t.id, from: s.own } } : s;
}

const twistCache = new WeakMap<Build, Map<string, Level>>();
/** Today's twist as a level, the same object for the same twist, so what reads it does not redraw for nothing. */
export function todayLevel(s: Pick<SchoolSaved, 'song' | 'today'>): Level | null {
  const t = s.today && twistById(s.today.id);
  if (!s.today || !t) return null;
  let byId = twistCache.get(s.today.from);
  if (!byId) { byId = new Map(); twistCache.set(s.today.from, byId); }
  if (!byId.has(t.id)) byId.set(t.id, twistLevel(t, songOf(s), s.today.from));
  return byId.get(t.id)!;
}

/** The level on screen: today's twist during one, otherwise the open level of the journey. */
export function activeLevel(ctx: { school: SchoolSaved; room: Pick<Room, 'twist'> }): Level {
  return (ctx.room.twist && todayLevel(ctx.school)) || levelOf(ctx.school);
}
/** Which build a level works on: the player's own song in Make it yours, the rebuild everywhere else. */
export const buildKey = (level: Level): 'own' | 'build' => (level.yours ? 'own' : 'build');
export const buildFor = (s: SchoolSaved, level: Level): Build => s[buildKey(level)];
/** The level on screen is done: its id is in `done`, or, for a twist, the twist's day is sewn. */
export function activeDone(ctx: { school: SchoolSaved; room: Pick<Room, 'twist'> }): boolean {
  if (ctx.room.twist) return !!ctx.school.today && sewnOn(ctx.school, ctx.school.today.on);
  return ctx.school.done.includes(levelOf(ctx.school).id);
}

/** The bars (or sections) a level's instrument has. */
export const unitsOf = (level: Level, song: Song) => (level.editor.kind === 'arr' ? song.sections.length : BARS);
/** The bar (or section) the arrows move to: the next one the level opens, that way, or null at the end. */
export function stepBar(level: Level, song: Song, bar: number, dir: -1 | 1): number | null {
  const units = unitsOf(level, song);
  for (let b = bar + dir; b >= 0 && b < units; b += dir) if (!level.yours || level.bars.includes(b)) return b;
  return null;
}

export function sanitizeSchool(x: unknown): SchoolSaved {
  const raw = (x && typeof x === 'object' ? x : {}) as Partial<SchoolSaved>;
  const song = songById(typeof raw.song === 'string' ? raw.song : 'first');
  const ids = new Set(levelsOf(song).map((l) => l.id));
  const stars: Record<string, number> = {};
  if (raw.stars && typeof raw.stars === 'object') {
    for (const [id, n] of Object.entries(raw.stars)) if (ids.has(id) && Number.isInteger(n)) stars[id] = Math.max(0, Math.min(3, n));
  }
  const sections = song.sections.length;
  const today = raw.today && typeof raw.today === 'object' ? raw.today as Partial<Today> : null;
  const s: SchoolSaved = {
    song: song.id,
    build: sanitizeBuild(raw.build, sections),
    level: 0,
    done: Array.isArray(raw.done) ? [...new Set(raw.done.filter((d): d is string => typeof d === 'string' && ids.has(d)))] : [],
    stars,
    met: raw.met === true,
    own: raw.own ? sanitizeBuild(raw.own, sections) : ownFrom(song),
    today: today && isDay(today.on) && typeof today.id === 'string' && twistById(today.id) && today.from
      ? { on: today.on, id: today.id, from: sanitizeBuild(today.from, sections) } : null,
    sewn: Array.isArray(raw.sewn)
      ? raw.sewn.filter((x): x is Sewn => !!x && typeof x === 'object' && isDay((x as Sewn).on) && typeof (x as Sewn).id === 'string')
        .filter((x, i, xs) => xs.findIndex((y) => y.on === x.on) === i).map((x) => ({ on: x.on, id: x.id }))
      : [],
  };
  return { ...s, level: levelFromSaved(s, raw as SavedSchool) };
}

/**
 * How the open level is saved. `level` stays what Nadilo 0.4.1 and earlier read: an index into the rebuilding levels
 * only (a Make it yours level saves the level before it). `levelId` names the exact level, for this build and later.
 */
export interface SavedSchool extends SchoolSaved { levelId?: string }
const rebuilding = (s: Pick<SchoolSaved, 'song'>) => levelsFor(s).filter((l) => !l.yours);

function levelFromSaved(s: SchoolSaved, raw: Partial<SavedSchool>): number {
  const ls = levelsFor(s);
  const byId = typeof raw.levelId === 'string' ? ls.findIndex((l) => l.id === raw.levelId) : -1;
  if (byId >= 0) return byId;
  const old = rebuilding(s);
  const l = old[Math.max(0, Math.min(old.length - 1, Math.round(Number(raw.level)) || 0))];
  return Math.max(0, ls.indexOf(l));
}

export function savedSchool(s: SchoolSaved): SavedSchool {
  const ls = levelsFor(s);
  const i = clampLevel(s, s.level);
  const legacy = Math.max(0, ls.slice(0, i + 1).filter((l) => !l.yours).length - 1);
  return { ...s, level: legacy, levelId: ls[i].id };
}

// ── how close ──

const resOf = (level: Level) => (level.editor.kind === 'drums' || level.editor.kind === 'notes' ? level.editor.res : STEPS);
export const matchOf = (level: Level, song: Song, b: Build) => compare(b, song, level.focus, level.bars, resOf(level));
export const starsNow = (level: Level, song: Song, b: Build) => starsFor(level.check(b), matchOf(level, song, b));

/**
 * A bar of the level that is exactly the song, for this level's part: it is sewn shut. A chord is one of six, so a
 * tick on it would let the player find it by trying them all; chords show theirs once the level is done.
 */
export function barSewn(level: Level, song: Song, b: Build, bar: number, done = false): boolean {
  if (level.yours) return false;
  if (level.editor.kind === 'arr' || !level.bars.includes(bar)) return false;
  if (level.editor.kind === 'chords' && !done) return false;
  return exact(compare(b, song, level.focus, [bar], resOf(level)));
}

/**
 * Where the song's notes go on the bar on screen, that the player does not have yet: drawn as marks to trace.
 * Traced levels mark all of them, or the first bar, or the first beat; levels by ear mark nothing until Hint.
 */
export function holesIn(level: Level, song: Song, b: Build, bar: number, hint: boolean): Set<string> {
  const out = new Set<string>();
  if (level.yours) return out;
  if (level.editor.kind === 'arr') {
    // Hint marks, in the section on screen, every part whose switch differs from the song's.
    if (!hint) return out;
    const want = marks(song.parts, ['arr'], []), have = marks(b, ['arr'], []);
    for (const p of ['drums', 'bass', 'chords', 'melody']) {
      const m = `arr:${p}:${bar}`;
      if (want.has(m) !== have.has(m)) out.add(m);
    }
    return out;
  }
  const by = level.holes;
  const show = hint || by === 'all' || ((by === 'bar1' || by === 'beat1') && bar === 0);
  if (!show || (!hint && !level.bars.includes(bar) && by === 'all')) return out;
  const have = marks(b, level.focus, [bar], resOf(level));
  for (const m of marks(song.parts, level.focus, [bar], resOf(level))) {
    if (have.has(m)) continue;
    if (!hint && by === 'beat1' && Number(m.split(':')[2]) >= STEPS / 4) continue;
    out.add(m);
  }
  return out;
}

// ── edits: each returns the new build, or null where this level does not allow it ──

export type Edit =
  | { kind: 'hit'; bar: number; lane: Lane; step: number }
  | { kind: 'place'; bar: number; at: number; row: number; len: number }
  | { kind: 'resize'; bar: number; at: number; len: number }
  | { kind: 'move'; bar: number; at: number; row: number }
  | { kind: 'remove'; bar: number; at: number }
  | { kind: 'chord'; bar: number; mood: Mood }
  | { kind: 'section'; part: Part; section: number }
  | { kind: 'copy'; from: number; to: number | 'all' }
  | { kind: 'clear'; bar: number }
  /** Make it yours: the level's bars back to the song's. */
  | { kind: 'reset' }
  /** Make it yours: one of the sparring partner's takes on a bar. `n`: takes asked for so far in this visit. */
  | { kind: 'take'; bar: number; take: Take; n: number };

const inBar = (bar: number) => Number.isInteger(bar) && bar >= 0 && bar < BARS;

/** The part a level's instrument edits, and for drums which lanes. */
function partEdited(level: Level): { part: Part; lanes?: readonly Lane[] } | null {
  const e = level.editor;
  if (e.kind === 'drums') return { part: 'drums', lanes: e.lanes };
  if (e.kind === 'notes') return { part: e.ladder };
  if (e.kind === 'chords') return { part: 'chords' };
  return null;
}

/**
 * An edit, in a level. In Make it yours (`song` given), it may only touch the level's bars, a new colour takes the bass
 * to its root, and the level can go back to the song's or take a take.
 */
export function applyEdit(level: Level, b: Build, e: Edit, song?: Song): Build | null {
  const ed = level.editor;
  if (level.yours) {
    if (!song) return null;
    if ('bar' in e && !level.bars.includes(e.bar)) return null;
    if (e.kind === 'copy' || e.kind === 'clear' || e.kind === 'section') return null;
    if (e.kind === 'reset') return backToSong(song, b, level);
    if (e.kind === 'take') return takeOn(level, b, e.bar, e.take, e.n);
    if (e.kind === 'chord') return ed.kind === 'chords' ? followRoot(song, b, e.bar, e.mood) : null;
  }
  switch (e.kind) {
    case 'reset':
    case 'take':
      return null;
    case 'hit':
      if (ed.kind !== 'drums' || !inBar(e.bar) || !ed.lanes.includes(e.lane) || e.step % (STEPS / ed.res) !== 0 || e.step < 0 || e.step >= STEPS) return null;
      return toggleHit(b, e.bar, e.lane, e.step);
    case 'place': {
      if (ed.kind !== 'notes' || !inBar(e.bar)) return null;
      const grid = STEPS / ed.res;
      if (e.at % grid !== 0 || e.at < 0 || e.at >= STEPS) return null;
      return editLine(b, ed.ladder, e.bar, (ns) => placeNote(ns, e.at, Math.max(grid, Math.round(e.len / grid) * grid), e.row));
    }
    case 'resize': {
      if (ed.kind !== 'notes' || !inBar(e.bar) || !b[ed.ladder][e.bar].some((n) => n.at === e.at)) return null;
      const grid = STEPS / ed.res;
      return editLine(b, ed.ladder, e.bar, (ns) => resizeNote(ns, e.at, Math.max(grid, Math.round(e.len / grid) * grid)));
    }
    case 'move':
      if (ed.kind !== 'notes' || !inBar(e.bar) || !b[ed.ladder][e.bar].some((n) => n.at === e.at)) return null;
      return editLine(b, ed.ladder, e.bar, (ns) => moveNote(ns, e.at, e.row));
    case 'remove':
      if (ed.kind !== 'notes' || !inBar(e.bar) || !b[ed.ladder][e.bar].some((n) => n.at === e.at)) return null;
      return editLine(b, ed.ladder, e.bar, (ns) => removeNote(ns, e.at));
    case 'chord':
      if (ed.kind !== 'chords' || !inBar(e.bar)) return null;
      return setChord(b, e.bar, e.mood);
    case 'section':
      if (ed.kind !== 'arr' || e.section < 0 || e.section >= b.arr[e.part].length) return null;
      return toggleSection(b, e.part, e.section);
    case 'copy': {
      const p = partEdited(level);
      if (!level.copy || !p || !inBar(e.from)) return null;
      const to = e.to === 'all' ? Array.from({ length: BARS }, (_, i) => i).filter((i) => i !== e.from) : [e.to];
      if (!to.every(inBar) || to.includes(e.from)) return null;
      return to.reduce((acc, t) => copyBar(acc, p.part, e.from, t, p.lanes), b);
    }
    case 'clear': {
      const p = partEdited(level);
      if (!p || !inBar(e.bar)) return null;
      return clearBar(b, p.part, e.bar, p.lanes);
    }
  }
}

/** True when an edit changed nothing (a copy onto an identical bar, a clear of an empty one). */
export const same = (a: Build, b: Build) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The part on screen has anything in this bar to clear. */
export function barHasNotes(level: Level, b: Build, bar: number): boolean {
  const p = partEdited(level);
  if (!p) return false;
  if (p.part === 'drums') return (p.lanes ?? []).some((l) => b.drums[bar][l].some(Boolean));
  if (p.part === 'chords') return b.chords[bar] !== null;
  return b[p.part][bar].length > 0;
}

export { isLane, partOf };
