// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { FakeEngine } from '../../src/audio/fakeEngine';
import { STEP_SECONDS, stepSeconds } from '../../src/audio/schedule';
import { freshSchool, levelsOf, todayLevel } from '../../src/school/rules';
import { twistById } from '../../src/school/twists';
import { FIRST_SONG as SONG, STEPS, emptyBuild, songBars, type Build } from '../../src/school/song';
import { LEVELS } from '../../src/game/levels';
import { nextLabel } from '../../src/game/copy';
import { continueIndex, nextIndex } from '../../src/game/progress';
import { barView, createAppMachine, songView, worldEndView, type AppEvent, type Persisted } from '../../src/machine/appMachine';

// The machine runs against the silent FakeEngine: no audio context is ever created.
const STEP_MS = STEP_SECONDS * 1000;
const BAR_MS = STEP_MS * 16;

function start(persisted: Partial<Persisted> = {}) {
  const engine = new FakeEngine();
  const actor = createActor(createAppMachine(engine), { input: { persisted } });
  actor.start();
  const s = () => actor.getSnapshot();
  return { engine, actor, s, send: actor.send.bind(actor), ctx: () => s().context };
}
/** A returning player: boots on Home, then continues into the level they were on. */
const inGame = (levelIdx = 0) => {
  const app = start({ onboarded: true, levelIdx });
  app.send({ type: 'CONTINUE' });
  return app;
};
const levelIdx = (name: string) => LEVELS.findIndex((l) => l.name === name);
const plays = (engine: FakeEngine) => engine.calls.filter((c) => c.startsWith('play:'));
/** Level 1 solved on the first check. */
const solveLevel1 = (send: (e: AppEvent) => void) => {
  send({ type: 'TOGGLE_CELL', lane: 'snare', step: 4 });
  send({ type: 'TOGGLE_CELL', lane: 'snare', step: 12 });
  send({ type: 'CHECK' });
};

/** Presses (lane, step) that meet a drum twist from the song's drums. */
function solveTwist(id: string, own: Build, bar: number): ['kick' | 'snare' | 'hat', number][] {
  const d = own.drums[bar];
  if (id === 'less') return [['hat', 2], ['hat', 6], ['hat', 10]].filter(([l, st]) => d[l as 'hat'][st as number]) as ['hat', number][];
  if (id === 'offbeat') return [['kick', 6]];
  if (id === 'more') return [['hat', 1], ['hat', 3]];
  if (id === 'drop') return [0, 4, 8, 12].filter((st) => d.kick[st]).map((st) => ['kick', st]);
  if (id === 'offhats') return [0, 4, 8, 12].filter((st) => d.hat[st]).map((st) => ['hat', st]);
  if (id === 'halftime') return [['snare', 4], ['snare', 12], ['snare', 8]];
  throw new Error(`no presses for ${id}`);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('boot', () => {
  it('starts in onboarding on first launch, and on Home once onboarded', () => {
    expect(start().s().hasTag('welcome')).toBe(true);
    const home = start({ onboarded: true, levelIdx: 4 });
    expect(home.s().hasTag('home')).toBe(true);
    expect(home.engine.started).toBe(false); // audio waits for a click
    home.send({ type: 'CONTINUE' });
    expect(home.s().hasTag('ready')).toBe(true);
    expect(home.ctx().levelIdx).toBe(4);
  });

  it('applies a saved sync offset to the engine on start', () => {
    const { engine } = start({ onboarded: true, syncOffsetMs: 170 });
    expect(engine.visualOffsetMs).toBe(170);
  });
});

describe('onboarding', () => {
  it('goes welcome → sound check → sync → School level 1', () => {
    const { engine, s, send, ctx } = start();
    send({ type: 'GET_STARTED' });
    expect(engine.started).toBe(true); // the click unlocked audio
    expect(s().hasTag('soundCheck')).toBe(true);

    send({ type: 'SIGNAL' });
    expect(ctx().soundSeen).toBe(false); // a signal only counts while the test sound is playing
    send({ type: 'TEST_SOUND' });
    expect(plays(engine)).toEqual(['play:test:2']);
    send({ type: 'SIGNAL' });
    expect(ctx().soundSeen).toBe(true);

    send({ type: 'HEARD' });
    expect(s().hasTag('sync.intro')).toBe(true);
    expect(ctx().playing).toBeNull(); // leaving the sound check stops the test sound
    send({ type: 'SKIP' });
    // How it all works is in the docs: new players start making music at once.
    expect(s().hasTag('school')).toBe(true);
    expect(ctx().onboarded).toBe(true);
    expect(ctx().school.level).toBe(0);
  });
});

describe('home', () => {
  const heartbeat = levelIdx('Heartbeat');

  it('going Home stops the beat; Continue brings the level back as it was left; another level starts fresh', () => {
    const { engine, s, send, ctx } = inGame(heartbeat);
    send({ type: 'LISTEN' });
    send({ type: 'TOGGLE_CELL', lane: 'kick', step: 4 });
    send({ type: 'HOME' });
    expect(s().hasTag('home')).toBe(true);
    expect(engine.mode).toBeNull();
    expect(ctx().playing).toBeNull();

    send({ type: 'CONTINUE' });
    expect(s().hasTag('building')).toBe(true);
    expect([...ctx().placed.kick]).toEqual([4]);

    send({ type: 'HOME' });
    send({ type: 'GOTO_LEVEL', index: heartbeat }); // its own tile works like Continue
    expect([...ctx().placed.kick]).toEqual([4]);

    send({ type: 'HOME' });
    send({ type: 'GOTO_LEVEL', index: 0 });
    expect(s().hasTag('ready')).toBe(true);
    expect(ctx()).toMatchObject({ levelIdx: 0, listens: 0 });
    expect(ctx().placed.kick.size).toBe(0);
  });

  it('Continue skips past a solved level to the next unsolved one', () => {
    expect(continueIndex({ levelIdx: 0, solved: [] })).toBe(0);
    expect(continueIndex({ levelIdx: 0, solved: [1, 2] })).toBe(2);
    expect(continueIndex({ levelIdx: LEVELS.length - 1, solved: [LEVELS.length, 1] })).toBe(1); // wraps around
    expect(continueIndex({ levelIdx: 5, solved: LEVELS.map((l) => l.id) })).toBe(5); // all solved: stay

    const { s, send, ctx } = start({ onboarded: true, levelIdx: 0, solved: [1] });
    send({ type: 'CONTINUE' });
    expect(s().hasTag('ready')).toBe(true);
    expect(ctx().levelIdx).toBe(1);
  });

  it('records how a level was first solved, and never celebrates it twice', () => {
    const { s, send, ctx } = inGame(0);
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 4 });
    send({ type: 'CHECK' }); // one snare short
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 12 });
    send({ type: 'CHECK' });
    expect(s().hasTag('reward')).toBe(true);
    expect(ctx().records[1]).toEqual({ checks: 2, on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(ctx().celebrate).toBe(1);

    // Coming back to the solved level, from Home or from Sync, shows it solved without a second celebration.
    send({ type: 'CLOSE_REWARD' });
    send({ type: 'HOME' });
    send({ type: 'GOTO_LEVEL', index: 0 });
    expect(s().hasTag('review')).toBe(true);
    send({ type: 'SYNC.OPEN' });
    send({ type: 'SYNC.DONE' });
    expect(s().hasTag('review')).toBe(true);
    expect(ctx().celebrate).toBe(1);

    // Solving it again celebrates again, but the first record stays.
    send({ type: 'GOTO_LEVEL', index: 0 });
    solveLevel1(send);
    expect(ctx().celebrate).toBe(2);
    expect(ctx().records[1].checks).toBe(2);
  });

  it('marks a solve that came after showing the answer', () => {
    const { send, ctx } = inGame(0);
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 3 });
    send({ type: 'CHECK' });
    send({ type: 'CHECK' });
    send({ type: 'SHOW_ANSWER' });
    send({ type: 'RETRY' });
    solveLevel1(send);
    expect(ctx().records[1]).toMatchObject({ checks: 1, peeked: true });
  });

  it('Sync opened from Home returns to Home', () => {
    const { s, send, ctx } = start({ onboarded: true });
    send({ type: 'SYNC.OPEN' });
    expect(s().hasTag('sync.intro')).toBe(true);
    send({ type: 'SKIP' });
    expect(s().hasTag('home')).toBe(true);

    send({ type: 'SYNC.OPEN' });
    send({ type: 'SYNC.PLAY' });
    send({ type: 'SYNC.SET', offsetMs: 120 });
    send({ type: 'SYNC.DONE' });
    expect(s().hasTag('home')).toBe(true);
    expect(ctx()).toMatchObject({ syncOffsetMs: 120, playing: null });
  });
});

