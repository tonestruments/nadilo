// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { send, snapshot, useApp } from '../../machine/actor';
import { WORLDS } from '../../school/levels';
import { activeLevel, levelsFor, stepBar, songOf } from '../../school/rules';
import { ChordBar } from './ChordBar';
import { Dock } from './Dock';
import { DrumBar } from './DrumBar';
import { Head } from './Head';
import { NoteBar } from './NoteBar';
import { SectionBar } from './SectionBar';
import { SongPlayer } from './SongPlayer';
import { Strip } from './Strip';
import { Tools } from './Tools';
import { YourSong } from './YourSong';
import { useLevel, useWorld } from './use';

/**
 * Nadilo School. Hear a song, then rebuild it: one column, read top to bottom. The level and its goal; the four bars
 * as a map; one bar, big, to work on; how to listen. Every part keeps its size in every level and state, so the
 * eye never has to chase anything. The song itself gets a screen of its own: first, and at the end of every world.
 */
export function School() {
  useShortcuts();
  const meet = useApp((s) => s.hasTag('schoolMeet'));
  const end = useApp((s) => s.hasTag('schoolEnd'));
  const yours = useApp((s) => s.hasTag('schoolSong'));
  return (
    <div className="screen s-school-screen">
      {meet ? <Meet /> : end ? <WorldEnd /> : yours ? <YourSong /> : <Level />}
    </div>
  );
}

function Level() {
  const level = useLevel();
  const world = useWorld();
  return (
    <main className="s-school" style={{ ['--world' as string]: world.color }} data-editor={level.editor.kind} data-testid="school">
      <Head />
      <Strip />
      <Tools />
      <section className="s-cloth" aria-label="Instrument" data-testid="cloth">
        {level.editor.kind === 'drums' && <DrumBar />}
        {level.editor.kind === 'notes' && <NoteBar />}
        {level.editor.kind === 'chords' && <ChordBar />}
        {level.editor.kind === 'arr' && <SectionBar />}
      </section>
      <Dock />
    </main>
  );
}

function Meet() {
  return (
    <SongPlayer kicker="Nadilo School" title="Here is a song. We’ll try to rebuild it." line="One part at a time!"
      action="Start with the drums" then={{ type: 'SONG.START' }} color={WORLDS[0].color} testId="meet" />
  );
}

const END_WHOSE = [{ id: 'song', label: 'The song' }, { id: 'mine', label: 'Yours so far' }] as const;

function WorldEnd() {
  const level = useLevel();
  const last = useApp((s) => s.context.school.level >= levelsFor(s.context.school).length - 1);
  const world = WORLDS[level.world];
  const next = WORLDS[level.world + 1];
  // The song as first heard, or only what the player has made so far: the difference is what is left to build.
  return (
    <SongPlayer kicker={`${world.name}, complete`} title={world.end} whose={END_WHOSE}
      action={next && !last ? `On to ${next.name}` : 'Back home'} then={{ type: 'NEXT' }} color={world.color} testId="world-end" />
  );
}

/** Keys send intents; the statechart decides what they mean. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); send({ type: 'UNDO' }); return; }
      if (e.code === 'Space' && !e.repeat) {
        // A focused pad takes Enter; Space always plays and stops.
        e.preventDefault();
        send({ type: 'PRIMARY_PLAY' });
        return;
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.metaKey && !e.altKey && el?.tagName !== 'INPUT') {
        const { context } = snapshot();
        const bar = stepBar(activeLevel(context), songOf(context.school), context.room.bar, e.key === 'ArrowLeft' ? -1 : 1);
        if (bar !== null) { e.preventDefault(); send({ type: 'SCHOOL.BAR', bar }); }
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}
