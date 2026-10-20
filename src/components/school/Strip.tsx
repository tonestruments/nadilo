// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { memo, useRef } from 'react';
import { LANE_ORDER, type Lane } from '../../game/levels';
import { send } from '../../machine/actor';
import type { Row } from '../../school/match';
import { MOODS } from '../../school/music';
import { barSewn, stepBar } from '../../school/rules';
import { BARS, type Build, type Part, type Song } from '../../school/song';
import { hitGold, noteGold, rowChanged } from '../../school/yours';
import { ChevronIcon, TickIcon } from './Glyphs';
import { press, useBuild, useDone, useLevel, useNeedle, useOwned, useRoom, useSong } from './use';

/**
 * The four bars of the loop, side by side, as small pieces of the same cloth: the map of where you are. Press a bar
 * to work on it. Your rows show their stitches; rows you have not rebuilt yet are basted, a loose dashed thread:
 * heard in the song, never shown. A bar that is exactly the song, for this level's part, is sewn shut (a tick).
 * The needle walks across the bar that is playing.
 */
export function Strip() {
  const level = useLevel();
  const song = useSong();
  const room = useRoom();
  const arr = level.editor.kind === 'arr';
  // In Make it yours the arrows skip the bars that stay the song's.
  const prev = stepBar(level, song, room.bar, -1);
  const next = stepBar(level, song, room.bar, 1);
  // The highlighted tile already says which bar is on screen; the arrows sit either side of the strip, just outside it.
  return (
    <div className="s-stripwrap">
      <button type="button" className="s-sicon s-strip-arrow" disabled={prev === null} aria-label={arr ? 'Section before' : 'Bar before'}
        data-testid="prev-bar" {...press(() => { if (prev !== null) send({ type: 'SCHOOL.BAR', bar: prev }); })}><ChevronIcon dir="left" /></button>
      {arr ? <SectionStrip /> : <BarStrip />}
      <button type="button" className="s-sicon s-strip-arrow" disabled={next === null} aria-label={arr ? 'Section after' : 'Bar after'}
        data-testid="next-bar" {...press(() => { if (next !== null) send({ type: 'SCHOOL.BAR', bar: next }); })}><ChevronIcon dir="right" /></button>
    </div>
  );
}

function BarStrip() {
  const level = useLevel();
  const song = useSong();
  const build = useBuild();
  const room = useRoom();
  const owned = useOwned();
  const done = useDone();
  const ref = useRef<HTMLDivElement>(null);
  const seen = (r: Row) => owned.has(r) || level.focus.includes(r);

  useNeedle(
    (n) => {
      ref.current?.querySelectorAll<HTMLElement>('.s-tile').forEach((t, i) => {
        const on = n.mode === 'school' && i === n.unit;
        t.toggleAttribute('data-now', on);
        if (on) t.style.setProperty('--at', String(n.step / 16));
      });
    },
    () => ref.current?.querySelectorAll('.s-tile').forEach((t) => t.removeAttribute('data-now')),
  );

  return (
    <nav className="s-strip" ref={ref} aria-label="Bars" data-testid="strip">
      {Array.from({ length: BARS }, (_, i) => {
        const sewn = barSewn(level, song, build, i, done);
        const counts = level.bars.includes(i);
        // Make it yours opens only the bars it changes: the others are the song's, heard in the loop, not pressed.
        const locked = !!level.yours && !counts;
        // The patch marks a change the strip draws: parts not rebuilt yet are basted, so theirs would mean nothing here.
        const changed = !!level.yours && SEEN_ROWS.some((r) => seen(r) && rowChanged(song, build, r, i));
        return (
          <button key={i} type="button" className="s-tile" aria-current={i === room.bar ? 'true' : undefined} data-sewn={sewn ? '' : undefined}
            data-counts={counts ? '' : undefined} data-locked={locked ? '' : undefined} data-changed={changed ? '' : undefined}
            data-testid={`bar-${i}`} tabIndex={locked ? -1 : 0} aria-disabled={locked || undefined}
            aria-label={`Bar ${i + 1}${sewn ? ', like the song' : ''}${changed ? ', yours' : ''}`}
            {...press(() => { if (!locked) send({ type: 'SCHOOL.BAR', bar: i }); })}>
            <span className="s-tile-top">
              <span className="s-tile-name">Bar {i + 1}</span>
              {level.yours ? <i className="s-patch" aria-hidden /> : <span className="s-sewn"><TickIcon /></span>}
            </span>
            <MiniBar build={build} bar={i} seen={seen} song={level.yours ? song : null} />
            <i className="s-tile-needle" aria-hidden />
          </button>
        );
      })}
    </nav>
  );
}

