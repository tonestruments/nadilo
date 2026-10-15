import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { nextLabel } from '../game/copy';
import { LEVELS } from '../game/levels';
import { send, useApp } from '../machine/actor';
import { selectLevel } from '../machine/view';
import { PlayButton } from './controls';
import { ArrowIcon } from './Icons';

export function RewardDialog() {
  const open = useApp((s) => s.hasTag('earReward'));
  const celebrate = useApp((s) => s.context.celebrate);
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="overlay" className="overlay" role="dialog" aria-modal aria-labelledby="reward-title"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <Confetti key={celebrate} />
          <Card />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Card() {
  const level = useApp(selectLevel);
  const checks = useApp((s) => s.context.checks);
  const playing = useApp((s) => s.context.playing === 'reveal');
  // The finale is the solve that completes every level, whichever level that is.
  const finale = useApp((s) => s.context.finale);
  const next = useApp((s) => nextLabel(s.context));

  return (
    <motion.div className="card" data-testid="reward"
      initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}>
      <motion.div className="stamp" aria-label="Scored 100%"
        initial={{ scale: 2.2, opacity: 0, rotate: -24 }} animate={{ scale: 1, opacity: 1, rotate: -8 }}
        transition={{ delay: 0.35, duration: 0.32, ease: [0.3, 0, 0.2, 1] }}>
        <div><b>100%</b><small>{finale ? 'All levels' : 'Matched'}</small></div>
      </motion.div>

      <div className="kicker">{finale ? 'Journey complete' : `Level ${level.id} complete`}</div>
      <h2 id="reward-title">{finale ? `${LEVELS.length} beats, heard.` : level.name}</h2>
      <div className="meta">{finale ? 'You rebuilt every one of them by ear.' : checks === 1 ? 'Matched on your first check' : `Matched in ${checks} checks`}</div>

      <motion.section className="listen-for" data-testid="listen-for"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.4 }}>
        <div className="lf-top">
          <PlayButton playing={playing} onClick={() => send({ type: 'REPLAY' })} label={playing ? 'Pause' : 'Play the beat'} testId="lf-play" />
          <div>
            <div className="lf-label">Listen for it</div>
            <div className="lf-line">{level.listenFor}</div>
          </div>
        </div>
        {level.songs && (
          <div className="songs">
            {level.songs.map((song) => (
              <div className="song" key={song.title}><b>{song.title} · {song.artist}</b><span>{song.what}</span></div>
            ))}
          </div>
        )}
      </motion.section>

      <p className="heard">{level.heard}</p>
      {finale && <div className="recap">{LEVELS.map((l) => <span key={l.id}>{l.name}</span>)}</div>}

      <div className="row">
        {finale ? (
          <button type="button" className="btn primary big" onClick={() => send({ type: 'HOME' })} data-testid="reward-home" autoFocus>
            See them all on Home <ArrowIcon size={17} />
          </button>
        ) : (
          <button type="button" className="btn primary big" onClick={() => send({ type: 'NEXT' })} data-testid="reward-next" autoFocus>
            {next} <ArrowIcon size={17} />
          </button>
        )}
        <button type="button" className="btn tertiary big" onClick={() => send({ type: 'CLOSE_REWARD' })} data-testid="reward-close">Look at the grid</button>
      </div>
    </motion.div>
  );
}

const COLORS = ['#e0603f', '#e3a12f', '#3a9ea4', '#9a4fa8', '#3d9a6c', '#3448c8'];

/** Paper confetti and a few brush strokes bursting from behind the card. */
export function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => {
    const angle = (Math.random() * 1.6 - 0.8) * Math.PI - Math.PI / 2;
    const dist = 260 + Math.random() * 360;
    const stroke = i % 9 === 0;
    return {
      i, color: COLORS[i % COLORS.length],
      w: stroke ? 38 + Math.random() * 30 : 7 + Math.random() * 7,
      h: stroke ? 7 : 9 + Math.random() * 8,
      round: i % 3 === 0,
      x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.7,
      rot: (Math.random() - 0.5) * 720,
      delay: 0.3 + Math.random() * 0.15,
    };
  }), []);
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p) => (
        <motion.i key={p.i}
          style={{ width: p.w, height: p.h, background: p.color, borderRadius: p.round ? '50%' : 3 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: [0, p.x, p.x * 1.05], y: [0, p.y, p.y + 520], opacity: [1, 1, 0], rotate: p.rot }}
          transition={{ duration: 2.4, delay: p.delay, times: [0, 0.3, 1], ease: ['easeOut', 'easeIn'] }} />
      ))}
    </div>
  );
}
