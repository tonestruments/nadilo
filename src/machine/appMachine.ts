// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { assign, raise, setup, type SnapshotFrom } from 'xstate';
import type { AudioEngine, Mode, Sound } from '../audio/types';
import { clampOffset } from '../audio/calibration';
import { stepSeconds } from '../audio/schedule';
import { haptic } from '../lib/haptics';
import { LEVELS, type Lane } from '../game/levels';
import { allSolved, clampLevel, continueIndex, nextIndex } from '../game/progress';
import {
  checkBeat, emptyPlaced, givenOf, laneFullyGiven, minePattern, placedCount, soloPattern, targetPattern, toPattern, wrongLanes,
  type CheckResult, type Pattern, type Placed,
} from '../game/logic';
import {
  barProgram, chord, hit, line, loopProgram, partProgram, partSpan, songProgram, sourcesOwn, sourcesOwned, sourcesSong, tempo, type BarView, type LoopView, type SongView,
} from '../school/mix';
import { type Ladder, type Mood } from '../school/music';
import {
  activeDone, activeLevel, allDone, applyEdit, buildKey, clampLevel as clampSchoolLevel, endsWorld, freshRoom, freshSchool,
  levelOf as schoolLevel, levelsFor, madeYours, nextOpen, ownedRows, same, songOf, starsNow, startTwist, todayLevel, twistToday,
  unitsOf, unlocked, type Cell, type Edit, type Listen, type Room, type SchoolSaved,
} from '../school/rules';
import type { Level, Scope } from '../school/levels';
import { STEPS, songBars, type Build } from '../school/song';
import { rowsChanged, rowsWith, type Take } from '../school/yours';
import { transportLogic, type TransportEvent } from './transport';

/*
 * The whole app as one statechart.
 *
 *   boot ─┬→ onboarding: welcome → soundCheck → sync ──→ game.school (the song, then level 1)
 *         └→ game.home (returning players)
 *
 *   game.home: the dashboard. Nadilo School first; the ear-training levels below it.
 *   game.school: Nadilo School. Hear a song, then rebuild it, part by part and bar by bar.
 *     enter → meet (the song, once) → level ⇄ worldEnd (the whole song again, with the player's part in it)
 *   game.level: the ear-training game. Rebuild a hidden beat by ear.
 *     unsolved: ready → building ⇄ checked        (editing, listening and checking live here)
 *     revealed: solved (reward → review) | answer (only "play the beat" lives here)
 *   game.sync: the calibration screen, opened from the title bar; returns to exactly where the player was.
 *
 * Rules that used to be scattered through handlers are now structural:
 * - In the ear game, solving stops playback and celebrates silently (stamp, confetti, trackpad haptic), once.
 *   Nothing starts a beat on its own; only REPLAY, the "Listen for it" button, does.
 * - In School, a level is done the moment its goal is met; the music keeps playing, and the level's real name
 *   appears in place. Nothing covers the instrument.
 * - Only one thing plays at a time: every play goes through the one engine, and `playing` names it.
 * - School's rules (what a press does, what is marked, the stars) are pure functions in src/school/.
 */

/** How a level was first solved. */
export interface LevelRecord {
  /** Checks it took. */
  checks: number;
  /** The day, as YYYY-MM-DD. */
  on: string;
  /** The answer had been shown before it was solved. */
  peeked?: boolean;
}

export interface Persisted {
  onboarded: boolean;
  cues: boolean;
  solved: number[];
  levelIdx: number;
  syncOffsetMs: number;
  /** By level id. */
  records: Record<number, LevelRecord>;
  school: SchoolSaved;
  /**
   * School as Nadilo 0.3.x saved it, kept exactly as it was read: that build can still be opened and still finds
   * its own School. This build never reads it.
   */
  legacySchool?: unknown;
}

export interface AppContext extends Persisted {
  placed: Placed;
  history: Placed[];
  listens: number;
  checks: number;
  /** Checks that found each lane off, on this grid: the coach picks its tip from them. */
  misses: Partial<Record<Lane, number>>;
  /** The answer was shown during this visit to the level (Try again keeps it). */
  peeked: boolean;
  /** Where the Sync screen returns to. */
  syncFrom: 'home' | 'level' | 'school' | 'song';
  /** Where the player's song was opened from, so Back returns there: the end of Story, today's twist, or Home. */
  songFrom: 'story' | 'twist' | 'home';
  result: (CheckResult & { stale: boolean }) | null;
  lastPlaced: { lane: Lane; step: number } | null;
  /** What the engine is playing, or null. */
  playing: Mode | null;
  loop: number;
  loops: number;
  /** Bumped on every solve; the reward uses it to fire its one-shot effects. */
  celebrate: number;
  /** The last solve was the last level still unsolved: every level is done. */
  finale: boolean;
  soundTried: boolean;
  soundSeen: boolean;
  soundHelp: boolean;
  /** The open School level's visit: the bar on screen, how it is listened to, Undo. */
  room: Room;
  /** Where the whole song picks up when played: 0, where it was paused, or where the player moved it. */
  songAt: number;
  /** The section of the song the player picked to listen to, looped; null for the whole song. */
  songPart: number | null;
}

/** A sound to hear on its own, without changing anything: a lane's name, a ladder height, a colour. */
export type Hearable = { lane: Lane } | { ladder: Ladder; row: number } | { mood: Mood };

