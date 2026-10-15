import { memo, useMemo, useRef } from 'react';
import { LANE_ORDER, type Lane } from '../../game/levels';
import { send, useApp } from '../../machine/actor';
import { visible } from '../../school/match';
import { laneName } from '../../school/names';
import { holesIn } from '../../school/rules';
import { STEPS } from '../../school/song';
import { SpeakerIcon, Stitch } from './Glyphs';
import { flash, mark, press, useBuild, useLevel, useNeedle, useRoom, useSong } from './use';

const COUNT = ['', 'e', '&', 'a'];

/**
 * One bar of drums, big. Three lanes, always in the same place: hi-hat on top, snare in the middle, kick at the
 * bottom. A lane this level does not use yet is drawn, quiet, with no pads, so nothing moves when it arrives. The
 * grid splits each beat in place as the levels go: four pads a bar, then eight, then sixteen.
 *
 * A press changes exactly one pad, in this bar only, and sounds on the press. Nothing else on screen changes.
 */
export function DrumBar() {
  const level = useLevel();
  const song = useSong();
  const build = useBuild();
  const room = useRoom();
  const done = useApp((s) => s.context.school.done);
  const ref = useRef<HTMLDivElement>(null);
  const ed = level.editor.kind === 'drums' ? level.editor : { kind: 'drums' as const, lanes: [] as Lane[], res: 4 as const };
  const bar = room.bar;
  const span = STEPS / ed.res;
  const steps = visible(ed.res);
  const holes = useMemo(() => holesIn(level, song, build, bar, room.hint), [level, song, build, bar, room.hint]);

  useNeedle(
    (n) => {
      const root = ref.current;
      if (n.mode !== 'school' || n.unit !== bar) { mark(root, null); return; }
      mark(root, `[data-col="${Math.floor(n.step / span) * span}"]`);
      flash(root, `.s-pad[data-s="${n.step}"][data-on]`);
    },
    () => mark(ref.current, null),
  );

  return (
    <div className="s-drumbar" ref={ref} data-res={ed.res} data-testid="drumbar" style={{ ['--per' as string]: ed.res / 4 }}>
      <div className="s-lane s-ruler" aria-hidden>
        <span />
        <div className="s-beats">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="s-beat">
              {steps.filter((s) => Math.floor(s / 4) === k).map((s) => (
                <span key={s} className="s-beatno" data-col={s} data-sub={s % 4 ? '' : undefined}>{s % 4 ? COUNT[s % 4] : k + 1}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {LANE_ORDER.map((lane) => (
        <DrumLane key={lane} lane={lane} active={ed.lanes.includes(lane)} name={laneName(lane, done)} bar={bar}
          hits={build.drums[bar][lane]} steps={steps} holes={holes} songHits={level.yours ? song.parts.drums[bar][lane] : null} />
      ))}
    </div>
  );
}

/**
 * `songHits`, in Make it yours: the song's hits in this lane and bar. A hit the song does not have is the player's own
 * (a gold ring); a hit of the song's the player took out is a faint gold ring where it was.
 */
const DrumLane = memo(function DrumLane({ lane, active, name, bar, hits, steps, holes, songHits }: {
  lane: Lane; active: boolean; name: string; bar: number; hits: readonly boolean[]; steps: number[]; holes: ReadonlySet<string>;
  songHits: readonly boolean[] | null;
}) {
  return (
    <div className={`s-lane c-${lane}`} data-lane={lane} data-off={active ? undefined : ''}>
      <button type="button" className="s-lane-name" tabIndex={active ? 0 : -1} {...press(() => send({ type: 'SCHOOL.HEAR', what: { lane } }))}>
        {name}<SpeakerIcon />
      </button>
      {active ? (
        <div className="s-beats">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="s-beat">
              {steps.filter((s) => Math.floor(s / 4) === k).map((s) => {
                const on = hits[s];
                const hole = !on && holes.has(`${lane}:${bar}:${s}`);
                const gold = !!songHits && on && !songHits[s];
                const gone = !!songHits && !on && songHits[s];
                return (
                  <button key={s} type="button" className="s-pad" data-s={s} data-col={s} data-on={on ? '' : undefined} data-hole={hole ? '' : undefined}
                    data-gold={gold ? '' : undefined} data-gone={gone ? '' : undefined}
                    data-testid={`pad-${lane}-${s}`} aria-pressed={on}
                    aria-label={`${name}, beat ${k + 1}${s % 4 ? ` ${COUNT[s % 4]}` : ''}${gold ? ', yours' : gone ? ', the song’s, taken out' : ''}`}
                    {...press(() => send({ type: 'SCHOOL.EDIT', edit: { kind: 'hit', bar, lane, step: s } }))}>
                    {(on || hole) && <Stitch lane={lane} hole={!on} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        // Not in play yet: heard in the song, not drawn. A loose basting thread holds its place.
        <div className="s-basted" aria-hidden />
      )}
    </div>
  );
});
