// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useRef } from 'react';
import { send, useApp } from '../../machine/actor';
import { HOME_ROW, MOODS, ROWS, type Ladder } from '../../school/music';
import { partName } from '../../school/names';
import { holesIn } from '../../school/rules';
import { STEPS, type Note } from '../../school/song';
import { noteGold, notesGone } from '../../school/yours';
import { SpeakerIcon, Stitch } from './Glyphs';
import { flash, mark, press, useBuild, useLevel, useNeedle, useOwned, useRoom, useSong } from './use';

/** Ladder rows, top to bottom: the highest height first. */
const TOP_DOWN = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i);

interface Drag {
  id: number;
  /** A new note (placed on the press), or one that was already there (removed if the press does not move). */
  kind: 'new' | 'grab';
  at: number;
  row: number;
  len: number;
  moved: boolean;
}

/**
 * One bar of the bass or the tune. The steps of the drums are gone: the bar is four beats, and a note starts on a
 * beat and lasts. Press an empty beat to place a note (it sounds at once); drag right to hold it longer, up or down
 * to change its height, hearing each one. Press a note and let go to take it away.
 *
 * Height is pitch: six heights, a bigger dot is deeper, the ringed one is home. Above the ladder, what the part
 * listens to: where the kick lands for the bass, the bar's colour for the tune, once those are the player's own.
 */
