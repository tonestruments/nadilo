// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

export type Lane = 'hat' | 'snare' | 'kick';

/** Top to bottom on screen. */
export const LANE_ORDER: readonly Lane[] = ['hat', 'snare', 'kick'];
export const STEPS = 16;

export interface Song {
  title: string;
  artist: string;
  what: string;
}

export interface Level {
  id: number;
  chapter: 1 | 2;
  /** Revealed only after the level is solved. */
  name: string;
  /** Shown while playing. */
  task: string;
  /** One short line under the task. */
  hint: string;
  /** Coach tip before the first listen, when this level introduces something new. */
  tip?: string;
  lanes: readonly Lane[];
  target: Readonly<Partial<Record<Lane, readonly number[]>>>;
  given: Readonly<Partial<Record<Lane, readonly number[] | 'all'>>>;
  /** The hero line of the reward dialog. */
  listenFor: string;
  /** The plain-English explanation, shown after solving. */
  heard: string;
  songs?: readonly Song[];
}

const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
const KS: readonly Lane[] = ['snare', 'kick'];
const ALL: readonly Lane[] = ['hat', 'snare', 'kick'];

export const LEVELS: readonly Level[] = [
  // ── Chapter 1 · kick and snare ──
  {
    id: 1, chapter: 1, name: 'The Backbeat', lanes: KS,
    task: 'Find the snare',
    hint: 'The kick is given. Listen for the sharp answer.',
    target: { kick: [0, 8], snare: [4, 12] }, given: { kick: 'all' },
    listenFor: 'Boom, tak, boom, tak. The snare answers every kick.',
    heard: 'The kick on 1 and 3, the snare on 2 and 4. That answer is the backbeat, and it sits under most of the pop songs you know.',
    songs: [
      { title: 'Billie Jean', artist: 'Michael Jackson', what: 'The drum intro: kick and snare trading places.' },
      { title: 'Back in Black', artist: 'AC/DC', what: 'Under the riff, the snare hits hard on 2 and 4.' },
    ],
  },
  {
    id: 2, chapter: 1, name: 'Together', lanes: KS,
    task: 'Two sounds, one moment',
    hint: 'The kick is given. Something lands with it.',
    tip: 'Two sounds can share a step. Listen for the double hit.',
    target: { kick: [0], snare: [0] }, given: { kick: 'all' },
    listenFor: 'The kick and the snare hitting together, the snare a hair behind.',
    heard: 'Two sounds can share a step. When they do, you hear one bigger hit. Nadilo nudges the snare a little late so you can pick them apart.',
  },
  {
    id: 3, chapter: 1, name: 'Heartbeat', lanes: KS,
    task: 'Find the kick',
    hint: 'The snare is given. Listen for the low thump.',
    target: { kick: [0, 4, 8, 12], snare: [4, 12] }, given: { snare: 'all' },
    listenFor: 'A kick on every single beat, never stopping, with the snare stacked on 2 and 4.',
    heard: 'A kick on every beat is called four on the floor. Dance music is built on it.',
    songs: [
      { title: 'One More Time', artist: 'Daft Punk', what: 'The kick never stops: one thump on every beat.' },
      { title: 'Don’t Start Now', artist: 'Dua Lipa', what: 'Under the bassline, a kick on every beat.' },
    ],
  },
  {
    id: 4, chapter: 1, name: 'Stomp Stomp Clap', lanes: KS,
    task: 'Two stomps, one clap',
    hint: 'One kick and one snare are given.',
    target: { kick: [0, 2, 8, 10], snare: [4, 12] }, given: { kick: [0], snare: [4] },
    listenFor: 'Two quick stomps, then a clap. Twice around the loop.',
    heard: 'Kick, kick, snare. It is a rhythm a whole stadium can stomp and clap.',
    songs: [{ title: 'We Will Rock You', artist: 'Queen', what: 'Stomp, stomp, clap. The whole song is built on it.' }],
  },
  {
    id: 5, chapter: 1, name: 'Double Kick', lanes: KS,
    task: 'The kick doubles up',
    hint: 'One snare is given. The kicks are yours.',
    target: { kick: [0, 8, 10], snare: [4, 12] }, given: { snare: [12] },
    listenFor: 'The two kicks in a row, right before the last snare.',
    heard: 'Doubling the kick before the snare gives the loop a little gallop.',
  },
  {
    id: 6, chapter: 1, name: 'Half Time', lanes: KS,
    task: 'Everything slows down',
    hint: 'Nothing is given. Where does the snare land?',
    target: { kick: [0, 14], snare: [8] }, given: {},
    listenFor: 'The long wait before the snare. Same speed, but it feels half as fast.',
    heard: 'Moving the snare to beat 3 is called half time. The tempo stays the same and the groove gets twice the space.',
  },
  {
    id: 7, chapter: 1, name: 'The Lean', lanes: KS,
    task: 'The kick can’t wait',
    hint: 'Nothing is given. One kick comes early.',
    target: { kick: [0, 6], snare: [4, 12] }, given: {},
    listenFor: 'The second kick jumping in before beat 3 instead of on it.',
    heard: 'Landing on the “and” before 3 makes the whole loop lean forward.',
  },
  // ── Chapter 2 · enter the hi-hat ──
  {
    id: 8, chapter: 2, name: 'Hello, Hi-hat', lanes: ALL,
    task: 'Meet the hi-hat',
    hint: 'The hi-hat is given in full. Find the kick and snare.',
    tip: 'Nod along to the hi-hat first. It’s the steady tick on top.',
    target: { hat: EIGHTHS, kick: [0, 10], snare: [4, 12] }, given: { hat: 'all' },
    listenFor: 'The hi-hat ticking on every count and every “and”.',
    heard: 'Hi-hats on every half beat are called eighth notes. They keep time for everything underneath.',
  },
  {
    id: 9, chapter: 2, name: 'Steady Hats', lanes: ALL,
    task: 'Lean on the kick',
    hint: 'The kick is given, plus two hats and a snare.',
    target: { hat: [0, 4, 8, 12], kick: [0, 6, 8], snare: [4, 12] }, given: { kick: 'all', hat: [0, 8], snare: [4] },
    listenFor: 'The hats slowing to one per beat while the kick sneaks in before 3.',
    heard: 'One hat per beat gives the groove room to breathe, and the early kick fills the space.',
  },
  {
    id: 10, chapter: 2, name: 'The Push', lanes: ALL,
    task: 'One kick arrives early',
    hint: 'Four notes are given: two hats, one kick, one snare.',
    target: { hat: EIGHTHS, kick: [0, 3, 8], snare: [4, 12] }, given: { hat: [0, 8], kick: [0], snare: [12] },
    listenFor: 'The kick in the tiny gap just before the first snare.',
    heard: 'A kick between the counts is a sixteenth note. It pushes the groove forward, like leaning into the beat.',
  },
  {
    id: 11, chapter: 2, name: 'Offbeat Hats', lanes: ALL,
    task: 'The hats step off the beat',
    hint: 'One hat and one kick are given.',
    target: { hat: [2, 6, 10, 14], kick: [0, 8], snare: [4, 12] }, given: { hat: [2], kick: [0] },
    listenFor: 'The hats landing only on the “ands”, in between the kicks.',
    heard: 'Hats on the offbeat give a loop its bounce. You hear it all over disco and house.',
  },
  {
    id: 12, chapter: 2, name: 'One More Tick', lanes: ALL,
    task: 'Listen to the very end',
    hint: 'Nothing is given. Something extra happens at the end.',
    target: { hat: [...EIGHTHS, 15], kick: [0, 8, 11], snare: [4, 12] }, given: {},
    listenFor: 'The extra tick at the very end, and the kick just after the “and” of 3.',
    heard: 'Small extras at the edges of a loop are what make it feel alive.',
  },
  {
    id: 13, chapter: 2, name: 'Syncopated', lanes: ALL,
    task: 'On your own',
    hint: 'The last one. Nothing is given.',
    target: { hat: EIGHTHS, kick: [0, 3, 6, 10], snare: [4, 12] }, given: {},
    listenFor: 'The kicks dodging the counts, pulling the groove off-centre.',
    heard: 'Kicks that avoid the obvious landings create the off-centre pull called syncopation.',
  },
];

export const LANE_NAME: Record<Lane, string> = { hat: 'Hi-hat', snare: 'Snare', kick: 'Kick' };
export const LANE_WORD: Record<Lane, string> = { hat: 'hi-hat', snare: 'snare', kick: 'kick' };
export const LANE_DESC: Record<Lane, string> = { hat: 'the tick on top', snare: 'the sharp answer', kick: 'the low thump' };
/** Ruler labels for the even steps. */
export const COUNT = ['1', '&', '2', '&', '3', '&', '4', '&'];
