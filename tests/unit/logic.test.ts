// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/game/levels';
import { coachTip } from '../../src/game/copy';
import { cellState, checkBeat, emptyPlaced, minePattern, wrongLanes, type Placed } from '../../src/game/logic';

const heartbeat = LEVELS.find((l) => l.name === 'Heartbeat')!; // snare given, find the kick on every beat
const place = (p: Partial<Record<'hat' | 'snare' | 'kick', number[]>>): Placed => ({ ...emptyPlaced(), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, new Set(v)])) });

describe('cell states', () => {
  it('shows given notes and hides the rest of the target before a reveal', () => {
    expect(cellState(heartbeat, 'snare', 4, emptyPlaced(), null)).toBe('given');
    expect(cellState(heartbeat, 'kick', 0, emptyPlaced(), null)).toBe('empty'); // hidden target note
    expect(cellState(heartbeat, 'kick', 0, place({ kick: [0] }), null)).toBe('placed');
  });

  it('marks correct, missed and extra after a reveal', () => {
    const p = place({ kick: [0, 5] });
    expect(cellState(heartbeat, 'kick', 0, p, 'answer')).toBe('correct');
    expect(cellState(heartbeat, 'kick', 4, p, 'answer')).toBe('missed');
    expect(cellState(heartbeat, 'kick', 5, p, 'answer')).toBe('extra');
  });
});

describe('check', () => {
  it('passes only when every lane matches, counting given notes', () => {
    expect(checkBeat(heartbeat, place({ kick: [0, 4, 8, 12] })).ok).toBe(true);
    const r = checkBeat(heartbeat, place({ kick: [0, 4, 8] }));
    expect(r.ok).toBe(false);
    expect(wrongLanes(heartbeat, r)).toEqual(['kick']);
  });

  it('fails on extra notes', () => {
    expect(checkBeat(heartbeat, place({ kick: [0, 4, 8, 12, 13] })).ok).toBe(false);
  });

  it('plays given notes plus the player’s notes in “play yours”', () => {
    const pat = minePattern(heartbeat, place({ kick: [0] }));
    expect([...pat.snare].sort((a, b) => a - b)).toEqual([4, 12]);
    expect([...pat.kick]).toEqual([0]);
    expect(pat.hat.size).toBe(0);
  });
});

describe('the coach', () => {
  const lvl = (name: string) => LEVELS.find((l) => l.name === name)!;
  /** What the coach sees: the level, the grid, and how many checks found each lane off. */
  const view = (name: string, p: Partial<Record<'hat' | 'snare' | 'kick', number[]>> = {}, o: { listens?: number; playing?: 'target' | null; misses?: number; stale?: boolean } = {}) => {
    const level = lvl(name);
    const placed = place(p);
    const checked = o.misses !== undefined;
    const result = checked ? { ...checkBeat(level, placed), stale: !!o.stale } : null;
    const misses = result ? Object.fromEntries(wrongLanes(level, result).map((l) => [l, o.misses!])) : {};
    return { level, placed, listens: o.listens ?? 1, result, reveal: null, playing: o.playing ?? null, misses };
  };

  it('before the first listen: the level\'s own tip, or on level 1 to listen all the way through, and otherwise quiet', () => {
    expect(coachTip(view('The Backbeat', {}, { listens: 0 }))).toBe('Listen all the way through before you place anything.');
    expect(coachTip(view('Together', {}, { listens: 0 }))).toBe(lvl('Together').tip);
    expect(coachTip(view('Heartbeat', {}, { listens: 0 }))).toBeNull();
    expect(coachTip(view('Heartbeat', {}, { listens: 0 }), true)).toBe('Listen all the way through before you place anything.');
  });

  it('while the hidden beat plays and nothing is placed: say it out loud, a word for each sound still to find', () => {
    expect(coachTip(view('The Backbeat', {}, { playing: 'target' }))).toBe('Say “tak” on every snare as it plays.');
    expect(coachTip(view('Syncopated', {}, { playing: 'target' })))
      .toBe('Say it as it plays: “ts” for the hi-hat, “tak” for the snare, “boom” for the kick.');
    expect(coachTip(view('Heartbeat', {}, { listens: 3 }))).toBe('Place the one hit you’re surest of first. You can move it later.');
  });

  it('gets more specific each time a check finds the same lane off, and never names a step', () => {
    const off = (misses: number) => coachTip(view('Heartbeat', { kick: [0, 4, 8, 12, 13] }, { misses }));
    expect(off(1)).toMatch(/boom/);
    expect(off(2)).toBe('There are fewer kick hits than that. Which one is extra?');
    expect(off(3)).toBe('Press “Hear the kick alone”, and say “boom” with every hit.');
    expect(coachTip(view('Double Kick', { kick: [0, 8], snare: [4] }, { misses: 2 }))).toBe('There are more kick hits than that. Listen between the ones you have.');
    // Heartbeat's missing kicks land on the snare: the first daily beats' problem.
    expect(coachTip(view('Heartbeat', { kick: [0, 8] }, { misses: 2 }))).toBe('Two sounds can land on one step. Listen for one bigger hit.');
    // Two sounds on one step (the snare lands with the given kick), and a pattern tidier than the beat.
    expect(coachTip(view('Together', { snare: [4] }, { misses: 2 }))).toBe('Two sounds can land on one step. Listen for one bigger hit.');
    expect(coachTip(view('The Lean', { kick: [0, 8], snare: [4, 12] }, { misses: 2 }))).toBe('Tidy on the grid isn’t always what plays. Trust your ear over the pattern.');
    expect(coachTip(view('The Lean', { kick: [0, 7], snare: [4, 12] }, { misses: 2 }))).toBe('You have the right number of kick hits, but not all in the right places.');
    for (const m of [1, 2, 3]) expect(off(m)).not.toMatch(/\d/);
  });

  it('is quiet when it has nothing to add, and always answers when asked', () => {
    expect(coachTip(view('Heartbeat', { kick: [0] }))).toBeNull();
    expect(coachTip(view('Heartbeat', { kick: [0] }), true)).toBe('Say “boom” on every kick as it plays.');
    expect(coachTip(view('Heartbeat', { kick: [0, 4, 8, 13] }, { misses: 1, stale: true }))).toBeNull();
    expect(coachTip({ ...view('Heartbeat'), reveal: 'solved' }, true)).toBeNull();
  });
});
