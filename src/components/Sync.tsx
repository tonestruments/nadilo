import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { engine } from '../audio/engine';
import { estimateOffset, OFFSET_LIMITS } from '../audio/calibration';
import { STEP_SECONDS } from '../audio/schedule';
import { send, useApp } from '../machine/actor';
import { Frame } from './Onboarding';

const BEAT_MS = STEP_SECONDS * 4 * 1000;
const TAPS = 12;
/** The first taps are usually the player finding the beat; they are not measured. */
const WARM_UP = 2;

const isBeat = (e: Parameters<Parameters<typeof engine.subscribe>[0]>[0]): e is Extract<typeof e, { type: 'step' }> =>
  e.type === 'step' && e.mode === 'calibrate' && e.step % 4 === 0;

/** Sync calibration: tap along to the sound, then check the flash against it and fine-tune. */
export function Sync() {
  const phase = useApp((s) => (s.hasTag('sync.tapping') ? 'tapping' : s.hasTag('sync.checking') ? 'checking' : 'intro'));
  const back = useApp((s) => (!s.hasTag('game') ? 'Skip for now' : s.context.syncFrom === 'home' ? 'Back to Home' : 'Back to the level'));
  return (
    <Frame>
      {phase === 'intro' && <Intro back={back} />}
      {phase === 'tapping' && <Tapping />}
      {phase === 'checking' && <Checking />}
    </Frame>
  );
}

const enter = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.07 * i, duration: 0.45 } });

function Intro({ back }: { back: string }) {
  const offset = useApp((s) => s.context.syncOffsetMs);
  return (
    <>
      <motion.h1 {...enter(0)}>Line up sound and picture</motion.h1>
      <motion.p className="sub" {...enter(1)}>
        Headphones, especially Bluetooth ones, delay the sound a little. Tap along for a few seconds and Nadilo will
        line the playhead up with what you hear.
      </motion.p>
      <motion.p className="fine" {...enter(2)} data-testid="sync-current">
        {offset > 0 ? `Right now the playhead runs ${offset} ms later than the beat.`
          : offset < 0 ? `Right now the playhead runs ${-offset} ms ahead of the beat. Tap again to fix that.`
            : 'Right now there is no adjustment.'}
      </motion.p>
      <motion.div className="actions" {...enter(3)}>
        <button type="button" className="btn primary big" onClick={() => send({ type: 'SYNC.PLAY' })} data-testid="sync-start">Start tapping</button>
        <button type="button" className="btn tertiary big" onClick={() => send({ type: 'SKIP' })} data-testid="sync-skip">{back}</button>
      </motion.div>
    </>
  );
}

