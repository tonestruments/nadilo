import { describe, expect, it } from 'vitest';
import { MIN_FUNDAMENTAL_HZ, ROOT } from '../../src/audio/samples';
import { LANE_ORDER } from '../../src/game/levels';
import { allBars, barMarks, compare, exact, marks, starsFor, visible, type Row } from '../../src/school/match';
import { loopBar, loopProgram, songProgram, sourcesFor, sourcesOwned, tempo, VOICED } from '../../src/school/mix';
import { LADDER, MOOD_ORDER, voicing } from '../../src/school/music';
import {
  activeLevel, allDone, applyEdit, barSewn, freshRoom, freshSchool, holesIn, levelsOf, madeYours, nextOpen, ownedRows, sanitizeSchool,
  savedSchool, startTwist, starsNow, todayLevel, twistToday, unlocked, type Edit, type SchoolSaved,
} from '../../src/school/rules';
import { dayNumber, FIRST_DAY, TWISTS, twistLevel, twistOn } from '../../src/school/twists';
import { backToSong, barChanged, changes, changedIn, followRoot, hitGold, hitGone, rootRow, rowsChanged, takeOn } from '../../src/school/yours';
import {
  FIRST_SONG as SONG, STEPS, copyBar, emptyBuild, placeNote, sanitizeBuild, songBars, toggleHit, type Build,
} from '../../src/school/song';
import type { Level } from '../../src/school/levels';

const LEVELS = levelsOf(SONG);
const by = (id: string) => LEVELS.find((l) => l.id === id)!;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/**
 * The moves a player makes to rebuild a level's part of the song exactly: every mark the level counts, placed one by
 * one with the level's own edits. Used to walk the whole School.
 */
function solve(level: Level, b: Build): Build {
  const edits: Edit[] = [];
  const ed = level.editor;
  for (const bar of level.bars) {
    if (ed.kind === 'drums') {
      for (const lane of ed.lanes.filter((l) => level.focus.includes(l))) {
        for (const s of visible(ed.res)) {
          if (b.drums[bar][lane][s] !== SONG.parts.drums[bar][lane][s]) edits.push({ kind: 'hit', bar, lane, step: s });
        }
      }
    } else if (ed.kind === 'notes') {
      edits.push({ kind: 'clear', bar });
      for (const n of SONG.parts[ed.ladder][bar]) edits.push({ kind: 'place', bar, at: n.at, row: n.row, len: n.len });
    } else if (ed.kind === 'chords') {
      edits.push({ kind: 'chord', bar, mood: SONG.parts.chords[bar]! });
    }
  }
  if (ed.kind === 'arr') {
    for (const p of ['drums', 'bass', 'chords', 'melody'] as const) {
      SONG.parts.arr[p].forEach((on, section) => { if (b.arr[p][section] !== on) edits.push({ kind: 'section', part: p, section }); });
    }
  }
  return edits.reduce((acc, e) => applyEdit(level, acc, e) ?? acc, b);
}

/** One change of the player's own: a take where the level has takes, otherwise a new colour on its first bar. */
function makeYours(level: Level, own: Build): Build {
  const bar = level.bars[0];
  if (level.yours?.takes) return applyEdit(level, own, { kind: 'take', bar, take: 'surprise', n: 0 }, SONG)!;
  return applyEdit(level, own, { kind: 'chord', bar, mood: 'longing' }, SONG)!;
}

describe('the song', () => {
  it('is 28 bars, about a minute and sixteen seconds, in five sections', () => {
    expect(songBars(SONG)).toBe(28);
    expect(Math.round(songBars(SONG) * 4 * 60 / SONG.bpm)).toBe(76);
  });

  it('never plays a note below the laptop floor, or a sample moved further than it was measured to bear', () => {
    for (const midi of LADDER.bass) {
      expect(hz(midi)).toBeGreaterThanOrEqual(MIN_FUNDAMENTAL_HZ);
      expect(Math.abs(midi - ROOT.bass!)).toBeLessThanOrEqual(10);
    }
    for (const midi of LADDER.melody) expect(Math.abs(midi - ROOT.kalimba!)).toBeLessThanOrEqual(7);
    for (const mood of MOOD_ORDER) for (const midi of voicing(mood)) expect(Math.abs(midi - ROOT.keys!)).toBeLessThanOrEqual(7);
  });
});

