/*
 * nadilo-sound.js
 *
 * The sound engine shared by the two Nadilo School pages in docs/artifacts (the music lesson and the School design).
 * Every sound is synthesised in the browser, so nothing licensed ever leaves the app. The song is Nadilo School's own
 * song, note for note (src/school/levels.ts): the same beat, bass, chords, tune, tempo, swing and arrangement.
 *
 * How it works, in the app's own terms:
 * - Steps are sixteenth notes. A player wakes every 25 ms and schedules each step 120 ms ahead on the audio clock.
 * - Swing delays the in-between (odd) sixteenths by a fraction of a step, as Nadilo's lean does.
 * - Visuals for a step fire on the animation frame closest to the moment it is heard.
 * - Each part has its own bus, so a page can change the mix live (solo a part, veil the ones not rebuilt yet)
 *   without restarting. Each playback has its own session, so Stop fades exactly its notes.
 * - One player at a time: starting one stops the last.
 */
(function (root) {
  'use strict';

  const BUSES = ['kick', 'snare', 'hat', 'bass', 'chords', 'melody', 'click'];
  const VOICE_BUS = { kick: 'kick', snare: 'snare', hat: 'hat', bass: 'bass', keys: 'chords', pad: 'chords', lead: 'melody', tone: 'melody', click: 'click', tap: 'click' };
  /** The mix: drums lead, the tune sits on top, bass and chords a little under. Multipliers apply on top of these. */
  const LEVEL = { kick: 0.95, snare: 0.62, hat: 0.24, bass: 0.37, chords: 0.6, melody: 0.7, click: 0.5 };

  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  // the signal path

  function makeKit(c) {
    const len = c.sampleRate;
    const noise = c.createBuffer(1, len, c.sampleRate);
    const d = noise.getChannelData(0);
    let s = 22695477;
    for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; }
    // A soft saturation for the kick, so a laptop speaker hears its harmonics even where it cannot play its body.
    const drive = new Float32Array(1024);
    for (let i = 0; i < drive.length; i++) { const x = (i / (drive.length - 1)) * 2 - 1; drive[i] = Math.tanh(2.4 * x) / Math.tanh(2.4); }
    return { noise, drive };
  }

  function buildGraph(c) {
    const out = c.createGain();
    out.gain.value = 0.55;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 35; hp.Q.value = 0.7;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -15; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
    out.connect(hp); hp.connect(comp); comp.connect(c.destination);
    const buses = {};
    for (const name of BUSES) {
      const gain = c.createGain();
      gain.gain.value = LEVEL[name];
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 18000; filter.Q.value = 0.4;
      gain.connect(filter); filter.connect(out);
      buses[name] = { gain, filter };
    }
    return { out, buses, kit: makeKit(c) };
  }

  /** Attack to a peak, decay toward a sustain level, release from `rel`. Never ramps to zero (exponential ramps can't). */
  function env(param, t, peak, atk, sustain, decayTau, rel, relTau) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + atk);
    param.setTargetAtTime(Math.max(sustain, 0.0001), t + atk, decayTau);
    param.setTargetAtTime(0.0001, Math.max(t + atk, rel), relTau);
  }

  function noiseSource(c, k, t, dur) {
    const s = c.createBufferSource();
    s.buffer = k.noise;
    s.start(t, (t * 7.31) % 0.5);
    s.stop(t + dur);
    return s;
  }

  // the voices: each one makes its own nodes, plays once and is let go

  const V = {};

  V.kick = (c, dest, k, t, o) => {
    const vel = o.vel ?? 1;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(54, t + 0.11);
    const g = c.createGain();
    env(g.gain, t, vel, 0.003, 0.0001, 0.11, t + 0.32, 0.05);
    const sh = c.createWaveShaper();
    sh.curve = k.drive;
    osc.connect(g); g.connect(sh); sh.connect(dest);
    osc.start(t); osc.stop(t + 0.55);
    // The beater: a tick of noise, which is most of what a laptop hears.
    const n = noiseSource(c, k, t, 0.03);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1600;
    const ng = c.createGain();
    env(ng.gain, t, 0.22 * vel, 0.001, 0.0001, 0.006, t + 0.012, 0.004);
    n.connect(hp); hp.connect(ng); ng.connect(dest);
  };

  V.snare = (c, dest, k, t, o) => {
    const vel = o.vel ?? 1;
    const n = noiseSource(c, k, t, 0.3);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 650;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.6;
    const g = c.createGain();
    env(g.gain, t, 0.95 * vel, 0.002, 0.0001, 0.055, t + 0.2, 0.03);
    n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(dest);
    const body = c.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(215, t);
    body.frequency.exponentialRampToValueAtTime(165, t + 0.08);
    const bg = c.createGain();
    env(bg.gain, t, 0.55 * vel, 0.002, 0.0001, 0.035, t + 0.12, 0.02);
    body.connect(bg); bg.connect(dest);
    body.start(t); body.stop(t + 0.25);
  };

  V.hat = (c, dest, k, t, o) => {
    const vel = o.vel ?? 1;
    const open = !!o.open;
    const n = noiseSource(c, k, t, open ? 0.6 : 0.12);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7200;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 10500; bp.Q.value = 0.7;
    const g = c.createGain();
    env(g.gain, t, 0.55 * vel, 0.001, 0.0001, open ? 0.12 : 0.016, t + (open ? 0.4 : 0.05), 0.012);
    n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(dest);
  };

  V.bass = (c, dest, k, t, o) => {
    const vel = o.vel ?? 1;
    const f = hz(o.midi ?? 36);
    const dur = Math.max(0.06, o.dur ?? 0.5);
    const saw = c.createOscillator();
    saw.type = 'sawtooth'; saw.frequency.value = f;
    const sub = c.createOscillator();
    sub.type = 'sine'; sub.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.6;
    lp.frequency.setValueAtTime(f * 11, t);
    lp.frequency.setTargetAtTime(f * 2.6, t, 0.09);
    const sg = c.createGain();
    sg.gain.value = 0.7;
    const g = c.createGain();
    env(g.gain, t, 0.5 * vel, 0.006, 0.34 * vel, 0.2, t + dur, 0.035);
    saw.connect(lp); lp.connect(g); sub.connect(sg); sg.connect(g); g.connect(dest);
    saw.start(t); sub.start(t);
    saw.stop(t + dur + 0.3); sub.stop(t + dur + 0.3);
  };

  /** A plucked, guitar-like chord tone. */
  V.keys = (c, dest, k, t, o) => {
    const vel = o.vel ?? 1;
    const f = hz(o.midi ?? 60);
    const dur = Math.max(0.1, o.dur ?? 1);
    const a = c.createOscillator();
    a.type = 'triangle'; a.frequency.value = f;
    const b = c.createOscillator();
    b.type = 'sawtooth'; b.frequency.value = f; b.detune.value = 4;
    const bg = c.createGain();
    bg.gain.value = 0.22;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 9, t);
    lp.frequency.setTargetAtTime(f * 2.6, t, 0.18);
    const g = c.createGain();
    env(g.gain, t, 0.2 * vel, 0.004, 0.06 * vel, 0.32, t + dur, 0.09);
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); g.connect(dest);
    a.start(t); b.start(t);
    a.stop(t + dur + 0.8); b.stop(t + dur + 0.8);
  };

  /** A soft pad that holds the bar. */
  V.pad = (c, dest, k, t, o) => {
    const vel = o.vel ?? 1;
    const f = hz(o.midi ?? 60);
    const dur = Math.max(0.2, o.dur ?? 2);
    const a = c.createOscillator();
    const b = c.createOscillator();
    a.type = 'sawtooth'; b.type = 'sawtooth';
    a.frequency.value = f; b.frequency.value = f;
    a.detune.value = -9; b.detune.value = 9;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = Math.min(1500, f * 3.2); lp.Q.value = 0.3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setTargetAtTime(0.045 * vel, t, 0.08);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.16);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(dest);
    a.start(t); b.start(t);
    a.stop(t + dur + 1.2); b.stop(t + dur + 1.2);
  };

  /** A kalimba-like tine: a round tone with a quick metallic tick on top. */
  V.lead = (c, dest, k, t, o) => {
    const vel = o.vel ?? 1;
    const f = hz(o.midi ?? 72);
    const dur = Math.max(0.08, o.dur ?? 0.6);
    const s = c.createOscillator();
    s.type = 'sine'; s.frequency.value = f;
    const tri = c.createOscillator();
    tri.type = 'triangle'; tri.frequency.value = f;
    const tg = c.createGain();
    tg.gain.value = 0.35;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34 * vel, t + 0.003);
    g.gain.setTargetAtTime(0.0001, t + 0.003, 0.42);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    s.connect(g); tri.connect(tg); tg.connect(g); g.connect(dest);
    const tine = c.createOscillator();
    tine.type = 'sine'; tine.frequency.value = f * 5.4;
    const ting = c.createGain();
    env(ting.gain, t, 0.05 * vel, 0.002, 0.0001, 0.03, t + 0.08, 0.02);
    tine.connect(ting); ting.connect(dest);
    s.start(t); tri.start(t); tine.start(t);
    s.stop(t + dur + 0.5); tri.stop(t + dur + 0.5); tine.stop(t + 0.3);
  };

  /** A plain held tone, for showing how long a note lasts. */
  V.tone = (c, dest, k, t, o) => {
    const vel = o.vel ?? 1;
    const f = hz(o.midi ?? 72);
    const dur = Math.max(0.05, o.dur ?? 0.5);
    const a = c.createOscillator();
    a.type = 'triangle'; a.frequency.value = f;
    const b = c.createOscillator();
    b.type = 'sine'; b.frequency.value = f * 2;
    const bg = c.createGain();
    bg.gain.value = 0.18;
    const g = c.createGain();
    env(g.gain, t, 0.3 * vel, 0.01, 0.24 * vel, 0.3, t + dur, 0.025);
    a.connect(g); b.connect(bg); bg.connect(g); g.connect(dest);
    a.start(t); b.start(t);
    a.stop(t + dur + 0.25); b.stop(t + dur + 0.25);
  };

  /** The metronome's tick; the first beat of a bar is higher. */
  V.click = (c, dest, k, t, o) => {
    const vel = o.vel ?? 1;
    const s = c.createOscillator();
    s.type = 'sine'; s.frequency.value = o.accent ? 1760 : 1175;
    const g = c.createGain();
    env(g.gain, t, 0.5 * vel, 0.001, 0.0001, 0.012, t + 0.03, 0.01);
    s.connect(g); g.connect(dest);
    s.start(t); s.stop(t + 0.1);
  };

  /** A woodblock knock, for tapping along. */
  V.tap = (c, dest, k, t, o) => {
    const s = c.createOscillator();
    s.type = 'sine'; s.frequency.setValueAtTime(920, t); s.frequency.exponentialRampToValueAtTime(700, t + 0.04);
    const g = c.createGain();
    env(g.gain, t, 0.35 * (o.vel ?? 1), 0.001, 0.0001, 0.02, t + 0.05, 0.01);
    s.connect(g); g.connect(dest);
    s.start(t); s.stop(t + 0.12);
  };

  // the live engine

  const NS = {};
  let ctx = null;
  let graph = null;
  let taps = null;
  let current = null;

  function newSession() {
    const s = {};
    for (const b of BUSES) { const g = ctx.createGain(); g.connect(graph.buses[b].gain); s[b] = g; }
    return s;
  }
  function endSession(s) {
    const t = ctx.currentTime;
    for (const b of BUSES) { s[b].gain.cancelScheduledValues(t); s[b].gain.setTargetAtTime(0, t, 0.012); }
    setTimeout(() => { for (const b of BUSES) s[b].disconnect(); }, 600);
  }

  /** Start (or wake) audio. Call it from a click: browsers only let sound start from a gesture. */
  NS.start = function () {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
      graph = buildGraph(ctx);
      taps = newSession();
    }
    if (ctx.state !== 'running') ctx.resume();
    return ctx;
  };
  NS.now = () => (ctx ? ctx.currentTime : 0);
  NS.hz = hz;

  /** Play one sound now (or at audio time `t`), outside any player: a pad tapped, a chord previewed. */
  NS.play = function (voice, o, t, session) {
    if (!NS.start() || !V[voice]) return;
    const when = t ?? ctx.currentTime + 0.006;
    V[voice](ctx, (session || taps)[VOICE_BUS[voice]], graph.kit, when, o || {});
  };

  /**
   * The mix, as multipliers of each bus's level (1 = as mixed, 0 = silent). `veil` dulls the named buses, the way a
   * part you can hear through a curtain sounds. Changes glide over about 30 ms, so they never click.
   */
  NS.mix = function (mult, veil) {
    if (!NS.start()) return;
    const t = ctx.currentTime;
    mult = mult || {};
    veil = veil || {};
    for (const b of BUSES) {
      const m = mult[b] ?? 1;
      graph.buses[b].gain.gain.setTargetAtTime(LEVEL[b] * m, t, 0.03);
      graph.buses[b].filter.frequency.setTargetAtTime(veil[b] ? 1100 : 18000, t, 0.04);
    }
  };

  // Visuals: queued in performance.now() time and run on the frame nearest to when each step is heard.
  const visuals = [];
  let raf = 0;
  function at(audioTime, fn) {
    const latency = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0;
    const target = performance.now() + (audioTime + latency - ctx.currentTime) * 1000;
    let i = visuals.length;
    while (i > 0 && visuals[i - 1].at > target) i--;
    visuals.splice(i, 0, { at: target, fn });
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    const now = performance.now();
    while (visuals.length && visuals[0].at <= now + 8) {
      const v = visuals.shift();
      try { v.fn(); } catch (e) { console.error(e); }
    }
    raf = visuals.length ? requestAnimationFrame(frame) : 0;
  }

  /**
   * A player: plays `events(pos, stepSec, n, first, at)` step by step, where `at` is the step's place on the audio clock
   * before swing (what a page needs to match a tap to a step). `steps` is a pass, `loops` the passes (0 = until
   * stopped). bpm, swing (0 to 0.5 of a step), events and mix can all change while it plays. `onStep(pos, n)` runs on the
   * frame the step is heard; `onStop(ended)` when it stops or plays to its end.
   */
  NS.player = function (spec) {
    const p = {
      bpm: spec.bpm || 88, steps: spec.steps || 16, loops: spec.loops || 0, swing: spec.swing || 0,
      events: spec.events, onStep: spec.onStep, onStop: spec.onStop, onStart: spec.onStart,
      mixMult: spec.mix || null, veil: spec.veil || null, playing: false,
    };
    let gen = 0, n = 0, next = 0, first = 0, timer = 0, session = null;

    function tick() {
      const g = gen;
      const total = p.loops ? p.loops * p.steps : Infinity;
      while (p.playing && g === gen && next < ctx.currentTime + 0.12) {
        if (n >= total) {
          clearInterval(timer); timer = 0;
          const s = session;
          at(next, () => {
            if (g !== gen) return;
            p.playing = false; gen++;
            if (current === p) current = null;
            setTimeout(() => endSession(s), 1500);
            if (p.onStop) p.onStop(true);
          });
          return;
        }
        const pos = n % p.steps;
        const sec = 60 / p.bpm / 4;
        const t = next + (pos % 2 === 1 ? p.swing * sec : 0);
        const evs = p.events ? p.events(pos, sec, n, n === first, next) : null;
        if (evs) for (const e of evs) NS.play(e.v, e, t + (e.delay || 0), session);
        const nn = n;
        at(t, () => { if (g === gen && p.onStep) p.onStep(pos, nn); });
        next += sec;
        n++;
      }
    }
    function halt(notify) {
      clearInterval(timer); timer = 0;
      if (!p.playing) return;
      p.playing = false; gen++;
      if (session) endSession(session);
      session = null;
      if (current === p) current = null;
      if (notify && p.onStop) p.onStop(false);
    }

    /** Start from step `from` (0: the top). Whatever else was playing stops. */
    p.start = function (from) {
      if (!NS.start()) return;
      if (current && current !== p) current.stop();
      halt(false);
      current = p;
      p.playing = true; gen++;
      n = Math.max(0, Math.floor(from || 0)); first = n;
      next = ctx.currentTime + 0.07;
      session = newSession();
      NS.mix(p.mixMult, p.veil);
      if (p.onStart) p.onStart();
      tick();
      timer = setInterval(tick, 25);
    };
    p.stop = function () { halt(true); };
    p.toggle = function (from) { if (p.playing) p.stop(); else p.start(from); };
    /** Change the mix while playing (or before), without a restart. */
    p.setMix = function (mult, veil) { p.mixMult = mult || null; p.veil = veil || null; if (p.playing) NS.mix(p.mixMult, p.veil); };
    /** The step about to be scheduled, for picking up again after a pause. */
    p.position = () => n;
    return p;
  };

  NS.stopAll = function () { if (current) current.stop(); };

  // Nadilo School's song (src/school/levels.ts, src/school/music.ts)

  /** C minor, six chords. Colours are the app's mood colours. */
  const MOODS = {
    home: { pcs: [0, 3, 7], color: 'oklch(56.2% 0.171 267.9)', chord: 'C minor', roman: 'i', notes: 'C E\u266d G' },
    warm: { pcs: [8, 0, 3], color: 'oklch(71% 0.139 59.4)', chord: 'A\u266d major', roman: 'VI', notes: 'A\u266d C E\u266d' },
    bright: { pcs: [3, 7, 10], color: 'oklch(80.1% 0.145 90.1)', chord: 'E\u266d major', roman: 'III', notes: 'E\u266d G B\u266d' },
    lift: { pcs: [10, 2, 5], color: 'oklch(66.3% 0.108 167.7)', chord: 'B\u266d major', roman: 'VII', notes: 'B\u266d D F' },
    longing: { pcs: [5, 8, 0], color: 'oklch(61.8% 0.161 313.2)', chord: 'F minor', roman: 'iv', notes: 'F A\u266d C' },
    restless: { pcs: [7, 10, 2], color: 'oklch(61.8% 0.171 17.7)', chord: 'G minor', roman: 'v', notes: 'G B\u266d D' },
  };
  const BASS_ROWS = [36, 39, 41, 43, 44, 46]; // C2 Eb2 F2 G2 Ab2 Bb2
  const LEAD_ROWS = [67, 70, 72, 75, 77, 79]; // G4 Bb4 C5 Eb5 F5 G5: C minor pentatonic
  const NOTE_NAMES = ['C', 'C\u266f', 'D', 'E\u266d', 'E', 'F', 'F\u266f', 'G', 'A\u266d', 'A', 'B\u266d', 'B'];
  const noteName = (midi) => NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  const fits = (mood, midi) => MOODS[mood].pcs.includes(((midi % 12) + 12) % 12);
  /** A chord's notes, voiced between G3 and F#4, as the app voices them. */
  const voicing = (mood) => MOODS[mood].pcs.map((pc) => (60 + pc > 66 ? 48 + pc : 60 + pc)).sort((a, b) => a - b);
  const rootRow = (mood) => BASS_ROWS.findIndex((m) => m % 12 === MOODS[mood].pcs[0]);
  /** The song's bass: each bar's root on beats 1 and 3, then a step up to another note of the chord on beat 4. */
  const walk = (chords) => chords.flatMap((m, b) => {
    const r = rootRow(m);
    const up = [1, 2, 3, 4, 5].map((d) => r + d).find((x) => x < BASS_ROWS.length && fits(m, BASS_ROWS[x])) ?? r;
    return [{ c: b * 4, r }, { c: b * 4 + 2, r }, { c: b * 4 + 3, r: up }];
  });

  const SECTIONS = [
    { id: 'intro', name: 'Intro', bars: 4 },
    { id: 'verse', name: 'Verse', bars: 8 },
    { id: 'break', name: 'Break', bars: 4 },
    { id: 'chorus', name: 'Chorus', bars: 8 },
    { id: 'outro', name: 'Outro', bars: 4 },
  ];
  const SONG_BARS = SECTIONS.reduce((s, x) => s + x.bars, 0);
  const sectionOfBar = (bar) => {
    let end = 0;
    for (let i = 0; i < SECTIONS.length; i++) { end += SECTIONS[i].bars; if (bar < end) return i; }
    return SECTIONS.length - 1;
  };

  const SONG = {
    bpm: 88,
    /** The app's swing of 0.3 is a lean of 0.15 of a step: about 57.5 % in drum-machine terms. */
    swing: 0.15,
    drums: { kick: [0, 4, 8, 12], snare: [4, 12], ghost: [3, 11], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    chords: ['home', 'warm', 'bright', 'lift'],
    tune: [
      { c: 0, r: 2 }, { c: 1, r: 3 }, { c: 3, r: 4 }, { c: 5, r: 3 }, { c: 6, r: 1 },
      { c: 8, r: 2 }, { c: 9, r: 3 }, { c: 11, r: 4 }, { c: 13, r: 3 }, { c: 15, r: 2 },
    ],
    /** Which parts play in each section: the intro is bass and chords, the break drops the drums, the outro lets go. */
    arr: {
      drums: [false, true, false, true, true],
      bass: [true, true, true, true, false],
      chords: [true, true, true, true, true],
      melody: [false, true, true, true, false],
    },
  };
  SONG.bass = walk(SONG.chords);

  /** A ladder note rings until the next one (going round the loop), at most `max` beats. */
  function ring(notes, cell, max, sec) {
    let beats = max;
    for (let d = 1; d <= max; d++) { if (notes.some((n) => n.c === (cell + d) % 16)) { beats = d; break; } }
    return beats * 4 * sec - 0.02;
  }

  /**
   * The sounds on step `pos` of a track. `opt.arranged` plays the song's sections (pos counts from the intro);
   * `opt.barOffset` starts a loop at a later bar. Parts the track leaves out (null) are silent.
   */
  function eventsAt(track, pos, sec, opt) {
    opt = opt || {};
    const bar = Math.floor(pos / 16) + (opt.barOffset || 0);
    const step = pos % 16;
    const lb = bar % 4;
    const sec_i = sectionOfBar(bar);
    const arr = track.arr || SONG.arr;
    const on = (part) => (!opt.arranged || arr[part][sec_i]);
    const out = [];
    const d = track.drums;
    if (d && on('drums')) {
      const kick = d.kick && d.kick.includes(step);
      if (kick) out.push({ v: 'kick', vel: 1 });
      if (d.snare && d.snare.includes(step)) out.push({ v: 'snare', vel: 1, delay: kick ? 0.03 : 0.004 });
      if (d.ghost && d.ghost.includes(step)) out.push({ v: 'snare', vel: 0.35, delay: 0.004 });
      if (d.hat && d.hat.includes(step)) out.push({ v: 'hat', vel: step % 4 === 0 ? 1 : 0.78, delay: 0.009 });
    }
    if (step === 0 && track.chords && on('chords')) {
      voicing(track.chords[lb]).forEach((midi, i) => {
        out.push({ v: 'keys', midi, delay: i * 0.014, dur: 16 * sec - 0.04 });
        out.push({ v: 'pad', midi, dur: 16 * sec });
      });
    }
    if (step % 4 === 0) {
      const cell = lb * 4 + step / 4;
      if (track.bass && on('bass')) {
        const n = track.bass.find((x) => x.c === cell);
        if (n) out.push({ v: 'bass', midi: BASS_ROWS[n.r], dur: ring(track.bass, cell, 4, sec) });
      }
      if (track.tune && on('melody')) {
        const n = track.tune.find((x) => x.c === cell);
        if (n) out.push({ v: 'lead', midi: LEAD_ROWS[n.r], dur: ring(track.tune, cell, 2, sec) });
      }
    }
    return out;
  }

  /**
   * Starting part-way through: what would still be ringing (the bar's chord, a held bass or tune note), for what is
   * left of it, so a resumed song comes in whole.
   */
  function ringingAt(track, pos, sec, opt) {
    const out = [];
    const barStart = pos - (pos % 16);
    if (barStart < pos) {
      for (const e of eventsAt(track, barStart, sec, opt)) {
        if (e.v !== 'keys' && e.v !== 'pad') continue;
        const left = e.dur - (pos - barStart) * sec;
        if (left > 0.08) out.push({ ...e, dur: left, delay: 0 });
      }
    }
    for (const v of ['bass', 'lead']) {
      for (let p = pos - 1; p >= Math.max(0, pos - 16); p--) {
        const e = eventsAt(track, p, sec, opt).find((x) => x.v === v);
        if (!e) continue;
        const left = e.dur - (pos - p) * sec;
        if (left > 0.08) out.push({ ...e, dur: left });
        break;
      }
    }
    return out;
  }

  NS.song = SONG;
  NS.moods = MOODS;
  NS.sections = SECTIONS;
  NS.SONG_BARS = SONG_BARS;
  NS.BASS_ROWS = BASS_ROWS;
  NS.LEAD_ROWS = LEAD_ROWS;
  NS.noteName = noteName;
  NS.voicing = voicing;
  NS.fits = fits;
  NS.walk = walk;
  NS.sectionOfBar = sectionOfBar;
  NS.eventsAt = eventsAt;
  NS.ringingAt = ringingAt;
  NS.stepSec = (bpm) => 60 / bpm / 4;

  /**
   * Render offline, for checking levels without speakers: `schedule(play)` calls `play(voice, options, time)`.
   * Resolves to the rendered AudioBuffer.
   */
  NS.render = function (seconds, schedule) {
    const OC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const oc = new OC(2, Math.ceil(44100 * seconds), 44100);
    const g = buildGraph(oc);
    schedule((voice, o, t) => V[voice](oc, g.buses[VOICE_BUS[voice]].gain, g.kit, t, o || {}));
    return oc.startRendering();
  };

  root.NadiloSound = NS;
})(window);
