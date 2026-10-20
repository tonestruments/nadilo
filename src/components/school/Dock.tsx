// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { send, useApp } from '../../machine/actor';
import { WORLDS, type Scope } from '../../school/levels';
import { buildFor, endsWorld, levelsFor, type Listen } from '../../school/rules';
import { PauseIcon, PlayIcon, ArrowIcon } from '../Icons';
import { CloseIcon, HintIcon, LoopIcon, SlowIcon } from './Glyphs';
import { press, selectLevel, useDone, useLevel, useRoom, useSong } from './use';

const WHOSE: readonly { id: Listen; label: string; tip: string }[] = [
  { id: 'song', label: 'The song', tip: 'The song, with the parts you have rebuilt in it' },
  { id: 'mine', label: 'Yours', tip: 'The song, with your notes for this part' },
];

/**
 * How to listen while you work, under the instrument. The song or Yours: an A and a B of the same bars. Pressing one
 * plays it, switches to it on the next step if the other plays (so the two are heard at the same moment of the bar),
 * or stops it if it is the one playing. When they sound the same, the part is right. Up close, for either, keeps only
 * this part and the one it plays with. Then what the loop covers (the bar on screen, or all four), Slow, and the way on.
 */
export function Dock() {
  const level = useLevel();
  const room = useRoom();
  const done = useDone();
  const song = useSong();
  const playing = useApp((s) => s.context.playing === 'school');
  // The last level of a world leads to the whole song, with the part just rebuilt in it; a twist, to the player's song.
  const next = useApp((s) => {
    const i = s.context.school.level;
    if (s.context.room.twist) return 'Hear your song';
    // The world ends here, so the way on says so: its end is the song next to what the player has made so far.
    if (endsWorld(s.context.school, i)) return i === levelsFor(s.context.school).length - 1 ? 'Hear your song' : `Finish ${WORLDS[level.world].name}`;
    return 'Next level';
  });
  // Make it yours is done when the player keeps what they changed: until then, once there is a change, Keep it.
  const keep = useApp((s) => !!level.yours && !done && level.check(buildFor(s.context.school, selectLevel(s))));
  const arr = level.editor.kind === 'arr';
  // The loop names what it loops: the bar (or section) on screen, or all of it.
  const scopes: readonly { id: Scope; label: string }[] = arr
    ? [{ id: 'one', label: song.sections[room.bar].name }, { id: 'all', label: 'Whole song' }]
    : [{ id: 'one', label: `Bar ${room.bar + 1}` }, { id: 'all', label: 'All 4 bars' }];
  const byEar = level.holes === 'none' && !level.noHint;
  return (
    <div className="s-dock">
      <div className="s-listens">
        <div className="s-ab" role="radiogroup" aria-label="Listen to">
          {WHOSE.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={room.listen === l.id} className="s-seg" title={l.tip}
              data-playing={playing && room.listen === l.id ? '' : undefined} data-testid={`listen-${l.id}`}
              data-nudge={l.id === 'song' && !room.heard && !done && !level.listen ? '' : undefined}
              {...press(() => send({ type: 'SCHOOL.LISTEN', listen: l.id }))}>{l.label}</button>
          ))}
        </div>
        <button type="button" className="s-seg s-toggle" aria-pressed={room.close} data-testid="listen-close" title="This part and the one it plays with"
          data-hidden={arr ? '' : undefined} tabIndex={arr ? -1 : 0} {...press(() => send({ type: 'SCHOOL.CLOSE' }))}><CloseIcon />Up close</button>
      </div>
      <div className="s-transport">
        <div className="s-scope" role="radiogroup" aria-label="Loop">
          <LoopIcon />
          {scopes.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={room.scope === s.id} className="s-seg" data-testid={`scope-${s.id}`}
              {...press(() => send({ type: 'SCHOOL.SCOPE', scope: s.id }))}>{s.label}</button>
          ))}
        </div>
        <button type="button" className="s-splay" aria-label={playing ? 'Stop' : 'Play'} data-testid="play" {...press(() => send({ type: 'SCHOOL.PLAY' }))}>
          {playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
        </button>
        <button type="button" className="s-seg s-toggle" aria-pressed={room.slow} data-testid="slow" title="Three quarters of the speed"
          {...press(() => send({ type: 'SCHOOL.SLOW' }))}><SlowIcon />Slow</button>
      </div>
      <div className="s-way-on">
        {keep ? (
          <button type="button" className="s-sbtn s-keep" data-testid="keep" {...press(() => send({ type: 'SCHOOL.KEEP' }))}>Keep it</button>
        ) : done && next ? (
          <button type="button" className="s-sbtn s-primary" data-testid="next" {...press(() => send({ type: 'NEXT' }))}>{next}<ArrowIcon size={17} /></button>
        ) : (
          <button type="button" className="s-sbtn s-ghost" aria-pressed={room.hint} data-hidden={byEar && !done ? undefined : ''} data-testid="hint"
            tabIndex={byEar && !done ? 0 : -1} {...press(() => send({ type: 'SCHOOL.HINT' }))}><HintIcon />{room.hint ? 'Hide hint' : 'Hint'}</button>
        )}
      </div>
    </div>
  );
}
