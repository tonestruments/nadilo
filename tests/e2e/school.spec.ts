// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { expect, test, type Page } from '@playwright/test';
import { freshSchool, levelsOf } from '../../src/school/rules';
import { FIRST_SONG as SONG, emptyBuild, type Build } from '../../src/school/song';
import { expectSilentEngine } from './helpers';

/*
 * Nadilo School in the browser, with the silent engine. What these check is what made the old School feel broken:
 * a press that did not land, a press that changed another pad, a pad that lit late, a screen that moved.
 */

const LEVELS = levelsOf(SONG);
const at = (id: string) => LEVELS.findIndex((l) => l.id === id);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** The build a player has when they reach `id` having matched the song exactly so far. */
function buildBefore(id: string): Build {
  const b = emptyBuild(SONG.sections.length);
  const done = LEVELS.slice(0, at(id));
  const has = (lid: string) => done.some((l) => l.id === lid);
  if (has('turn')) b.drums = clone(SONG.parts.drums);
  else {
    for (let i = 0; i < 4; i++) {
      if (has('copy') || (has('heartbeat') && i === 0)) b.drums[i].kick = clone(SONG.parts.drums[0].kick);
      if (has('clapback')) b.drums[i].snare = clone(SONG.parts.drums[0].snare);
      if (has('zoomin')) b.drums[i].hat = clone(SONG.parts.drums[0].hat);
    }
  }
  if (has('moods')) b.bass = clone(SONG.parts.bass);
  else if (has('floor')) b.bass[0] = clone(SONG.parts.bass[0]);
  if (has('colors')) b.chords = clone(SONG.parts.chords);
  if (has('tune')) b.melody[0] = clone(SONG.parts.melody[0]);
  if (has('echo')) b.melody[2] = clone(SONG.parts.melody[0]);
  if (has('land')) b.melody = clone(SONG.parts.melody);
  return b;
}

/** Open School on a level, as a returning player who has done everything before it. */
async function openSchool(page: Page, id: string, build: Build = buildBefore(id)) {
  const done = LEVELS.slice(0, at(id)).map((l) => l.id);
  const saved = {
    v: 5, onboarded: true, cues: true, solved: [], levelIdx: 0, syncOffsetMs: 0, records: {},
    // As this build saves it: the exact level by id (a bare `level` is read as an index from 0.4.1, which had no Make it yours).
    rebuild: { ...freshSchool(), build, level: at(id), levelId: id, done, met: true, stars: Object.fromEntries(done.map((d) => [d, 3])) },
  };
  await page.goto('/?fake-audio');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('nadilo', JSON.stringify(s)); }, saved);
  await page.reload();
  await expectSilentEngine(page);
  await page.getByTestId('school-continue').click();
  await expect(page.getByTestId('level-title')).toHaveText(LEVELS[at(id)].title);
}

const build = (page: Page): Promise<Build> =>
  page.evaluate(() => (window as any).__nadilo.actor.getSnapshot().context.school.build);
const pad = (page: Page, lane: string, step: number) => page.getByTestId(`pad-${lane}-${step}`);