const SEEN_ROWS: readonly Row[] = [...LANE_ORDER, 'bass', 'chords', 'melody'];

/** Rows of the miniature, top to bottom: the tune, the colour, the floor, then the drums (hi-hat, snare, kick). */
const ROW: Record<Lane | 'bass' | 'chords' | 'melody', number> = { melody: 1, chords: 2, bass: 3, hat: 4, snare: 5, kick: 6 };

/**
 * One bar in miniature: 16 steps across, one row per part, drawn in CSS so every hit keeps its shape however wide the
 * tile is (0.4.0 stretched an SVG, which flattened the kick and the snare to nothing). Each drum keeps its stitch:
 * a pill for the kick, a cross for the snare, a slant for the hi-hat. A part not rebuilt yet is a basting thread.
 */
export const MiniBar = memo(function MiniBar({ build, bar, seen, song = null }: {
  build: Build; bar: number; seen: (r: Row) => boolean;
  /** Given in Make it yours: what differs from it is drawn with a gold outline. */
  song?: Song | null;
}) {
  const lanes = LANE_ORDER.filter((l) => seen(l));
  const at = (row: number, col: string) => ({ gridRow: row, gridColumn: col });
  const gold = (yes: boolean) => (song && yes ? ' s-gold' : '');
  const mood = build.chords[bar];
  return (
    <span className="s-mini" aria-hidden>
      {(['melody', 'bass'] as const).map((p) => (seen(p)
        ? build[p][bar].map((n) => (
          <i key={`${p}${n.at}`} className={`s-mini-line c-${p}${gold(!!song && noteGold(song, p, bar, n))}`} style={at(ROW[p], `${n.at + 1} / span ${n.len}`)} />
        ))
        : <i key={p} className="s-mini-basted" style={at(ROW[p], '1 / -1')} />))}
      {seen('chords')
        ? mood && <i className={`s-mini-chord${gold(!!song && mood !== song.parts.chords[bar])}`} style={{ ...at(ROW.chords, '1 / -1'), background: MOODS[mood].color }} />
        : <i className="s-mini-basted" style={at(ROW.chords, '1 / -1')} />}
      {lanes.length === 0
        ? <i className="s-mini-basted" style={at(ROW.snare, '1 / -1')} />
        : lanes.flatMap((lane) => build.drums[bar][lane].map((on, s) => (on
          ? <i key={`${lane}${s}`} className={`s-mini-hit s-mini-${lane} c-${lane}${gold(!!song && hitGold(song, build, bar, lane, s))}`} style={at(ROW[lane], String(s + 1))} />
          : null)))}
    </span>
  );
});

/** The whole song as sections, each as wide as it is long. */
function SectionStrip() {
  const song = useSong();
  const build = useBuild();
  const room = useRoom();
  const ref = useRef<HTMLDivElement>(null);

  useNeedle(
    (n) => {
      let start = 0;
      ref.current?.querySelectorAll<HTMLElement>('.s-tile').forEach((t, i) => {
        const bars = song.sections[i].bars;
        const on = n.songBar >= start && n.songBar < start + bars;
        t.toggleAttribute('data-now', on);
        if (on) t.style.setProperty('--at', String((n.songBar - start + n.step / 16) / bars));
        start += bars;
      });
    },
    () => ref.current?.querySelectorAll('.s-tile').forEach((t) => t.removeAttribute('data-now')),
  );

  return (
    <nav className="s-strip s-sections" ref={ref} aria-label="Sections" data-testid="strip"
      style={{ gridTemplateColumns: song.sections.map((s) => `${s.bars}fr`).join(' ') }}>
      {song.sections.map((sec, i) => (
        <button key={sec.id} type="button" className="s-tile" aria-current={i === room.bar ? 'true' : undefined} data-testid={`section-${i}`}
          {...press(() => send({ type: 'SCHOOL.BAR', bar: i }))}>
          <span className="s-tile-top"><span className="s-tile-name">{sec.name}</span></span>
          <span className="s-mini s-mini-sections" aria-hidden>
            {(['melody', 'chords', 'bass', 'drums'] as Part[]).map((p, r) => (
              build.arr[p][i]
                ? <i key={p} className={`c-${p} s-mini-band`} style={{ gridRow: r + 1 }} />
                : <i key={p} className="s-mini-basted" style={{ gridRow: r + 1 }} />
            ))}
          </span>
          <i className="s-tile-needle" aria-hidden />
        </button>
      ))}
    </nav>
  );
}

