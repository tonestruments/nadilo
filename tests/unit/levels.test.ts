// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { LEVELS, STEPS, type Lane } from '../../src/game/levels';
import { givenOf, laneFullyGiven, patternKey, targetOf } from '../../src/game/logic';

describe('curriculum', () => {
  it('has 12 or 13 levels with sequential ids', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(12);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
  });

  it('never repeats a pattern', () => {
    const keys = LEVELS.map(patternKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses only kick and snare in chapter 1, and adds the hi-hat in chapter 2', () => {
    for (const l of LEVELS) {
      if (l.chapter === 1) {
        expect(l.lanes).toEqual(['snare', 'kick']);
        expect(l.target.hat ?? []).toEqual([]);
      } else {
        expect(l.lanes).toEqual(['hat', 'snare', 'kick']);
        expect(targetOf(l, 'hat').length).toBeGreaterThan(0);
      }
    }
    const chapters = LEVELS.map((l) => l.chapter);
    expect(chapters).toEqual([...chapters].sort()); // chapter 1 comes first, all together
  });

  it('starts with no stacked sounds, then teaches stacking on level 2 with one shared step', () => {
    const first = LEVELS[0];
    expect(targetOf(first, 'kick').some((s) => targetOf(first, 'snare').includes(s))).toBe(false);
    const second = LEVELS[1];
    expect(targetOf(second, 'kick')).toEqual([0]);
    expect(targetOf(second, 'snare')).toEqual([0]);
  });

  it('introduces the hi-hat with its whole lane given, then tapers the anchors', () => {
    const firstHat = LEVELS.find((l) => l.chapter === 2)!;
    expect(laneFullyGiven(firstHat, 'hat')).toBe(true);
    const next = LEVELS[LEVELS.indexOf(firstHat) + 1];
    expect(laneFullyGiven(next, 'kick')).toBe(true);
    expect(LEVELS[LEVELS.length - 1].given).toEqual({});
  });

  it('only gives notes that are part of the target, and always leaves something to place', () => {
    for (const l of LEVELS) {
      let toPlace = 0;
      for (const lane of l.lanes as Lane[]) {
        const t = targetOf(l, lane);
        for (const s of givenOf(l, lane)) expect(t).toContain(s);
        for (const s of t) expect(s >= 0 && s < STEPS).toBe(true);
        toPlace += t.length - givenOf(l, lane).size;
      }
      expect(toPlace, `level ${l.id}`).toBeGreaterThan(0);
    }
  });

  it('has short copy above the grid', () => {
    for (const l of LEVELS) {
      expect(l.task.length, l.task).toBeLessThanOrEqual(32);
      expect(l.hint.length, l.hint).toBeLessThanOrEqual(60);
    }
  });

  it('contains no Japanese characters in any player-facing text', () => {
    const cjk = /[぀-ヿ㐀-鿿]/;
    expect(cjk.test(JSON.stringify(LEVELS))).toBe(false);
  });
});