describe('edits change exactly what they name', () => {
  it('a hit flips one step of one lane of one bar', () => {
    const a = emptyBuild(5);
    const b = toggleHit(a, 2, 'snare', 6);
    expect(b.drums[2].snare[6]).toBe(true);
    const flat = (x: Build) => x.drums.flatMap((d) => LANE_ORDER.flatMap((l) => d[l]));
    expect(flat(b).filter(Boolean)).toHaveLength(1);
    expect(toggleHit(b, 2, 'snare', 6)).toEqual(a);
  });

  it('a line plays one note at a time: a new note cuts a ringing one short, and stops at the next one', () => {
    let n = placeNote([], 0, 16, 0);
    expect(n).toEqual([{ at: 0, len: 16, row: 0 }]);
    n = placeNote(n, 8, 4, 2);
    expect(n).toEqual([{ at: 0, len: 8, row: 0 }, { at: 8, len: 4, row: 2 }]);
    n = placeNote(n, 4, 16, 3); // can only ring until the note at 8
    expect(n).toEqual([{ at: 0, len: 4, row: 0 }, { at: 4, len: 4, row: 3 }, { at: 8, len: 4, row: 2 }]);
    n = placeNote(n, 12, 99, 1); // and never past the end of the bar
    expect(n.at(-1)).toEqual({ at: 12, len: 4, row: 1 });
  });

  it('copying a bar replaces that part of the other bar, and nothing else', () => {
    const a = clone(SONG.parts);
    a.drums[1] = { hat: Array(16).fill(false), snare: Array(16).fill(true), kick: Array(16).fill(false) };
    const b = copyBar(a, 'drums', 0, 1, ['kick']);
    expect(b.drums[1].kick).toEqual(a.drums[0].kick);
    expect(b.drums[1].snare).toEqual(a.drums[1].snare);
    expect(b.bass).toEqual(a.bass);
  });

  it('a level refuses what it does not offer', () => {
    const b = emptyBuild(5);
    expect(applyEdit(by('heartbeat'), b, { kind: 'hit', bar: 0, lane: 'snare', step: 4 })).toBeNull();
    expect(applyEdit(by('heartbeat'), b, { kind: 'hit', bar: 0, lane: 'kick', step: 2 })).toBeNull(); // between the beats
    expect(applyEdit(by('heartbeat'), b, { kind: 'copy', from: 0, to: 1 })).toBeNull(); // no copying yet
    expect(applyEdit(by('floor'), b, { kind: 'place', bar: 0, at: 2, row: 0, len: 4 })).toBeNull(); // notes start on a beat
    expect(applyEdit(by('colors'), b, { kind: 'hit', bar: 0, lane: 'kick', step: 0 })).toBeNull();
    expect(applyEdit(by('heartbeat'), b, { kind: 'hit', bar: 4, lane: 'kick', step: 0 })).toBeNull();
  });
});

