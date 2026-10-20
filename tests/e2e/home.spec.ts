// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test } from '@playwright/test';
import { cell, openLevel, place } from './helpers';

test('Home shows progress, keeps unsolved beats hidden, and picks up where you left off', async ({ page }) => {
  await openLevel(page, 1);
  await page.getByTestId('listen').click();
  await place(page, { snare: [4, 12] });
  await page.getByTestId('check').click();
  await expect(page.getByTestId('reward')).toBeVisible();
  await expect(page.getByTestId('home')).toHaveCount(0); // the reward card is modal
  await page.getByTestId('reward-close').click();
  await page.getByTestId('home').click();

  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByTestId('home-summary')).toHaveText('Ear training · 1 of 13 beats heard');
  const solved = page.getByTestId('tile-1');
  await expect(solved).toHaveAttribute('title', 'The Backbeat');
  await expect(solved).toContainText('First');
  await expect(solved.locator('.thumb i.on')).toHaveCount(4); // kick on 1 and 3, snare on 2 and 4

  // An unsolved level shows its task, never its name or its beat.
  const unsolved = page.getByTestId('tile-3');
  await expect(unsolved).toHaveAttribute('title', 'Find the kick');
  await expect(unsolved.locator('.thumb i.on')).toHaveCount(0);

  // Continue moves on past the solved level.
  await expect(page.getByTestId('tile-2')).toContainText('Next');
  await expect(page.getByTestId('continue')).toHaveText('Continue level 2');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('task')).toHaveText('Two sounds, one moment');

  // Home and back keeps the notes on the level.
  await place(page, { snare: [5] });
  await page.getByTestId('home').click();
  await page.getByTestId('continue').click();
  await expect(cell(page, 'snare', 5)).toHaveAttribute('data-state', 'placed');

  // Progress survives a restart.
  await page.reload();
  await expect(page.getByTestId('home-summary')).toHaveText('Ear training · 1 of 13 beats heard');
  await expect(page.getByTestId('tile-1')).toHaveAttribute('title', 'The Backbeat');
});

/** A returning player who has solved every level except `except`, sitting on level `on`. */
async function almostDone(page: import('@playwright/test').Page, { except, on }: { except: number[]; on: number }) {
  await page.goto('/?fake-audio');
  await page.evaluate(({ except, on }) => {
    const solved = Array.from({ length: 13 }, (_, i) => i + 1).filter((id) => !except.includes(id));
    localStorage.setItem('nadilo', JSON.stringify({ v: 4, onboarded: true, cues: true, solved, levelIdx: on - 1, syncOffsetMs: 0, records: {} }));
  }, { except, on });
  await page.reload();
}

test('finishing the last level with one skipped leads back to the skipped one', async ({ page }) => {
  await almostDone(page, { except: [12, 13], on: 13 });
  await page.getByTestId('tile-13').click();
  await expect(page.getByTestId('task')).toHaveText('On your own');
  await place(page, { hat: [0, 2, 4, 6, 8, 10, 12, 14], kick: [0, 3, 6, 10], snare: [4, 12] });
  await page.getByTestId('check').click();
  await expect(page.getByTestId('reward-next')).toHaveText('Next: level 12');
  await page.getByTestId('reward-next').click();
  await expect(page.getByTestId('task')).toHaveText('Listen to the very end');
});

test('solving the last unsolved level is the finale, and Home then shows the journey finished', async ({ page }) => {
  await almostDone(page, { except: [12], on: 12 });
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('task')).toHaveText('Listen to the very end');
  await place(page, { hat: [0, 2, 4, 6, 8, 10, 12, 14, 15], kick: [0, 8, 11], snare: [4, 12] });
  await page.getByTestId('check').click();
  const reward = page.getByTestId('reward');
  await expect(reward).toContainText('Journey complete');
  await page.getByTestId('reward-home').click();

  // Finished: no level is "next", and every tile shows how it went, level 12 included.
  await expect(page.getByTestId('home-summary')).toHaveText('Ear training · 13 of 13 beats heard · Journey complete');
  await expect(page.locator('.tile-tag.next')).toHaveCount(0);
  await expect(page.getByTestId('tile-12')).toContainText('First');

  // The way on is to start again, fresh.
  await expect(page.getByTestId('continue')).toHaveText('Start again');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('task')).toHaveText('Find the snare');
  await expect(cell(page, 'snare', 4)).toHaveAttribute('data-state', 'empty');
});

test('a placed note fires, and the grid stays flat', async ({ page }) => {
  await openLevel(page, 1);
  const c = cell(page, 'snare', 4);
  await c.click();
  await expect(c).toHaveAttribute('data-fire', '');
  const style = await c.evaluate((el) => {
    const s = getComputedStyle(el);
    return { boxShadow: s.boxShadow, transform: s.transform };
  });
  expect(style.boxShadow).toBe('none');
  expect(style.transform).toBe('none');
});
