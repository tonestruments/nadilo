// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { estimateOffset } from '../../src/audio/calibration';
import { KIT, STACK_FLAM, STEP_SECONDS, hitsAtStep, stepTime } from '../../src/audio/schedule';
import { toPattern } from '../../src/game/logic';
import { loadPersisted, loadProgress, mergeProgress, savePersisted, serializePersisted } from '../../src/machine/persist';
import { DEFAULTS } from '../../src/machine/appMachine';

describe('schedule', () => {
  it('runs at 96 BPM in sixteenth notes', () => {
    expect(STEP_SECONDS * 1000).toBeCloseTo(156.25, 6);
    expect(stepTime(1, 16)).toBeCloseTo(1 + 2.5, 9); // one bar is 2.5 s
  });

  it('applies the feel offsets: kick on the grid, snare +4 ms, hi-hat +9 ms', () => {
    const p = toPattern({ kick: [0], snare: [4], hat: [2] });
    expect(hitsAtStep(p, 0)).toEqual([{ lane: 'kick', delay: 0 }]);
    expect(hitsAtStep(p, 4)).toEqual([{ lane: 'snare', delay: KIT.snare.offset }]);
    expect(hitsAtStep(p, 2)).toEqual([{ lane: 'hat', delay: KIT.hat.offset }]);
    expect(hitsAtStep(p, 1)).toEqual([]);
  });

  it('flams a snare that shares a step with the kick', () => {
    const p = toPattern({ kick: [0], snare: [0] });
    expect(hitsAtStep(p, 0)).toEqual([{ lane: 'snare', delay: STACK_FLAM }, { lane: 'kick', delay: 0 }]);
    expect(STACK_FLAM).toBeGreaterThan(KIT.snare.offset);
  });
});

describe('sync calibration estimate', () => {
  const BEAT = 625; // ms, one beat at 96 BPM
  const beats = Array.from({ length: 16 }, (_, i) => 1000 + i * BEAT);
  const jitter = [3, -5, 8, -2, 0, 6, -7, 4, -3, 5];

  it('measures a Bluetooth-sized delay', () => {
    const taps = beats.slice(2, 12).map((b, i) => b + 180 + jitter[i]);
    const e = estimateOffset(taps, beats, BEAT)!;
    expect(e.offsetMs).toBeGreaterThanOrEqual(175);
    expect(e.offsetMs).toBeLessThanOrEqual(185);
    expect(e.used).toBe(10);
  });

  it('treats normal tapping wobble on wired output as no correction', () => {
    const taps = beats.slice(2, 12).map((b, i) => b - 10 + jitter[i]);
    expect(estimateOffset(taps, beats, BEAT)!.offsetMs).toBe(0);
  });

  it('never moves the playhead ahead of the sound: tapping early is the player anticipating the beat', () => {
    const taps = beats.slice(2, 12).map((b, i) => b - 56 + jitter[i]);
    expect(estimateOffset(taps, beats, BEAT)!.offsetMs).toBe(0);
  });

  it('ignores a stray tap', () => {
    const taps = beats.slice(2, 10).map((b, i) => b + 120 + jitter[i]);
    taps.splice(3, 0, beats[5] - 290); // an accidental early tap
    const e = estimateOffset(taps, beats, BEAT)!;
    expect(Math.abs(e.offsetMs - 120)).toBeLessThanOrEqual(6);
  });

  it('refuses to guess from too few or scattered taps', () => {
    expect(estimateOffset(beats.slice(0, 3).map((b) => b + 100), beats, BEAT)).toBeNull();
    const scattered = beats.slice(0, 10).map((b, i) => b + (i % 2 ? 250 : -150));
    expect(estimateOffset(scattered, beats, BEAT)).toBeNull();
  });
});

