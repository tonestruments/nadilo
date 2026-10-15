import { expect, test } from '@playwright/test';
import { freshStart } from './helpers';

test('first launch walks through welcome, sound check and sync, then straight into School', async ({ page }) => {
  await freshStart(page);
  await expect(page.getByRole('heading', { name: 'Welcome to Nadilo Desktop' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Nadilo' })).toBeVisible(); // the logomark
  await page.getByTestId('get-started').click();

  await expect(page.getByRole('heading', { name: 'First, check your sound' })).toBeVisible();
  await page.getByTestId('test-sound').click();
  // The meter reads the engine's output level; the fake reports a signal while it "plays".
  await expect(page.getByTestId('signal')).toHaveText('✓ Nadilo is playing sound', { timeout: 8000 });
  await page.getByTestId('can-hear').click();

  await expect(page.getByRole('heading', { name: 'Line up sound and picture' })).toBeVisible();
  await page.getByTestId('sync-skip').click();

  // No "how it works" screen. Before the first level, the song the player will rebuild, offered whole.
  await expect(page.getByTestId('meet')).toBeVisible();
  await page.getByTestId('song-play').click();
  await expect(page.getByTestId('song-play')).toHaveAttribute('aria-label', 'Pause');
  await page.getByTestId('song-next').click();
  await expect(page.getByTestId('meet')).toHaveCount(0);
  await expect(page.getByTestId('level-title')).toHaveText('Heartbeat');
  await expect(page.getByTestId('goal')).toContainText('Tap a Boom on 1, 2, 3 and 4.');

  // Progress persists: a reload opens on Home, and Continue goes back to the first level.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByTestId('school-continue').click();
  await expect(page.getByTestId('level-title')).toHaveText('Heartbeat');
});

test('the sound check keeps its status text and meter centred', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('get-started').click();
  const centre = async (sel: string) => {
    const b = (await page.locator(sel).first().boundingBox())!;
    return b.x + b.width / 2;
  };
  const button = await centre('[data-testid="test-sound"]');
  expect(Math.abs((await centre('[data-testid="signal"]')) - button)).toBeLessThan(2);
  expect(Math.abs((await centre('.signal [data-testid="meter"]')) - button)).toBeLessThan(2);
});
