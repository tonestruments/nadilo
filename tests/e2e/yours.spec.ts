// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test, type Page } from '@playwright/test';
import { freshSchool, levelsOf, twistToday, type SchoolSaved } from '../../src/school/rules';
import { FIRST_SONG as SONG, type Build } from '../../src/school/song';
import { followRoot } from '../../src/school/yours';
import { expectSilentEngine } from './helpers';

/*
 * Make it yours, the player's song and today's twist, in the browser, with the silent engine.
 */

const LEVELS = levelsOf(SONG);
const at = (id: string) => LEVELS.findIndex((l) => l.id === id);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const DAY = '2026-10-15';

async function load(page: Page, school: Partial<SchoolSaved> & { levelId?: string }) {
  await page.clock.setFixedTime(new Date(`${DAY}T10:00:00`));
  await page.goto('/?fake-audio');
  const saved = { v: 5, onboarded: true, cues: true, solved: [], levelIdx: 0, syncOffsetMs: 0, records: {}, rebuild: { ...freshSchool(), met: true, ...school } };
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('nadilo', JSON.stringify(s)); }, saved);
  await page.reload();
  await expectSilentEngine(page);
}
const ctx = (page: Page) => page.evaluate(() => (window as any).__nadilo.actor.getSnapshot().context);
const saved = async (page: Page) => JSON.parse((await page.evaluate(() => localStorage.getItem('nadilo')))!);

/** A player who rebuilt everything and changed bar 4's fill and bar 3's colour. */
function finished(): Partial<SchoolSaved> & { levelId: string } {
  const own: Build = followRoot(SONG, clone(SONG.parts), 2, 'longing'); // a new colour, and the bass with it
  own.drums[3].kick[2] = true;
  return { build: clone(SONG.parts), own, done: LEVELS.map((l) => l.id), level: at('story'), levelId: 'story' };
}

test('the player\'s song: each part of each bar is a tile; a press loops it, The song swaps only that part, a second press stops', async ({ page }) => {
  await load(page, finished());
  await page.getByTestId('school-continue').click(); // all rebuilt: Home opens the player's song
  await expect(page.getByTestId('your-song')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your song' })).toBeVisible();
  await expect(page.locator('.s-mapcell')).toHaveCount(16);
  await expect(page.getByTestId('listen-mine')).toBeVisible(); // there is a difference to hear
  await expect(page.locator('.s-mapcell[data-gold]')).toHaveCount(3); // the fill, the colour, and the bass that moved with it
  for (const cell of ['cell-drums-3', 'cell-chords-2', 'cell-bass-2']) await expect(page.getByTestId(cell)).toHaveAttribute('data-gold', '');
  // Every tile is big enough to read and to press.
  const box = (await page.getByTestId('cell-melody-0').boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(150);

  await page.getByTestId('cell-chords-2').click();
  await expect(page.getByTestId('cell-chords-2')).toHaveAttribute('aria-pressed', 'true');
  expect((await ctx(page)).playing).toBe('bar');
  await page.getByTestId('listen-song').click();
  expect((await ctx(page)).playing).toBe('bar'); // switched, not stopped
  // Drawn as heard: the song's colour in that tile, the player's everywhere else.
  await expect(page.getByTestId('cell-chords-2').locator('.s-mc-chord i')).toHaveAttribute('data-mood', SONG.parts.chords[2]!);
  await page.getByTestId('cell-chords-2').click();
  expect((await ctx(page)).playing).toBeNull();
  await expect(page.getByTestId('cell-chords-2')).toHaveAttribute('aria-pressed', 'false');

  // The whole song from the player above; a tile takes over from it, and the song keeps its place.
  await page.getByTestId('song-play').click();
  expect((await ctx(page)).playing).toBe('song');
  await page.getByTestId('cell-drums-3').click();
  expect((await ctx(page)).playing).toBe('bar');
  await page.getByTestId('song-next').click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect((await ctx(page)).playing).toBeNull();
});

test('with nothing changed, the player\'s song offers no The song | Yours: there is nothing to tell apart', async ({ page }) => {
  await load(page, { ...finished(), own: clone(SONG.parts) });
  await page.getByTestId('school-continue').click();
  await expect(page.getByRole('heading', { name: 'The song, rebuilt' })).toBeVisible();
  await expect(page.getByTestId('listen-mine')).toHaveCount(0);
  await expect(page.getByTestId('song-play')).toBeVisible();
});

test('today\'s twist: offered on Home once something is the player\'s own, kept into the sampler, heard in their song', async ({ page }) => {
  const done = LEVELS.slice(0, at('floor')).map((l) => l.id); // Pulse rebuilt and made their own
  const start: SchoolSaved = { ...freshSchool(), met: true, build: clone(SONG.parts), done, level: at('floor') };
  const twist = twistToday(start, DAY)!;
  await load(page, { ...start, levelId: 'floor' });
  await expect(page.getByTestId('today-goal')).toHaveText(twist.goal);
  await page.getByTestId('today-start').click();
  await expect(page.getByTestId('level-title')).toHaveText('Today’s twist');
  await expect(page.getByTestId('journey-twist')).toBeVisible();
  const bar = twist.bars[0];
  await expect(page.getByTestId(`bar-${bar}`)).toHaveAttribute('aria-current', 'true');
  // The presses each drum twist asks for.
  const presses: Record<string, [string, number][]> = {
    less: [['hat', 2], ['hat', 6], ['hat', 10]], offbeat: [['kick', 6]], more: [['hat', 1], ['hat', 3]],
    drop: [['kick', 0], ['kick', 4], ['kick', 8], ['kick', 12]], offhats: [['hat', 0], ['hat', 4], ['hat', 8], ['hat', 12]],
    halftime: [['snare', 4], ['snare', 12], ['snare', 8]],
  };
  for (const [lane, step] of presses[twist.id]) await page.getByTestId(`pad-${lane}-${step}`).click();
  await page.getByTestId('keep').click();
  await expect(page.getByTestId('next')).toHaveText(/Hear your song/);
  await page.getByTestId('next').click();
  await expect(page.getByTestId('your-song')).toContainText('Today’s twist, sewn');
  await page.getByTestId('song-next').click();
  await expect(page.getByTestId('today-goal')).toHaveText('Sewn. A new twist tomorrow.');
  await expect(page.getByTestId('sampler').locator('i')).toHaveCount(1);
  const s = await saved(page);
  expect(s.rebuild.sewn).toEqual([{ on: DAY, id: twist.id }]);
  expect(s.rebuild.build.drums).toEqual(SONG.parts.drums); // a twist changes the player's own song, never the rebuild
});

test('the save stays readable by 0.4.1: `level` counts only the levels 0.4.1 had', async ({ page }) => {
  await load(page, { build: clone(SONG.parts), done: LEVELS.slice(0, at('yours-color')).map((l) => l.id), level: at('yours-color'), levelId: 'yours-color' });
  await page.getByTestId('school-continue').click();
  await expect(page.getByTestId('level-title')).toHaveText('Your colours');
  await page.getByTestId('swatch-restless').click();
  const s = await saved(page);
  expect(s.v).toBe(5);
  expect(s.rebuild.levelId).toBe('yours-color');
  expect(LEVELS.filter((l) => !l.yours)[s.rebuild.level].id).toBe('colors'); // what 0.4.1 opens: the level before
  expect(s.rebuild.own.chords[2]).toBe('restless'); // Your colours opens on bar 3
  expect(s.rebuild.build.chords).toEqual(SONG.parts.chords);
});
