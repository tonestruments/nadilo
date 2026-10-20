// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { motion } from 'motion/react';
import { LEVELS, STEPS, type Level } from '../game/levels';
import { targetOf } from '../game/logic';
import { allSolved, continueIndex } from '../game/progress';
import type { LevelRecord } from '../machine/appMachine';
import { send, useApp } from '../machine/actor';
import { WORLDS } from '../school/levels';
import { allDone, levelsFor, madeYours, nextOpen, sewnOn, twistToday, unlocked } from '../school/rules';
import { twistById } from '../school/twists';
import { PatchIcon, Stars } from './school/Glyphs';
import { CHAPTERS } from './EarJourney';
import { ArrowIcon, CheckIcon, StarIcon } from './Icons';
import { Logomark } from './Logomark';

const enter = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.05 * i, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] as const },
});

/**
 * Home: one way on (Continue), School's five worlds, and the ear-training levels below them. Returning players land
 * here; Enter or Space continues.
 */
export function Home() {
  const school = useApp((s) => s.context.school);
  const levels = levelsFor(school);
  const { done, stars } = school;
  const next = done.includes(levels[school.level].id) ? nextOpen(school, school.level) : school.level;
  const finished = allDone(school);
  const ownSong = school.met && (finished || madeYours(school));
  const summary = finished ? 'You rebuilt the whole song, part by part.'
    : done.length === 0 ? 'Hear a song. Then rebuild it, part by part.'
      : `${done.length} of ${levels.length} levels.`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'Enter' && e.code !== 'Space') || e.repeat || document.activeElement instanceof HTMLButtonElement) return;
      e.preventDefault();
      send({ type: 'SCHOOL' });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <motion.div className="screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <div className="home">
        <div className="home-hero">
          <motion.div className="home-mark" {...enter(0)}><Logomark width={84} /></motion.div>
          {finished && <motion.div className="home-kicker" {...enter(1)} data-testid="school-finished">Song complete</motion.div>}
          <motion.h1 {...enter(1)}>Welcome back</motion.h1>
          <motion.p className="line" {...enter(2)} data-testid="school-summary">{summary}</motion.p>
          <motion.div {...enter(3)}>
            {finished ? (
              <button type="button" className="btn primary big" onClick={() => send({ type: 'SONG.OPEN' })} data-testid="school-continue">
                Your song <ArrowIcon size={17} />
              </button>
            ) : (
              <button type="button" className="btn primary big" onClick={() => send({ type: 'SCHOOL' })} data-testid="school-continue">
                {done.length === 0 ? 'Start' : `Continue · ${levels[next].title}`} <ArrowIcon size={17} />
              </button>
            )}
          </motion.div>
        </div>
        {ownSong && <motion.div {...enter(4)} className="today-wrap"><Today /></motion.div>}
        <motion.section className="worlds" {...enter(5)} aria-label="Nadilo School">
          {WORLDS.map((w, wi) => {
            const inWorld = levels.map((l, i) => ({ l, i })).filter(({ l }) => l.world === wi);
            return (
              <div key={w.name} className="world-card" style={{ ['--w' as string]: w.color }}>
                <div className="wc-top"><i />{w.name}<span className="wc-n">{inWorld.filter(({ l }) => done.includes(l.id)).length}/{inWorld.length}</span></div>
                <div className="wc-levels">
                  {inWorld.map(({ l, i }) => (
                    <button key={l.id} type="button" className={`wc-level ${done.includes(l.id) ? 'done' : ''} ${i === next && !finished ? 'here' : ''} ${l.yours ? 'yours' : ''}`}
                      disabled={!unlocked(school, i)} onClick={() => send({ type: 'SCHOOL', index: i })} data-testid={`world-level-${l.id}`}>
                      {/* Make it yours is a diamond, gold once kept: it has no stars, since it is not measured against the song. */}
                      <span className="mark">{l.yours ? <PatchIcon /> : done.includes(l.id) && <CheckIcon size={9} />}</span>{l.title}
                      {done.includes(l.id) && !l.yours && <Stars n={stars[l.id] ?? 1} />}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </motion.section>
        <EarTraining />
      </div>
    </motion.div>
  );
}

const today = () => {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const longDay = (on: string) => new Date(`${on}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

/**
 * Today's twist: one small change to the player's own song, the same all day, a new one tomorrow. Done, it is a stitch
 * in the sampler, one per day sewn. Nothing counts days in a row and nothing is lost by missing one: the reason to come
 * back is the song, which keeps every change.
 */
function Today() {
  const school = useApp((s) => s.context.school);
  const on = today();
  const twist = twistToday(school, on);
  const sewn = sewnOn(school, on);
  return (
    <section className="today" aria-label="Today’s twist" data-testid="today">
      <div className="today-text">
        <span className="today-kicker">Today’s twist · {longDay(on)}</span>
        <span className="today-goal" data-testid="today-goal">{sewn ? 'Sewn. A new twist tomorrow.' : twist?.goal ?? 'Make one part yours to open the twists.'}</span>
      </div>
      <div className="today-actions">
        {!sewn && twist && (
          <button type="button" className="btn" onClick={() => send({ type: 'TWIST' })} data-testid="today-start">
            {school.today?.on === on ? 'Go on' : 'Start'}
          </button>
        )}
        <button type="button" className={sewn ? 'btn' : 'btn tertiary'} onClick={() => send({ type: 'SONG.OPEN' })} data-testid="today-song">Your song</button>
      </div>
      {school.sewn.length > 0 && (
        <div className="sampler" role="img" aria-label={`${school.sewn.length} ${school.sewn.length === 1 ? 'twist' : 'twists'} sewn`} data-testid="sampler">
          {school.sewn.slice(-28).map((x) => (
            <i key={x.on} title={`${longDay(x.on)}: ${twistById(x.id)?.name ?? 'a twist'}`}><PatchIcon /></i>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The ear-training game: rebuild a hidden beat by ear. One row per chapter, each level a card big enough to read:
 * its number, what to do (or, once solved, its name), the beat in miniature, and how it went, in words.
 */
function EarTraining() {
  const solved = useApp((s) => s.context.solved);
  const records = useApp((s) => s.context.records);
  const next = useApp((s) => continueIndex(s.context));
  const finished = allSolved(solved);
  const heard = LEVELS.filter((l) => solved.includes(l.id)).length;
  const action = finished ? 'Start again' : heard === 0 && next === 0 ? 'Start' : `Continue level ${LEVELS[next].id}`;
  return (
    <motion.section className="ear-section" {...enter(6)} aria-label="Ear training">
      <div className="section-head">
        <span data-testid="home-summary">Ear training · {heard} of {LEVELS.length} beats heard{finished ? ' · Journey complete' : ''}</span>
        <button type="button" className="btn small tertiary" onClick={() => send({ type: 'CONTINUE' })} data-testid="continue">{action}</button>
      </div>
      {CHAPTERS.map((c) => (
        <div key={c.n} className="chapter-row" style={{ ['--chapter' as string]: c.color }}>
          <div className="chapter-name"><i />{c.name}</div>
          <div className="tiles">
            {LEVELS.filter((l) => l.chapter === c.n).map((l) => (
              <Tile key={l.id} level={l} done={solved.includes(l.id)} record={records[l.id]} upNext={!finished && LEVELS.indexOf(l) === next} />
            ))}
          </div>
        </div>
      ))}
    </motion.section>
  );
}

/** How a solved level went, in words. */
function outcome(r?: LevelRecord): { text: string; tone: 'first' | 'peeked' | '' } {
  if (!r) return { text: 'Solved', tone: '' };
  if (r.peeked) return { text: 'Answer shown', tone: 'peeked' };
  if (r.checks === 1) return { text: 'First try', tone: 'first' };
  return { text: `${r.checks} tries`, tone: '' };
}

function Tile({ level, done, record, upNext }: { level: Level; done: boolean; record?: LevelRecord; upNext: boolean }) {
  const how = done ? outcome(record) : null;
  return (
    <button type="button" className={`tile ${done ? 'done' : ''} ${upNext ? 'up-next' : ''}`}
      onClick={() => send({ type: 'GOTO_LEVEL', index: LEVELS.indexOf(level) })} data-testid={`tile-${level.id}`}
      title={done ? level.name : level.task} aria-label={`Level ${level.id}: ${done ? level.name : level.task}`}>
      <span className="tile-top">
        <span className="tile-n">Level {level.id}</span>
        {upNext ? <span className="tile-tag next">Next</span> : done ? <span className="tile-check"><CheckIcon size={11} /></span> : null}
      </span>
      <span className="tile-name">{done ? level.name : level.task}</span>
      <Thumb level={level} done={done} />
      <span className={`tile-how ${how?.tone ?? ''}`}>{how ? (how.tone === 'first' ? <><StarIcon size={12} />{how.text}</> : how.text) : '\u00a0'}</span>
    </button>
  );
}

/** The level's beat in miniature. Only a solved level shows its notes; hidden notes never reach the DOM. */
function Thumb({ level, done }: { level: Level; done: boolean }) {
  return (
    <span className="thumb" aria-hidden>
      {level.lanes.map((lane) => {
        const notes = done ? new Set(targetOf(level, lane)) : null;
        return (
          <span key={lane} className={`thumb-row thumb-${lane}`}>
            {Array.from({ length: STEPS }, (_, s) => <i key={s} className={notes?.has(s) ? 'on' : undefined} />)}
          </span>
        );
      })}
    </span>
  );
}
