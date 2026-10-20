// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test } from '@playwright/test';
import { cell, openLevel, place } from './helpers';

test('sync calibration measures a delay from taps and returns to the level where it left off', async ({ page }) => {
  test.setTimeout(40_000);
  await openLevel(page, 3);
  await page.getByTestId('listen').click();
  await place(page, { kick: [0, 4] });
  await page.getByTestId('check').click();
  await expect(page.getByTestId('line')).toHaveText('Almost. Your kick is off.');

  await page.getByTestId('open-sync').click();
  await expect(page.getByRole('heading', { name: 'Line up sound and picture' })).toBeVisible();
  await page.getByTestId('sync-start').click();
  await expect(page.getByRole('heading', { name: 'Tap along to the kick' })).toBeVisible();

  // A player whose headphones delay the sound by ~150 ms taps 150 ms after each beat is due.
  await page.evaluate(() => {
    const { engine } = (window as any).__nadilo;
    engine.subscribe((e: any) => {
      if (e.type !== 'step' || e.mode !== 'calibrate' || e.step % 4) return;
      setTimeout(() => document.querySelector('[data-testid="sync-pad"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), 150);
    });
  });

  await expect(page.getByRole('heading', { name: 'Do they land together?' })).toBeVisible({ timeout: 20_000 });
  const measured = Number((await page.getByTestId('sync-offset').innerText()).match(/(\d+) ms/)![1]);
  expect(measured).toBeGreaterThanOrEqual(135);
  expect(measured).toBeLessThanOrEqual(175);
  expect(await page.evaluate(() => (window as any).__nadilo.engine.visualOffsetMs)).toBe(measured);

  // The arrows fine-tune it, a millisecond a tap.
  await page.getByTestId('sync-later').click();
  await page.getByTestId('sync-later').click();
  await page.getByTestId('sync-earlier').click();
  await expect(page.getByTestId('sync-offset')).toHaveText(`Playhead delayed by ${measured + 1} ms`);
  await page.getByTestId('sync-earlier').click();
  expect(await page.evaluate(() => (window as any).__nadilo.engine.visualOffsetMs)).toBe(measured);

  await page.getByTestId('sync-done').click();
  // Back exactly where the player was: same level, same notes, same feedback.
  await expect(page.getByTestId('line')).toHaveText('Almost. Your kick is off.');
  await expect(cell(page, 'kick', 4)).toHaveAttribute('data-state', 'placed');

  // The offset survives a restart.
  await page.reload();
  expect(await page.evaluate(() => (window as any).__nadilo.engine.visualOffsetMs)).toBe(measured);
});
