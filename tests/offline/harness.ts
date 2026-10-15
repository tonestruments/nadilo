import { findOnsets, renderInto } from '../../src/audio/render';
import { KIT } from '../../src/audio/schedule';
import { STEPS, type Lane } from '../../src/game/levels';
import { toPattern, type Pattern } from '../../src/game/logic';
import kickUrl from '../../src/assets/audio/kick.wav';
import snareUrl from '../../src/assets/audio/snare.wav';
import hatUrl from '../../src/assets/audio/hat.wav';

/**
 * Renders patterns with the real samples and the real schedule into an OfflineAudioContext (memory only,
 * never the speakers), then finds where each lane's hits start. Each lane is rendered on its own so
 * overlapping sounds do not hide each other's onsets.
 */
const RATE = 48000;
const URLS: Record<Lane, string> = { kick: kickUrl, snare: snareUrl, hat: hatUrl };

async function decode(): Promise<Record<Lane, AudioBuffer>> {
  const ctx = new OfflineAudioContext(1, RATE, RATE);
  const entries = await Promise.all((Object.keys(URLS) as Lane[]).map(async (l) => {
    const data = await (await fetch(URLS[l])).arrayBuffer();
    return [l, await ctx.decodeAudioData(data)] as const;
  }));
  return Object.fromEntries(entries) as Record<Lane, AudioBuffer>;
}

async function render(buffers: Record<Lane, AudioBuffer>, pattern: Pattern, bars: number, start: number) {
  const seconds = start + bars * STEPS * (60 / 96 / 4) + 0.6;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  renderInto(ctx, buffers, pattern, bars, start);
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}

const START = 0.1;

(window as any).onsetsMs = async (spec: Partial<Record<Lane, number[]>>, bars: number) => {
  const buffers = await decode();
  const result: Partial<Record<Lane, number[]>> = {};
  for (const lane of Object.keys(spec) as Lane[]) {
    // Where this sample's own attack starts when it is scheduled at exactly START: a lone hit on step 0 is
    // scheduled at START plus the lane's feel offset, so take that offset back out.
    const one = await render(buffers, toPattern({ [lane]: [0] }), 1, START);
    const base = findOnsets(one, RATE)[0] - KIT[lane].offset * RATE;
    // Render the full pattern (all lanes, so the snare flam against the kick applies), keeping only this lane audible.
    const full = toPattern(spec);
    const onlyThis = { ...full, audible: lane } as Pattern & { audible: Lane };
    const data = await renderLane(buffers, onlyThis, bars);
    result[lane] = findOnsets(data, RATE).map((i) => ((i - base) / RATE) * 1000);
  }
  return result;
};

/** Render with every lane scheduled (so stacking rules apply), but only `audible` connected. */
async function renderLane(buffers: Record<Lane, AudioBuffer>, p: Pattern & { audible: Lane }, bars: number) {
  const silent = new AudioBuffer({ length: 1, sampleRate: RATE });
  const muted = { kick: silent, snare: silent, hat: silent, [p.audible]: buffers[p.audible] } as Record<Lane, AudioBuffer>;
  return render(muted, p, bars, START);
}