function Tapping() {
  const [taps, setTaps] = useState<number[]>([]);
  const [retry, setRetry] = useState(false);
  const beats = useRef<number[]>([]);
  const pad = useRef<HTMLButtonElement>(null);

  useEffect(() => engine.subscribe((e) => { if (isBeat(e)) beats.current.push(e.heardAt); }), []);

  const tap = useCallback(() => {
    setTaps((t) => [...t, performance.now()]);
    const el = pad.current;
    if (el) { el.setAttribute('data-tap', ''); setTimeout(() => el.removeAttribute('data-tap'), 90); }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      tap();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [tap]);

  useEffect(() => {
    if (taps.length < TAPS) return;
    const estimate = estimateOffset(taps.slice(WARM_UP), beats.current, BEAT_MS);
    if (estimate) send({ type: 'SYNC.SET', offsetMs: estimate.offsetMs });
    else { setRetry(true); setTaps([]); }
  }, [taps]);

  return (
    <>
      <motion.h1 {...enter(0)}>Tap along to the kick</motion.h1>
      <motion.p className="sub" {...enter(1)}>
        {retry ? 'Those taps were a little uneven. Once more, just follow the sound.' : 'Press Space on every kick you hear. It is more exact than tapping the trackpad, which registers late.'}
      </motion.p>
      <motion.div {...enter(2)} className="sync-stage">
        {/* No beat visuals here on purpose: the taps must follow the sound, not the screen. */}
        {/* It lights up on every Space press; clicking it works too, for a mouse. */}
        <button ref={pad} type="button" className="pad" onPointerDown={tap} aria-label="Tap" data-testid="sync-pad">Space</button>
        <div className="taps" aria-label={`${taps.length} of ${TAPS} taps`}>
          {Array.from({ length: TAPS }, (_, i) => <i key={i} className={i < taps.length ? 'on' : ''} />)}
        </div>
      </motion.div>
      <motion.div className="actions" {...enter(3)}>
        <button type="button" className="btn tertiary" onClick={() => send({ type: 'SKIP' })}>Skip</button>
      </motion.div>
    </>
  );
}

/** One press of an arrow moves the playhead 1 ms. Held, it keeps going, faster after a moment. */
const NUDGE_MS = 1;

/**
 * An arrow that nudges the offset: a tap is one step; holding it repeats, so a big correction does not need forty
 * taps. Reads the offset live from the statechart, so repeats build on each other.
 */
function Step({ dir, children, testId }: { dir: -1 | 1; children: React.ReactNode; testId: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offset = useApp((s) => s.context.syncOffsetMs);
  const live = useRef(offset);
  live.current = offset;
  const nudge = (ms: number) => { live.current += dir * ms; send({ type: 'SYNC.SET', offsetMs: live.current }); };
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const start = () => {
    stop();
    nudge(NUDGE_MS);
    let n = 0;
    const repeat = () => { n++; nudge(n > 12 ? 5 : NUDGE_MS); timer.current = setTimeout(repeat, 70); };
    timer.current = setTimeout(repeat, 400);
  };
  useEffect(() => stop, []);
  return (
    <button type="button" className="step" data-testid={testId}
      onPointerDown={(e) => { if (e.button === 0) start(); }} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onClick={(e) => { if (e.detail === 0) nudge(NUDGE_MS); }}>
      {children}
    </button>
  );
}

function Checking() {
  const offset = useApp((s) => s.context.syncOffsetMs);
  const pulse = useRef<HTMLDivElement>(null);

  useEffect(() => engine.subscribe((e) => {
    const el = pulse.current;
    if (!isBeat(e) || !el) return;
    el.setAttribute('data-hit', '');
    setTimeout(() => el.removeAttribute('data-hit'), 110);
  }), []);

  return (
    <>
      <motion.h1 {...enter(0)}>Do they land together?</motion.h1>
      <motion.p className="sub" {...enter(1)}>The circle now flashes on every kick. If it looks early or late, tap the arrows (1 ms a tap, hold to keep going) until the flash and the sound feel like one.</motion.p>
      <motion.div {...enter(2)} className="sync-stage">
        <div ref={pulse} className="pulse" aria-hidden />
        <div className="nudge">
          <Step dir={-1} testId="sync-earlier"><span aria-hidden>◀</span> Earlier</Step>
          <input type="range" min={OFFSET_LIMITS.min} max={OFFSET_LIMITS.max} step={1} value={offset} aria-label="Playhead offset in milliseconds"
            onChange={(e) => send({ type: 'SYNC.SET', offsetMs: Number(e.target.value) })} data-testid="sync-slider" />
          <Step dir={1} testId="sync-later">Later <span aria-hidden>▶</span></Step>
        </div>
        <div className="fine" data-testid="sync-offset">{offset ? `Playhead ${offset > 0 ? 'delayed' : 'advanced'} by ${Math.abs(offset)} ms` : 'No adjustment'}</div>
      </motion.div>
      <motion.div className="actions" {...enter(3)}>
        <button type="button" className="btn primary big" onClick={() => send({ type: 'SYNC.DONE' })} data-testid="sync-done">Looks right</button>
        <button type="button" className="btn big" onClick={() => send({ type: 'SYNC.RETAP' })}>Tap again</button>
      </motion.div>
    </>
  );
}