describe('moving on', () => {
  const all = LEVELS.map((l) => l.id);
  const allBut = (id: number) => all.filter((x) => x !== id);

  it('Next goes to the next unsolved level, back to a skipped one if need be', () => {
    expect(nextIndex({ levelIdx: 0, solved: [1] })).toBe(1);
    expect(nextIndex({ levelIdx: 4, solved: [1, 2, 3, 4, 5, 6] })).toBe(6); // level 6 is done: on to 7
    expect(nextIndex({ levelIdx: 12, solved: allBut(12) })).toBe(11); // the skipped level 12
    expect(nextIndex({ levelIdx: 12, solved: all })).toBe(0);
    expect(nextIndex({ levelIdx: 4, solved: all })).toBe(5);

    expect(nextLabel({ levelIdx: 0, solved: [1] })).toBe('Next level');
    expect(nextLabel({ levelIdx: 12, solved: allBut(12) })).toBe('Next: level 12');
    expect(nextLabel({ levelIdx: 12, solved: all })).toBe('Start again from level 1');

    const { send, ctx } = start({ onboarded: true, levelIdx: 12, solved: allBut(12) });
    send({ type: 'GOTO_LEVEL', index: 12 });
    send({ type: 'NEXT' });
    expect(ctx().levelIdx).toBe(11);
  });

  it('the solve that completes every level is the finale, whichever level it is', () => {
    const { s, send, ctx } = start({ onboarded: true, levelIdx: 0, solved: allBut(1) });
    send({ type: 'CONTINUE' }); // level 1, the only one left
    solveLevel1(send);
    expect(s().hasTag('reward')).toBe(true);
    expect(ctx().finale).toBe(true);

    // Home from the card closes it on the way, so coming back to that level shows the solved grid, not the card.
    send({ type: 'HOME' });
    expect(s().hasTag('home')).toBe(true);
    send({ type: 'GOTO_LEVEL', index: 0 });
    expect(s().hasTag('review')).toBe(true);

    // With everything solved, Continue starts again from level 1, fresh.
    send({ type: 'HOME' });
    send({ type: 'CONTINUE' });
    expect(s().hasTag('ready')).toBe(true);
    expect(ctx().levelIdx).toBe(0);
    expect(ctx().placed.snare.size).toBe(0);

    // Solving a level again is not a finale.
    solveLevel1(send);
    expect(ctx().finale).toBe(false);
  });
});