export function NoteBar() {
  const level = useLevel();
  const song = useSong();
  const build = useBuild();
  const room = useRoom();
  const owned = useOwned();
  const done = useApp((s) => s.context.school.done);
  const ref = useRef<HTMLDivElement>(null);
  const cells = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const ed = level.editor.kind === 'notes' ? level.editor : { kind: 'notes' as const, ladder: 'bass' as Ladder, res: 4 as const };
  const { ladder, res } = ed;
  const span = STEPS / res;
  const bar = room.bar;
  const notes = build[ladder][bar];
  const holes = useMemo(() => holesIn(level, song, build, bar, room.hint), [level, song, build, bar, room.hint]);
  const holeNotes = useMemo(() => [...holes].map((m) => { const [, , at, row, len] = m.split(':').map(Number); return { at, row, len }; }), [holes]);
  const name = partName(ladder, done);
  // Make it yours: the player's own notes are gold; the song's notes they took out leave a faint gold outline.
  const yours = !!level.yours;
  const gone = useMemo(() => (yours ? notesGone(song, build, ladder, bar) : []), [yours, song, build, ladder, bar]);
  const listensTo = ladder === 'bass' ? (owned.has('kick') ? 'kick' : null) : owned.has('chords') ? 'chords' : null;

  useNeedle(
    (n) => {
      const root = ref.current;
      if (n.mode !== 'school' || n.unit !== bar) { mark(root, null); return; }
      mark(root, `[data-col="${Math.floor(n.step / span) * span}"]`);
      flash(root, `.s-note[data-at="${n.step}"]`, 160);
    },
    () => mark(ref.current, null),
  );

  /** The beat and height under the pointer. */
  const cellAt = (e: React.PointerEvent) => {
    const r = cells.current!.getBoundingClientRect();
    const c = Math.max(0, Math.min(res - 1, Math.floor(((e.clientX - r.left) / r.width) * res)));
    const row = Math.max(0, Math.min(ROWS - 1, ROWS - 1 - Math.floor(((e.clientY - r.top) / r.height) * ROWS)));
    return { at: c * span, row };
  };
  const under = (at: number, row: number) => notes.find((n) => n.row === row && n.at <= at && at < n.at + n.len);

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary || drag.current) return;
    e.preventDefault();
    cells.current!.setPointerCapture(e.pointerId);
    const { at, row } = cellAt(e);
    const hit = under(at, row);
    if (hit) {
      drag.current = { id: e.pointerId, kind: 'grab', at: hit.at, row: hit.row, len: hit.len, moved: false };
      send({ type: 'SCHOOL.HEAR', what: { ladder, row: hit.row } });
    } else {
      drag.current = { id: e.pointerId, kind: 'new', at, row, len: span, moved: false };
      send({ type: 'SCHOOL.EDIT', edit: { kind: 'place', bar, at, row, len: span } });
    }
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const { at, row } = cellAt(e);
    const len = Math.max(span, at + span - d.at);
    // A grabbed note only starts changing once the pointer leaves where it was pressed.
    const merge = d.kind === 'new' || d.moved;
    if (row !== d.row) {
      send({ type: 'SCHOOL.EDIT', edit: { kind: 'move', bar, at: d.at, row }, merge });
      d.row = row;
      d.moved = true;
    }
    if (len !== d.len && (d.kind === 'new' || d.moved || at !== d.at)) {
      send({ type: 'SCHOOL.EDIT', edit: { kind: 'resize', bar, at: d.at, len }, merge: d.kind === 'new' || d.moved });
      d.len = len;
      d.moved = true;
    }
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.kind === 'grab' && !d.moved) send({ type: 'SCHOOL.EDIT', edit: { kind: 'remove', bar, at: d.at } });
  };
  const cancel = () => { drag.current = null; };

  return (
    <div className={`s-notebar c-${ladder}`} ref={ref} data-res={res} data-testid="notebar" style={{ ['--cols' as string]: res }}>
      <div className="s-row s-ruler" aria-hidden>
        <span className="s-ladder-name">{name}</span>
        {/* The drums' steps are still there, folded into the beats: four to a beat, now one place to start a note. */}
        <div className="s-cols">
          {Array.from({ length: res }, (_, c) => (
            <span key={c} className="s-beatno" data-col={c * span} data-sub={(c * span) % 4 ? '' : undefined}>
              {(c * span) % 4 ? '&' : (c * span) / 4 + 1}
              <span className="s-folded">{Array.from({ length: span }, (_, i) => <i key={i} />)}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="s-row s-context" aria-hidden data-on={listensTo ? '' : undefined}>
        <span className="s-context-name">{listensTo === 'kick' ? 'Kick' : listensTo === 'chords' ? 'Color' : ''}</span>
        <Context ladder={ladder} bar={bar} on={!!listensTo} />
      </div>
      <div className="s-ladder">
        <div className="s-heights">
          {TOP_DOWN.map((r) => (
            <button key={r} type="button" className="s-height" data-home={r === HOME_ROW[ladder] ? '' : undefined}
              style={{ ['--depth' as string]: (ROWS - r) / ROWS }} aria-label={`${name}, height ${r + 1}${r === HOME_ROW[ladder] ? ', home' : ''}`}
              {...press(() => send({ type: 'SCHOOL.HEAR', what: { ladder, row: r } }))}>
              <i /><SpeakerIcon />
            </button>
          ))}
        </div>
        <div className="s-cells" ref={cells} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
          onLostPointerCapture={cancel} data-testid="cells">
          {TOP_DOWN.map((r) => Array.from({ length: res }, (_, c) => (
            <button key={`${r}:${c}`} type="button" className="s-cell" data-col={c * span} data-beat={(c * span) % 4 ? undefined : ''}
              style={{ gridRow: ROWS - r, gridColumn: c + 1 }} tabIndex={c === 0 && r === HOME_ROW[ladder] ? 0 : -1}
              aria-label={`${name}, height ${r + 1}, beat ${Math.floor((c * span) / 4) + 1}`}
              onClick={(e) => {
                if (e.detail !== 0) return; // the keyboard; the pointer is handled by the ladder above
                const n = notes.find((x) => x.at === c * span && x.row === r);
                send({ type: 'SCHOOL.EDIT', edit: n ? { kind: 'remove', bar, at: n.at } : { kind: 'place', bar, at: c * span, row: r, len: span } });
              }} />
          )))}
          {holeNotes.map((n) => <NoteMark key={`h${n.at}`} n={n} span={span} hole />)}
          {gone.map((n) => <NoteMark key={`g${n.at}:${n.row}`} n={n} span={span} gone />)}
          {notes.map((n) => <NoteMark key={n.at} n={n} span={span} gold={yours && noteGold(song, ladder, bar, n)} />)}
        </div>
      </div>
    </div>
  );
}

/**
 * A note: a running stitch as long as the note, with a knot where it starts. A hole is its dashed outline. In Make it
 * yours, a note of the player's own is ringed in gold, and a note of the song's they took out is a faint gold outline.
 */
function NoteMark({ n, span, hole = false, gold = false, gone = false }: {
  n: Pick<Note, 'at' | 'row' | 'len'>; span: number; hole?: boolean; gold?: boolean; gone?: boolean;
}) {
  return (
    <span className="s-note" data-at={hole || gone ? undefined : n.at} data-hole={hole ? '' : undefined}
      data-gold={gold ? '' : undefined} data-gone={gone ? '' : undefined} aria-hidden
      style={{ gridRow: ROWS - n.row, gridColumn: `${n.at / span + 1} / span ${Math.max(1, Math.round(n.len / span))}` }}>
      <i className="s-knot" />
    </span>
  );
}

/** What the line listens to, drawn small above it: the player's kicks under the bass, the bar's colour under the tune. */
function Context({ ladder, bar, on }: { ladder: Ladder; bar: number; on: boolean }) {
  const build = useBuild();
  if (!on) return <div className="s-ctx" />;
  if (ladder === 'bass') {
    return (
      <div className="s-ctx s-kicks c-kick">
        {Array.from({ length: STEPS }, (_, s) => <span key={s} style={{ gridColumn: s + 1 }}>{build.drums[bar].kick[s] && <Stitch lane="kick" />}</span>)}
      </div>
    );
  }
  const mood = build.chords[bar];
  return <div className="s-ctx s-mood" style={{ ['--mood' as string]: mood ? MOODS[mood].color : 'transparent' }} />;
}
