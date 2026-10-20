// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useRef } from 'react';
import { send, useApp } from '../../machine/actor';
import { LADDER, MOODS, MOOD_ORDER } from '../../school/music';
import { partName } from '../../school/names';
import { holesIn } from '../../school/rules';
import { noteGold } from '../../school/yours';
import { flash, mark, press, useBuild, useLevel, useNeedle, useOwned, useRoom, useSong } from './use';

/**
 * One bar of colour. The steps and the beats are gone: a chord fills the whole bar, one block, held from beat 1 to
 * the end. The four counts under it show how long that is. Under the block, faint, the player's own bass for this
 * bar: the note a chord is named after is usually the one the bass plays.
 *
 * Press a colour to paint the bar (it sounds at once). Press the block to hear it again.
 */
export function ChordBar() {
  const level = useLevel();
  const song = useSong();
  const build = useBuild();
  const room = useRoom();
  const owned = useOwned();
  const done = useApp((s) => s.context.school.done);
  const ref = useRef<HTMLDivElement>(null);
  const bar = room.bar;
  const mood = build.chords[bar];
  const holes = useMemo(() => holesIn(level, song, build, bar, room.hint), [level, song, build, bar, room.hint]);
  const hole = [...holes][0]?.split(':')[2] as keyof typeof MOODS | undefined;
  // Make it yours: a colour of the player's own is ringed in gold, and so is the bass that moved with it.
  const yours = !!level.yours;
  const songMood = song.parts.chords[bar];

  useNeedle(
    (n) => {
      const root = ref.current;
      if (n.mode !== 'school' || n.unit !== bar) { mark(root, null); return; }
      mark(root, `[data-col="${Math.floor(n.step / 4) * 4}"]`);
      if (n.step === 0) flash(root, '.s-block[data-on]', 200);
    },
    () => mark(ref.current, null),
  );

  return (
    <div className="s-chordbar" ref={ref} data-testid="chordbar">
      {/* Named like every other instrument: the part on the left, and what it listens to, the bass, under it. */}
      <span className="s-ladder-name s-chord-name" aria-hidden>{partName('chords', done)}</span>
      <div className="s-ruler" aria-hidden>
        {[0, 1, 2, 3].map((k) => <span key={k} className="s-beatno" data-col={k * 4}>{k + 1}</span>)}
      </div>
      <button type="button" className="s-block" data-on={mood ? '' : undefined} data-hole={!mood && hole ? '' : undefined}
        data-gold={yours && mood && mood !== songMood ? '' : undefined}
        style={{ ['--mood' as string]: mood ? MOODS[mood].color : hole ? MOODS[hole].color : 'transparent' }}
        aria-label={mood ? 'Hear this bar’s colour' : 'No colour yet'} data-testid="block"
        {...press(() => { if (mood) send({ type: 'SCHOOL.HEAR', what: { mood } }); })} />
      <span className="s-context-name s-under-name" aria-hidden>{owned.has('bass') ? partName('bass', done) : ''}</span>
      <div className="s-under" aria-hidden data-on={owned.has('bass') ? '' : undefined}>
        {owned.has('bass') && build.bass[bar].map((n) => (
          <span key={n.at} className="s-bassline" data-gold={yours && noteGold(song, 'bass', bar, n) ? '' : undefined}
            style={{ gridColumn: `${n.at + 1} / span ${n.len}`, ['--h' as string]: (LADDER.bass[n.row] - LADDER.bass[0]) / 12 }} />
        ))}
      </div>
      <div className="s-palette" role="radiogroup" aria-label="Colours">
        {MOOD_ORDER.map((m) => (
          <button key={m} type="button" className="s-swatch" role="radio" aria-checked={mood === m} data-testid={`swatch-${m}`}
            data-song={yours && m === songMood ? '' : undefined} title={yours && m === songMood ? 'The song’s colour for this bar' : undefined}
            style={{ ['--mood' as string]: MOODS[m].color }} aria-label={`Colour ${MOOD_ORDER.indexOf(m) + 1}`}
            {...press(() => send(mood === m ? { type: 'SCHOOL.HEAR', what: { mood: m } } : { type: 'SCHOOL.EDIT', edit: { kind: 'chord', bar, mood: m } }))} />
        ))}
      </div>
    </div>
  );
}
