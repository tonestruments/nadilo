import { useEffect, useRef, type ReactNode } from 'react';
import { engine } from '../audio/engine';
import { playingLabel } from '../game/copy';
import { useApp } from '../machine/actor';
import { PauseIcon, PlayIcon } from './Icons';

export function Switch({ on, onChange, children, testId }: { on: boolean; onChange: (v: boolean) => void; children?: ReactNode; testId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="switch" onClick={() => onChange(!on)} data-testid={testId}>
      {children}
      <span className="track" />
    </button>
  );
}

/** The small round play/pause button. Flat, no glow, no ring. */
export function PlayButton({ playing, onClick, label, primary = true, large = false, testId }: {
  playing: boolean; onClick: () => void; label: string; primary?: boolean; large?: boolean; testId?: string;
}) {
  const size = large ? 30 : 24;
  // The triangle is drawn optically centred in its box (see PlayIcon): it needs no extra nudge.
  return (
    <button type="button" className={`play ${primary ? '' : 'secondary'} ${large ? 'large' : ''}`} onClick={onClick} aria-label={label} data-testid={testId}>
      {playing ? <PauseIcon size={size} /> : <PlayIcon size={size} />}
    </button>
  );
}

/**
 * Whether sound is playing, and what: small, in the title bar, next to Sync. A dot (green while playing), a few words,
 * and while something plays, a live meter of the real signal leaving the app.
 */
export function SoundStatus() {
  const playing = useApp((s) => s.context.playing);
  const loop = useApp((s) => s.context.loop);
  const loops = useApp((s) => s.context.loops);
  return (
    <div className={`status ${playing ? 'on' : ''}`} data-testid="status">
      <span className="led" />
      <b>{playing ? playingLabel(playing) : engine.started ? 'Sound ready' : 'Sound starts on play'}</b>
      {/* A count only where there is more than one pass to count. */}
      {playing && loops > 1 && <span>loop {loop} of {loops}</span>}
      <Meter />
    </div>
  );
}

/** A live output meter. It reads the real signal leaving the app, so a moving line means sound is playing. */
export function Meter({ onSignal }: { onSignal?: () => void }) {
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    let raf = 0;
    let level = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = engine.level();
      level = v > level ? v : level * 0.9;
      if (level < 0.01) level = 0;
      if (bar.current) bar.current.style.transform = `scaleX(${level.toFixed(3)})`;
      if (v > 0.02) onSignal?.();
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [onSignal]);
  return <span className="meter" data-testid="meter"><i ref={bar} /></span>;
}
