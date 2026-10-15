import { expect, type Page } from '@playwright/test';

type Lane = 'hat' | 'snare' | 'kick';

/**
 * UI tests run the app with `?fake-audio`: the silent FakeEngine replaces Web Audio entirely, so no test
 * makes a sound. Tests tagged @audio opt into the real engine and are run separately (npm run e2e:audio).
 */
export async function freshStart(page: Page, { realAudio = false } = {}) {
  await page.goto(realAudio ? '/' : '/?fake-audio');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  if (!realAudio) await expectSilentEngine(page);
}

/** Open a level as a returning player would: onboarding done, the app opens on Home, Continue opens the level. */
export async function openLevel(page: Page, levelId: number, { realAudio = false } = {}) {
  await page.goto(realAudio ? '/' : '/?fake-audio');
  await page.evaluate((levelIdx) => {
    localStorage.setItem('nadilo', JSON.stringify({ v: 4, onboarded: true, cues: true, solved: [], levelIdx, syncOffsetMs: 0, records: {} }));
  }, levelId - 1);
  await page.reload();
  if (!realAudio) await expectSilentEngine(page);
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('grid')).toBeVisible();
}

/** Fail loudly (not audibly) if a UI test is ever pointed at the real engine. */
export async function expectSilentEngine(page: Page) {
  expect(await page.evaluate(() => Array.isArray((window as any).__nadilo?.engine?.calls))).toBe(true);
}

export const cell = (page: Page, lane: Lane, step: number) => page.locator(`.lane-${lane} .cell[data-s="${step}"]`);

export async function place(page: Page, notes: Partial<Record<Lane, number[]>>) {
  for (const [lane, steps] of Object.entries(notes) as [Lane, number[]][]) {
    for (const s of steps) await cell(page, lane, s).click();
  }
}
