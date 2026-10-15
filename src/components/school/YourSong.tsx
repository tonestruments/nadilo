import { useRef } from 'react';
import { LANE_ORDER } from '../../game/levels';
import { send, useApp } from '../../machine/actor';
import { WORLDS } from '../../school/levels';
import type { Row } from '../../school/match';
import { MOODS, ROWS } from '../../school/music';
import { partName } from '../../school/names';
import { ownedRows, songOf, type Listen } from '../../school/rules';
import { BARS, sectionAt, type Build, type Part, type Song } from '../../school/song';
import { changedIn, hitGold, noteGold, rowsChanged, rowsWith } from '../../school/yours';
import { ArrowIcon } from '../Icons';
import { Player } from './SongPlayer';
import { press, useNeedle } from './use';

/** Top to bottom, as everywhere else in School: the tune, the colour, the floor, the drums. */
const PARTS: readonly Part[] = ['melody', 'chords', 'bass', 'drums'];
const WHOSE: readonly { id: Listen; label: string }[] = [{ id: 'song', label: 'The song' }, { id: 'mine', label: 'Yours' }];

/**
 * The player's song, on a screen of its own: where the journey ends, where a twist ends, and where Home opens it.
 *
 * The whole song plays from the player above. Yours is the player's own song: the song with exactly the changes they
 * made their own (a near miss in a rebuild is not theirs, so it is neither heard nor drawn here). Under it, the song as
 * a map: one row per part, one tile per bar of the loop, each tile drawing that part of that bar, big enough to read.
 * Gold is the player's own (a tile ringed in gold holds a change; inside it, what changed is outlined). A part not
 * rebuilt yet is basted: heard, never drawn.
 *
 * Press a tile and that bar loops, every part playing. The song and Yours then swap only that part, in that bar, so
 * the A and the B differ by exactly that change: what did it do? Press the tile again to stop. While the whole song
 * plays, the bar it is in lights up in every row, and a part resting in that section fades.
 */
export function YourSong() {
  const school = useApp((s) => s.context.school);
  const room = useApp((s) => s.context.room);
  const from = useApp((s) => s.context.songFrom);
  const playing = useApp((s) => s.context.playing);
  const song = songOf(school);
  const owned = ownedRows(school);
  const yours = rowsChanged(song, school.own);
  const any = yours.size > 0;
  const ref = useRef<HTMLDivElement>(null);

  // The playhead: the bar looping, or the bar of the loop the whole song is in, in every row.
  useNeedle(
    (n) => {
      const root = ref.current;
      if (!root) return;
      const col = n.mode === 'bar' ? n.unit : n.songBar % BARS;
      const arr = song.parts.arr;
      const section = sectionAt(song, n.songBar).index;
      root.querySelectorAll<HTMLElement>('.s-mapcell').forEach((c) => {
        const on = n.mode === 'bar' ? c.getAttribute('aria-pressed') === 'true' : Number(c.dataset.bar) === col;
        c.toggleAttribute('data-now', on);
        if (on) c.style.setProperty('--at', String(n.step / 16));
        c.toggleAttribute('data-rest', n.mode === 'song' && !arr[c.dataset.part as Part][section]);
      });
    },
    () => ref.current?.querySelectorAll('.s-mapcell').forEach((c) => { c.removeAttribute('data-now'); c.removeAttribute('data-rest'); }),
  );

  const kicker = from === 'story' ? `${WORLDS[WORLDS.length - 1].name}, complete` : from === 'twist' ? 'Today’s twist, sewn' : song.title;
  const looping = playing === 'bar' ? room.cell : null;
  /** What a row is drawn from: the song's notes where The song is heard there, otherwise the player's own song. */
  const drawn = (r: Row, bar: number): Build | null => {
    if (!owned.has(r) && !yours.has(r)) return null;
    const songHere = room.listen === 'song' && (!looping || (looping.bar === bar && rowsWith(looping.part).includes(r)));
    return songHere ? song.parts : school.own;
  };

  return (
    <section className="s-song-screen s-yours-screen" style={{ ['--world' as string]: WORLDS[WORLDS.length - 1].color }} data-testid="your-song">
      <p className="s-kicker">{kicker}</p>
      <h1>{any ? 'Your song' : 'The song, rebuilt'}</h1>
      <p className="s-line">{any ? 'The song, with your changes in it. Gold is yours.' : 'Nothing has changed yet: it is still the song.'}</p>
      <Player />
      <div className="s-ab" role="radiogroup" aria-label="Listen to">
        {WHOSE.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={room.listen === l.id} className="s-seg" data-testid={`listen-${l.id}`}
            {...press(() => send({ type: 'SCHOOL.LISTEN', listen: l.id }))}>{l.label}</button>
        ))}
      </div>
      <div className="s-map" ref={ref} data-testid="song-map">
        <span aria-hidden />
        {Array.from({ length: BARS }, (_, b) => <span key={b} className="s-map-bar" aria-hidden>Bar {b + 1}</span>)}
        {PARTS.map((part) => (
          <PartRow key={part} part={part} name={partName(part, school.done)} song={song} own={school.own} drawn={drawn} looping={looping} />
        ))}
      </div>
      <button type="button" className="s-sbtn s-primary s-big" data-testid="song-next" onClick={() => send({ type: 'NEXT' })}>
        Back home<ArrowIcon size={17} />
      </button>
    </section>
  );
}

