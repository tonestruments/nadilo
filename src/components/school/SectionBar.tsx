// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useRef } from 'react';
import { send, useApp } from '../../machine/actor';
import { partName } from '../../school/names';
import { holesIn } from '../../school/rules';
import type { Part } from '../../school/song';
import { mark, press, useBuild, useLevel, useNeedle, useRoom, useSong } from './use';

/** Top to bottom, as everywhere else: the tune, the colour, the floor, the drums. */
const ROWS: readonly Part[] = ['melody', 'chords', 'bass', 'drums'];

/**
 * One section of the whole song, and which parts play in it. Each part is a band across the section: woven when it
 * plays, a loose basting thread when it rests. Press a band to switch it.
 */
export function SectionBar() {
  const level = useLevel();
  const song = useSong();
  const build = useBuild();
  const room = useRoom();
  const done = useApp((s) => s.context.school.done);
  const ref = useRef<HTMLDivElement>(null);
  const section = song.sections[room.bar];
  const holes = useMemo(() => holesIn(level, song, build, room.bar, room.hint), [level, song, build, room.bar, room.hint]);

  useNeedle(
    (n) => {
      if (n.unit !== room.bar) { mark(ref.current, null); return; }
      ref.current?.style.setProperty('--at', String((n.songBar - start(song, room.bar) + n.step / 16) / section.bars));
      mark(ref.current, '.s-sec-needle');
    },
    () => mark(ref.current, null),
  );

  return (
    <div className="s-sectionbar" ref={ref} data-testid="sectionbar">
      <div className="s-sec-title"><b>{section.name}</b><span>{section.bars} bars</span></div>
      <div className="s-parts">
        {ROWS.map((p) => {
          const on = build.arr[p][room.bar];
          const hole = holes.has(`arr:${p}:${room.bar}`);
          return (
            <div key={p} className={`s-part c-${p}`}>
              <span className="s-part-name">{partName(p, done)}</span>
              <button type="button" className="s-band" data-on={on ? '' : undefined} data-hole={hole ? '' : undefined} aria-pressed={on}
                aria-label={`${partName(p, done)} in the ${section.name.toLowerCase()}: ${on ? 'plays' : 'rests'}`} data-testid={`band-${p}`}
                {...press(() => send({ type: 'SCHOOL.EDIT', edit: { kind: 'section', part: p, section: room.bar } }))}>
                <span className="s-band-word">{on ? 'Plays' : 'Rests'}</span>
              </button>
            </div>
          );
        })}
        <i className="s-sec-needle" aria-hidden />
      </div>
    </div>
  );
}

const start = (song: ReturnType<typeof useSong>, i: number) => song.sections.slice(0, i).reduce((n, s) => n + s.bars, 0);