describe('solving a level', () => {
  it('level 1: listen, place the snares, check, and get the reward', () => {
    const { engine, s, send, ctx } = inGame(0);
    send({ type: 'TOGGLE_CELL', lane: 'kick', step: 0 }); // given: cannot be removed
    expect(ctx().placed.kick.size).toBe(0);

    send({ type: 'LISTEN' });
    expect(s().hasTag('building')).toBe(true);
    expect(ctx()).toMatchObject({ listens: 1, playing: 'target' });

    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 4 });
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 12 });
    expect(engine.calls).toContain('audition:snare');
    send({ type: 'CHECK' });

    expect(s().hasTag('reward')).toBe(true);
    expect(ctx().playing).toBeNull();
    expect(ctx().solved).toEqual([1]);
  });

  it('the reward is silent: no chime, no beat, no drum hit', () => {
    const { engine, send } = inGame(0);
    send({ type: 'LISTEN' });
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 4 });
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 12 });
    const before = engine.calls.length;
    send({ type: 'CHECK' });
    vi.advanceTimersByTime(10_000);
    // The only thing the reward does to the engine is stop what was playing.
    expect(engine.calls.slice(before)).toEqual(['stop']);
  });

  it('never plays a beat on its own when the reward opens', () => {
    const { engine, s, send } = inGame(0);
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 4 });
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 12 });
    send({ type: 'CHECK' });
    expect(s().hasTag('reward')).toBe(true);
    const before = plays(engine).length;
    vi.advanceTimersByTime(10_000);
    expect(plays(engine).length).toBe(before);
    expect(engine.mode).toBeNull();
    // Only the "Listen for it" button plays it.
    send({ type: 'REPLAY' });
    expect(plays(engine).at(-1)).toBe('play:reveal:2');
  });

  it('solving while "play yours" is looping stops it', () => {
    const { engine, send, ctx } = inGame(0);
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 4 });
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 12 });
    send({ type: 'PLAY_MINE' });
    expect(engine.mode).toBe('mine');
    send({ type: 'CHECK' });
    expect(engine.mode).toBeNull();
    expect(ctx().playing).toBeNull();
  });

  it('locks the grid and the hidden beat once solved', () => {
    const { engine, send, ctx } = inGame(0);
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 4 });
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 12 });
    send({ type: 'CHECK' });
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 5 });
    send({ type: 'LISTEN' });
    send({ type: 'UNDO' });
    expect([...ctx().placed.snare].sort((a, b) => a - b)).toEqual([4, 12]);
    expect(plays(engine)).not.toContain('play:target:2');
  });

  it('space means "listen" while solving and "play the beat" once revealed', () => {
    const { engine, send } = inGame(0);
    send({ type: 'PRIMARY_PLAY' });
    expect(engine.mode).toBe('target');
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 4 });
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 12 });
    send({ type: 'CHECK' });
    send({ type: 'PRIMARY_PLAY' });
    expect(engine.mode).toBe('reveal');
    send({ type: 'PRIMARY_PLAY' });
    expect(engine.mode).toBeNull();
  });

  it('NEXT moves on to a fresh next level', () => {
    const { s, send, ctx } = inGame(0);
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 4 });
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 12 });
    send({ type: 'CHECK' });
    send({ type: 'NEXT' });
    expect(s().hasTag('ready')).toBe(true);
    expect(ctx()).toMatchObject({ levelIdx: 1, listens: 0, checks: 0, result: null });
    expect(ctx().placed.snare.size).toBe(0);
  });
});

describe('a wrong check', () => {
  const heartbeat = levelIdx('Heartbeat');

  it('names the wrong lane, offers that lane alone, and goes stale on edit', () => {
    const { engine, s, send, ctx } = inGame(heartbeat);
    for (const step of [0, 4, 8, 13]) send({ type: 'TOGGLE_CELL', lane: 'kick', step });
    send({ type: 'CHECK' });
    expect(s().hasTag('checked')).toBe(true);
    expect(ctx().result).toMatchObject({ ok: false, stale: false, lanes: { kick: false, snare: true } });

    send({ type: 'HINT' });
    expect(plays(engine).at(-1)).toBe('play:solo:kick:2');
    send({ type: 'HINT' });
    expect(engine.mode).toBeNull();

    send({ type: 'TOGGLE_CELL', lane: 'kick', step: 13 });
    expect(ctx().result?.stale).toBe(true);
  });

  it('offers the answer only after two checks, and "try again" starts the level fresh', () => {
    const { s, send, ctx } = inGame(heartbeat);
    send({ type: 'TOGGLE_CELL', lane: 'kick', step: 1 });
    send({ type: 'CHECK' });
    send({ type: 'SHOW_ANSWER' });
    expect(s().hasTag('answer')).toBe(false);
    send({ type: 'CHECK' });
    send({ type: 'SHOW_ANSWER' });
    expect(s().hasTag('answer')).toBe(true);
    send({ type: 'TOGGLE_CELL', lane: 'kick', step: 2 }); // no editing while the answer is shown
    expect(ctx().placed.kick.has(2)).toBe(false);
    send({ type: 'RETRY' });
    expect(s().hasTag('ready')).toBe(true);
    expect(ctx()).toMatchObject({ checks: 0, result: null });
  });

  it('counts the checks that find each lane off, for the coach, and Try again starts the count over', () => {
    const { send, ctx } = inGame(heartbeat);
    send({ type: 'TOGGLE_CELL', lane: 'kick', step: 1 });
    send({ type: 'CHECK' });
    send({ type: 'CHECK' });
    expect(ctx().misses).toEqual({ kick: 2 });
    send({ type: 'SHOW_ANSWER' });
    send({ type: 'RETRY' });
    expect(ctx().misses).toEqual({});
  });

  it('a lane given in full takes no presses: there is nothing left to place in it', () => {
    const { send, ctx } = inGame(levelIdx('The Backbeat')); // the kick is given in full
    send({ type: 'TOGGLE_CELL', lane: 'kick', step: 4 });
    send({ type: 'TOGGLE_CELL', lane: 'kick', step: 0 });
    expect(ctx().placed.kick.size).toBe(0);
    send({ type: 'TOGGLE_CELL', lane: 'snare', step: 4 });
    expect(ctx().placed.snare.has(4)).toBe(true);
  });

  it('checking an empty grid does nothing', () => {
    const { s, send, ctx } = inGame(heartbeat);
    send({ type: 'CHECK' });
    expect(s().hasTag('ready')).toBe(true);
    expect(ctx().checks).toBe(0);
  });
});

