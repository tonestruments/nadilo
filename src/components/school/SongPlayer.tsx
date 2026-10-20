// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';
import { send, useApp } from '../../machine/actor';
import type { AppEvent } from '../../machine/appMachine';
import { stepSeconds } from '../../audio/schedule';
import { partSpan } from '../../school/mix';
import { songOf, type Listen } from '../../school/rules';
import { STEPS, songBars } from '../../school/song';
import { ArrowIcon, PauseIcon, PlayIcon } from '../Icons';
import { LoopIcon } from './Glyphs';
import { mark, press, useNeedle } from './use';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** A move through the song lands on a beat. */
const BEAT = STEPS / 4;

/**
 * The whole song on a screen of its own, with a real player: play, pause, a track to move through it, and its
 * sections to listen to one at a time. Used when the song is met, and at the end of each world, where The song and
 * Yours so far (only what the player has made) sit under it.
 */
export function SongPlayer({ kicker, title, line, action, then, color, testId, whose }: {
  kicker: string; title: string; line?: string; action: string; then: AppEvent; color: string; testId: string;
  whose?: readonly { id: Listen; label: string }[];
}) {
  return (
    <section className="s-song-screen" style={{ ['--world' as string]: color }} data-testid={testId}>
      <p className="s-kicker">{kicker}</p>
      <h1>{title}</h1>
      {line && <p className="s-line">{line}</p>}
      <Player />
      {whose && <Whose options={whose} />}
      <button type="button" className="s-sbtn s-primary s-big" data-testid="song-next"
        onClick={() => send(then)}>{action}<ArrowIcon size={17} /></button>
    </section>
  );
}

/** Two ways to hear the whole song, switched on the next step while it plays. Pressing the one playing stops it. */
export function Whose({ options }: { options: readonly { id: Listen; label: string }[] }) {
  const listen = useApp((s) => s.context.room.listen);
  const playing = useApp((s) => s.context.playing === 'song');
  return (
    <div className="s-ab" role="radiogroup" aria-label="Listen to">
      {options.map((l) => (
        <button key={l.id} type="button" role="radio" aria-checked={listen === l.id} className="s-seg" data-testid={`listen-${l.id}`}
          data-playing={playing && listen === l.id ? '' : undefined}
          {...press(() => send({ type: 'SCHOOL.LISTEN', listen: l.id }))}>{l.label}</button>
      ))}
    </div>
  );
}

/**
 * Play and pause; the track, with the time either side of it; and the song's sections under it, each where it falls.
 * The track follows the music step by step without asking React. A press on it moves the song there at once, and a
 * drag moves only the handle until it is let go, so the music never fights the hand. A section pressed is looped on
 * its own; pressed again, the whole song plays on from where it is.
 */
export function Player() {
  const song = useApp((s) => songOf(s.context.school));
  const playing = useApp((s) => s.context.playing === 'song');
  const at = useApp((s) => s.context.songAt);
  const part = useApp((s) => s.context.songPart);
  const total = songBars(song) * STEPS;
  const sec = stepSeconds(song.bpm);
  const track = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLSpanElement>(null);
  const parts = useRef<HTMLDivElement>(null);
  /** The handle is being dragged: the music's steps do not move it. */
  const held = useRef(false);

  /** Show a position, in steps of the whole song. */
  const show = (pos: number) => {
    track.current?.style.setProperty('--pf', String(Math.min(1, pos / total)));
    track.current?.setAttribute('aria-valuenow', String(Math.round(pos * sec)));
    track.current?.setAttribute('aria-valuetext', clock(pos * sec));
    if (now.current) now.current.textContent = clock(pos * sec);
  };
  const showPart = (pos: number) => {
    let start = 0;
    const i = song.sections.findIndex((s) => (start += s.bars * STEPS) > pos);
    mark(parts.current, `[data-part="${i}"]`);
  };
  useEffect(() => { show(at); if (!playing) mark(parts.current, null); }, [at, playing]); // eslint-disable-line react-hooks/exhaustive-deps
  useNeedle((n) => {
    if (n.mode !== 'song') return;
    showPart(n.pos);
    if (!held.current) show(n.pos);
  }, () => mark(parts.current, null));

  /** The step under the pointer, on a beat. */
  const under = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (x - r.left) / r.width));
    return Math.min(total - BEAT, Math.round((f * total) / BEAT) * BEAT);
  };
  const seek = (pos: number) => { show(pos); send({ type: 'SONG.SEEK', at: pos }); };
  const loop = part === null ? null : partSpan(song, part);

  return (
    <div className="s-player">
      <button type="button" className="s-splay" aria-label={playing ? 'Pause' : 'Play'} data-testid="song-play"
        onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); send({ type: 'SONG.PLAY' }); } }}
        onClick={(e) => { if (e.detail === 0) send({ type: 'SONG.PLAY' }); }}>
        {playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
      </button>
      <div className="s-seek">
        <span className="s-time" ref={now}>{clock(at * sec)}</span>
        <div ref={track} className="s-track" role="slider" tabIndex={0} aria-label="Where in the song" data-testid="song-track"
          aria-valuemin={0} aria-valuemax={Math.round(total * sec)} data-held={undefined}
          style={loop ? { ['--ls' as string]: loop.start / total, ['--lw' as string]: loop.steps / total } : undefined}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            held.current = true;
            e.currentTarget.setAttribute('data-held', '');
            show(under(e.clientX));
          }}
          onPointerMove={(e) => { if (held.current) show(under(e.clientX)); }}
          onPointerUp={(e) => {
            if (!held.current) return;
            held.current = false;
            e.currentTarget.removeAttribute('data-held');
            seek(under(e.clientX));
          }}
          onPointerCancel={(e) => { held.current = false; e.currentTarget.removeAttribute('data-held'); show(at); }}
          onKeyDown={(e) => {
            // A bar back or on; the arrows here move the song, not the bars of a level.
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            e.stopPropagation();
            const from = Number(track.current?.style.getPropertyValue('--pf') || 0) * total;
            seek(Math.max(0, Math.min(total - BEAT, Math.round(from / STEPS) * STEPS + (e.key === 'ArrowLeft' ? -STEPS : STEPS))));
          }}>
          <i className="s-track-loop" aria-hidden data-on={loop ? '' : undefined} />
          <i className="s-track-done" aria-hidden />
          <i className="s-track-thumb" aria-hidden />
        </div>
        <span className="s-time">{clock(total * sec)}</span>
        <div className="s-parts-row" ref={parts} role="group" aria-label="Listen to one part of the song"
          style={{ gridTemplateColumns: song.sections.map((s) => `${s.bars}fr`).join(' ') }}>
          {song.sections.map((s, i) => (
            <button key={s.id} type="button" className="s-songpart" data-part={i} aria-pressed={part === i} data-testid={`song-part-${s.id}`}
              title={part === i ? 'Back to the whole song' : `Loop the ${s.name.toLowerCase()}`}
              {...press(() => send({ type: 'SONG.PART', part: i }))}>
              {part === i && <LoopIcon />}{s.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