/** A real press and release with the mouse, at the centre of an element, with no wait in between. */
async function tap(page: Page, el: ReturnType<Page['locator']>) {
  const b = (await el.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

test('every press lands, on that pad only, in that bar only, however fast', async ({ page }) => {
  await openSchool(page, 'zoomin');
  const before = await build(page);
  const steps = [0, 2, 4, 6, 8, 10, 12, 14];
  for (const s of steps) await tap(page, pad(page, 'hat', s)); // as fast as Playwright can press
  for (const s of steps) await expect(pad(page, 'hat', s)).toHaveAttribute('aria-pressed', 'true');
  const after = await build(page);
  expect(after.drums[0].hat.map(Number).join('')).toBe('1010101010101010');
  // Nothing else changed: no other lane, no other bar.
  expect(after.drums[0].kick).toEqual(before.drums[0].kick);
  expect(after.drums[0].snare).toEqual(before.drums[0].snare);
  for (const bar of [1, 2, 3]) expect(after.drums[bar]).toEqual(before.drums[bar]);
  // And they all come off again, one press each.
  for (const s of steps) await tap(page, pad(page, 'hat', s));
  expect((await build(page)).drums[0].hat.some(Boolean)).toBe(false);
});

test('a pad lights while the button is still held down', async ({ page }) => {
  await openSchool(page, 'heartbeat');
  const b = (await pad(page, 'kick', 8).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await expect(pad(page, 'kick', 8)).toHaveAttribute('data-on', '');
  await page.mouse.up();
  await expect(pad(page, 'kick', 8)).toHaveAttribute('data-on', '');
});

test('each bar has its own screen; the bar strip and the arrows move between them', async ({ page }) => {
  await openSchool(page, 'clapback');
  await tap(page, pad(page, 'snare', 4));
  await page.getByTestId('bar-2').click();
  await expect(page.getByTestId('bar-2')).toHaveAttribute('aria-current', 'true');
  await expect(pad(page, 'snare', 4)).toHaveAttribute('aria-pressed', 'false'); // bar 3 is its own bar
  await page.getByTestId('prev-bar').click();
  await expect(page.getByTestId('bar-1')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('bar-0')).toHaveAttribute('aria-current', 'true');
  await expect(pad(page, 'snare', 4)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('scope-one')).toHaveText('Bar 1'); // the loop names the bar it loops
  // The arrows sit outside the strip, either side of it.
  const strip = (await page.getByTestId('strip').boundingBox())!;
  expect((await page.getByTestId('prev-bar').boundingBox())!.x).toBeLessThan(strip.x);
  expect((await page.getByTestId('next-bar').boundingBox())!.x).toBeGreaterThan(strip.x + strip.width);
});

test('copying onto one bar shows in the strip: that bar gets the kicks and its tick', async ({ page }) => {
  await openSchool(page, 'copy');
  await page.getByTestId('copy-to-1').click();
  await expect(page.locator('[data-testid="bar-1"] .s-mini-kick')).toHaveCount(4);
  await expect(page.getByTestId('bar-1')).toHaveAttribute('data-sewn', '');
  await expect(page.locator('[data-testid="bar-2"] .s-mini-kick')).toHaveCount(0);
  await expect(page.getByTestId('count')).toHaveText('1/3');
});

test('clearing a bar after the goal is met brings the goal back; the level stays done', async ({ page }) => {
  await openSchool(page, 'heartbeat');
  for (const s of [0, 4, 8, 12]) await tap(page, pad(page, 'kick', s));
  await expect(page.getByTestId('named')).toContainText('The beat.');
  await page.getByTestId('clear').click();
  await expect(page.getByTestId('named')).toHaveCount(0);
  await expect(page.getByTestId('goal')).toContainText('Tap a Boom on 1, 2, 3 and 4.');
  await expect(page.getByTestId('next')).toBeVisible();
});

test('Copy it on: one press copies bar 1 into the other bars, and the level names what was done', async ({ page }) => {
  await openSchool(page, 'copy');
  await expect(page.getByTestId('copy')).toHaveAttribute('data-nudge', '');
  await page.getByTestId('copy-to-all').click();
  const b = await build(page);
  for (const bar of [1, 2, 3]) expect(b.drums[bar].kick).toEqual(b.drums[0].kick);
  await expect(page.getByTestId('named')).toContainText('The loop.');
  await expect(page.getByTestId('next')).toBeVisible();
  await page.getByTestId('undo').click();
  expect((await build(page)).drums[1].kick.some(Boolean)).toBe(false);
});

test('notes: press to place, drag right to hold, drag up to go higher, press and let go to take away', async ({ page }) => {
  await openSchool(page, 'floor');
  const cells = page.getByTestId('cells');
  const box = (await cells.boundingBox())!;
  const col = box.width / 4, row = box.height / 6;
  const point = (c: number, r: number) => [box.x + col * (c + 0.5), box.y + row * (5 - r + 0.5)] as const;
  // Place on beat 1 at the lowest height and drag to the end of beat 2.
  await page.mouse.move(...point(0, 0));
  await page.mouse.down();
  await page.mouse.move(...point(1, 0), { steps: 4 });
  await page.mouse.up();
  expect((await build(page)).bass[0]).toEqual([{ at: 0, len: 8, row: 0 }]);
  // A second note, dragged up two heights.
  await page.mouse.move(...point(3, 0));
  await page.mouse.down();
  await page.mouse.move(...point(3, 2), { steps: 4 });
  await page.mouse.up();
  expect((await build(page)).bass[0]).toEqual([{ at: 0, len: 8, row: 0 }, { at: 12, len: 4, row: 2 }]);
  // Undo takes the whole drag back at once.
  await page.getByTestId('undo').click();
  expect((await build(page)).bass[0]).toEqual([{ at: 0, len: 8, row: 0 }]);
  // Press the long note and let go: gone.
  await page.mouse.move(...point(1, 0));
  await page.mouse.down();
  await page.mouse.up();
  expect((await build(page)).bass[0]).toEqual([]);
});

test('what is not rebuilt yet is heard, never drawn', async ({ page }) => {
  await openSchool(page, 'heartbeat');
  await expect(page.locator('[data-testid^="pad-snare"], [data-testid^="pad-hat"]')).toHaveCount(0);
  await expect(page.locator('.s-strip .s-mini-line')).toHaveCount(0); // no bass or tune drawn anywhere

  // A level by ear marks nothing until Hint, and then only the bar on screen.
  await openSchool(page, 'moods');
  await expect(page.locator('.s-note[data-hole]')).toHaveCount(0);
  await page.getByTestId('hint').click();
  const holes = await page.locator('.s-note[data-hole]').count();
  expect(holes).toBeGreaterThan(0);
  expect(holes).toBeLessThanOrEqual(SONG.parts.bass[1].length);
});

test('The song or Yours, either Up close: a press plays, a switch never stops it, the same one again stops it', async ({ page }) => {
  await openSchool(page, 'clapback');
  await page.getByTestId('listen-close').click();
  await expect(page.getByTestId('listen-close')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('play')).toHaveAttribute('aria-label', 'Stop');
  await page.getByTestId('listen-mine').click();
  await expect(page.getByTestId('play')).toHaveAttribute('aria-label', 'Stop');
  await expect(page.getByTestId('listen-close')).toHaveAttribute('aria-pressed', 'true'); // yours, up close
  await page.getByTestId('listen-song').click();
  await tap(page, pad(page, 'snare', 12));
  await expect(page.getByTestId('listen-mine')).toHaveAttribute('aria-checked', 'true'); // an edit is heard as yours
  await page.getByTestId('listen-mine').click();
  await expect(page.getByTestId('play')).toHaveAttribute('aria-label', 'Play');
});

test('Back goes one step back along School, and the title bar shows one world at a time', async ({ page }) => {
  await openSchool(page, 'floor');
  await expect(page.getByTestId('journey-world')).toContainText('The Floor');
  await expect(page.locator('.s-jn')).toHaveCount(2);
  await page.getByTestId('journey-prev').click();
  await expect(page.getByTestId('level-title')).toHaveText('Heartbeat'); // Pulse is all done: its first level
  await page.getByTestId('back').click();
  await expect(page.getByTestId('meet')).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('nothing moves: every level, done or not, keeps the same layout', async ({ page }) => {
  test.setTimeout(120_000);
  const parts = ['.s-head', '[data-testid="strip"]', '.s-tools', '[data-testid="cloth"]', '.s-dock'];
  const boxes = async () => Promise.all(parts.map(async (sel) => {
    const b = (await page.locator(sel).boundingBox())!;
    return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)].join(',');
  }));
  await openSchool(page, 'heartbeat');
  const first = await boxes();
  for (const l of LEVELS.slice(1)) {
    await openSchool(page, l.id);
    expect(await boxes(), l.id).toEqual(first);
  }
  // Solving a level does not move anything either: its name takes the goal's place.
  await openSchool(page, 'heartbeat');
  for (const s of [0, 4, 8, 12]) await tap(page, pad(page, 'kick', s));
  await expect(page.getByTestId('named')).toBeVisible();
  expect(await boxes()).toEqual(first);
});

test('a world ends with the whole song, then goes on to the next world', async ({ page }) => {
  const b = buildBefore('turn');
  await openSchool(page, 'turn', b);
  await tap(page, pad(page, 'snare', 14));
  await tap(page, pad(page, 'snare', 15));
  await expect(page.getByTestId('named')).toContainText('A fill.');
  await page.getByTestId('next').click();
  // Make it yours comes first: a change of the player's own, kept, and only then the whole song.
  await expect(page.getByTestId('level-title')).toHaveText('Your fill');
  await expect(page.getByTestId('keep')).toHaveCount(0);
  await tap(page, pad(page, 'kick', 2));
  await expect(page.getByTestId('pad-kick-2')).toHaveAttribute('data-gold', '');
  await page.getByTestId('keep').click();
  // The way on says that the world ends here.
  await expect(page.getByTestId('next')).toHaveText('Finish Pulse');
  await page.getByTestId('next').click();
  await expect(page.getByTestId('world-end')).toContainText('Your drums');
  // What the player has made so far, or the song as first heard: one press apart.
  await expect(page.getByTestId('listen-mine')).toHaveText('Yours so far');
  await expect(page.getByTestId('listen-mine')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('song-play').click();
  await expect(page.getByTestId('song-play')).toHaveAttribute('aria-label', 'Pause');
  await page.getByTestId('listen-song').click();
  await expect(page.getByTestId('listen-song')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('song-play')).toHaveAttribute('aria-label', 'Pause'); // switched, not stopped
  await page.getByTestId('song-next').click();
  await expect(page.getByTestId('level-title')).toHaveText('Under the boom');
});

test('the save keeps 0.3.x School as it was, so that build can still be opened', async ({ page }) => {
  const legacy = { track: { bpm: 91 }, level: 3, done: ['heartbeat'], stars: {}, met: true };
  await page.goto('/?fake-audio');
  await page.evaluate((school) => {
    localStorage.clear();
    localStorage.setItem('nadilo', JSON.stringify({ v: 5, onboarded: true, cues: true, solved: [1], levelIdx: 1, syncOffsetMs: 0, records: {}, school }));
  }, legacy);
  await page.reload();
  await page.getByTestId('school-continue').click();
  await expect(page.getByTestId('meet')).toBeVisible();
  await page.getByTestId('song-next').click();
  await tap(page, pad(page, 'kick', 0));
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('nadilo')))!);
  expect(saved.v).toBe(5);
  expect(saved.school).toEqual(legacy);
  expect(saved.rebuild.build.drums[0].kick[0]).toBe(true);
});

test('the song player: a press on the track moves the song at once; a section loops on its own', async ({ page }) => {
  await page.goto('/?fake-audio');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('nadilo', JSON.stringify({ v: 5, onboarded: true, cues: true, solved: [], levelIdx: 0, syncOffsetMs: 0, records: {} })); });
  await page.reload();
  await page.getByTestId('school-continue').click();
  await expect(page.getByTestId('meet')).toBeVisible();
  const ctx = () => page.evaluate(() => (window as any).__nadilo.actor.getSnapshot().context);
  const track = page.getByTestId('song-track');
  const box = (await track.boundingBox())!;
  const total = 28 * 16;
  // Halfway along, with nothing playing: the place moves, and the time says where.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(Math.abs((await ctx()).songAt - total / 2)).toBeLessThanOrEqual(4);
  await expect(track).toHaveAttribute('aria-valuetext', '0:38');
  // Playing, a press moves it at once and it plays on from there: no jump back to where it was.
  await page.getByTestId('song-play').click();
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await page.waitForTimeout(400);
  const c = await ctx();
  expect(c.playing).toBe('song');
  expect(c.songAt).toBeGreaterThan(total * 0.85);
  const pf = Number(await track.evaluate((el) => getComputedStyle(el).getPropertyValue('--pf')));
  expect(pf).toBeGreaterThan(0.88);
  // The chorus, looped: the track stays inside it.
  await page.getByTestId('song-part-chorus').click();
  await expect(page.getByTestId('song-part-chorus')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(600);
  const inChorus = Number(await track.evaluate((el) => getComputedStyle(el).getPropertyValue('--pf')));
  expect(inChorus).toBeGreaterThanOrEqual(16 / 28);
  expect(inChorus).toBeLessThan(24 / 28);
  await expect(page.getByTestId('song-part-chorus')).toHaveAttribute('data-now', '');
  // Pressed again: the whole song plays on.
  await page.getByTestId('song-part-chorus').click();
  await expect(page.getByTestId('song-part-chorus')).toHaveAttribute('aria-pressed', 'false');
  expect((await ctx()).playing).toBe('song');
  await page.getByTestId('song-play').click();
});