describe('the levels', () => {
  it('are made from the song: twelve to rebuild and three to make it yours, five worlds, each id once', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([
      'heartbeat', 'copy', 'clapback', 'zoomin', 'turn', 'yours-pulse', 'floor', 'moods', 'colors', 'yours-color',
      'tune', 'echo', 'land', 'yours-voice', 'story',
    ]);
    expect(LEVELS.filter((l) => l.yours).map((l) => l.world)).toEqual([0, 2, 3]);
    expect(new Set(LEVELS.map((l) => l.world))).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('have goals that name what to touch, in a few words, and names that come with a plain sentence', () => {
    for (const l of LEVELS) {
      expect(l.goal.split(' ').length, l.id).toBeLessThanOrEqual(9);
      expect(l.named.length, l.id).toBeLessThanOrEqual(120);
      expect(l.named.endsWith('.'), l.id).toBe(true);
    }
  });

  it('never offer a part on its own as Up close', () => {
    for (const l of LEVELS.filter((x) => x.editor.kind !== 'arr')) {
      const close = sourcesFor(l, new Set(), 'song', true);
      expect(VOICED.filter((r) => close[r] !== null).length, l.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('played in order, from nothing, rebuild exactly the song (three stars each), and make it the player\'s own', () => {
    let s = { ...freshSchool(), met: true };
    for (const [i, level] of LEVELS.entries()) {
      expect(unlocked(s, i), level.id).toBe(true);
      if (level.yours) {
        expect(level.check(s.own), `${level.id} is not met before a change`).toBe(false);
        const own = makeYours(level, s.own);
        expect(level.check(own), `${level.id} is met`).toBe(true);
        s = { ...s, own, done: [...s.done, level.id] };
      } else {
        expect(level.check(s.build), `${level.id} is not met before it is played`).toBe(false);
        const b = solve(level, s.build);
        expect(level.check(b), `${level.id} is met`).toBe(true);
        expect(starsNow(level, SONG, b), level.id).toBe(3);
        s = { ...s, build: b, done: [...s.done, level.id] };
      }
      expect(nextOpen(s, i)).toBe(Math.min(i + 1, LEVELS.length - 1));
    }
    const all: Row[] = [...LANE_ORDER, 'bass', 'chords', 'melody', 'arr'];
    expect(exact(compare(s.build, SONG, all, allBars))).toBe(true); // Make it yours never touched the rebuild
    expect([...rowsChanged(SONG, s.own)].sort()).toEqual(['bass', 'chords', 'hat', 'kick', 'melody', 'snare']);
  });

  it('give stars for the match: extra notes count against it', () => {
    const level = by('zoomin');
    const b = clone(SONG.parts);
    expect(starsNow(level, SONG, b)).toBe(3);
    b.drums[0].hat[0] = false;
    expect(starsNow(level, SONG, b)).toBe(2);
    for (let s = 0; s < 16; s += 2) for (const bar of allBars) b.drums[bar].hat[s] = s < 12;
    expect(starsNow(level, SONG, b)).toBe(2); // six of eight in each bar: three quarters of the way
    const clap = by('clapback');
    const c = clone(SONG.parts);
    for (const bar of allBars) { c.drums[bar].snare[0] = true; c.drums[bar].snare[8] = true; }
    expect(clap.check(c)).toBe(true);
    expect(starsNow(clap, SONG, c)).toBe(1); // a crack on every beat meets the goal, but it is not the song
    expect(starsFor(false, { right: 9, of: 9, extra: 0 })).toBe(0);
  });

  it('mark where the song goes: all of it, the first bar, the first beat, or nothing until Hint', () => {
    const b = emptyBuild(5);
    expect(holesIn(by('heartbeat'), SONG, b, 0, false).size).toBe(4);
    expect(holesIn(by('heartbeat'), SONG, b, 1, false).size).toBe(0); // only the bar the goal counts
    expect(holesIn(by('clapback'), SONG, b, 0, false).size).toBe(2);
    expect(holesIn(by('clapback'), SONG, b, 1, false).size).toBe(0);
    expect([...holesIn(by('zoomin'), SONG, b, 0, false)]).toEqual(['hat:0:0', 'hat:0:2']);
    expect(holesIn(by('moods'), SONG, b, 1, false).size).toBe(0);
    expect(holesIn(by('moods'), SONG, b, 1, true).size).toBe(SONG.parts.bass[1].length);
    expect(holesIn(by('story'), SONG, b, 0, true)).toEqual(new Set(['arr:drums:0', 'arr:melody:0']));
  });

  it('sew a bar shut when it is the song, but never give a chord away before the level is done', () => {
    const b = clone(SONG.parts);
    expect(barSewn(by('clapback'), SONG, b, 2)).toBe(true);
    expect(barSewn(by('colors'), SONG, b, 2)).toBe(false);
    expect(barSewn(by('colors'), SONG, b, 2, true)).toBe(true);
  });

  it('only count what the grid can show: the fill in bar 4 is not asked for at four pads a bar', () => {
    expect(barMarks(SONG.parts, 'snare', 3, 4)).toEqual(['snare:3:4', 'snare:3:12']);
    expect(barMarks(SONG.parts, 'snare', 3)).toEqual(['snare:3:4', 'snare:3:12', 'snare:3:14', 'snare:3:15']);
  });
});

describe('what plays', () => {
  const view = (id: string, extra: Partial<Parameters<typeof loopProgram>[0] extends () => infer V ? V : never> = {}) => ({
    song: SONG, mine: emptyBuild(5), level: by(id), owned: new Set<Row>(), listen: 'song' as const, close: false, scope: 'all' as const, unit: 0, slow: false, ...extra,
  });
  const voicesAt = (p: ReturnType<typeof loopProgram>, pos: number) => p.at(pos, 0.17).map((s) => s.voice);

  it('The song plays the song; Yours swaps in the player\'s part; rows not reached yet are the song\'s', () => {
    const mine = sourcesFor(by('clapback'), new Set<Row>(['kick']), 'mine');
    expect(mine).toEqual({ hat: 'song', snare: 'mine', kick: 'mine', bass: 'song', chords: 'song', melody: 'song' });
    const song = sourcesFor(by('clapback'), new Set<Row>(['kick']), 'song');
    expect(song.snare).toBe('song');
    const close = sourcesFor(by('clapback'), new Set<Row>(['kick']), 'song', true);
    expect(close).toEqual({ hat: null, snare: 'song', kick: 'mine', bass: null, chords: null, melody: null });
  });

  it('Up close works for Yours too: the player\'s part with its partner, and nothing else', () => {
    const close = sourcesFor(by('floor'), new Set<Row>(['kick', 'snare', 'hat']), 'mine', true);
    expect(close).toEqual({ hat: null, snare: null, kick: 'mine', bass: 'mine', chords: null, melody: null });
  });

  it('loops the bar on screen, or all four', () => {
    const v = view('copy', { scope: 'one', unit: 2 });
    expect(loopBar(v, 0)).toBe(2);
    expect(loopBar(v, 40)).toBe(2);
    expect(loopBar({ ...v, scope: 'all' }, 40)).toBe(2);
    expect(loopBar({ ...v, scope: 'all' }, 50)).toBe(3);
    const story = view('story', { scope: 'one', unit: 2 }); // the break: bars 12 to 15 of the song
    expect([0, 16, 48, 64].map((p) => loopBar(story, p))).toEqual([12, 13, 15, 12]);
  });

  it('plays the song\'s parts in its own arrangement: the intro has no drums, the break has no drums', () => {
    const p = songProgram(() => ({ song: SONG, mine: emptyBuild(5), src: sourcesOwned(new Set()), ownArr: false }));
    expect(voicesAt(p as never, 0)).not.toContain('kick');
    expect(voicesAt(p as never, 4 * STEPS)).toContain('kick'); // the verse
    expect(voicesAt(p as never, 12 * STEPS)).not.toContain('kick'); // the break
    expect(p.steps).toBe(28 * STEPS);
  });

  it('Slow plays at three quarters of the tempo', () => {
    expect(tempo(SONG, false)).toBe(88);
    expect(tempo(SONG, true)).toBe(66);
    expect(loopProgram(() => view('heartbeat', { slow: true })).bpm()).toBe(66);
  });

  it('a level that is not done plays the player\'s rows they own, and the rest from the song', () => {
    const owned = ownedRows({ song: 'first', done: ['heartbeat', 'copy', 'clapback', 'zoomin', 'turn'] });
    expect([...owned].sort()).toEqual(['hat', 'kick', 'snare']);
  });
});

describe('reading a save back', () => {
  it('repairs anything malformed and keeps what is good', () => {
    const s = sanitizeSchool({ song: 'nope', level: 99, done: ['heartbeat', 'nope', 3], stars: { heartbeat: 7, x: 1 }, build: { drums: 'x', chords: ['home', 'x', null, 'lift'] } });
    expect(s.song).toBe('first');
    expect(s.level).toBe(LEVELS.length - 1);
    expect(s.done).toEqual(['heartbeat']);
    expect(s.stars).toEqual({ heartbeat: 3 });
    expect(s.build.chords).toEqual(['home', null, null, 'lift']);
    expect(s.build.drums).toEqual(emptyBuild(5).drums);
  });

  it('reads a build back note by note, dropping notes that cannot be', () => {
    const b = sanitizeBuild({ bass: [[{ at: 0, len: 8, row: 0 }, { at: 4, len: 4, row: 9 }, { at: 20, len: 1, row: 0 }], [], [], []] }, 5);
    expect(b.bass[0]).toEqual([{ at: 0, len: 8, row: 0 }]);
  });

  it('starts a visit on the level\'s own bar, listening to the song', () => {
    expect(freshRoom(by('turn'))).toMatchObject({ bar: 3, listen: 'song', scope: 'one', hint: false, history: [] });
    expect(marks(emptyBuild(5), ['arr'], []).size).toBe(0); // everything plays until it is taken out
  });
});

describe('make it yours', () => {
  const fill = by('yours-pulse');
  const colours = by('yours-color');
  const answer = by('yours-voice');

  it('starts from the song: nothing is gold until the player changes it', () => {
    const own = freshSchool().own;
    expect(own).toEqual(SONG.parts);
    expect(rowsChanged(SONG, own).size).toBe(0);
    for (const l of [fill, colours, answer]) expect(changes(SONG, own, l), l.id).toBe(0);
  });

  it('marks gold what the player added and what they took out, nothing else', () => {
    const own = applyEdit(fill, SONG.parts, { kind: 'hit', bar: 3, lane: 'kick', step: 2 }, SONG)!;
    const less = applyEdit(fill, own, { kind: 'hit', bar: 3, lane: 'snare', step: 15 }, SONG)!;
    expect(hitGold(SONG, less, 3, 'kick', 2)).toBe(true);
    expect(hitGone(SONG, less, 3, 'snare', 15)).toBe(true);
    expect(hitGold(SONG, less, 3, 'kick', 0)).toBe(false);
    expect(changes(SONG, less, fill)).toBe(2);
    expect(barChanged(SONG, less, 3)).toBe(true);
    expect([0, 1, 2].some((bar) => barChanged(SONG, less, bar))).toBe(false);
  });

  it('changes only its own bars, never copies or clears, and needs the song to do it', () => {
    expect(applyEdit(fill, SONG.parts, { kind: 'hit', bar: 0, lane: 'kick', step: 2 }, SONG)).toBeNull();
    expect(applyEdit(fill, SONG.parts, { kind: 'copy', from: 3, to: 0 }, SONG)).toBeNull();
    expect(applyEdit(fill, SONG.parts, { kind: 'clear', bar: 3 }, SONG)).toBeNull();
    expect(applyEdit(fill, SONG.parts, { kind: 'hit', bar: 3, lane: 'kick', step: 2 })).toBeNull();
    expect(applyEdit(answer, SONG.parts, { kind: 'place', bar: 0, at: 0, row: 3, len: 4 }, SONG)).toBeNull(); // the song's call
    expect(applyEdit(answer, SONG.parts, { kind: 'place', bar: 1, at: 0, row: 3, len: 4 }, SONG)).not.toBeNull();
  });

  it('a new colour takes the bass to its root; the song\'s colour brings the song\'s bass back', () => {
    const own = applyEdit(colours, SONG.parts, { kind: 'chord', bar: 2, mood: 'longing' }, SONG)!;
    expect(own.chords[2]).toBe('longing');
    expect(own.bass[2].map((n) => n.row)).toEqual([rootRow('longing'), rootRow('longing'), SONG.parts.bass[2][2].row]);
    expect(own.bass[2].map((n) => [n.at, n.len])).toEqual(SONG.parts.bass[2].map((n) => [n.at, n.len])); // same rhythm
    expect(changedIn(SONG, own, 'bass', 2)).toBe(true);
    const back = followRoot(SONG, own, 2, SONG.parts.chords[2]!);
    expect(back).toEqual(SONG.parts);
  });

  it('goes back to the song\'s for the level\'s bars only', () => {
    let own = applyEdit(colours, SONG.parts, { kind: 'chord', bar: 0, mood: 'restless' }, SONG)!;
    own = applyEdit(fill, own, { kind: 'hit', bar: 3, lane: 'hat', step: 1 }, SONG)!;
    const back = applyEdit(colours, own, { kind: 'reset' }, SONG)!;
    expect(back.chords).toEqual(SONG.parts.chords);
    expect(back.bass).toEqual(SONG.parts.bass);
    expect(back.drums[3].hat[1]).toBe(true); // the fill is another level's
    expect(backToSong(SONG, back, fill)).toEqual(SONG.parts);
  });

  it('takes change the bar on screen, on the level\'s grid, the same way each time; the last bar\'s tune lands home', () => {
    for (const take of ['busier', 'emptier', 'surprise'] as const) {
      for (const n of [0, 1, 2, 3]) {
        const d = takeOn(fill, SONG.parts, 3, take, n)!;
        expect(changedIn(SONG, d, 'drums', 3), `${take} ${n}`).toBe(true);
        expect([0, 1, 2].some((bar) => barChanged(SONG, d, bar))).toBe(false);
        expect(takeOn(fill, SONG.parts, 3, take, n)).toEqual(d);
        for (const bar of [1, 3]) {
          const m = takeOn(answer, SONG.parts, bar, take, n)!;
          expect(m.melody[bar].every((x) => x.at % 4 === 0 && x.len % 4 === 0 && x.at + x.len <= STEPS), `${take} ${n} bar ${bar}`).toBe(true);
          if (bar === 3) expect(m.melody[3].at(-1)!.row).toBe(2);
        }
      }
    }
    expect(takeOn(colours, SONG.parts, 2, 'busier', 0)).toBeNull(); // colours have no takes
    expect(takeOn(fill, SONG.parts, 0, 'busier', 0)).toBeNull(); // nor bars the level does not open
  });

  it('plays the song in The song and the player\'s own in Yours: they differ by exactly the change', () => {
    const yours = new Set<Row>(['kick', 'snare', 'hat']);
    const song = sourcesFor(colours, new Set<Row>(['kick', 'snare', 'hat', 'bass', 'chords']), 'song', false, yours);
    const mine = sourcesFor(colours, new Set<Row>(['kick', 'snare', 'hat', 'bass', 'chords']), 'mine', false, yours);
    expect(song.chords).toBe('song');
    expect(song.bass).toBe('song'); // the bass moves with the colour, so it is part of the A and the B
    expect(mine.chords).toBe('own');
    expect(mine.bass).toBe('own');
    expect(mine.kick).toBe('own'); // the player's own fill plays everywhere
    expect(song.melody).toBe('song');
  });

  it('never stands in the way of the next world, and Continue goes on from where the player is', () => {
    let s: SchoolSaved = { ...freshSchool(), met: true, done: LEVELS.slice(0, 5).map((l) => l.id) }; // Pulse rebuilt
    const floor = LEVELS.findIndex((l) => l.id === 'floor');
    expect(unlocked(s, floor)).toBe(true);
    s = { ...s, done: [...s.done, 'floor', 'moods'] };
    expect(nextOpen(s, floor)).toBe(LEVELS.findIndex((l) => l.id === 'colors'));
    expect(nextOpen(s, 0)).toBe(LEVELS.findIndex((l) => l.id === 'yours-pulse'));
    expect(allDone({ ...s, done: LEVELS.filter((l) => !l.yours).map((l) => l.id) })).toBe(true);
    expect(madeYours(s)).toBe(false);
  });
});

describe('today\'s twist', () => {
  const pulseYours = (): SchoolSaved => ({ ...freshSchool(), met: true, done: [...LEVELS.slice(0, 6).map((l) => l.id)] });
  const everything = (): SchoolSaved => ({ ...freshSchool(), met: true, done: LEVELS.map((l) => l.id) });

  it('is offered once something is the player\'s own, on a part whose world is rebuilt', () => {
    expect(twistToday({ ...freshSchool(), met: true, done: LEVELS.slice(0, 5).map((l) => l.id) }, '2026-10-15')).toBeNull();
    for (let d = 0; d < 30; d++) {
      const on = new Date(Date.UTC(2026, 9, 15 + d)).toISOString().slice(0, 10);
      expect(twistToday(pulseYours(), on)!.part, on).toBe('drums'); // only the drums are rebuilt
    }
  });

  it('is the same all day, and not the same two days running', () => {
    const s = everything();
    let last = '';
    for (let d = 0; d < 40; d++) {
      const on = new Date(Date.UTC(2026, 9, 15 + d)).toISOString().slice(0, 10);
      const t = twistToday(s, on)!;
      expect(twistToday(s, on)!.id).toBe(t.id);
      expect(t.id, on).not.toBe(last);
      last = t.id;
    }
    expect(dayNumber('2026-10-15') - dayNumber('2026-10-14')).toBe(1);
  });

  it('has goals of a few words, each possible from the song, and none met by the song itself', () => {
    for (const t of TWISTS) {
      expect(t.goal.split(' ').length, t.id).toBeLessThanOrEqual(9);
      expect(t.named.endsWith('.'), t.id).toBe(true);
      expect(t.possible(SONG.parts), t.id).toBe(true);
      expect(t.check(SONG.parts, SONG.parts), t.id).toBe(false);
    }
    expect(twistOn('2026-10-15', new Set([0, 1, 2, 3]), SONG.parts)).not.toBeNull();
  });

  it('offers a new twist every day from 14 October to the end of the month, in calendar order', () => {
    const s = everything();
    const october = Array.from({ length: 18 }, (_, d) => new Date(Date.UTC(2026, 9, 14 + d)).toISOString().slice(0, 10));
    expect(october[0]).toBe(FIRST_DAY);
    expect(october.at(-1)).toBe('2026-10-31');
    const ids = october.map((on) => twistToday(s, on)!.id);
    expect(new Set(ids).size).toBe(18);
    expect(ids).toEqual(TWISTS.slice(0, 18).map((t) => t.id));
    expect(TWISTS).toHaveLength(20);
    expect(new Set(TWISTS.map((t) => t.id)).size).toBe(20);
    // The parts take turns down the list.
    TWISTS.forEach((t, i) => expect(t.part, t.id).not.toBe(TWISTS[(i + 1) % TWISTS.length].part));
  });

  it('leaves out a twist already sewn while another is open', () => {
    const s = { ...everything(), sewn: [{ on: FIRST_DAY, id: TWISTS[1].id }] };
    const t = twistToday(s, '2026-10-15')!; // the calendar's day for TWISTS[1]
    expect(t.id).not.toBe(TWISTS[1].id);
    // Every drum twist sewn, with only the drums rebuilt: they come round again rather than nothing.
    const drums = TWISTS.filter((x) => x.part === 'drums');
    expect(twistOn('2026-10-20', new Set([0]), SONG.parts, new Set(drums.map((x) => x.id)))?.part).toBe('drums');
  });

  it('can each be done from the song, with its own level\'s edits, and the check then passes', () => {
    const hits = (bar: number, lane: 'kick' | 'snare' | 'hat', steps: number[]): Edit[] => steps.map((step) => ({ kind: 'hit', bar, lane, step }));
    const moves: Record<string, Edit[]> = {
      less: hits(2, 'hat', [2]),
      swap: [{ kind: 'chord', bar: 1, mood: 'bright' }, { kind: 'chord', bar: 2, mood: 'warm' }],
      long: [{ kind: 'remove', bar: 1, at: 4 }],
      offbeat: hits(1, 'kick', [6]),
      whole: [{ kind: 'remove', bar: 2, at: 8 }, { kind: 'remove', bar: 2, at: 12 }, { kind: 'resize', bar: 2, at: 0, len: 16 }],
      new: [{ kind: 'chord', bar: 2, mood: 'longing' }],
      more: hits(0, 'hat', [1]),
      rhythm: [{ kind: 'resize', bar: 2, at: 4, len: 4 }],
      climb: [{ kind: 'move', bar: 3, at: 0, row: 0 }, { kind: 'move', bar: 3, at: 8, row: 1 }, { kind: 'move', bar: 3, at: 12, row: 2 }],
      fall: [{ kind: 'move', bar: 3, at: 4, row: 5 }],
      drop: hits(3, 'kick', [0, 4, 8, 12]),
      hold: [{ kind: 'chord', bar: 1, mood: 'home' }],
      peak: [{ kind: 'move', bar: 0, at: 12, row: 5 }],
      pedal: [0, 8, 12].map((at): Edit => ({ kind: 'move', bar: 1, at, row: 0 })),
      offhats: hits(1, 'hat', [0, 4, 8, 12]),
      leap: [{ kind: 'move', bar: 2, at: 4, row: 5 }],
      short: [{ kind: 'resize', bar: 0, at: 0, len: 4 }, { kind: 'place', bar: 0, at: 4, row: 0, len: 4 }],
      cadence: [{ kind: 'chord', bar: 3, mood: 'home' }],
      halftime: hits(2, 'snare', [4, 12, 8]),
      open: [{ kind: 'move', bar: 3, at: 8, row: 1 }],
    };
    expect(Object.keys(moves).sort()).toEqual(TWISTS.map((t) => t.id).sort());
    for (const t of TWISTS) {
      const level = twistLevel(t, SONG, SONG.parts);
      let b: Build = SONG.parts;
      expect(level.check(b), t.id).toBe(false);
      for (const e of moves[t.id]) {
        const next = applyEdit(level, b, e, SONG);
        expect(next, `${t.id}: ${JSON.stringify(e)}`).not.toBeNull();
        b = next!;
      }
      expect(level.check(b), t.id).toBe(true);
    }
  });

  it('is checked against the song as it was when started, so an earlier change never counts for today', () => {
    let s = everything();
    // The day the swap is offered, with the song's own colours.
    const on = Array.from({ length: 40 }, (_, d) => new Date(Date.UTC(2026, 9, 15 + d)).toISOString().slice(0, 10))
      .find((d) => twistToday(s, d)?.id === 'swap')!;
    s = startTwist(s, on);
    expect(s.today).toEqual({ on, id: 'swap', from: s.own });
    expect(startTwist(s, on)).toBe(s); // picked up again the same day, unchanged
    const level = todayLevel(s)!;
    expect(todayLevel(s)).toBe(level); // the same level object while the twist lasts
    expect(activeLevel({ school: s, room: { twist: true } })).toBe(level);
    expect(level.bars).toEqual([1, 2]);
    let own = applyEdit(level, s.own, { kind: 'chord', bar: 1, mood: s.own.chords[2]! }, SONG)!;
    expect(level.check(own)).toBe(false);
    own = applyEdit(level, own, { kind: 'chord', bar: 2, mood: SONG.parts.chords[1]! }, SONG)!;
    expect(level.check(own)).toBe(true);
    expect(applyEdit(level, own, { kind: 'chord', bar: 0, mood: 'restless' }, SONG)).toBeNull();
  });
});

describe('saves', () => {
  it('read a 0.4.1 save: its level index counts the rebuilding levels only', () => {
    // 0.4.1 had twelve levels; index 7 was Paint the bars.
    const s = sanitizeSchool({ song: 'first', build: null, level: 7, done: ['heartbeat'], stars: {}, met: true });
    expect(LEVELS[s.level].id).toBe('colors');
    expect(s.own).toEqual(SONG.parts);
    expect(s.today).toBeNull();
    expect(s.sewn).toEqual([]);
  });

  it('write the exact level by id, and an index 0.4.1 reads as the level before Make it yours', () => {
    const s = { ...freshSchool(), level: LEVELS.findIndex((l) => l.id === 'yours-color') };
    const saved = savedSchool(s);
    expect(saved.levelId).toBe('yours-color');
    const old = LEVELS.filter((l) => !l.yours);
    expect(old[saved.level].id).toBe('colors');
    expect(sanitizeSchool(JSON.parse(JSON.stringify(saved))).level).toBe(s.level);
    expect(old[savedSchool({ ...s, level: LEVELS.findIndex((l) => l.id === 'story') }).level].id).toBe('story');
  });

  it('keep the player\'s own song, today\'s twist and the sampler, and repair what is broken', () => {
    const own = applyEdit(by('yours-pulse'), SONG.parts, { kind: 'hit', bar: 3, lane: 'kick', step: 2 }, SONG)!;
    const s = sanitizeSchool(JSON.parse(JSON.stringify({
      ...freshSchool(), own, today: { on: '2026-10-15', id: 'less', from: SONG.parts },
      sewn: [{ on: '2026-10-14', id: 'more' }, { on: '2026-10-14', id: 'long' }, { on: 'yesterday', id: 'x' }, null],
    })));
    expect(s.own).toEqual(own);
    expect(s.today?.id).toBe('less');
    expect(s.sewn).toEqual([{ on: '2026-10-14', id: 'more' }]);
    expect(sanitizeSchool({ today: { on: '2026-10-15', id: 'no-such-twist', from: {} } }).today).toBeNull();
  });
});
