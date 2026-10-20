// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { send, useApp } from '../../machine/actor';
import { WORLDS } from '../../school/levels';
import { levelsFor, unlocked } from '../../school/rules';
import { ChevronIcon } from './Glyphs';

/**
 * The journey, in the title bar: the world you are in, by name, its levels as dots, and an arrow either side to the
 * world before and after. One world at a time, so the title bar says one thing. Done dots are filled in the world's
 * colour; the open level is ringed. A dot opens its level once every level before it is done; an arrow opens the
 * first level of that world not done yet.
 */
export function Journey() {
  const school = useApp((s) => s.context.school);
  const twist = useApp((s) => s.context.room.twist && s.hasTag('schoolLevel'));
  const levels = levelsFor(school);
  const wi = levels[school.level]?.world ?? 0;
  const w = WORLDS[wi];
  /** Where an arrow goes: the first level of world `to` not done yet, or its first level. */
  const entry = (to: number) => {
    const inWorld = levels.map((l, i) => ({ l, i })).filter(({ l }) => l.world === to);
    return (inWorld.find(({ l }) => !school.done.includes(l.id)) ?? inWorld[0])?.i;
  };
  const prev = wi > 0 ? entry(wi - 1) : undefined;
  const next = wi < WORLDS.length - 1 ? entry(wi + 1) : undefined;
  // A twist is not a step of the journey: the title bar names it, and nothing else.
  if (twist) {
    return (
      <nav className="s-journey" aria-label="Nadilo School" data-testid="journey-twist">
        <div className="s-jw"><span className="s-jw-name">Today’s twist</span><i className="s-jn s-jn-yours" data-done="" aria-hidden /></div>
      </nav>
    );
  }
  return (
    <nav className="s-journey" aria-label="Nadilo School" style={{ ['--world' as string]: w.color }}>
      <button type="button" className="s-jarrow" aria-label={wi > 0 ? WORLDS[wi - 1].name : 'Previous world'} data-testid="journey-prev"
        disabled={prev === undefined || !unlocked(school, prev)} onClick={() => prev !== undefined && send({ type: 'SCHOOL', index: prev })}>
        <ChevronIcon dir="left" />
      </button>
      <div className="s-jw" data-testid="journey-world">
        <span className="s-jw-name">{w.name}</span>
        {levels.map((l, i) => (l.world !== wi ? null : (
          <button key={l.id} type="button" className={`s-jn${l.yours ? ' s-jn-yours' : ''}`} disabled={!unlocked(school, i)} aria-label={l.title}
            aria-current={i === school.level ? 'step' : undefined} data-done={school.done.includes(l.id) ? '' : undefined}
            data-testid={`journey-${l.id}`} onClick={() => send({ type: 'SCHOOL', index: i })} />
        )))}
      </div>
      <button type="button" className="s-jarrow" aria-label={wi < WORLDS.length - 1 ? WORLDS[wi + 1].name : 'Next world'} data-testid="journey-next"
        disabled={next === undefined || !unlocked(school, next)} onClick={() => next !== undefined && send({ type: 'SCHOOL', index: next })}>
        <ChevronIcon dir="right" />
      </button>
    </nav>
  );
}
