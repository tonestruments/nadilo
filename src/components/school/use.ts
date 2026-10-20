// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';
import { engine } from '../../audio/engine';
import type { EngineEvent } from '../../audio/types';
import { snapshot, useApp } from '../../machine/actor';
import type { AppSnapshot } from '../../machine/appMachine';
import { WORLDS } from '../../school/levels';
import { loopBar, partSpan } from '../../school/mix';
import { activeDone, activeLevel, buildFor, ownedRows, songOf } from '../../school/rules';
import { STEPS } from '../../school/song';

/**
 * Small selectors, so every part of School reads the statechart the same way. The level is the one on screen (today's
 * twist during one), and the build is the one it works on: the player's own song in Make it yours, the rebuild
 * everywhere else.
 */
export const selectLevel = (s: AppSnapshot) => activeLevel(s.context);
export const useLevel = () => useApp(selectLevel);
export const useSong = () => useApp((s) => songOf(s.context.school));
export const useBuild = () => useApp((s) => buildFor(s.context.school, selectLevel(s)));
export const useRoom = () => useApp((s) => s.context.room);
export const useDone = () => useApp((s) => activeDone(s.context));
/** The level on screen makes the song the player's own: gold for every change. */
export const useYours = () => useApp((s) => !!selectLevel(s).yours);
export const useOwned = () => useApp((s) => ownedRows(s.context.school), (a, b) => a.size === b.size);
export const useWorld = () => WORLDS[useLevel().world];

/**
 * An instrument plays when it is pressed, not when it is let go. A click fires on release, 80 to 150 ms after the
 * press on a trackpad: long enough to feel like lag. The keyboard still works: Enter and Space give a click with no
 * pointer behind it (`detail` 0). The press is taken over (`preventDefault`), so it never also selects text or
 * moves focus, and one press is one action.
 */
export function press(fn: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      fn();
    },
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) fn(); },
  };
}

export type StepEvent = Extract<EngineEvent, { type: 'step' }>;

/** Where the music is: the bar (or section) and step it is playing, for the level loop or the whole song. */
export interface Needle {
  /** The bar of the four-bar loop, or the section in the Story world, that is sounding. */
  unit: number;
  /** The bar of the whole song (the Story world and the song player). */
  songBar: number;
  step: number;
  /** A level's loop, the whole song, or one bar of the player's song on its own screen. */
  mode: 'school' | 'song' | 'bar';
  pos: number;
}

/**
 * The playhead. Steps come straight from the audio scheduler, on the animation frame closest to when they are
 * heard; handlers mark the DOM directly, so nothing sits between the sound and the pixels.
 */
export function useNeedle(onStep: (n: Needle) => void, onStop: () => void) {
  const handlers = useRef({ onStep, onStop });
  handlers.current = { onStep, onStop };
  useEffect(() => engine.subscribe((e) => {
    if (e.mode !== 'school' && e.mode !== 'song' && e.mode !== 'bar') return;
    if (e.type === 'end') { handlers.current.onStop(); return; }
    if (e.type !== 'step') return;
    const { context } = snapshot();
    const song = songOf(context.school);
    const level = activeLevel(context);
    // A section looped on its own counts its steps from the section's top.
    const pos = e.mode === 'song' && context.songPart !== null ? partSpan(song, context.songPart).start + e.pos : e.pos;
    let songBar = Math.floor(pos / STEPS);
    let unit = songBar;
    if (e.mode === 'school') {
      songBar = loopBar({ song, level, scope: context.room.scope, unit: context.room.bar }, e.pos);
      unit = level.editor.kind === 'arr' ? sectionOf(song, songBar) : songBar;
    } else if (e.mode === 'bar') {
      songBar = unit = context.room.cell?.bar ?? 0;
    } else unit = sectionOf(song, songBar);
    handlers.current.onStep({ unit, songBar, step: pos % STEPS, mode: e.mode, pos });
  }), []);
}

function sectionOf(song: ReturnType<typeof songOf>, bar: number) {
  let end = 0;
  for (let i = 0; i < song.sections.length; i++) {
    end += song.sections[i].bars;
    if (bar < end) return i;
  }
  return song.sections.length - 1;
}

/** Mark exactly the elements matching `selector` inside `root` with `attr`. */
export function mark(root: HTMLElement | null, selector: string | null, attr = 'data-now') {
  if (!root) return;
  root.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
  if (selector) root.querySelectorAll(selector).forEach((el) => el.setAttribute(attr, ''));
}

/** Flash elements once, as their note sounds. */
export function flash(root: HTMLElement | null, selector: string, ms = 120) {
  if (!root) return;
  root.querySelectorAll(selector).forEach((el) => {
    el.setAttribute('data-hit', '');
    setTimeout(() => el.removeAttribute('data-hit'), ms);
  });
}
