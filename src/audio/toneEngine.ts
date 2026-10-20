// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import * as Tone from 'tone';
import type { Lane } from '../game/levels';
import type { Pattern } from '../game/logic';
import type { SampleId } from './samples';
import { SAMPLE_URLS } from './sampleUrls';
import { drumProgram, leanDelay, stepSeconds } from './schedule';
import type { AudioEngine, EngineEvent, Mode, Program, Sound, TraceEntry } from './types';
import { fadeOut, masterChain, newBus, trigger, type Bus } from './voices';

/** Fire a visual on the animation frame closest to its target: up to half a frame early, never a full frame late. */
const HALF_FRAME_MS = 8;
/**
 * How far ahead of the audio clock a playback starts. Tone's own "+0.02" is relative to its look-ahead, so it meant
 * 120 ms of silence after every press of Play. 60 ms still leaves the first step comfortably scheduled ahead of time
 * (the clock wakes every 25 ms). The transport must then be stopped at `Tone.immediate()`, never at Tone's default.
 */
const START_LEAD = 0.06;
/**
 * The silent warm-up before the first note. The audio thread's first moments are its roughest: WebKit opens the
 * output and sets up each kind of node (and the resampler a pitched note uses) the first time it is used, and a burst
 * of real notes landing on that crackled. So every sample is played once at -80 dB, pitched, through the whole chain.
 */
const WARM_UP_MS = 250;
const WARM_UP_GAIN = 1e-4;

/**
 * The real engine. Tone's Transport is the clock: it wakes every 25 ms and schedules every step ahead of time on the
 * audio clock. Each step becomes sound (native buffer sources, one per note) and one visual event, fired on the
 * animation frame closest to when that step is heard.
 *
 * Signal path: note → its envelope → the playback's bus → master → 40 Hz high-pass → compressor → speakers
 * (src/audio/voices.ts, shared with the offline renderer). Each playback has its own bus, so Stop fades exactly its
 * notes, in a few ms, and a new playback never starts under a fading one.
 */
export class ToneEngine implements AudioEngine {
  private raw: AudioContext | null = null;
  private buffers = new Map<SampleId, AudioBuffer>();
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private meterData: Float32Array<ArrayBuffer> | null = null;
  private auditions: Bus | null = null;
  private session: Bus | null = null;
  private repeatId: number | null = null;
  private listeners = new Set<(e: EngineEvent) => void>();
  private ready: Promise<void> | null = null;
  /** The samples are decoded and the audio thread is warm: a tap can sound at once, without waiting on a promise. */
  private loaded = false;
  /** What is playing, and `next`: the step after the last one shown, where it would pick up after a pause. */
  private current: { mode: Mode; loops: number; next: number } | null = null;
  private visuals: { at: number; run: () => void }[] = [];
  private raf = 0;
  private lastFrameAt = 0;
  visualOffsetMs = 0;
  trace: TraceEntry[] | null = null;

  get started() {
    return this.raw !== null && this.raw.state === 'running';
  }

  unlock(): Promise<void> {
    if (!this.raw) {
      this.raw = new AudioContext({ latencyHint: 'interactive' });
      Tone.setContext(this.raw);
      // Tone's clock wakes every `updateInterval` and schedules everything due within `lookAhead`.
      // The look-ahead must comfortably exceed the wake-up interval, or a late wake-up (WebKit's worker
      // timers are coarse) schedules a hit after its time has passed and it sounds late.
      const ctx = Tone.getContext() as Tone.Context;
      ctx.updateInterval = 0.025;
      ctx.lookAhead = 0.1;
      this.buildChain(this.raw);
    }
    const resumed = Tone.start();
    const raw = this.raw;
    this.ready ??= this.load(raw).then(() => this.warmUp(raw)).then(() => { this.loaded = true; });
    return Promise.all([resumed, this.ready]).then(() => undefined);
  }

  private buildChain(ctx: AudioContext) {
    const { input, output } = masterChain(ctx);
    this.master = input;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.meterData = new Float32Array(this.analyser.fftSize);
    output.connect(this.analyser);
    this.auditions = newBus(ctx, input);
  }

  private async load(ctx: AudioContext) {
    await Promise.all(Object.entries(SAMPLE_URLS).map(async ([id, url]) => {
      const data = await (await fetch(url)).arrayBuffer();
      this.buffers.set(id as SampleId, await ctx.decodeAudioData(data));
    }));
  }

