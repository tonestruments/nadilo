import { renderProgram } from '../../src/audio/renderProgram';
import { SAMPLE_URLS } from '../../src/audio/sampleUrls';
import type { SampleId } from '../../src/audio/samples';
import { stepSeconds } from '../../src/audio/schedule';
import { loopProgram, songProgram, sourcesOwned } from '../../src/school/mix';
import { levelsOf } from '../../src/school/rules';
import { FIRST_SONG as SONG, emptyBuild, songBars, STEPS } from '../../src/school/song';

/**
 * Renders Nadilo School's song with the real samples, the real voices and the real master chain into an
 * OfflineAudioContext (memory only, never the speakers), and measures it.
 */
const RATE = 48000;

async function decode(): Promise<Map<SampleId, AudioBuffer>> {
  const ctx = new OfflineAudioContext(1, RATE, RATE);
  const out = new Map<SampleId, AudioBuffer>();
  await Promise.all(Object.entries(SAMPLE_URLS).map(async ([id, url]) => {
    out.set(id as SampleId, await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer()));
  }));
  return out;
}

const peakOf = (d: Float32Array) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** The whole song, every part, as the player meets it: its loudest sample. */
(window as any).songPeak = async () => {
  const buffers = await decode();
  const seconds = songBars(SONG) * STEPS * stepSeconds(SONG.bpm) + 4;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  renderProgram(ctx, buffers, songProgram(() => ({ song: SONG, mine: emptyBuild(5), src: sourcesOwned(new Set()), ownArr: false })));
  return peakOf((await ctx.startRendering()).getChannelData(0));
};

/**
 * A level's loop (all parts playing: The song in Tap a tune), stopped the way the Stop button stops it, mid-note.
 * Returns how loud the sound still is 100 ms after the stop, and the biggest jump between two samples around it.
 */
(window as any).stopClean = async () => {
  const buffers = await decode();
  const level = levelsOf(SONG).find((l) => l.id === 'tune')!;
  const program = loopProgram(() => ({ song: SONG, mine: emptyBuild(5), level, owned: new Set(), listen: 'song', close: false, scope: 'all', unit: 0, slow: false }));
  const stopAt = 0.05 + 5.3 * stepSeconds(SONG.bpm) * 4; // inside a held bass note and a ringing chord
  const ctx = new OfflineAudioContext(1, Math.ceil((stopAt + 1) * RATE), RATE);
  renderProgram(ctx, buffers, program, { passes: 1, stopAt });
  const d = (await ctx.startRendering()).getChannelData(0);
  const at = Math.round(stopAt * RATE);
  const after = peakOf(d.subarray(at + Math.round(0.1 * RATE)));
  let jump = 0;
  for (let i = at - 480; i < at + 4800; i++) jump = Math.max(jump, Math.abs(d[i + 1] - d[i]));
  const before = peakOf(d.subarray(at - 4800, at));
  return { after, jump, before };
};
