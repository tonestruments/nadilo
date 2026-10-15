import { expect, test } from '@playwright/test';
import { openLevel } from './helpers';

/**
 * The playhead must take its timing from the audio scheduler. We record, for every step, the audio-clock
 * time it was scheduled for and the audio-clock time the playhead moved, then check they agree.
 */
test('@audio the playhead moves on every step, in order, at the moment the step sounds', async ({ page, browserName }) => {
  await openLevel(page, 8, { realAudio: true }); // the full hi-hat lane is given, so there is something visible on every other step
  await page.evaluate(() => { (window as any).__nadilo.engine.trace = []; });

  const domSteps: number[] = [];
  await page.exposeFunction('reportStep', (s: number) => domSteps.push(s));
  await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="grid"]')!;
    new MutationObserver(() => {
      const s = (grid as HTMLElement).dataset.step;
      if (s !== undefined) (window as any).reportStep(Number(s));
    }).observe(grid, { attributes: true, attributeFilter: ['data-step'] });
  });

  await page.getByTestId('listen').click();
  await expect(page.getByTestId('status')).toContainText('Hidden beat', { timeout: 5000 });
  await expect(page.getByTestId('status')).not.toContainText('Hidden beat', { timeout: 12_000 });

  type T = { step: number; scheduled: number; lead: number; latency: number; target: number; fired: number; prevFrame: number; drawn: number };
  const trace = await page.evaluate(() => (window as any).__nadilo.engine.trace as T[]);

  // Two full loops, every step, in order: the playhead's step number always comes from the scheduler.
  expect(trace.map((t) => t.step)).toEqual([...Array(32)].map((_, i) => i % 16));

  // Every hit was handed to the audio engine ahead of its time, so the sound itself is never late.
  for (const t of trace) expect(t.lead * 1000).toBeGreaterThan(5);

  // The playhead moves on the first animation frame that is due for that step: never more than half a
  // frame early, and never a frame late. This holds however the browser paces its frames.
  const HALF = 8;
  for (const t of trace) {
    expect(t.fired).toBeGreaterThanOrEqual(t.target - HALF - 1);
    expect(t.prevFrame).toBeLessThan(t.target - HALF + 1);
  }

  const stats = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return { min: s[0], max: s[s.length - 1], p95: s[Math.floor(s.length * 0.95)], mean: xs.reduce((a, b) => a + b, 0) / xs.length };
  };
  const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ');
  const clock = stats(trace.map((t) => (t.drawn - (t.scheduled + t.latency)) * 1000));
  const frame = stats(trace.map((t) => t.fired - t.target));
  const leads = trace.map((t) => t.lead * 1000);
  console.log(`[${browserName}] lead ms ${Math.min(...leads).toFixed(0)}–${Math.max(...leads).toFixed(0)} | vs audio clock ms: ${fmt(clock)} | vs target ms: ${fmt(frame)}`);

  // With steady 60 Hz frames (Chromium here, and the system WebKit that runs the Mac app, which is
  // display-synced) the playhead lands within about half a frame of the sound. Playwright's own WebKit
  // build paces frames at ~49 fps with occasional stalls, so only the rules above are checked there.
  if (browserName === 'chromium') {
    expect(Math.abs(clock.mean)).toBeLessThan(6);
    expect(frame.p95).toBeLessThan(12);
  }

  // The scheduled step times are exactly one 16th note apart (96 BPM).
  for (let i = 1; i < trace.length; i++) expect((trace[i].scheduled - trace[i - 1].scheduled) * 1000).toBeCloseTo(156.25, 1);
  // The DOM playhead followed the same sequence.
  expect(domSteps.slice(0, 32)).toEqual([...Array(32)].map((_, i) => i % 16));
});