describe('playback', () => {
  it('plays one thing at a time', () => {
    const { engine, send, ctx } = inGame(0);
    send({ type: 'LISTEN' });
    send({ type: 'PLAY_MINE' });
    expect(engine.calls.slice(-3)).toEqual(['play:target:2', 'stop', 'play:mine:0']);
    expect(ctx().playing).toBe('mine');
  });

  it('the hidden beat plays two loops, counts them, then stops by itself', () => {
    const { send, ctx } = inGame(0);
    send({ type: 'LISTEN' });
    vi.advanceTimersByTime(BAR_MS + STEP_MS);
    expect(ctx()).toMatchObject({ playing: 'target', loop: 2, loops: 2 });
    vi.advanceTimersByTime(BAR_MS + STEP_MS);
    expect(ctx().playing).toBeNull();
  });

  it('changing level stops playback', () => {
    const { engine, send, ctx } = inGame(0);
    send({ type: 'LISTEN' });
    send({ type: 'GOTO_LEVEL', index: 5 });
    expect(engine.mode).toBeNull();
    expect(ctx()).toMatchObject({ levelIdx: 5, playing: null, listens: 0 });
  });
});

describe('sync calibration', () => {
  it('opens mid-level and returns to exactly where the player was', () => {
    const { engine, s, send, ctx } = inGame(levelIdx('Heartbeat'));
    send({ type: 'LISTEN' });
    send({ type: 'TOGGLE_CELL', lane: 'kick', step: 4 });
    send({ type: 'CHECK' });
    expect(s().hasTag('checked')).toBe(true);

    send({ type: 'SYNC.OPEN' });
    expect(s().hasTag('sync.intro')).toBe(true);
    expect(engine.mode).toBeNull();
    send({ type: 'SYNC.PLAY' });
    expect(s().hasTag('sync.tapping')).toBe(true);
    expect(engine.mode).toBe('calibrate');
    send({ type: 'SYNC.SET', offsetMs: 180 });
    expect(s().hasTag('sync.checking')).toBe(true);
    expect(engine.visualOffsetMs).toBe(180);
    send({ type: 'SYNC.SET', offsetMs: 9999 });
    expect(ctx().syncOffsetMs).toBe(400); // clamped
    send({ type: 'SYNC.DONE' });

    expect(s().hasTag('checked')).toBe(true);
    expect(engine.mode).toBeNull();
    expect([...ctx().placed.kick]).toEqual([4]);
    expect(ctx().result?.ok).toBe(false);
  });
});

