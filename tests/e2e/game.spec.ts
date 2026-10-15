import { expect, test } from '@playwright/test';
import { cell, openLevel, place } from './helpers';

test('level 2: stacking kick and snare on one step, solved, shows the reward', async ({ page }) => {
  await openLevel(page, 2);
  await expect(page.getByTestId('task')).toHaveText('Two sounds, one moment');
  await expect(cell(page, 'kick', 0)).toHaveAttribute('data-state', 'given');
  await expect(page.locator('.lane-hat')).toHaveCount(0); // no hi-hat in chapter 1

  await page.getByTestId('listen').click();
  await place(page, { snare: [0] });
  await page.getByTestId('check').click();

  const reward = page.getByTestId('reward');
  await expect(reward).toBeVisible();
  await expect(reward).toContainText('100%');
  await expect(reward).toContainText('Level 2 complete');
  await expect(reward.getByRole('heading', { name: 'Together' })).toBeVisible();
  await expect(page.getByTestId('listen-for')).toContainText('Listen for it');

  await page.getByTestId('reward-next').click();
  await expect(page.getByTestId('task')).toHaveText('Find the kick');
});

test('a wrong check names the lane but never the position', async ({ page }) => {
  await openLevel(page, 3);
  await page.getByTestId('listen').click();
  await place(page, { kick: [0, 4, 8, 13] });
  await page.getByTestId('check').click();
  await expect(page.getByTestId('line')).toHaveText('Almost. Your kick is off.');
  await expect(page.getByTestId('stat-kick')).toHaveText('off');
  await expect(page.getByTestId('hint')).toHaveText('Hear the kick alone');
  await expect(page.getByTestId('reward')).toHaveCount(0);
  // Still hidden: the missing kick on step 12 looks exactly like any empty cell.
  await expect(cell(page, 'kick', 12)).toHaveAttribute('data-state', 'empty');
});

test('the hidden beat is not in the DOM before it is solved', async ({ page }) => {
  await openLevel(page, 3);
  await page.getByTestId('listen').click();
  await page.waitForTimeout(1200);
  // Every kick cell (the hidden lane) is plain "empty", with no title and no flash, while the beat plays.
  const kick = page.locator('.lane-kick .cell');
  await expect(kick).toHaveCount(16);
  for (let s = 0; s < 16; s++) {
    await expect(kick.nth(s)).toHaveAttribute('data-state', 'empty');
    expect(await kick.nth(s).getAttribute('title')).toBeNull();
  }
  const flashedHidden = await page.evaluate(() => new Promise<boolean>((resolve) => {
    let seen = false;
    const obs = new MutationObserver(() => { if (document.querySelector('.lane-kick .cell[data-hit]')) seen = true; });
    obs.observe(document.querySelector('[data-testid="grid"]')!, { attributes: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(seen); }, 2600);
  }));
  expect(flashedHidden).toBe(false);
});

test('the playhead fires every note you placed, right or wrong, and never a hidden one', async ({ page }) => {
  await openLevel(page, 1);
  await expect(page.locator('.ball')).toHaveCount(0); // the glowing column is the playhead; no bouncing ball
  await place(page, { snare: [4, 5] }); // 4 is right, 5 is wrong
  await page.evaluate(() => {
    const seen = new Set<string>();
    (window as any).__fired = seen;
    new MutationObserver(() => {
      document.querySelectorAll<HTMLElement>('.cell[data-hit]').forEach((c) => seen.add(`${c.dataset.lane}:${c.dataset.s}`));
    }).observe(document.querySelector('[data-testid="grid"]')!, { attributes: true, subtree: true, attributeFilter: ['data-hit'] });
  });
  await page.getByTestId('listen').click();
  await page.waitForTimeout(2700); // one loop is 2.5 s
  // Your notes fire whether or not they are right, so a flash never gives the answer away. The hidden snare on
  // step 12 stays dark; the given kicks fire.
  expect(await page.evaluate(() => [...(window as any).__fired].sort())).toEqual(['kick:0', 'kick:8', 'snare:4', 'snare:5']);
});

test('buttons are buttons: nothing is underlined, and the quiet ones still have an edge', async ({ page }) => {
  await openLevel(page, 3);
  await place(page, { kick: [1] });
  await page.getByTestId('check').click();
  await page.getByTestId('check').click();
  const answer = page.getByTestId('answer');
  await expect(answer).toBeVisible();
  const look = await answer.evaluate((el) => {
    const s = getComputedStyle(el);
    return { underline: s.textDecorationLine, edge: s.boxShadow, height: el.getBoundingClientRect().height };
  });
  expect(look.underline).toBe('none');
  expect(look.edge).not.toBe('none');
  expect(look.height).toBe(46); // the same height as every other button in the dock
});

