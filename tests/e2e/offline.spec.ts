// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test } from '@playwright/test';

/**
 * Timing, checked on real rendered audio without playing a sound: the samples and the engine's schedule
 * are rendered into an OfflineAudioContext (memory only), and every hit's onset is measured to the sample.
 */
const STEP = 156.25; // ms at 96 BPM
const BAR = STEP * 16;
const near = (actual: number[], expected: number[]) => {
  expect(actual.length).toBe(expected.length);
  actual.forEach((a, i) => expect(Math.abs(a - expected[i]), `hit ${i}: ${a.toFixed(3)} vs ${expected[i]}`).toBeLessThan(0.1));
};

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/offline/harness.html');
  await page.waitForFunction(() => typeof (window as any).onsetsMs === 'function');
});

test('every hit lands on its step, bar after bar', async ({ page }) => {
  const o = await page.evaluate(() => (window as any).onsetsMs({ kick: [0, 3, 8], hat: [0, 4, 8, 12] }, 2));
  near(o.kick, [0, 3, 8, 16, 19, 24].map((s) => s * STEP));
  near(o.hat, [0, 4, 8, 12, 16, 20, 24, 28].map((s) => s * STEP + 9)); // hi-hat plays 9 ms late, for feel
  expect(BAR).toBe(2500);
});

test('the snare plays 4 ms late on its own, and 30 ms late when stacked on a kick', async ({ page }) => {
  const alone = await page.evaluate(() => (window as any).onsetsMs({ kick: [0, 8], snare: [4, 12] }, 1));
  near(alone.snare, [4 * STEP + 4, 12 * STEP + 4]);
  near(alone.kick, [0, 8 * STEP]);

  const stacked = await page.evaluate(() => (window as any).onsetsMs({ kick: [0, 4, 8, 12], snare: [4, 12] }, 1));
  near(stacked.snare, [4 * STEP + 30, 12 * STEP + 30]);
  near(stacked.kick, [0, 4, 8, 12].map((s) => s * STEP));
});