export type AppEvent =
  // onboarding
  | { type: 'GET_STARTED' } | { type: 'TEST_SOUND' } | { type: 'SIGNAL' } | { type: 'CANT_HEAR' }
  | { type: 'HEARD' } | { type: 'SKIP' } | { type: 'START' }
  // sync calibration
  | { type: 'SYNC.OPEN' } | { type: 'SYNC.PLAY' } | { type: 'SYNC.SET'; offsetMs: number } | { type: 'SYNC.RETAP' } | { type: 'SYNC.DONE' }
  // settings
  | { type: 'SET_CUES'; on: boolean }
  // home
  | { type: 'HOME' } | { type: 'CONTINUE' }
  // ear-training level
  | { type: 'GOTO_LEVEL'; index: number } | { type: 'NEXT' } | { type: 'RETRY' }
  | { type: 'TOGGLE_CELL'; lane: Lane; step: number } | { type: 'UNDO' } | { type: 'CLEAR' }
  | { type: 'LISTEN' } | { type: 'PLAY_MINE' } | { type: 'HINT' } | { type: 'REPLAY' }
  /** Space bar. The state decides what it means: listen, play the beat, play your track. */
  | { type: 'PRIMARY_PLAY' }
  | { type: 'AUDITION'; lane: Lane }
  | { type: 'CHECK' } | { type: 'SHOW_ANSWER' } | { type: 'CLOSE_REWARD' }
  // School
  /** Open School: a level by index, or (without one) where the player left off. */
  | { type: 'SCHOOL'; index?: number }
  /**
   * One edit of the player's build (see `Edit` in src/school/rules.ts). `merge`: part of a drag that already started
   * with an edit, so Undo takes the whole drag back at once.
   */
  | { type: 'SCHOOL.EDIT'; edit: Edit; merge?: boolean }
  /** Put a bar (a section, in the Story world) on screen. */
  | { type: 'SCHOOL.BAR'; bar: number }
  /**
   * Listen to The song or Yours: it starts if nothing plays, switches on the next step if the other one plays, and
   * stops if it is the one playing.
   */
  | { type: 'SCHOOL.LISTEN'; listen: Listen }
  /** Up close, on or off, for whichever of the two is heard: this part and the one it plays with. */
  | { type: 'SCHOOL.CLOSE' }
  /** Solo, on or off, for whichever of the two is heard: this part and nothing else. */
  | { type: 'SCHOOL.SOLO' }
  /** Back a step along School: the level before, or the song before the first level, or Home from the song. */
  | { type: 'SCHOOL.BACK' }
  | { type: 'SCHOOL.PLAY' }
  | { type: 'SCHOOL.SCOPE'; scope: Scope }
  | { type: 'SCHOOL.SLOW' }
  | { type: 'SCHOOL.HINT' }
  | { type: 'SCHOOL.HEAR'; what: Hearable }
  /** Make it yours: keep what was changed. The level is done (a twist is sewn). */
  | { type: 'SCHOOL.KEEP' }
  /** Make it yours: the sparring partner's take on the bar on screen. If nothing plays, the bar plays. */
  | { type: 'SCHOOL.TAKE'; take: Take }
  /** Open today's twist (from Home). */
  | { type: 'TWIST' }
  /** Open the player's song on its own screen (from Home). */
  | { type: 'SONG.OPEN' }
  /** On the player's song's screen: loop one part's bar, or stop it if it is the one looping. */
  | { type: 'SONG.CELL'; cell: Cell }
  /** Play the whole song from where it was left, or pause it. */
  | { type: 'SONG.PLAY' }
  /** Move the whole song to a step. If it is playing, it carries on from there. */
  | { type: 'SONG.SEEK'; at: number }
  /** Listen to one section of the song, looped; the same one again goes back to the whole song. */
  | { type: 'SONG.PART'; part: number }
  /** Leave the song's introduction for the first level. */
  | { type: 'SONG.START' }
  | TransportEvent;

export interface AppInput {
  persisted?: Partial<Persisted>;
}

export const DEFAULTS: Persisted = { onboarded: false, cues: true, solved: [], levelIdx: 0, syncOffsetMs: 0, records: {}, school: freshSchool() };
const TEST_PATTERN = toPattern({ kick: [0, 8], snare: [4, 12] });
const CALIBRATE_PATTERN = toPattern({ kick: [0, 4, 8, 12] });

/** A clean grid. Try again uses this; it keeps `peeked`. */
const freshLevel = () => ({
  placed: emptyPlaced(), history: [] as Placed[], listens: 0, checks: 0, misses: {} as AppContext['misses'],
  result: null as AppContext['result'], lastPlaced: null as AppContext['lastPlaced'],
});
/** A new visit to a level. */
const freshVisit = () => ({ ...freshLevel(), peeked: false });
export const levelOf = (ctx: Pick<AppContext, 'levelIdx'>) => LEVELS[clampLevel(ctx.levelIdx)];
const firstWrongLane = (ctx: AppContext) => wrongLanes(levelOf(ctx), ctx.result)[0];

const today = () => {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};

export function patternFor(mode: Mode, ctx: AppContext): Pattern {
  const level = levelOf(ctx);
  if (mode === 'target' || mode === 'reveal') return targetPattern(level);
  if (mode === 'mine') return minePattern(level, ctx.placed);
  if (mode === 'test') return TEST_PATTERN;
  if (mode === 'calibrate') return CALIBRATE_PATTERN;
  if (mode.startsWith('solo:')) return soloPattern(level, mode.slice(5) as Lane);
  return toPattern({});
}

// ── School helpers ──

/** Open a School level with a fresh visit. */
const openSchool = (school: SchoolSaved, index: number) => {
  const next = { ...school, level: clampSchoolLevel(school, index) };
  return { school: next, room: freshRoom(schoolLevel(next)) };
};
/** Where Continue goes: the level the player was on, or the next open one after it if that is done. */
const hereOf = (s: SchoolSaved) => (s.done.includes(schoolLevel(s).id) ? nextOpen(s, s.level) : s.level);
const isDone = (s: SchoolSaved) => s.done.includes(schoolLevel(s).id);

/** What the loop of the open level reads, live, on every step. */
export function loopView(ctx: Pick<AppContext, 'school' | 'room'>): LoopView {
  const { school, room } = ctx;
  const song = songOf(school);
  return {
    song, mine: school.build, own: school.own, level: activeLevel(ctx), owned: ownedRows(school), yours: rowsChanged(song, school.own),
    listen: room.listen, close: room.close, solo: room.solo, scope: room.scope, unit: room.bar, slow: room.slow,
  };
}
/**
 * The whole song: the song's own on its first screen; at the end of a world, with every part rebuilt so far and every
 * change the player has made their own.
 */
export function songView(ctx: Pick<AppContext, 'school'>, meet: boolean): SongView {
  const song = songOf(ctx.school);
  const owned = meet ? new Set<never>() : ownedRows(ctx.school);
  const yours = meet ? new Set<never>() : rowsChanged(song, ctx.school.own);
  return { song, mine: ctx.school.build, own: ctx.school.own, src: sourcesOwned(owned, yours), ownArr: owned.has('arr' as never) };
}
/**
 * The end of a world. The song is the song as first heard. Yours so far is only what the player has made: the parts
 * they have rebuilt, with every change they made their own, and nothing of the song's. Their parts play in every
 * section, since the arrangement is not theirs until Story.
 */
export function worldEndView(ctx: Pick<AppContext, 'school' | 'room'>): SongView {
  const song = songOf(ctx.school);
  const base = { song, mine: ctx.school.build, own: ctx.school.own, ownArr: false };
  if (ctx.room.listen === 'song') return { ...base, src: sourcesSong() };
  const owned = ownedRows(ctx.school);
  const yours = rowsChanged(song, ctx.school.own);
  const src = sourcesOwned(owned, yours);
  for (const r of Object.keys(src) as (keyof typeof src)[]) if (!owned.has(r) && !yours.has(r)) src[r] = null;
  return { ...base, src, allOn: true };
}
/**
 * The player's song on its own screen. The song is the song as first heard. Yours is the player's own song: the song
 * with exactly the changes they made their own, and nothing else, so a near miss in a rebuild is never heard as theirs.
 */
