// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test } from '@playwright/test';

/**
 * School's sound, checked on real rendered audio without playing a sound: the song is rendered with the real samples
 * into an OfflineAudioContext (memory only) and measured.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/offline/school.html');
  await page.waitForFunction(() => typeof (window as any).songPeak === 'function');
});

test('the whole song, every part at once, never clips', async ({ page }) => {
  test.setTimeout(90_000);
  const peak = await page.evaluate(() => (window as any).songPeak());
  expect(peak).toBeGreaterThan(0.2); // it is really playing
  expect(peak).toBeLessThan(1);
});

test('Stop fades to silence (-60 dB within 100 ms) and never clicks, even mid-note', async ({ page }) => {
  const r = await page.evaluate(() => (window as any).stopClean());
  expect(r.before).toBeGreaterThan(0.05); // something was sounding
  expect(r.after).toBeLessThan(0.001);
  expect(r.jump).toBeLessThan(0.2);
});