describe('school', () => {
  const LEVELS_S = levelsOf(SONG);
  const at = (id: string) => LEVELS_S.findIndex((l) => l.id === id);
  /** A returning player opening School at a level, with `done` levels behind them and `build` as their song. */
  const inSchool = (id = 'heartbeat', done: string[] = [], build: Build = emptyBuild(SONG.sections.length)) => {
    const app = start({ onboarded: true, school: { ...freshSchool(), build, level: at(id), done, met: true } });
    app.send({ type: 'SCHOOL', index: at(id) });
    return app;
  };
  const before = (id: string) => LEVELS_S.slice(0, at(id)).map((l) => l.id);
  const hit = (bar: number, lane: 'kick' | 'snare' | 'hat', step: number) => ({ type: 'SCHOOL.EDIT' as const, edit: { kind: 'hit' as const, bar, lane, step } });
  /** The song's drums in every bar: what a player who finished Pulse has. */
  const drumsDone = (): Build => ({ ...emptyBuild(SONG.sections.length), drums: structuredClone(SONG.parts.drums) });
  const programs = (engine: FakeEngine) => engine.calls.filter((c) => c.startsWith('program:'));

  it('meets the song first, once: offered whole, never played on its own', () => {
    const { engine, s, send, ctx } = start({ onboarded: true, school: freshSchool() });
    send({ type: 'SCHOOL' });
    expect(s().hasTag('schoolMeet')).toBe(true);
    expect(programs(engine)).toEqual([]); // nothing plays until it is pressed
    send({ type: 'PRIMARY_PLAY' }); // Space plays the song here
    expect(ctx().playing).toBe('song');
    send({ type: 'SONG.START' });
    expect(s().hasTag('schoolLevel')).toBe(true);
    expect(ctx().playing).toBeNull();
    expect(ctx().school.met).toBe(true);
    send({ type: 'HOME' });
    send({ type: 'SCHOOL' });
    expect(s().hasTag('schoolMeet')).toBe(false); // once is enough
  });

  it('the song pauses where it stopped, carries on from there, and the ribbon moves it', () => {
    const { engine, send, ctx } = start({ onboarded: true, school: freshSchool() });
    send({ type: 'SCHOOL' });
    const step = stepSeconds(SONG.bpm) * 1000;
    send({ type: 'SONG.PLAY' });
    vi.advanceTimersByTime(step * 20 + 1);
    send({ type: 'SONG.PLAY' });
    expect(ctx().songAt).toBe(21);
    send({ type: 'SONG.PLAY' });
    expect(engine.calls.at(-1)).toBe('program:song@21');
    send({ type: 'SONG.SEEK', at: 128 });
    expect(engine.calls.slice(-2)).toEqual(['stop', 'program:song@128']);
    expect(ctx().playing).toBe('song');
    // The old playback's stop must not pull the place back to where it was (0.4.3 jumped back, then forward).
    expect(ctx().songAt).toBe(128);
    vi.advanceTimersByTime(step * 4 + 1);
    send({ type: 'SONG.PLAY' });
    expect(ctx().songAt).toBeGreaterThanOrEqual(132);
    send({ type: 'SONG.PLAY' });
    send({ type: 'SONG.SEEK', at: 99_999 });
    expect(ctx().songAt).toBe(songBars(SONG) * STEPS - 1);
  });

  it('a section of the song can be looped on its own, and let go again from where it is', () => {
    const { engine, send, ctx } = start({ onboarded: true, school: freshSchool() });
    send({ type: 'SCHOOL' });
    const step = stepSeconds(SONG.bpm) * 1000;
    const verse = SONG.sections[0].bars * STEPS; // the verse starts after the intro
    const verseLen = SONG.sections[1].bars * STEPS;
    send({ type: 'SONG.PART', part: 1 });
    expect(ctx().songPart).toBe(1);
    expect(ctx().playing).toBe('song');
    expect(engine.calls.at(-1)).toBe('program:song'); // the verse's own program, from its top
    // It loops: past the verse's end it is still in the verse.
    vi.advanceTimersByTime(step * (verseLen + 3) + 1);
    send({ type: 'SONG.PLAY' }); // pause
    expect(ctx().songAt).toBeGreaterThanOrEqual(verse);
    expect(ctx().songAt).toBeLessThan(verse + 8);
    send({ type: 'SONG.PLAY' });
    expect(ctx().songPart).toBe(1);
    // A move inside the verse stays looped; outside it, the whole song plays on from there.
    send({ type: 'SONG.SEEK', at: verse + 32 });
    expect(ctx().songPart).toBe(1);
    expect(engine.calls.at(-1)).toBe('program:song@32');
    send({ type: 'SONG.SEEK', at: 4 });
    expect(ctx().songPart).toBeNull();
    expect(engine.calls.at(-1)).toBe('program:song@4');
    // Pressed again while it plays, the whole song carries on from where the loop was.
    send({ type: 'SONG.PART', part: 1 });
    vi.advanceTimersByTime(step * 5 + 1);
    send({ type: 'SONG.PART', part: 1 });
    expect(ctx().songPart).toBeNull();
    expect(ctx().playing).toBe('song');
    expect(engine.calls.at(-1)).toBe(`program:song@${verse + 6}`);
    // With nothing playing, pressing the looped section only lets the loop go.
    send({ type: 'SONG.PART', part: 4 });
    send({ type: 'SONG.PLAY' });
    const n = engine.calls.length;
    send({ type: 'SONG.PART', part: 4 });
    expect(ctx().songPart).toBeNull();
    expect(engine.calls.length).toBe(n);
  });

  it('a press changes exactly one pad, in its own bar, and sounds on the press', () => {
    const { engine, send, ctx } = inSchool('heartbeat');
    send(hit(0, 'kick', 4));
    const drums = ctx().school.build.drums;
    expect(drums[0].kick.map(Number).join('')).toBe('0000100000000000');
    for (const bar of [1, 2, 3]) expect(drums[bar].kick.some(Boolean)).toBe(false); // no other bar changes
    expect(drums[0].snare.some(Boolean) || drums[0].hat.some(Boolean)).toBe(false);
    expect(engine.calls.at(-1)).toBe('hear:kick');
    send(hit(0, 'kick', 4));
    expect(ctx().school.build.drums[0].kick[4]).toBe(false); // a second press takes it away, nothing in between
  });

  it('ignores a press the level does not offer', () => {
    const { send, ctx } = inSchool('heartbeat');
    send(hit(0, 'snare', 4)); // no Crack yet
    send(hit(0, 'kick', 2)); // four pads a bar: there is no pad between the beats
    expect(ctx().school.build).toEqual(emptyBuild(SONG.sections.length));
    expect(ctx().room.history).toHaveLength(0);
  });

  it('is done the moment the goal is met, with its stars, and the music keeps playing', () => {
    const { s, send, ctx } = inSchool('heartbeat');
    send({ type: 'SCHOOL.PLAY' });
    for (const step of [0, 4, 8]) send(hit(0, 'kick', step));
    expect(ctx().school.done).toEqual([]);
    send(hit(0, 'kick', 12));
    expect(ctx().school.done).toEqual(['heartbeat']);
    expect(ctx().school.stars.heartbeat).toBe(3);
    expect(ctx().playing).toBe('school'); // the level does not stop the music
    expect(s().hasTag('schoolLevel')).toBe(true); // and nothing covers it
    send({ type: 'NEXT' });
    expect(ctx().school.level).toBe(at('copy'));
  });

  it('switches between The song and Yours, and Up close, on the next step, without a restart', () => {
    const { engine, send, ctx } = inSchool('heartbeat');
    send({ type: 'SCHOOL.LISTEN', listen: 'song' });
    expect(programs(engine)).toEqual(['program:school']);
    expect(ctx().room.heard).toBe(true);
    send({ type: 'SCHOOL.CLOSE' });
    expect(ctx().room.close).toBe(true);
    send({ type: 'SCHOOL.LISTEN', listen: 'mine' });
    expect(ctx().room.close).toBe(true); // Up close holds for Yours too
    expect(programs(engine)).toEqual(['program:school']); // one playback, switched live
    send({ type: 'SCHOOL.LISTEN', listen: 'song' });
    send(hit(0, 'kick', 0));
    expect(ctx().room.listen).toBe('mine'); // what you hear is what you just did
    send({ type: 'SCHOOL.PLAY' });
    expect(ctx().playing).toBeNull();
  });

  it('pressing the one that is playing stops it; Up close with nothing playing plays it', () => {
    const { send, ctx } = inSchool('heartbeat');
    send({ type: 'SCHOOL.LISTEN', listen: 'song' });
    expect(ctx().playing).toBe('school');
    send({ type: 'SCHOOL.LISTEN', listen: 'song' });
    expect(ctx().playing).toBeNull();
    send({ type: 'SCHOOL.CLOSE' });
    expect(ctx().playing).toBe('school');
    send({ type: 'SCHOOL.CLOSE' });
    expect(ctx().playing).toBe('school'); // turning it off keeps the music going
    expect(ctx().room.close).toBe(false);
  });

  it('Back goes a step back: the level before, the song before the first level, Home from the song', () => {
    const { send, ctx, s } = inSchool('clapback', ['heartbeat', 'copy']);
    send({ type: 'SCHOOL.BACK' });
    expect(ctx().school.level).toBe(at('copy'));
    send({ type: 'SCHOOL.BACK' });
    expect(ctx().school.level).toBe(at('heartbeat'));
    send({ type: 'SCHOOL.BACK' });
    expect(s().hasTag('schoolMeet')).toBe(true);
    send({ type: 'SCHOOL.BACK' });
    expect(s().hasTag('home')).toBe(true);
  });

  it('loops the bar on screen, or all four, and Slow slows it down', () => {
    const { engine, send } = inSchool('copy', ['heartbeat'], (() => { const b = emptyBuild(SONG.sections.length); b.drums[0].kick = SONG.parts.drums[0].kick.slice(); return b; })());
    const kicksIn = (n: number) => engine.heard.slice(-n).filter((step) => step.some((x) => x.sample === 'kick')).length;
    // Copy it on opens on all four bars, in Yours: only bar 1 has kicks yet.
    send({ type: 'SCHOOL.LISTEN', listen: 'mine' });
    vi.advanceTimersByTime(64 * stepSeconds(SONG.bpm) * 1000);
    expect(kicksIn(64)).toBe(4);
    send({ type: 'SCHOOL.SCOPE', scope: 'one' });
    send({ type: 'SCHOOL.BAR', bar: 0 });
    vi.advanceTimersByTime(32 * stepSeconds(SONG.bpm) * 1000);
    expect(kicksIn(16)).toBe(4); // bar 1, again and again
    send({ type: 'SCHOOL.BAR', bar: 2 });
    vi.advanceTimersByTime(32 * stepSeconds(SONG.bpm) * 1000);
    expect(kicksIn(16)).toBe(0); // the bar on screen, still empty
    send({ type: 'SCHOOL.SLOW' });
    const n = engine.heard.length;
    vi.advanceTimersByTime(16 * stepSeconds(SONG.bpm) * 1000);
    expect(engine.heard.length - n).toBeLessThan(16); // three quarters of the speed
  });

  it('copies a bar onto the others in one move, and Undo takes it back', () => {
    const b = emptyBuild(SONG.sections.length);
    b.drums[0].kick = SONG.parts.drums[0].kick.slice();
    const { send, ctx } = inSchool('copy', ['heartbeat'], b);
    send({ type: 'SCHOOL.EDIT', edit: { kind: 'copy', from: 0, to: 'all' } });
    for (const bar of [1, 2, 3]) expect(ctx().school.build.drums[bar].kick).toEqual(SONG.parts.drums[0].kick);
    expect(ctx().school.done).toContain('copy');
    send({ type: 'UNDO' });
    expect(ctx().school.build.drums[1].kick.some(Boolean)).toBe(false);
    expect(ctx().school.done).toContain('copy'); // done stays done
  });

  it('a drag is one edit to Undo', () => {
    const { send, ctx } = inSchool('floor', before('floor'), drumsDone());
    send({ type: 'SCHOOL.EDIT', edit: { kind: 'place', bar: 0, at: 0, row: 0, len: 4 } });
    send({ type: 'SCHOOL.EDIT', edit: { kind: 'resize', bar: 0, at: 0, len: 8 }, merge: true });
    send({ type: 'SCHOOL.EDIT', edit: { kind: 'move', bar: 0, at: 0, row: 2 }, merge: true });
    expect(ctx().school.build.bass[0]).toEqual([{ at: 0, len: 8, row: 2 }]);
    send({ type: 'UNDO' });
    expect(ctx().school.build.bass[0]).toEqual([]);
  });

  it('ends a world with Make it yours, then the whole song with the player\'s part in it, then goes on', () => {
    const b = drumsDone();
    b.drums[3] = structuredClone(SONG.parts.drums[0]); // bar 4 not turned yet
    const { engine, s, send, ctx } = inSchool('turn', before('turn'), b);
    send(hit(3, 'snare', 14));
    send(hit(3, 'snare', 15));
    expect(ctx().school.done).toContain('turn');
    send({ type: 'NEXT' });
    expect(ctx().school.level).toBe(at('yours-pulse'));
    send(hit(3, 'kick', 2));
    send({ type: 'SCHOOL.KEEP' });
    send({ type: 'NEXT' });
    expect(s().hasTag('schoolEnd')).toBe(true);
    send({ type: 'PRIMARY_PLAY' });
    expect(engine.calls.at(-1)).toBe('program:song');
    // It opens on Yours so far: only what the player has made (their drums, their own fill), in every section.
    expect(ctx().room.listen).toBe('mine');
    const yours = worldEndView(ctx());
    expect(yours.src.kick).toBe('own');
    expect(yours.src.snare).toBe('mine');
    expect([yours.src.bass, yours.src.chords, yours.src.melody]).toEqual([null, null, null]);
    expect(yours.allOn).toBe(true);
    // The song is the song as first heard, switched on the next step without a restart.
    const calls = engine.calls.length;
    send({ type: 'SCHOOL.LISTEN', listen: 'song' });
    expect(engine.calls.length).toBe(calls);
    expect(Object.values(worldEndView(ctx()).src).every((x) => x === 'song')).toBe(true);
    expect(songView(ctx(), false).src.kick).toBe('own');
    send({ type: 'NEXT' });
    expect(s().hasTag('schoolLevel')).toBe(true);
    expect(ctx().school.level).toBe(at('floor'));
    expect(ctx().playing).toBeNull();
  });

  it('Make it yours changes the player\'s own song, never the rebuild, and is done when kept', () => {
    const { s, send, ctx } = inSchool('yours-pulse', before('yours-pulse'), drumsDone());
    expect(ctx().room.bar).toBe(3);
    expect(ctx().room.listen).toBe('mine');
    send({ type: 'SCHOOL.KEEP' });
    expect(ctx().school.done).not.toContain('yours-pulse'); // nothing changed yet: nothing to keep
    send({ type: 'SCHOOL.BAR', bar: 0 });
    expect(ctx().room.bar).toBe(3); // bars the level does not change stay the song's
    send(hit(3, 'snare', 15));
    expect(ctx().school.own.drums[3].snare[15]).toBe(false);
    expect(ctx().school.build.drums[3].snare[15]).toBe(true); // the rebuild is untouched
    expect(ctx().school.done).not.toContain('yours-pulse'); // kept only when the player says so
    expect(s().hasTag('schoolLevel')).toBe(true);
    send({ type: 'SCHOOL.KEEP' });
    expect(ctx().school.done).toContain('yours-pulse');
    expect(ctx().school.stars['yours-pulse']).toBeUndefined(); // no stars: it is not measured against the song
    send({ type: 'SCHOOL.EDIT', edit: { kind: 'reset' } });
    expect(ctx().school.own.drums).toEqual(SONG.parts.drums);
    send({ type: 'UNDO' });
    expect(ctx().school.own.drums[3].snare[15]).toBe(false);
  });

  it('a take plays at once on the bar on screen, Surprise moves on, and Undo takes it back', () => {
    const { engine, send, ctx } = inSchool('yours-pulse', before('yours-pulse'), drumsDone());
    send({ type: 'SCHOOL.SCOPE', scope: 'all' });
    send({ type: 'SCHOOL.TAKE', take: 'surprise' });
    expect(ctx().playing).toBe('school');
    expect(ctx().room.scope).toBe('one');
    expect(engine.calls.at(-1)).toBe('program:school');
    const first = structuredClone(ctx().school.own.drums[3]);
    send({ type: 'SCHOOL.TAKE', take: 'surprise' });
    expect(ctx().school.own.drums[3]).not.toEqual(first);
    expect(ctx().playing).toBe('school'); // still the same loop: no restart
    send({ type: 'UNDO' });
    expect(ctx().school.own.drums[3]).toEqual(first);
    send({ type: 'UNDO' });
    expect(ctx().school.own.drums[3]).toEqual(SONG.parts.drums[3]);
  });

  it('the journey\'s end is the player\'s song: a bar of a part loops, The song and Yours swap that part', () => {
    const done = LEVELS_S.filter((l) => l.id !== 'story').map((l) => l.id);
    const b = { ...structuredClone(SONG.parts), arr: emptyBuild(SONG.sections.length).arr };
    const { engine, s, send, ctx } = inSchool('story', done, b);
    for (const [p, on] of Object.entries(SONG.parts.arr)) on.forEach((v, i) => { if (!v) send({ type: 'SCHOOL.EDIT', edit: { kind: 'section', part: p as 'drums', section: i } }); });
    expect(ctx().school.done).toContain('story');
    send({ type: 'NEXT' });
    expect(s().hasTag('schoolSong')).toBe(true);
    expect(ctx().songFrom).toBe('story');
    send({ type: 'SONG.CELL', cell: { part: 'chords', bar: 2 } });
    expect(ctx().playing).toBe('bar');
    expect(engine.calls.at(-1)).toBe('program:bar');
    expect(barView(ctx()).bar).toBe(2);
    send({ type: 'SCHOOL.LISTEN', listen: 'song' });
    expect(ctx().playing).toBe('bar'); // switched live
    expect(barView(ctx()).src.chords).toBe('song');
    expect(barView(ctx()).src.bass).toBe('song'); // a colour's bass moved with it, so it is the song's too
    expect(barView(ctx()).src.kick).not.toBe('song');
    send({ type: 'SONG.CELL', cell: { part: 'chords', bar: 2 } });
    expect(ctx().playing).toBeNull(); // the cell that loops stops
    send({ type: 'SONG.PLAY' });
    expect(ctx().playing).toBe('song');
    send({ type: 'SCHOOL.LISTEN', listen: 'song' });
    expect(ctx().playing).toBeNull();
    send({ type: 'SCHOOL.BACK' });
    expect(s().hasTag('schoolLevel')).toBe(true);
    expect(ctx().school.level).toBe(at('story'));
    send({ type: 'NEXT' });
    send({ type: 'NEXT' });
    expect(s().hasTag('home')).toBe(true);
  });

  it('today\'s twist opens from Home once something is the player\'s own, is sewn when kept, and ends on their song', () => {
    const done = LEVELS_S.filter((l) => l.world === 0).map((l) => l.id);
    const engine = new FakeEngine();
    const persisted = { onboarded: true, school: { ...freshSchool(), build: drumsDone(), level: at('floor'), done, met: true } };
    const actor = createActor(createAppMachine(engine, () => '2026-10-15'), { input: { persisted } });
    actor.start();
    const s = () => actor.getSnapshot(), ctx = () => s().context, send = actor.send.bind(actor);
    send({ type: 'TWIST' });
    expect(ctx().room.twist).toBe(true);
    expect(ctx().school.today?.on).toBe('2026-10-15');
    const level = todayLevel(ctx().school)!;
    expect(level.editor.kind).toBe('drums');
    expect(ctx().room.bar).toBe(level.bars[0]);
    expect(ctx().school.level).toBe(at('floor')); // the journey stays where it was
    const t = twistById(ctx().school.today!.id)!;
    // Make the change the twist asks for, one press at a time.
    const bar = t.bars[0];
    const goal = solveTwist(t.id, ctx().school.own, bar);
    for (const [lane, step] of goal) send(hit(bar, lane, step));
    send({ type: 'SCHOOL.KEEP' });
    expect(ctx().school.sewn).toEqual([{ on: '2026-10-15', id: t.id }]);
    send({ type: 'NEXT' });
    expect(s().hasTag('schoolSong')).toBe(true);
    send({ type: 'SCHOOL.BACK' });
    expect(ctx().room.twist).toBe(true);
    send({ type: 'SCHOOL.BACK' });
    expect(s().hasTag('home')).toBe(true);
    send({ type: 'SCHOOL' });
    expect(ctx().room.twist).toBe(false);
    expect(ctx().school.level).toBe(at('floor'));
  });

  it('opens the player\'s song from Home only once there is one', () => {
    const { s, send } = start({ onboarded: true, school: { ...freshSchool(), met: true } });
    send({ type: 'SONG.OPEN' });
    expect(s().hasTag('home')).toBe(true);
    send({ type: 'TWIST' });
    expect(s().hasTag('home')).toBe(true);
    const done = LEVELS_S.filter((l) => !l.yours).map((l) => l.id);
    const app = start({ onboarded: true, school: { ...freshSchool(), met: true, done } });
    app.send({ type: 'SONG.OPEN' });
    expect(app.s().hasTag('schoolSong')).toBe(true);
    expect(app.ctx().songFrom).toBe('home');
    app.send({ type: 'SCHOOL.BACK' });
    expect(app.s().hasTag('home')).toBe(true);
  });

  it('opens only levels whose earlier levels are done', () => {
    const { s, send, ctx } = inSchool('copy', ['heartbeat']);
    send({ type: 'SCHOOL', index: at('floor') });
    expect(ctx().school.level).toBe(at('copy'));
    send({ type: 'HOME' });
    send({ type: 'SCHOOL', index: at('heartbeat') });
    expect(s().hasTag('schoolLevel')).toBe(true);
    expect(ctx().school.level).toBe(at('heartbeat'));
  });

  it('leaving School stops its sound; Sync returns to the same level', () => {
    const { s, send, ctx } = inSchool('copy', ['heartbeat']);
    send({ type: 'SCHOOL.PLAY' });
    send({ type: 'SYNC.OPEN' });
    expect(ctx().playing).toBeNull();
    send({ type: 'SKIP' });
    expect(s().hasTag('schoolLevel')).toBe(true);
    expect(ctx().school.level).toBe(at('copy'));
  });
});