  /** Play every sample once, inaudibly, as soon as the context runs, and give the output time to settle (see WARM_UP_MS). */
  private async warmUp(ctx: AudioContext) {
    if (ctx.state !== 'running') {
      await new Promise<void>((resolve) => {
        const onChange = () => {
          if (ctx.state !== 'running') return;
          ctx.removeEventListener('statechange', onChange);
          resolve();
        };
        ctx.addEventListener('statechange', onChange);
      });
    }
    const bus = newBus(ctx, this.master!);
    bus.node.gain.value = WARM_UP_GAIN;
    const at = ctx.currentTime + 0.02;
    for (const buffer of this.buffers.values()) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 2 ** (1 / 12);
      src.connect(bus.node);
      src.start(at);
      src.stop(at + WARM_UP_MS / 1000);
    }
    await new Promise((resolve) => setTimeout(resolve, WARM_UP_MS + 30));
    bus.node.disconnect();
  }

  /** Seconds between the audio clock and the speaker, where the browser reports it (WebKit does not). */
  private reportedLatency(): number {
    const reported = (this.raw as (AudioContext & { outputLatency?: number }) | null)?.outputLatency;
    return Number.isFinite(reported) ? (reported as number) : 0;
  }

  /** One note. A native AudioBufferSourceNode is made for exactly this: cheap, played once, then garbage-collected. */
  private trigger(s: Sound, when: number, bus: Bus) {
    if (this.raw) trigger(this.raw, this.buffers, s, when, bus);
  }

  async audition(lane: Lane) {
    await this.hear([{ voice: lane, sample: lane, vel: 1 }]);
  }

  async hear(sounds: Sound[]) {
    // A tap must sound now. Once the context runs and the samples are in, nothing is awaited: even a resolved
    // promise would push the sound past the click's frame.
    if (!this.started || !this.loaded) await this.unlock();
    const now = this.raw!.currentTime + 0.005;
    for (const s of sounds) this.trigger(s, now + (s.delay ?? 0), this.auditions!);
  }

  play(mode: Mode, loops: number, pattern: () => Pattern) {
    return this.playProgram(mode, drumProgram(pattern, loops));
  }

  async playProgram(mode: Mode, program: Program, from = 0) {
    if (!this.started || !this.loaded) await this.unlock();
    // A playback replaced by one of its own kind (the song moved to a new place) has not ended: it carries on.
    this.stop(this.current?.mode === mode);
    const raw = this.raw!;
    const session = newBus(raw, this.master!);
    this.session = session;
    const transport = Tone.getTransport();
    // A tempo change the last playback scheduled ahead must not reach this one. Tempo and position are set on the
    // audio clock's now: Tone's setters (`bpm.value =`, `position =`) act at now + look-ahead, after this playback
    // has started (START_LEAD), so its first steps would run at the last playback's tempo and place.
    const startAt = raw.currentTime + START_LEAD;
    transport.bpm.cancelScheduledValues(0);
    transport.bpm.setValueAtTime(program.bpm(), Tone.immediate());
    const total = program.loops ? program.loops * program.steps : Infinity;
    let n = from;
    const current = { mode, loops: program.loops, next: from % program.steps };
    this.current = current;
    this.emit({ type: 'start', mode, loops: program.loops });

    this.repeatId = transport.scheduleRepeat((time) => {
      if (this.session !== session) return;
      const latency = this.reportedLatency();
      if (n >= total) {
        // Ended on its own: the last notes ring out, and the bus is let go once they have.
        this.atAudioTime(time + latency, () => this.finish(mode, true));
        if (this.repeatId !== null) transport.clear(this.repeatId);
        this.repeatId = null;
        this.session = null;
        setTimeout(() => session.node.disconnect(), 8000);
        return;
      }
      // The tempo is read live: a new one starts exactly on this step.
      const bpm = program.bpm();
      if (Math.abs(transport.bpm.value - bpm) > 0.001) transport.bpm.setValueAtTime(bpm, time);
      const sec = stepSeconds(bpm);
      const pos = n % program.steps;
      const loop = Math.floor(n / program.steps);
      // Swing: the in-between sixteenths land late, and so does what you see of them.
      const at = time + leanDelay(pos, program.lean(), sec);
      // Starting part-way through, what would still be ringing comes in with the first step.
      const sounds = n === from && from > 0 && program.resume ? [...program.at(pos, sec), ...program.resume(pos, sec)] : program.at(pos, sec);
      for (const s of sounds) this.trigger(s, at + (s.delay ?? 0), session);
      const lanes = sounds.filter((s) => s.voice === 'kick' || s.voice === 'snare' || s.voice === 'hat').map((s) => s.voice as Lane);
      const i = n;
      const lead = time - raw.currentTime; // how far ahead this step was scheduled; must be > 0
      const heardAt = performance.now() + (at + latency - raw.currentTime) * 1000;
      const target = this.at(heardAt + this.visualOffsetMs, () => {
        if (this.current?.mode !== mode || (this.session !== session && this.session !== null)) return;
        current.next = (pos + 1) % program.steps;
        this.trace?.push({ step: pos % 16, n: i, scheduled: time, lead, latency, target, fired: performance.now(), prevFrame: this.lastFrameAt, drawn: raw.currentTime });
        this.emit({ type: 'step', mode, step: pos % 16, pos, loop, bar: Math.floor(i / 16), lanes, heardAt });
      });
      n++;
    }, '16n', 0);

    transport.start(startAt, 0);
  }

  /** `quiet`: a new playback of the same kind takes over at once, so no end is reported. */
  stop(quiet = false) {
    if (!this.raw) return; // nothing has played yet; touching Tone now would create a stray audio context
    const transport = Tone.getTransport();
    if (this.repeatId !== null) transport.clear(this.repeatId);
    this.repeatId = null;
    // Now, on the audio clock. Tone's default is now + look-ahead, which would land after a playback that starts
    // straight after this one (START_LEAD) and stop it the moment it began.
    transport.stop(Tone.immediate());
    transport.cancel(0);
    this.visuals = [];
    if (this.session) this.fadeOut(this.session);
    this.session = null;
    if (this.current) this.finish(this.current.mode, false, quiet);
  }

  /** Stop a playback without a click (see `fadeOut`), then let its bus go. */
  private fadeOut(bus: Bus) {
    fadeOut(bus, this.raw!.currentTime);
    setTimeout(() => bus.node.disconnect(), 400);
  }

  /** Run `fn` on the animation frame closest to when audio-clock time `time` is heard. */
  private atAudioTime(time: number, fn: () => void): number {
    return this.at(performance.now() + (time - this.raw!.currentTime) * 1000 + this.visualOffsetMs, fn);
  }

  /**
   * Queue `fn` for the animation frame closest to performance.now() time `at`. The audio time is converted
   * to the page clock once, when Tone schedules the step, so the frame loop does not depend on how often
   * the browser updates currentTime (about every 8 ms in WebKit).
   */
  private at(at: number, fn: () => void): number {
    // Swung steps can be queued after a later straight one; keep the queue in time order.
    let i = this.visuals.length;
    while (i > 0 && this.visuals[i - 1].at > at) i--;
    this.visuals.splice(i, 0, { at, run: fn });
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    return at;
  }

  private frame = () => {
    const now = performance.now();
    while (this.visuals.length && this.visuals[0].at <= now + HALF_FRAME_MS) this.visuals.shift()!.run();
    this.lastFrameAt = now;
    this.raf = this.visuals.length || this.current ? requestAnimationFrame(this.frame) : 0;
  };

  private finish(mode: Mode, completed: boolean, quiet = false) {
    if (this.current?.mode !== mode) return;
    const at = completed ? 0 : this.current.next;
    this.current = null;
    if (completed) Tone.getTransport().stop(Tone.immediate());
    if (!quiet) this.emit({ type: 'end', mode, completed, at });
  }

  position() {
    return this.current?.next ?? null;
  }

  level(): number {
    if (!this.analyser || !this.meterData) return 0;
    this.analyser.getFloatTimeDomainData(this.meterData);
    let peak = 0;
    for (const v of this.meterData) peak = Math.max(peak, Math.abs(v));
    return Math.min(1, peak * 1.6);
  }

  subscribe(fn: (e: EngineEvent) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit(e: EngineEvent) {
    for (const fn of this.listeners) fn(e);
  }
}
