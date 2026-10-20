// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { test } from '@playwright/test';
import { freshStart, openLevel, place } from './helpers';

// Not assertions: renders each key state to test-results/screens/ for design review.
const shot = (name: string, project: string) => ({ path: `test-results/screens/${project}-${name}.png` });

test('capture key screens', async ({ page }, info) => {
  test.setTimeout(90_000);
  const p = info.project.name;
  await freshStart(page);
  await page.waitForTimeout(1200);
  await page.screenshot(shot('01-welcome', p));
  await page.getByTestId('get-started').click();
  await page.waitForTimeout(900);
  await page.screenshot(shot('02-sound', p));
  await page.getByTestId('test-sound').click();
  await page.waitForTimeout(900);
  await page.screenshot(shot('03-sound-playing', p));
  await page.getByTestId('can-hear').click();
  await page.waitForTimeout(900);
  await page.screenshot(shot('04-sync-intro', p));
  await page.getByTestId('sync-start').click();
  await page.waitForTimeout(700);
  await page.screenshot(shot('05-sync-tapping', p));
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.waitForTimeout(900);
  await page.screenshot(shot('06-school-first-level', p));

  await openLevel(page, 1);
  await page.waitForTimeout(500);
  await page.screenshot(shot('07-level1', p));

  await openLevel(page, 10);
  await page.getByTestId('listen').click();
  await page.waitForTimeout(700);
  await page.screenshot(shot('08-level10-listening', p));
  await page.getByTestId('listen').click();
  await place(page, { hat: [2, 4, 6, 10, 12, 14], kick: [3, 9], snare: [4] });
  await page.getByTestId('check').click();
  await page.waitForTimeout(400);
  await page.screenshot(shot('09-level10-almost', p));

  await openLevel(page, 1);
  await place(page, { snare: [4, 12] });
  await page.getByTestId('check').click();
  await page.waitForTimeout(1800);
  await page.screenshot(shot('10-reward', p));
  await page.getByTestId('reward-close').click();
  await page.waitForTimeout(500);
  await page.screenshot(shot('11-solved-grid', p));

  await openLevel(page, 5);
  await place(page, { kick: [0, 6] });
  await page.getByTestId('check').click();
  await page.getByTestId('check').click();
  await page.getByTestId('answer').click();
  await page.waitForTimeout(400);
  await page.screenshot(shot('12-answer', p));

  // Home, part way through: four levels solved, one of them on the first try.
  await page.evaluate(() => {
    localStorage.setItem('nadilo', JSON.stringify({
      v: 4, onboarded: true, cues: true, solved: [1, 2, 3, 4], levelIdx: 4, syncOffsetMs: 0,
      records: { 1: { checks: 1, on: '2026-09-26' }, 2: { checks: 2, on: '2026-09-26' }, 3: { checks: 3, on: '2026-09-26' }, 4: { checks: 2, on: '2026-09-26', peeked: true } },
    }));
  });
  await page.reload();
  await page.waitForTimeout(900);
  await page.screenshot(shot('13-home', p));

  // Home once every level is solved.
  await page.evaluate(() => {
    const solved = Array.from({ length: 13 }, (_, i) => i + 1);
    const records = Object.fromEntries(solved.map((id) => [id, { checks: id % 3 ? 1 : 2, on: '2026-09-26' }]));
    localStorage.setItem('nadilo', JSON.stringify({ v: 4, onboarded: true, cues: true, solved, levelIdx: 11, syncOffsetMs: 0, records }));
  });
  await page.reload();
  await page.waitForTimeout(900);
  await page.screenshot(shot('14-home-finished', p));
});