test('undo, clear and show-the-answer', async ({ page }) => {
  await openLevel(page, 1);
  await place(page, { snare: [3, 5] });
  await expect(cell(page, 'snare', 5)).toHaveAttribute('data-state', 'placed');
  await page.keyboard.press('Meta+z');
  await expect(cell(page, 'snare', 5)).toHaveAttribute('data-state', 'empty');
  await page.getByTestId('check').click();
  await page.getByTestId('check').click();
  await page.getByTestId('answer').click();
  await expect(cell(page, 'snare', 4)).toHaveAttribute('data-state', 'missed');
  await expect(cell(page, 'snare', 3)).toHaveAttribute('data-state', 'extra');
  await page.getByTestId('retry').click();
  await expect(cell(page, 'snare', 3)).toHaveAttribute('data-state', 'empty');
});

test('level 1 is the backbeat, with no hi-hat and nothing stacked', async ({ page }) => {
  await openLevel(page, 1);
  await expect(page.getByTestId('task')).toHaveText('Find the snare');
  await expect(page.locator('.lane-hat')).toHaveCount(0);
  for (const s of [0, 8]) await expect(cell(page, 'kick', s)).toHaveAttribute('data-state', 'given');
});

test('the reward card does not start any beat on its own', async ({ page }) => {
  await openLevel(page, 1);
  await page.getByTestId('listen').click();
  await place(page, { snare: [4, 12] });
  await page.getByTestId('check').click();
  await expect(page.getByTestId('reward')).toBeVisible();
  // Watch for two seconds: nothing may start playing while the card is up.
  const started = await page.evaluate(() => new Promise<string[]>((resolve) => {
    const seen: string[] = [];
    const off = (window as any).__nadilo.engine.subscribe((e: any) => { if (e.type === 'start') seen.push(e.mode); });
    setTimeout(() => { off(); resolve(seen); }, 2000);
  }));
  expect(started).toEqual([]);
  await expect(page.getByTestId('status')).not.toContainText('loop');
  // The player can still choose to hear it from "Listen for it".
  await page.getByTestId('lf-play').click();
  await expect(page.getByTestId('status')).toContainText('The beat');
});

test('a lane given in full says so and takes no presses; a lane partly given says that', async ({ page }) => {
  await openLevel(page, 9); // the kick in full, two hats and a snare
  await expect(page.getByTestId('given-kick')).toHaveText('All given');
  await expect(page.getByTestId('given-hat')).toHaveText('Partly given');
  await expect(page.getByTestId('given-snare')).toHaveText('Partly given');
  await expect(page.locator('.lane-kick')).toHaveAttribute('data-locked', '');
  await cell(page, 'kick', 2).click({ force: true });
  await expect(cell(page, 'kick', 2)).toHaveAttribute('data-state', 'empty');
  await cell(page, 'hat', 4).click();
  await expect(cell(page, 'hat', 4)).toHaveAttribute('data-state', 'placed');
});

test('the chapters are in the title bar, one at a time, and the steps sit on the window\'s centre line', async ({ page }) => {
  await openLevel(page, 1);
  const journey = page.getByTestId('ear-journey');
  await expect(journey).toContainText('Kick and snare');
  await expect(journey).not.toContainText('Enter the hi-hat');
  await expect(journey.locator('.journey-dot')).toHaveCount(7);
  await expect(page.getByTestId('ear-journey-prev')).toBeDisabled();
  await page.getByTestId('ear-journey-next').click();
  await expect(page.getByTestId('task')).toHaveText('Meet the hi-hat');
  await expect(journey).toContainText('Enter the hi-hat');
  await expect(journey.locator('.journey-dot')).toHaveCount(6);
  await expect(page.locator('.ribbon')).toHaveCount(0);
  const steps = (await page.locator('.lane-kick .beats').boundingBox())!;
  expect(Math.abs(steps.x + steps.width / 2 - 720)).toBeLessThan(1);
});

test('coach tips off: the coach waits to be asked, and an asked tip lasts until the player does something', async ({ page }) => {
  await openLevel(page, 3);
  await expect(page.getByTestId('coach-ask')).toHaveCount(0);
  await page.getByTestId('cues').click();
  await page.getByTestId('coach-ask').click();
  await expect(page.getByTestId('coach')).toContainText('Listen all the way through before you place anything.');
  await page.getByTestId('listen').click();
  await expect(page.getByTestId('coach-ask')).toBeVisible();
  await page.getByTestId('cues').click();
  await expect(page.getByTestId('coach')).toContainText('Say “boom” on every kick as it plays.');
});