describe('persistence', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it('round-trips what should survive a restart', () => {
    const store = memory();
    const p = { ...DEFAULTS, onboarded: true, cues: false, solved: [1, 2], levelIdx: 2, syncOffsetMs: 150 };
    savePersisted(p, store);
    expect(loadPersisted(store)).toEqual(p);
  });

  it('keeps preferences from the old store but resets progress saved before the level reorder', () => {
    const store = memory();
    store.setItem('nadilo', JSON.stringify({ state: { onboarded: true, cues: false, solved: [1, 3], levelIdx: 5 }, version: 1 }));
    expect(loadPersisted(store)).toEqual({ onboarded: true, cues: false, solved: [], levelIdx: 0 });
    store.setItem('nadilo', JSON.stringify({ state: { onboarded: true, cues: true, solved: [1, 3], levelIdx: 5 }, version: 2 }));
    expect(loadPersisted(store)).toEqual({ onboarded: true, cues: true, solved: [1, 3], levelIdx: 5 });
  });

  it('survives garbage in storage', () => {
    const store = memory();
    store.setItem('nadilo', '{not json');
    expect(loadPersisted(store)).toEqual({});
  });

  it('keeps per-level records, and drops malformed ones', () => {
    const store = memory();
    const p = { ...DEFAULTS, onboarded: true, solved: [1, 4], records: { 1: { checks: 1, on: '2026-09-26' }, 4: { checks: 3, on: '2026-09-27', peeked: true } } };
    savePersisted(p, store);
    expect(loadPersisted(store)).toEqual(p);

    const saved = JSON.parse(store.getItem('nadilo')!);
    store.setItem('nadilo', JSON.stringify({ ...saved, records: { 1: { checks: 0 }, x: { checks: 2 }, 2: 'nope', 3: { checks: 2, on: 5 } } }));
    expect(loadPersisted(store).records).toEqual({ 3: { checks: 2, on: '' } });
  });

  it('upgrades progress saved before records existed (v3)', () => {
    const store = memory();
    store.setItem('nadilo', JSON.stringify({ v: 3, onboarded: true, cues: true, solved: [1, 2], levelIdx: 2, syncOffsetMs: 40 }));
    expect(loadPersisted(store)).toEqual({ onboarded: true, cues: true, solved: [1, 2], levelIdx: 2, syncOffsetMs: 40, records: {} });
  });

  it('loads the progress file and localStorage together, and falls back to either alone', async () => {
    const store = memory();
    const inStorage = { ...DEFAULTS, onboarded: true, solved: [1], levelIdx: 1, syncOffsetMs: 170, records: { 1: { checks: 1, on: '2026-09-20' } } };
    savePersisted(inStorage, store);
    const file = (text: string | null) => () => Promise.resolve(text);

    // The same progress in both: nothing changes.
    expect(await loadProgress(file(serializePersisted(inStorage)), store)).toEqual(inStorage);
    // No file yet (the first run with it), an unreadable one, or none at all: localStorage alone.
    expect(await loadProgress(file(null), store)).toEqual(inStorage);
    expect(await loadProgress(file('{broken'), store)).toEqual(inStorage);
    expect(await loadProgress(() => Promise.reject(new Error('no app data dir')), memory())).toEqual({});
    // A browser, or storage cleared: the file alone.
    expect(await loadProgress(file(serializePersisted(inStorage)), memory())).toEqual(inStorage);
  });

  it('never loses a solved level when the two copies differ', () => {
    // The installed app's localStorage, and a file last written by a dev build that had solved one other level.
    const installed = { ...DEFAULTS, onboarded: true, cues: false, solved: [1, 2, 3], levelIdx: 3, syncOffsetMs: 170, records: { 1: { checks: 1, on: '2026-09-20' } } };
    const devFile = { ...DEFAULTS, onboarded: true, solved: [5], levelIdx: 5, records: { 5: { checks: 2, on: '2026-09-26' } } };
    expect(mergeProgress(devFile, installed)).toEqual({
      ...installed, // the copy with more solved levels keeps its settings and place
      solved: [1, 2, 3, 5],
      records: { 1: { checks: 1, on: '2026-09-20' }, 5: { checks: 2, on: '2026-09-26' } },
    });
    // A fresh file (onboarding not done) never undoes onboarding.
    expect(mergeProgress({ ...DEFAULTS }, installed).onboarded).toBe(true);
  });
});