export function yourSongView(ctx: Pick<AppContext, 'school' | 'room'>): SongView {
  const song = songOf(ctx.school);
  return { song, mine: ctx.school.build, own: ctx.school.own, src: ctx.room.listen === 'mine' ? sourcesOwn() : sourcesSong(), ownArr: false };
}
/**
 * One bar of the player's own song, looped, every part playing, except, in The song, the part of the cell picked,
 * which is the song's (with the bass, for a colour, since it moved with it). The A and the B differ by exactly that
 * part's change in that bar.
 */
export function barView(ctx: Pick<AppContext, 'school' | 'room'>): BarView {
  const cell = ctx.room.cell ?? { part: 'drums', bar: 0 };
  const src = sourcesOwn();
  if (ctx.room.listen === 'song') for (const r of rowsWith(cell.part)) src[r as keyof typeof src] = 'song';
  return { song: songOf(ctx.school), mine: ctx.school.build, own: ctx.school.own, src, bar: cell.bar };
}

/** What a press sounds like, the moment it lands. Nothing for a removal: silence says it is gone. */
function editSound(ctx: AppContext, level: Level, edit: Edit, after: Build): Sound[] {
  const sec = stepSeconds(tempo(songOf(ctx.school), false));
  const ed = level.editor;
  if (edit.kind === 'hit') return after.drums[edit.bar][edit.lane][edit.step] ? hit(edit.lane) : [];
  if ((edit.kind === 'place' || edit.kind === 'move') && ed.kind === 'notes') {
    const n = after[ed.ladder][edit.bar].find((x) => x.at === edit.at);
    return n ? [line(ed.ladder, n.row, Math.min(n.len, 8) * sec)] : [];
  }
  if (edit.kind === 'chord') return chord(edit.mood, 8 * sec);
  return [];
}

/**
 * `clock` gives today's date, YYYY-MM-DD in local time: when a level was first solved, and which twist the day offers.
 * Tests pass a fixed day.
 */
