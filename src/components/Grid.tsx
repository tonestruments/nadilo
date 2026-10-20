// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';
import { engine } from '../audio/engine';
import { COUNT, LANE_DESC, LANE_NAME, LANE_WORD, type Lane } from '../game/levels';
import { cellState, givenOf, laneFullyGiven } from '../game/logic';
import { send, useApp } from '../machine/actor';
import { revealOf, selectLevel } from '../machine/view';
import { CheckIcon, SpeakerIcon } from './Icons';

/**
 * The notes the playhead fires as it passes: every note the player can see, right or wrong, so a flash never gives
 * away the hidden beat. Once revealed, the missed notes fire too (they are what sounds there); extra ones do not.
 */
const FIRES = new Set(['given', 'placed', 'correct', 'missed']);
const beats = [0, 1, 2, 3];

/** A note fires: one bright flash that fades, restarted if it is already running. The grid stays flat. */
const fire = (el: HTMLElement) => {
  el.removeAttribute('data-fire');
  void el.offsetWidth;
  el.setAttribute('data-fire', '');
};

export function Grid() {
  const level = useApp(selectLevel);
  const placed = useApp((s) => s.context.placed);
  const reveal = useApp(revealOf);
  const result = useApp((s) => s.context.result);
  const lastPlaced = useApp((s) => s.context.lastPlaced);
  const audition = (lane: Lane) => send({ type: 'AUDITION', lane });
  const toggleCell = (lane: Lane, step: number) => send({ type: 'TOGGLE_CELL', lane, step });
  const ref = useRef<HTMLDivElement>(null);

  usePlayhead(ref);

  // A placed note fires as it sounds, so a click never feels like nothing happened.
  useEffect(() => {
    if (!lastPlaced || !ref.current) return;
    const el = ref.current.querySelector<HTMLElement>(`.lane-${lastPlaced.lane} .cell[data-s="${lastPlaced.step}"]`);
    if (el) fire(el);
  }, [lastPlaced]);

  // Reveal: the solved notes fire in turn, left to right.
  useEffect(() => {
    if (reveal !== 'solved' || !ref.current) return;
    const timers = Array.from(ref.current.querySelectorAll<HTMLElement>('.cell[data-state="correct"]'), (el) =>
      setTimeout(() => fire(el), Number(el.dataset.s) * 18));
    return () => timers.forEach(clearTimeout);
  }, [reveal]);

  const nope = (el: HTMLElement, lane: Lane) => {
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
    audition(lane);
  };

  // A lane given in full is complete: it says so, and takes no presses. A lane with some notes given says that, until a
  // check answers for it.
  const stat = (lane: Lane) => {
    if (laneFullyGiven(level, lane)) return <span className="given-tag" data-testid={`given-${lane}`}>All given</span>;
    if (!result && givenOf(level, lane).size) return <span className="given-tag" data-testid={`given-${lane}`}>Partly given</span>;
    if (!result) return null;
    const stale = result.stale ? ' stale' : '';
    return result.lanes[lane]
      ? <span className={`chip ok${stale}`} data-testid={`stat-${lane}`}><CheckIcon size={14} /> right</span>
      : <span className={`chip off${stale}`} data-testid={`stat-${lane}`}>off</span>;
  };

  return (
    <div className={`grid ${level.lanes.length === 2 ? 'two' : ''}`} ref={ref} data-testid="grid">
      <div className="ruler">
        <div />
        <div className="beats">
          {beats.map((b) => (
            <div className="beat" key={b}>
              {beats.map((i) => {
                const s = b * 4 + i;
                return s % 2
                  ? <div key={s} className="num tick" data-s={s}>·</div>
                  : <div key={s} className={`num ${s % 4 ? '' : 'beat-num'}`} data-s={s}>{COUNT[s / 2]}</div>;
              })}
            </div>
          ))}
        </div>
        <div />
      </div>
      {level.lanes.map((lane) => {
        const locked = laneFullyGiven(level, lane) && !reveal;
        return (
        <div className={`lane lane-${lane}`} key={lane} data-locked={locked ? '' : undefined}>
          <button type="button" className="lane-label" data-label={lane} onClick={() => audition(lane)} title={`Hear the ${LANE_WORD[lane]}`}>
            <span className="name">{LANE_NAME[lane]} <SpeakerIcon size={18} /></span>
            <span className="desc">{LANE_DESC[lane]}</span>
          </button>
          <div className="beats">
            {beats.map((b) => (
              <div className="beat" key={b}>
                {beats.map((i) => {
                  const s = b * 4 + i;
                  const st = cellState(level, lane, s, placed, reveal);
                  return (
                    <button
                      type="button" key={s} className="cell" data-s={s} data-lane={lane} data-state={st}
                      title={st === 'given' ? 'Given: part of the hidden beat' : undefined}
                      aria-label={`${LANE_NAME[lane]}, step ${s + 1}${st === 'empty' ? '' : `, ${st}`}`}
                      aria-disabled={locked || undefined}
                      onClick={(e) => (st === 'given' || locked ? nope(e.currentTarget, lane) : toggleCell(lane, s))}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="lane-stat">{stat(lane)}</div>
        </div>
        );
      })}
    </div>
  );
}

/**
 * The playhead is the glow of the current column, and the notes firing in it. Both happen on the step events
 * from the audio scheduler itself, the same clock as the sound, so they cannot drift apart. Nothing here runs
 * on a timer of its own.
 */
function usePlayhead(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const clear = () => grid.querySelectorAll('[data-now]').forEach((el) => el.removeAttribute('data-now'));
    const flash = (el: Element | null) => {
      if (!el) return;
      el.setAttribute('data-hit', '');
      setTimeout(() => el.removeAttribute('data-hit'), 110);
    };

    return engine.subscribe((e) => {
      if (e.type !== 'step') {
        clear();
        grid.removeAttribute('data-playing');
        delete grid.dataset.step;
        return;
      }
      clear();
      grid.querySelectorAll(`[data-s="${e.step}"]`).forEach((el) => el.setAttribute('data-now', ''));
      grid.setAttribute('data-playing', '');
      grid.dataset.step = String(e.step);
      // A lane played on its own fires only that lane.
      const solo = e.mode.startsWith('solo:') ? e.mode.slice(5) : null;
      grid.querySelectorAll<HTMLElement>(`.cell[data-s="${e.step}"]`).forEach((cell) => {
        if (FIRES.has(cell.dataset.state ?? '') && (!solo || cell.dataset.lane === solo)) flash(cell);
      });
      // The lane names light up with what sounds, except for the hidden beat, where that would give it away.
      if (e.mode !== 'target') for (const lane of e.lanes) flash(grid.querySelector(`[data-label="${lane}"]`));
    });
  }, [ref]);
}