function PartRow({ part, name, song, own, drawn, looping }: {
  part: Part; name: string; song: Song; own: Build;
  drawn: (r: Row, bar: number) => Build | null;
  looping: { part: Part; bar: number } | null;
}) {
  return (
    <>
      <span className={`s-map-part c-${part}`}>{name}</span>
      {Array.from({ length: BARS }, (_, bar) => {
        const gold = changedIn(song, own, part, bar);
        const on = looping?.part === part && looping.bar === bar;
        return (
          <button key={bar} type="button" className={`s-mapcell c-${part}`} data-part={part} data-bar={bar} data-gold={gold ? '' : undefined}
            aria-pressed={on} aria-label={`${name}, bar ${bar + 1}${gold ? ', yours' : ''}`} data-testid={`cell-${part}-${bar}`}
            {...press(() => send({ type: 'SONG.CELL', cell: { part, bar } }))}>
            <Drawing part={part} bar={bar} song={song} drawn={drawn} />
            <i className="s-tile-needle" aria-hidden />
          </button>
        );
      })}
    </>
  );
}

/** One part of one bar, drawn as it is on the cloth: stitches for the drums, lines at their heights, a colour. */
function Drawing({ part, bar, song, drawn }: { part: Part; bar: number; song: Song; drawn: (r: Row, bar: number) => Build | null }) {
  const at = (row: number, col: string) => ({ gridRow: row, gridColumn: col });
  const gold = (yes: boolean) => (yes ? ' s-gold' : '');
  if (part === 'drums') {
    const lanes = LANE_ORDER.filter((l) => drawn(l, bar));
    if (!lanes.length) return <span className="s-mc s-mc-basted" aria-hidden><i className="s-mini-basted" /></span>;
    return (
      <span className="s-mc s-mc-drums" aria-hidden>
        {lanes.flatMap((lane) => {
          const b = drawn(lane, bar)!;
          return b.drums[bar][lane].map((on, s) => (on
            ? <i key={`${lane}${s}`} className={`s-mini-hit s-mini-${lane} c-${lane}${gold(b !== song.parts && hitGold(song, b, bar, lane, s))}`}
              style={at(LANE_ORDER.indexOf(lane) + 1, String(s + 1))} />
            : null));
        })}
      </span>
    );
  }
  const b = drawn(part, bar);
  if (!b) return <span className="s-mc s-mc-basted" aria-hidden><i className="s-mini-basted" /></span>;
  if (part === 'chords') {
    const mood = b.chords[bar];
    return (
      <span className="s-mc s-mc-chord" aria-hidden>
        {/* One colour fills the bar: the tile's gold ring already says it is the player's. */}
        {mood ? <i data-mood={mood} style={{ backgroundColor: MOODS[mood].color }} /> : <i className="s-mini-basted" />}
      </span>
    );
  }
  const ladder = part;
  return (
    <span className="s-mc s-mc-line" aria-hidden>
      {b[ladder][bar].map((n) => (
        <i key={n.at} className={`s-mini-line c-${ladder}${gold(b !== song.parts && noteGold(song, ladder, bar, n))}`}
          style={at(ROWS - n.row, `${n.at + 1} / span ${n.len}`)} />
      ))}
    </span>
  );
}

