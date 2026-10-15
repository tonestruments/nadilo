import { useEffect, useRef } from 'react';
import { send, useApp } from '../../machine/actor';
import type { AppEvent } from '../../machine/appMachine';
import { stepSeconds } from '../../audio/schedule';
import { songOf } from '../../school/rules';
import { STEPS, songBars } from '../../school/song';
import { ArrowIcon, PauseIcon, PlayIcon } from '../Icons';
import { useNeedle } from './use';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The whole song on a screen of its own, with a real player: play, pause, and a ribbon to move through it. It shows
 * how long the song is and where it is, nothing of how it is built. Used when the song is met, and at the end of each
 * world, when the player's own parts are in it.
 */
export function SongPlayer({ kicker, title, line, action, then, color, testId }: {
  kicker: string; title: string; line?: string; action: string; then: AppEvent; color: string; testId: string;
}) {
  return (
    <section className="s-song-screen" style={{ ['--world' as string]: color }} data-testid={testId}>
      <p className="s-kicker">{kicker}</p>
      <h1>{title}</h1>
      {line && <p className="s-line">{line}</p>}
      <Player />
      <button type="button" className="s-sbtn s-primary s-big" data-testid="song-next"
        onClick={() => send(then)}>{action}<ArrowIcon size={17} /></button>
    </section>
  );
}

/** Play, pause, and the ribbon: the whole song, from where it was left. */
export function Player() {
  const song = useApp((s) => songOf(s.context.school));
  const playing = useApp((s) => s.context.playing === 'song');
  const at = useApp((s) => s.context.songAt);
  const total = songBars(song) * STEPS;
  const sec = stepSeconds(song.bpm);
  const range = useRef<HTMLInputElement>(null);
  const now = useRef<HTMLSpanElement>(null);

  /** Show a position without asking React: the ribbon follows the music step by step. */
  const show = (pos: number) => {
    if (range.current) {
      range.current.value = String(pos);
      range.current.style.setProperty('--pf', String(pos / (total - 1)));
    }
    if (now.current) now.current.textContent = clock(pos * sec);
  };
  useEffect(() => show(at), [at]); // eslint-disable-line react-hooks/exhaustive-deps
  useNeedle((n) => { if (n.mode === 'song') show(n.pos); }, () => undefined);

  // The ribbon moves the song when it is let go (or on each key press), not on every pixel of a drag.
  useEffect(() => {
    const el = range.current;
    if (!el) return;
    const commit = () => send({ type: 'SONG.SEEK', at: Number(el.value) });
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, []);

  return (
    <div className="s-player">
      <button type="button" className="s-splay" aria-label={playing ? 'Pause' : 'Play'} data-testid="song-play"
        onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); send({ type: 'SONG.PLAY' }); } }}
        onClick={(e) => { if (e.detail === 0) send({ type: 'SONG.PLAY' }); }}>
        {playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
      </button>
      <div className="s-ribbon">
        <input ref={range} type="range" min={0} max={total - 1} step={STEPS / 4} defaultValue={at} aria-label="Where in the song"
          data-testid="song-ribbon" onInput={(e) => show(Number((e.target as HTMLInputElement).value))} />
      </div>
      <p className="s-time"><span ref={now}>{clock(at * sec)}</span> / {clock(total * sec)}</p>
    </div>
  );
}
