import { ROOT, VOICE_DB, type SampleId, type Voice } from './samples';
import { dbToGain } from './schedule';
import type { Sound } from './types';

/**
 * How one sound becomes audio: a buffer source through its own envelope into a bus. The live engine and the offline
 * renderer (tests, and anything exported) both use this, so what is measured is what is heard.
 */

/** How long a held note takes to fade once released, by voice. Drums are not held: they play out. */
export const RELEASE: Partial<Record<Voice, number>> = { bass: 0.09, keys: 0.3, pad: 0.6, lead: 0.18 };
/** One string, one voice: a new note on these cuts the last one (with a few ms of crossfade). */
export const MONO: ReadonlySet<Voice> = new Set<Voice>(['bass', 'lead']);
/** Time constant of the fade when playback stops. Long enough not to click, short enough to feel instant. */
export const STOP_FADE = 0.012;
/** Time constant of the crossfade when a new note cuts the last one on the same string. */
export const HANDOFF = 0.008;

export interface Voiced { src: AudioBufferSourceNode; env: GainNode; start: number; end: number }

/** A playback's own bus: stopping it fades exactly its sounds and nothing else. */
export interface Bus { node: GainNode; playing: Set<Voiced>; mono: Map<Voice, Voiced> }

export function newBus(ctx: BaseAudioContext, into: AudioNode): Bus {
  const node = ctx.createGain();
  node.connect(into);
  return { node, playing: new Set(), mono: new Map() };
}

/**
 * The master chain: master gain → 40 Hz high-pass → compressor → destination. The high-pass keeps rumble that small
 * speakers cannot play from eating their headroom; the compressor keeps stacked hits from clipping. Returns the input
 * and the output (for a meter).
 */
export function masterChain(ctx: BaseAudioContext): { input: GainNode; output: AudioNode } {
  const input = ctx.createGain();
  input.gain.value = 0.8;
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 40;
  highpass.Q.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.15;
  input.connect(highpass).connect(comp).connect(ctx.destination);
  return { input, output: comp };
}

/**
 * Play one sound at `when` on `bus`. A pitched sample is played faster or slower from the note it was recorded at.
 * A held note fades out after `hold`; a new note on a one-string voice crossfades the last one out.
 */
export function trigger(ctx: BaseAudioContext, buffers: ReadonlyMap<SampleId, AudioBuffer>, s: Sound, when: number, bus: Bus) {
  const buffer = buffers.get(s.sample);
  if (!buffer) return;
  const t = Math.max(when, ctx.currentTime);
  const root = ROOT[s.sample];
  const rate = s.midi !== undefined && root !== undefined ? 2 ** ((s.midi - root) / 12) : 1;

  const last = MONO.has(s.voice) ? bus.mono.get(s.voice) : undefined;
  if (last && last.end > t) release(last, t, HANDOFF);

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const env = ctx.createGain();
  env.gain.setValueAtTime(s.vel * dbToGain(VOICE_DB[s.voice]), t);
  src.connect(env).connect(bus.node);

  let end = t + buffer.duration / rate;
  const rel = RELEASE[s.voice];
  if (s.hold !== undefined && rel !== undefined && t + s.hold < end) {
    env.gain.setTargetAtTime(0, t + s.hold, rel / 5);
    end = t + s.hold + rel;
  }
  src.start(t);
  src.stop(end);
  const v: Voiced = { src, env, start: t, end };
  bus.playing.add(v);
  if (MONO.has(s.voice)) bus.mono.set(s.voice, v);
  src.onended = () => {
    bus.playing.delete(v);
    if (bus.mono.get(s.voice) === v) bus.mono.delete(s.voice);
    env.disconnect();
  };
}

/** Fade a note out from `at`, then stop it. */
export function release(v: Voiced, at: number, tau: number) {
  v.env.gain.cancelScheduledValues(at);
  v.env.gain.setTargetAtTime(0, at, tau);
  v.end = at + tau * 6;
  try {
    v.src.stop(v.end);
  } catch {
    // already stopped
  }
}

/**
 * Stop a whole bus without a click: what is sounding fades in a few ms and then stops; what was scheduled ahead but
 * has not started yet (the engine schedules 100 ms ahead) never starts.
 */
export function fadeOut(bus: Bus, at: number) {
  bus.node.gain.cancelScheduledValues(at);
  bus.node.gain.setTargetAtTime(0, at, STOP_FADE);
  for (const v of bus.playing) {
    try {
      v.src.stop(v.start >= at ? at : at + STOP_FADE * 8);
    } catch {
      // already stopped
    }
  }
}