export function createAppMachine(engine: AudioEngine, clock: () => string = today) {
  const hear = (sounds: Sound[]) => { if (sounds.length) void engine.hear(sounds); };
  /** The whole song from `songAt`, or the section the player picked, looped, from `songAt` if it is inside it. */
  const playSong = (ctx: AppContext, view: () => SongView) => {
    if (ctx.songPart === null) return void engine.playProgram('song', songProgram(view), ctx.songAt);
    const { start, steps } = partSpan(songOf(ctx.school), ctx.songPart);
    const from = ctx.songAt >= start && ctx.songAt < start + steps ? ctx.songAt - start : 0;
    void engine.playProgram('song', partProgram(view, ctx.songPart), from);
  };
  /** Where the section being looped starts, in steps of the whole song (the engine counts from there). */
  const partStart = (ctx: AppContext) => (ctx.songPart === null ? 0 : partSpan(songOf(ctx.school), ctx.songPart).start);

  return setup({
    types: {} as { context: AppContext; events: AppEvent; input: AppInput },
    actors: { transport: transportLogic },
    guards: {
      onboarded: ({ context }) => context.onboarded,
      isPlaying: ({ context }, params: { mode: Mode }) => context.playing === params.mode,
      /** The one asked for is the one playing: pressing it again stops it. */
      hearingThis: ({ context, event }) => event.type === 'SCHOOL.LISTEN' && context.playing !== null && context.room.listen === event.listen,
      closeOff: ({ context }) => !context.room.close,
      soloOff: ({ context }) => !context.room.solo,
      firstLevel: ({ context }) => context.school.level === 0,
      hintPlaying: ({ context }) => !!firstWrongLane(context) && context.playing === `solo:${firstWrongLane(context)}`,
      hasWrongLane: ({ context }) => !!firstWrongLane(context),
      noNotes: ({ context }) => placedCount(levelOf(context), context.placed) === 0,
      hasNotes: ({ context }) => placedCount(levelOf(context), context.placed) > 0,
      canUndo: ({ context }) => context.history.length > 0,
      // A given note never changes, and a lane given in full has nothing left to place.
      editable: ({ context, event }) => event.type === 'TOGGLE_CELL'
        && !laneFullyGiven(levelOf(context), event.lane) && !givenOf(levelOf(context), event.lane).has(event.step),
      wouldSolve: ({ context }) => checkBeat(levelOf(context), context.placed).ok,
      checkedTwice: ({ context }) => context.checks >= 2,
      allDone: ({ context }) => allSolved(context.solved),
      continueHere: ({ context }) => continueIndex(context) === clampLevel(context.levelIdx),
      isCurrentLevel: ({ context, event }) => event.type === 'GOTO_LEVEL' && clampLevel(event.index) === clampLevel(context.levelIdx),
      syncFromHome: ({ context }) => context.syncFrom === 'home',
      syncFromSchool: ({ context }) => context.syncFrom === 'school',
      syncFromSong: ({ context }) => context.syncFrom === 'song',
      // School
      canOpenSchool: ({ context, event }) => event.type === 'SCHOOL' && (event.index === undefined || unlocked(context.school, clampSchoolLevel(context.school, event.index))),
      songUnmet: ({ context }) => !context.school.met,
      // A rebuilding level is done the moment its goal is met. Make it yours is done when the player keeps it.
      solvedNow: ({ context }) => {
        const level = activeLevel(context);
        return !level.yours && !isDone(context.school) && level.check(context.school.build);
      },
      keepable: ({ context }) => {
        const level = activeLevel(context);
        return !!level.yours && !activeDone(context) && level.check(context.school.own);
      },
      twisting: ({ context }) => context.room.twist,
      twistSewn: ({ context }) => context.room.twist && activeDone(context),
      /** The last level is done: the journey ends on the player's song. */
      storyEnds: ({ context }) => !context.room.twist && isDone(context.school) && context.school.level === levelsFor(context.school).length - 1,
      worldEnds: ({ context }) => !context.room.twist && isDone(context.school) && endsWorld(context.school, context.school.level),
      levelDone: ({ context }) => !context.room.twist && isDone(context.school) && context.school.level < levelsFor(context.school).length - 1,
      hasNextLevel: ({ context }) => context.school.level < levelsFor(context.school).length - 1,
      schoolUndo: ({ context }) => context.room.history.length > 0,
      canTwist: ({ context }) => context.school.met && twistToday(context.school, clock()) !== null,
      hasOwnSong: ({ context }) => context.school.met && (allDone(context.school) || madeYours(context.school)),
      songFromStory: ({ context }) => context.songFrom === 'story',
      songFromTwist: ({ context }) => context.songFrom === 'twist' && !!todayLevel(context.school),
      /** The section being looped, pressed again with nothing playing: only the loop is let go. */
      partOff: ({ context, event }) => event.type === 'SONG.PART' && context.songPart === event.part && context.playing !== 'song',
      isCellPlaying: ({ context, event }) => event.type === 'SONG.CELL' && context.playing === 'bar'
        && context.room.cell?.part === event.cell.part && context.room.cell?.bar === event.cell.bar,
    },
    actions: {
      // ── side effects on the engine ──
      unlock: () => void engine.unlock(),
      /** Start a mode. The pattern is read from the live context at every step. */
      play: ({ self }, params: { mode: Mode; loops: number }) =>
        void engine.play(params.mode, params.loops, () => patternFor(params.mode, self.getSnapshot().context)),
      playHint: ({ context, self }) => {
        const lane = firstWrongLane(context);
        if (lane) void engine.play(`solo:${lane}`, 2, () => patternFor(`solo:${lane}`, self.getSnapshot().context));
      },
      halt: () => engine.stop(),
      auditionEvent: ({ event }) => { if (event.type === 'AUDITION') void engine.audition(event.lane); },
      /** Runs after `toggleCell`: a newly placed note sounds, so a click never feels like nothing happened. */
      auditionPlaced: ({ context, event }) => {
        if (event.type === 'TOGGLE_CELL' && context.placed[event.lane].has(event.step)) void engine.audition(event.lane);
      },
      applyOffset: ({ context }) => { engine.visualOffsetMs = context.syncOffsetMs; },
      buzz: () => void haptic('levelChange'),

      // ── context ──
      markPlaying: assign((_, params: { mode: Mode; loops: number }) => ({ playing: params.mode, loops: params.loops, loop: 1 })),
      markHint: assign(({ context }) => ({ playing: `solo:${firstWrongLane(context)}` as Mode, loops: 2, loop: 1 })),
      markStopped: assign({ playing: null }),
      countListen: assign(({ context }) => ({ listens: context.listens + 1 })),
      toggleCell: assign(({ context, event }) => {
        if (event.type !== 'TOGGLE_CELL') return {};
        const lanes = new Set(context.placed[event.lane]);
        const on = !lanes.has(event.step);
        if (on) lanes.add(event.step); else lanes.delete(event.step);
        return {
          placed: { ...context.placed, [event.lane]: lanes },
          history: [...context.history.slice(-99), context.placed],
          result: context.result ? { ...context.result, stale: true } : null,
          lastPlaced: on ? { lane: event.lane, step: event.step } : null,
        };
      }),
      undo: assign(({ context }) => ({
        placed: context.history[context.history.length - 1],
        history: context.history.slice(0, -1),
        result: context.result ? { ...context.result, stale: true } : null,
        lastPlaced: null,
      })),
      clear: assign(({ context }) => ({
        placed: emptyPlaced(),
        history: [...context.history.slice(-99), context.placed],
        result: context.result ? { ...context.result, stale: true } : null,
        lastPlaced: null,
      })),
      recordCheck: assign(({ context }) => {
        const result = checkBeat(levelOf(context), context.placed);
        const misses = { ...context.misses };
        for (const lane of wrongLanes(levelOf(context), result)) misses[lane] = (misses[lane] ?? 0) + 1;
        return { checks: context.checks + 1, misses, result: { ...result, stale: false } };
      }),
      /** Runs after `recordCheck`, so `checks` includes the check that solved it. The first solve is the one recorded. */
      markSolved: assign(({ context }) => {
        const id = levelOf(context).id;
        const first = !context.solved.includes(id);
        const solved = first ? [...context.solved, id] : context.solved;
        const record: LevelRecord = { checks: context.checks, on: clock(), ...(context.peeked ? { peeked: true } : {}) };
        return {
          celebrate: context.celebrate + 1,
          finale: first && allSolved(solved),
          solved,
          records: context.records[id] ? context.records : { ...context.records, [id]: record },
        };
      }),
      markPeeked: assign({ peeked: true }),
      resetLevel: assign(() => freshLevel()),
      gotoLevel: assign(({ event }) => (event.type === 'GOTO_LEVEL' ? { levelIdx: clampLevel(event.index), ...freshVisit() } : {})),
      gotoContinue: assign(({ context }) => ({ levelIdx: continueIndex(context), ...freshVisit() })),
      gotoFirst: assign(() => ({ levelIdx: 0, ...freshVisit() })),
      nextLevel: assign(({ context }) => ({ levelIdx: nextIndex(context), ...freshVisit() })),
      setOffset: assign(({ event }) => (event.type === 'SYNC.SET' ? { syncOffsetMs: clampOffset(event.offsetMs) } : {})),

      // ── School ──
      startJourney: assign(({ context }) => ({ onboarded: true, ...openSchool(context.school, 0) })),
      gotoSchool: assign(({ context, event }) => (event.type === 'SCHOOL' ? openSchool(context.school, event.index ?? hereOf(context.school)) : {})),
      nextSchool: assign(({ context }) => openSchool(context.school, context.school.level + 1)),
      prevSchool: assign(({ context }) => openSchool(context.school, context.school.level - 1)),
      reopenSchool: assign(({ context }) => openSchool(context.school, context.school.level)),
      /** The level's loop: what it plays is read live, so switches, edits and a new bar land on the next step. */
      startLoop: ({ self }) => void engine.playProgram('school', loopProgram(() => loopView(self.getSnapshot().context))),
      markLoop: assign(({ context }) => ({ playing: 'school' as Mode, loop: 1, loops: 0, room: { ...context.room, heard: context.room.heard || context.room.listen === 'song' } })),
      startMeetSong: ({ context, self }) => playSong(context, () => songView(self.getSnapshot().context, true)),
      startEndSong: ({ context, self }) => playSong(context, () => worldEndView(self.getSnapshot().context)),
      markSong: assign({ playing: 'song' as Mode, loop: 1, loops: 1 }),
      /**
       * One edit. If this level allows it and it changes something, the build changes, the visit remembers the old
       * one for Undo, the stars are kept if they went up, and the loop becomes Yours: what you hear is what you
       * just did. The sound of the press plays at once.
       */
      schoolEdit: assign(({ context, event }) => {
        if (event.type !== 'SCHOOL.EDIT') return {};
        const level = activeLevel(context);
        const key = buildKey(level);
        const song = songOf(context.school);
        const before = context.school[key];
        const after = applyEdit(level, before, event.edit, song);
        if (!after || same(after, before)) return {};
        hear(editSound(context, level, event.edit, after));
        const stars = level.yours ? 0 : Math.max(context.school.stars[level.id] ?? 0, starsNow(level, song, after));
        return {
          school: { ...context.school, [key]: after, stars: stars ? { ...context.school.stars, [level.id]: stars } : context.school.stars },
          room: { ...context.room, history: event.merge ? context.room.history : [...context.room.history.slice(-99), before], listen: 'mine' as Listen },
        };
      }),
      /** A take is an edit like any other (Undo takes it back), and Surprise moves on each time it is asked for. */
      schoolTake: assign(({ context, event }) => {
        if (event.type !== 'SCHOOL.TAKE') return {};
        const level = activeLevel(context);
        const before = context.school.own;
        const after = applyEdit(level, before, { kind: 'take', bar: context.room.bar, take: event.take, n: context.room.takes }, songOf(context.school));
        if (!after) return {};
        const changed = !same(after, before);
        return {
          school: changed ? { ...context.school, own: after } : context.school,
          room: {
            ...context.room, takes: context.room.takes + 1, listen: 'mine' as Listen,
            history: changed ? [...context.room.history.slice(-99), before] : context.room.history,
          },
        };
      }),
      loopThisBar: assign(({ context }) => ({ room: { ...context.room, scope: 'one' as Scope } })),
      schoolUndo: assign(({ context }) => ({
        school: { ...context.school, [buildKey(activeLevel(context))]: context.room.history[context.room.history.length - 1] },
        room: { ...context.room, history: context.room.history.slice(0, -1), listen: 'mine' as Listen },
      })),
      schoolBar: assign(({ context, event }) => {
        if (event.type !== 'SCHOOL.BAR') return {};
        const level = activeLevel(context);
        const units = unitsOf(level, songOf(context.school));
        // Make it yours opens only the bars it changes; the others are the song's, heard in the loop.
        if (level.yours && !level.bars.includes(event.bar)) return {};
        return event.bar >= 0 && event.bar < units ? { room: { ...context.room, bar: event.bar } } : {};
      }),
      schoolListen: assign(({ context, event }) => (event.type === 'SCHOOL.LISTEN'
        ? { room: { ...context.room, listen: event.listen, heard: context.room.heard || event.listen === 'song' } } : {})),
      // Up close and Solo are two ways of leaving parts out: turning one on turns the other off.
      schoolClose: assign(({ context }) => ({ room: { ...context.room, close: !context.room.close, solo: false } })),
      schoolSolo: assign(({ context }) => ({ room: { ...context.room, solo: !context.room.solo, close: false } })),
      schoolScope: assign(({ context, event }) => (event.type === 'SCHOOL.SCOPE' ? { room: { ...context.room, scope: event.scope } } : {})),
      schoolSlow: assign(({ context }) => ({ room: { ...context.room, slow: !context.room.slow } })),
      schoolHint: assign(({ context }) => ({ room: { ...context.room, hint: !context.room.hint } })),
      /** Keep what was changed: a Make it yours level is done; today's twist is sewn into the sampler. */
      markKept: assign(({ context }) => {
        const s = context.school;
        if (context.room.twist && s.today) {
          return { school: { ...s, sewn: [...s.sewn.filter((x) => x.on !== s.today!.on), { on: s.today.on, id: s.today.id }] }, celebrate: context.celebrate + 1 };
        }
        const level = schoolLevel(s);
        return { school: { ...s, done: s.done.includes(level.id) ? s.done : [...s.done, level.id] }, celebrate: context.celebrate + 1 };
      }),
      /** Today's twist: started (the song as it is now is what it is checked against), on the bar it changes. */
      openTwist: assign(({ context }) => {
        const school = startTwist(context.school, clock());
        const level = todayLevel(school);
        return level ? { school, room: freshRoom(level, true) } : {};
      }),
      // ── the player's song, on its own screen ──
      openSong: assign(({ context }) => ({ room: { ...context.room, listen: 'mine' as Listen, cell: null }, songAt: 0, songPart: null })),
      songFromStory: assign({ songFrom: 'story' as const }),
      songFromTwist: assign({ songFrom: 'twist' as const }),
      songFromHome: assign({ songFrom: 'home' as const }),
      startYourSong: ({ context, self }) => playSong(context, () => yourSongView(self.getSnapshot().context)),
      pickCell: assign(({ context, event }) => (event.type === 'SONG.CELL' ? { room: { ...context.room, cell: event.cell } } : {})),
      startBar: ({ self }) => void engine.playProgram('bar', barProgram(() => barView(self.getSnapshot().context))),
      markBar: assign({ playing: 'bar' as Mode, loop: 1, loops: 0 }),
      /** The song remembers where it stopped even when a bar took over from it. */
      songStopped: assign(({ context, event }) => {
        if (event.type !== 'TRANSPORT.ENDED') return {};
        const at = event.mode === 'song' ? { songAt: event.completed ? 0 : partStart(context) + event.at } : {};
        return { ...at, ...(context.playing === event.mode ? { playing: null } : {}) };
      }),
      schoolHear: ({ context, event }) => {
        if (event.type !== 'SCHOOL.HEAR') return;
        const sec = stepSeconds(songOf(context.school).bpm);
        const w = event.what;
        hear('lane' in w ? hit(w.lane) : 'mood' in w ? chord(w.mood, 8 * sec) : [line(w.ladder, w.row, 8 * sec)]);
      },
      markDone: assign(({ context }) => {
        const level = activeLevel(context);
        const stars = Math.max(context.school.stars[level.id] ?? 0, starsNow(level, songOf(context.school), context.school.build), 1);
        return {
          school: { ...context.school, done: [...context.school.done, level.id], stars: { ...context.school.stars, [level.id]: stars } },
          celebrate: context.celebrate + 1,
        };
      }),
      metSong: assign(({ context }) => ({ school: { ...context.school, met: true }, songAt: 0, songPart: null })),
      /** A move inside the section being looped stays in it; anywhere else goes back to the whole song. */
      songSeek: assign(({ context, event }) => {
        if (event.type !== 'SONG.SEEK') return {};
        const song = songOf(context.school);
        const at = Math.max(0, Math.min(songBars(song) * STEPS - 1, Math.round(event.at) || 0));
        if (context.songPart === null) return { songAt: at };
        const { start, steps } = partSpan(song, context.songPart);
        return { songAt: at, songPart: at >= start && at < start + steps ? context.songPart : null };
      }),
      /** Pick a section to loop, from its top; the same one again goes back to the whole song, from where it is. */
      songPart: assign(({ context, event }) => {
        if (event.type !== 'SONG.PART') return {};
        const { start } = partSpan(songOf(context.school), event.part);
        if (context.songPart !== event.part) return { songPart: event.part, songAt: start };
        const pos = context.playing === 'song' ? engine.position() : null;
        return { songPart: null, songAt: pos === null ? context.songAt : start + pos };
      }),
      /** A world ends on what the player has made so far: The song is one press away. */
      listenYours: assign(({ context }) => ({ room: { ...context.room, listen: 'mine' as Listen } })),
      /** The whole song remembers where it was paused, and starts from the top once it has played to the end. */
      schoolEnded: assign(({ context, event }) => {
        if (event.type !== 'TRANSPORT.ENDED' || context.playing !== event.mode) return {};
        return { playing: null, ...(event.mode === 'song' ? { songAt: event.completed ? 0 : partStart(context) + event.at } : {}) };
      }),
      resetSongAt: assign({ songAt: 0, songPart: null }),
    },
  }).createMachine({
    id: 'app',
    context: ({ input }) => {
      const school = input.persisted?.school ?? freshSchool();
      return {
        ...DEFAULTS,
        ...input.persisted,
        school,
        levelIdx: clampLevel(input.persisted?.levelIdx ?? 0),
        ...freshVisit(),
        syncFrom: 'level' as const,
        songFrom: 'home' as const,
        playing: null, loop: 1, loops: 0, celebrate: 0, finale: false,
        soundTried: false, soundSeen: false, soundHelp: false,
        room: freshRoom(schoolLevel(school)),
        songAt: 0,
        songPart: null,
      };
    },
    entry: 'applyOffset',
    // Listens to the engine and reports start / loop / end back here.
    invoke: { id: 'transport', src: 'transport', input: { engine } },
    on: {
      'TRANSPORT.STARTED': { actions: assign(({ event }) => ({ playing: event.mode, loops: event.loops, loop: 1 })) },
      'TRANSPORT.LOOP': { actions: assign(({ context, event }) => (context.playing === event.mode ? { loop: event.loop } : {})) },
      'TRANSPORT.ENDED': { actions: assign(({ context, event }) => (context.playing === event.mode ? { playing: null } : {})) },
      SET_CUES: { actions: assign(({ event }) => ({ cues: event.on })) },
      AUDITION: { actions: 'auditionEvent' },
    },
    initial: 'boot',
    states: {
      boot: { always: [{ guard: 'onboarded', target: 'game' }, { target: 'onboarding' }] },

      onboarding: {
        tags: 'onboarding',
        initial: 'welcome',
        states: {
          // "Get started" is the click that lets WebKit start audio.
          welcome: { tags: 'welcome', on: { GET_STARTED: { target: 'soundCheck', actions: 'unlock' } } },
          soundCheck: {
            tags: 'soundCheck',
            exit: ['halt', 'markStopped'],
            on: {
              TEST_SOUND: [
                { guard: { type: 'isPlaying', params: { mode: 'test' } }, actions: ['halt', 'markStopped'] },
                {
                  actions: [
                    assign({ soundTried: true }),
                    { type: 'play', params: { mode: 'test', loops: 2 } },
                    { type: 'markPlaying', params: { mode: 'test', loops: 2 } },
                  ],
                },
              ],
              SIGNAL: { guard: { type: 'isPlaying', params: { mode: 'test' } }, actions: assign({ soundSeen: true }) },
              CANT_HEAR: { actions: assign({ soundHelp: true }) },
              HEARD: 'sync',
              SKIP: 'sync',
            },
          },
          sync: {
            tags: 'sync',
            entry: ['halt', 'markStopped'],
            exit: ['halt', 'markStopped'],
            initial: 'intro',
            states: {
              intro: {
                tags: 'sync.intro',
                on: { 'SYNC.PLAY': { target: 'tapping', actions: [{ type: 'play', params: { mode: 'calibrate', loops: 0 } }, { type: 'markPlaying', params: { mode: 'calibrate', loops: 0 } }] } },
              },
              tapping: { tags: 'sync.tapping', on: { 'SYNC.SET': { target: 'checking', actions: ['setOffset', 'applyOffset'] } } },
              checking: { tags: 'sync.checking', on: { 'SYNC.SET': { actions: ['setOffset', 'applyOffset'] }, 'SYNC.RETAP': 'tapping' } },
            },
            // New players go straight to School: the song first, then the first level.
            on: {
              'SYNC.DONE': { target: '#app.game.school', actions: 'startJourney' },
              SKIP: { target: '#app.game.school', actions: 'startJourney' },
            },
          },
        },
      },

      game: {
        tags: 'game',
        initial: 'home',
        states: {
          home: {
            tags: 'home',
            on: {
              SCHOOL: { guard: 'canOpenSchool', target: 'school', actions: 'gotoSchool' },
              TWIST: { guard: 'canTwist', target: 'school.level', actions: 'openTwist' },
              'SONG.OPEN': { guard: 'hasOwnSong', target: 'school.song', actions: ['songFromHome', 'openSong'] },
              // The ear-training level you were on comes back exactly as you left it; any other level starts fresh.
              // With every level solved, Continue is "Start again from level 1".
              CONTINUE: [
                { guard: 'allDone', target: 'level.unsolved', actions: 'gotoFirst' },
                { guard: 'continueHere', target: 'level.hist' },
                { target: 'level.unsolved', actions: 'gotoContinue' },
              ],
              GOTO_LEVEL: [
                { guard: 'isCurrentLevel', target: 'level.hist' },
                { target: 'level.unsolved', actions: 'gotoLevel' },
              ],
              'SYNC.OPEN': { target: 'sync', actions: assign({ syncFrom: 'home' as const }) },
            },
          },

          school: {
            tags: 'school',
            exit: ['halt', 'markStopped'],
            initial: 'enter',
            on: {
              HOME: '#app.game.home',
              'SYNC.OPEN': { target: '#app.game.sync', actions: assign({ syncFrom: 'school' as const }) },
              SCHOOL: { guard: 'canOpenSchool', target: '.level', reenter: true, actions: ['halt', 'markStopped', 'gotoSchool'] },
              'TRANSPORT.ENDED': { actions: 'schoolEnded' },
            },
            states: {
              enter: { always: [{ guard: 'songUnmet', target: 'meet' }, { target: 'level' }] },

              // Before the first level: the whole song, offered (never played on its own), on a screen of its own.
              meet: {
                tags: 'schoolMeet',
                on: {
                  'SONG.PLAY': [
                    // A pause: the engine reports where it stopped, and `schoolEnded` keeps it for the next play.
                    { guard: { type: 'isPlaying', params: { mode: 'song' } }, actions: 'halt' },
                    { actions: ['startMeetSong', 'markSong'] },
                  ],
                  'SONG.SEEK': [
                    { guard: { type: 'isPlaying', params: { mode: 'song' } }, actions: ['songSeek', 'startMeetSong', 'markSong'] },
                    { actions: 'songSeek' },
                  ],
                  'SONG.PART': [{ guard: 'partOff', actions: 'songPart' }, { actions: ['songPart', 'startMeetSong', 'markSong'] }],
                  PRIMARY_PLAY: { actions: raise({ type: 'SONG.PLAY' }) },
                  'SONG.START': { target: 'level', actions: ['halt', 'markStopped', 'metSong'] },
                  'SCHOOL.BACK': '#app.game.home',
                },
              },

              // A level: one bar on screen; The song or Yours, either of them Up close. It is done the moment its goal is met.
              level: {
                tags: 'schoolLevel',
                always: { guard: 'solvedNow', actions: ['markDone', 'buzz'] },
                on: {
                  'SCHOOL.EDIT': { actions: 'schoolEdit' },
                  UNDO: { guard: 'schoolUndo', actions: 'schoolUndo' },
                  'SCHOOL.BAR': { actions: 'schoolBar' },
                  'SCHOOL.LISTEN': [
                    { guard: 'hearingThis', actions: ['halt', 'markStopped'] },
                    // Playing: switch on the next step, without a restart, so the two are heard at the same moment.
                    { guard: { type: 'isPlaying', params: { mode: 'school' } }, actions: 'schoolListen' },
                    { actions: ['schoolListen', 'startLoop', 'markLoop'] },
                  ],
                  'SCHOOL.CLOSE': [
                    { guard: { type: 'isPlaying', params: { mode: 'school' } }, actions: 'schoolClose' },
                    // Asking to hear it up close, with nothing playing, plays it.
                    { guard: 'closeOff', actions: ['schoolClose', 'startLoop', 'markLoop'] },
                    { actions: 'schoolClose' },
                  ],
                  'SCHOOL.SOLO': [
                    { guard: { type: 'isPlaying', params: { mode: 'school' } }, actions: 'schoolSolo' },
                    // Asking to hear the part on its own, with nothing playing, plays it.
                    { guard: 'soloOff', actions: ['schoolSolo', 'startLoop', 'markLoop'] },
                    { actions: 'schoolSolo' },
                  ],
                  'SCHOOL.BACK': [
                    { guard: 'twisting', target: '#app.game.home' },
                    { guard: 'firstLevel', target: 'meet', actions: ['halt', 'markStopped', 'resetSongAt'] },
                    { target: 'level', reenter: true, actions: ['halt', 'markStopped', 'prevSchool'] },
                  ],
                  'SCHOOL.KEEP': { guard: 'keepable', actions: ['markKept', 'buzz'] },
                  'SCHOOL.TAKE': [
                    { guard: { type: 'isPlaying', params: { mode: 'school' } }, actions: 'schoolTake' },
                    // Asking for a take with nothing playing plays it, on this bar: hear what it did.
                    { actions: ['schoolTake', 'loopThisBar', 'startLoop', 'markLoop'] },
                  ],
                  'SCHOOL.PLAY': [
                    { guard: { type: 'isPlaying', params: { mode: 'school' } }, actions: ['halt', 'markStopped'] },
                    { actions: ['startLoop', 'markLoop'] },
                  ],
                  PRIMARY_PLAY: { actions: raise({ type: 'SCHOOL.PLAY' }) },
                  'SCHOOL.SCOPE': { actions: 'schoolScope' },
                  'SCHOOL.SLOW': { actions: 'schoolSlow' },
                  'SCHOOL.HINT': { actions: 'schoolHint' },
                  'SCHOOL.HEAR': { actions: 'schoolHear' },
                  NEXT: [
                    { guard: 'twistSewn', target: 'song', actions: ['halt', 'markStopped', 'songFromTwist', 'openSong'] },
                    { guard: 'storyEnds', target: 'song', actions: ['halt', 'markStopped', 'songFromStory', 'openSong'] },
                    { guard: 'worldEnds', target: 'worldEnd', actions: ['halt', 'markStopped', 'resetSongAt', 'listenYours'] },
                    { guard: 'levelDone', target: 'level', reenter: true, actions: ['halt', 'markStopped', 'nextSchool'] },
                  ],
                },
              },

              // A world is done: the whole song from the top, with every part the player has rebuilt in it.
              worldEnd: {
                tags: 'schoolEnd',
                exit: ['halt', 'markStopped', 'resetSongAt'],
                on: {
                  'SONG.PLAY': [
                    { guard: { type: 'isPlaying', params: { mode: 'song' } }, actions: 'halt' },
                    { actions: ['startEndSong', 'markSong'] },
                  ],
                  'SONG.SEEK': [
                    { guard: { type: 'isPlaying', params: { mode: 'song' } }, actions: ['songSeek', 'startEndSong', 'markSong'] },
                    { actions: 'songSeek' },
                  ],
                  'SONG.PART': [{ guard: 'partOff', actions: 'songPart' }, { actions: ['songPart', 'startEndSong', 'markSong'] }],
                  // The song or Yours so far: switched on the next step while playing, so the two meet at the same moment.
                  'SCHOOL.LISTEN': [
                    { guard: 'hearingThis', actions: ['halt', 'markStopped'] },
                    { guard: { type: 'isPlaying', params: { mode: 'song' } }, actions: 'schoolListen' },
                    { actions: ['schoolListen', 'startEndSong', 'markSong'] },
                  ],
                  PRIMARY_PLAY: { actions: raise({ type: 'SONG.PLAY' }) },
                  NEXT: [
                    { guard: 'hasNextLevel', target: 'level', actions: 'nextSchool' },
                    { target: '#app.game.home' },
                  ],
                  // Back to the level that ended the world.
                  'SCHOOL.BACK': { target: 'level', actions: 'reopenSchool' },
                },
              },

              // The player's song, on its own screen: the whole song, The song or Yours, and every part of every bar,
              // gold where it is the player's own. Press one to loop that bar; The song and Yours then swap that part.
              song: {
                tags: 'schoolSong',
                exit: ['halt', 'markStopped', 'resetSongAt'],
                on: {
                  'TRANSPORT.ENDED': { actions: 'songStopped' },
                  'SONG.PLAY': [
                    { guard: { type: 'isPlaying', params: { mode: 'song' } }, actions: 'halt' },
                    { actions: ['startYourSong', 'markSong'] },
                  ],
                  'SONG.SEEK': [
                    { guard: { type: 'isPlaying', params: { mode: 'song' } }, actions: ['songSeek', 'startYourSong', 'markSong'] },
                    { actions: 'songSeek' },
                  ],
                  'SONG.PART': [{ guard: 'partOff', actions: 'songPart' }, { actions: ['songPart', 'startYourSong', 'markSong'] }],
                  PRIMARY_PLAY: [
                    { guard: { type: 'isPlaying', params: { mode: 'bar' } }, actions: ['halt', 'markStopped'] },
                    { actions: raise({ type: 'SONG.PLAY' }) },
                  ],
                  'SCHOOL.LISTEN': [
                    { guard: 'hearingThis', actions: ['halt', 'markStopped'] },
                    // Playing: switch on the next step, so the two are heard at the same moment.
                    { guard: ({ context }) => context.playing !== null, actions: 'schoolListen' },
                    { actions: ['schoolListen', 'startYourSong', 'markSong'] },
                  ],
                  'SONG.CELL': [
                    { guard: 'isCellPlaying', actions: ['halt', 'markStopped'] },
                    { actions: ['pickCell', 'startBar', 'markBar'] },
                  ],
                  NEXT: '#app.game.home',
                  'SCHOOL.BACK': [
                    { guard: 'songFromStory', target: 'level', actions: 'reopenSchool' },
                    { guard: 'songFromTwist', target: 'level', actions: 'openTwist' },
                    { target: '#app.game.home' },
                  ],
                  'SYNC.OPEN': { target: '#app.game.sync', actions: assign({ syncFrom: 'song' as const }) },
                },
              },
            },
          },

          level: {
            initial: 'unsolved',
            on: {
              GOTO_LEVEL: { target: '.unsolved', actions: ['halt', 'markStopped', 'gotoLevel'] },
              NEXT: { target: '.unsolved', actions: ['halt', 'markStopped', 'nextLevel'] },
              HOME: { target: '#app.game.home', actions: ['halt', 'markStopped'] },
              'SYNC.OPEN': { target: '#app.game.sync', actions: assign({ syncFrom: 'level' as const }) },
            },
            states: {
              unsolved: {
                tags: 'unsolved',
                initial: 'ready',
                on: {
                  TOGGLE_CELL: { guard: 'editable', actions: ['toggleCell', 'auditionPlaced'] },
                  UNDO: { guard: 'canUndo', actions: 'undo' },
                  CLEAR: { guard: 'hasNotes', actions: 'clear' },
                  LISTEN: [
                    { guard: { type: 'isPlaying', params: { mode: 'target' } }, actions: ['halt', 'markStopped'] },
                    { actions: ['countListen', { type: 'play', params: { mode: 'target', loops: 2 } }, { type: 'markPlaying', params: { mode: 'target', loops: 2 } }] },
                  ],
                  PRIMARY_PLAY: [
                    { guard: { type: 'isPlaying', params: { mode: 'target' } }, actions: ['halt', 'markStopped'] },
                    { actions: ['countListen', { type: 'play', params: { mode: 'target', loops: 2 } }, { type: 'markPlaying', params: { mode: 'target', loops: 2 } }] },
                  ],
                  PLAY_MINE: [
                    { guard: { type: 'isPlaying', params: { mode: 'mine' } }, actions: ['halt', 'markStopped'] },
                    { actions: [{ type: 'play', params: { mode: 'mine', loops: 0 } }, { type: 'markPlaying', params: { mode: 'mine', loops: 0 } }] },
                  ],
                  CHECK: [
                    { guard: 'noNotes' },
                    // The celebration belongs to solving, not to entering `solved`, which history can do again.
                    { guard: 'wouldSolve', target: '#app.game.level.revealed.solved', actions: ['recordCheck', 'markSolved', 'buzz'] },
                    { target: '.checked', actions: 'recordCheck' },
                  ],
                },
                states: {
                  ready: {
                    tags: 'ready',
                    on: {
                      // The first listen moves the level on; afterwards the parent's LISTEN toggles.
                      LISTEN: { target: 'building', actions: ['countListen', { type: 'play', params: { mode: 'target', loops: 2 } }, { type: 'markPlaying', params: { mode: 'target', loops: 2 } }] },
                      PRIMARY_PLAY: { target: 'building', actions: ['countListen', { type: 'play', params: { mode: 'target', loops: 2 } }, { type: 'markPlaying', params: { mode: 'target', loops: 2 } }] },
                    },
                  },
                  building: { tags: 'building' },
                  checked: {
                    tags: 'checked',
                    on: {
                      HINT: [
                        { guard: 'hintPlaying', actions: ['halt', 'markStopped'] },
                        { guard: 'hasWrongLane', actions: ['playHint', 'markHint'] },
                      ],
                      SHOW_ANSWER: { guard: 'checkedTwice', target: '#app.game.level.revealed.answer', actions: 'markPeeked' },
                    },
                  },
                },
              },
              revealed: {
                tags: 'revealed',
                initial: 'solved', // only ever entered by an explicit target: solved or answer
                on: {
                  REPLAY: [
                    { guard: { type: 'isPlaying', params: { mode: 'reveal' } }, actions: ['halt', 'markStopped'] },
                    { actions: [{ type: 'play', params: { mode: 'reveal', loops: 2 } }, { type: 'markPlaying', params: { mode: 'reveal', loops: 2 } }] },
                  ],
                  PRIMARY_PLAY: [
                    { guard: { type: 'isPlaying', params: { mode: 'reveal' } }, actions: ['halt', 'markStopped'] },
                    { actions: [{ type: 'play', params: { mode: 'reveal', loops: 2 } }, { type: 'markPlaying', params: { mode: 'reveal', loops: 2 } }] },
                  ],
                },
                states: {
                  solved: {
                    tags: 'solved',
                    // The reward. Playback stops and nothing starts it again until the player asks.
                    entry: ['halt', 'markStopped'],
                    initial: 'reward',
                    states: {
                      reward: {
                        tags: ['reward', 'earReward'],
                        on: {
                          CLOSE_REWARD: 'review',
                          // Close the card first, so coming back from Home shows the solved grid, not the card again.
                          HOME: { target: 'review', actions: raise({ type: 'HOME' }) },
                        },
                      },
                      review: { tags: 'review' },
                    },
                  },
                  answer: {
                    tags: 'answer',
                    entry: ['halt', 'markStopped'],
                    on: { RETRY: { target: '#app.game.level.unsolved', actions: ['halt', 'markStopped', 'resetLevel'] } },
                  },
                },
              },
              hist: { type: 'history', history: 'deep' },
            },
          },
          sync: {
            tags: 'sync',
            entry: ['halt', 'markStopped'],
            exit: ['halt', 'markStopped'],
            initial: 'intro',
            states: {
              intro: {
                tags: 'sync.intro',
                on: { 'SYNC.PLAY': { target: 'tapping', actions: [{ type: 'play', params: { mode: 'calibrate', loops: 0 } }, { type: 'markPlaying', params: { mode: 'calibrate', loops: 0 } }] } },
              },
              tapping: { tags: 'sync.tapping', on: { 'SYNC.SET': { target: 'checking', actions: ['setOffset', 'applyOffset'] } } },
              checking: { tags: 'sync.checking', on: { 'SYNC.SET': { actions: ['setOffset', 'applyOffset'] }, 'SYNC.RETAP': 'tapping' } },
            },
            on: {
              'SYNC.DONE': [
                { guard: 'syncFromHome', target: 'home' }, { guard: 'syncFromSchool', target: 'school.level' },
                { guard: 'syncFromSong', target: 'school.song' }, { target: 'level.hist' },
              ],
              SKIP: [
                { guard: 'syncFromHome', target: 'home' }, { guard: 'syncFromSchool', target: 'school.level' },
                { guard: 'syncFromSong', target: 'school.song' }, { target: 'level.hist' },
              ],
            },
          },
        },
      },
    },
  });
}

export type AppMachine = ReturnType<typeof createAppMachine>;
export type AppSnapshot = SnapshotFrom<AppMachine>;
