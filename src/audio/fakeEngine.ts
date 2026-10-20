// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import type { Lane } from '../game/levels';
import type { Pattern } from '../game/logic';
import { drumProgram, stepSeconds } from './schedule';
import type { AudioEngine, EngineEvent, Mode, Program, Sound, TraceEntry } from './types';

/**
 * A silent engine with the same contract as the real one: it never creates an AudioContext.
 * Steps are driven by timers, so tests can use fake timers. Used by the unit tests, and by the app
 * when opened with `?fake-audio` (the end-to-end UI tests).
 */
export class FakeEngine implements AudioEngine {
  started = false;
  visualOffsetMs = 0;
  trace: TraceEntry[] | null = null;
  /** Everything the app asked for, in order, for assertions. */
  readonly calls: string[] = [];
  /** The sounds of every step played so far, for assertions about what a program plays. */
  readonly heard: Sound[][] = [];
  private listeners = new Set<(e: EngineEvent) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private current: { mode: Mode; loops: number; next: number } | null = null;

  /** `stepMs` fixes the step length; without it, steps follow the program's tempo. */
  constructor(private stepMs?: number) {}

  get mode() {
    return this.current?.mode ?? null;
  }

  unlock() {
    this.started = true;
    return Promise.resolve();
  }

  play(mode: Mode, loops: number, pattern: () => Pattern) {
    return this.playProgram(mode, drumProgram(pattern, loops), 0, `play:${mode}:${loops}`);
  }

  async playProgram(mode: Mode, program: Program, from = 0, call = from ? `program:${mode}@${from}` : `program:${mode}`) {
    this.stop(this.current?.mode === mode);
    this.started = true;
    this.calls.push(call);
    const current = { mode, loops: program.loops, next: from % program.steps };
    this.current = current;
    this.emit({ type: 'start', mode, loops: program.loops });
    const total = program.loops ? program.loops * program.steps : Infinity;
    let n = from;
    const tick = () => {
      if (this.current !== current) return;
      if (n >= total) {
        this.current = null;
        this.emit({ type: 'end', mode, completed: true, at: 0 });
        return;
      }
      const pos = n % program.steps;
      const sec = stepSeconds(program.bpm());
      const sounds = n === from && from > 0 && program.resume ? [...program.at(pos, sec), ...program.resume(pos, sec)] : program.at(pos, sec);
      current.next = (pos + 1) % program.steps;
      this.heard.push(sounds);
      if (this.heard.length > 1024) this.heard.splice(0, 512);
      const lanes = sounds.filter((s) => s.voice === 'kick' || s.voice === 'snare' || s.voice === 'hat').map((s) => s.voice as Lane);
      this.emit({ type: 'step', mode, step: pos % 16, pos, loop: Math.floor(n / program.steps), bar: Math.floor(n / 16), lanes, heardAt: performance.now() });
      n++;
      this.timer = setTimeout(tick, this.stepMs ?? sec * 1000);
    };
    tick();
  }

  /** `quiet`: a new playback of the same kind takes over at once, so no end is reported (as in ToneEngine). */
  stop(quiet = false) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.current) {
      const { mode, next } = this.current;
      this.current = null;
      this.calls.push('stop');
      if (!quiet) this.emit({ type: 'end', mode, completed: false, at: next });
    }
  }

  async audition(lane: Lane) {
    this.calls.push(`audition:${lane}`);
  }

  async hear(sounds: Sound[]) {
    this.calls.push(`hear:${sounds.map((s) => s.sample + (s.midi !== undefined ? `@${s.midi}` : '')).join('+')}`);
  }

  position() {
    return this.current?.next ?? null;
  }

  level() {
    return this.current ? 0.4 : 0;
  }

  subscribe(fn: (e: EngineEvent) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit(e: EngineEvent) {
    for (const fn of this.listeners) fn(e);
  }
}
