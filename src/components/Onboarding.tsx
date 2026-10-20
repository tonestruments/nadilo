// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from 'react';
import { motion } from 'motion/react';
import { send, useApp } from '../machine/actor';
import { Meter, PlayButton } from './controls';
import { ArrowIcon } from './Icons';
import { Logomark } from './Logomark';

const enter = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};
const stagger = (i: number) => ({ ...enter, transition: { delay: 0.08 * i, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] as const } });

export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <motion.div className="screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <div className="ob">{children}</div>
    </motion.div>
  );
}

export function Welcome() {
  // This click is the gesture that lets the Mac app start audio; the machine unlocks it on GET_STARTED.
  const begin = () => send({ type: 'GET_STARTED' });
  return (
    <Frame>
      <motion.div className="brand" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
        <Logomark width={260} />
      </motion.div>
      <motion.h1 {...stagger(1)}>Welcome to <em>Nadilo</em> Desktop</motion.h1>
      <motion.p className="sub" {...stagger(2)}>Make a song, one part at a time.</motion.p>
      <motion.div className="actions" {...stagger(3)}>
        <button type="button" className="btn primary big" onClick={begin} data-testid="get-started">Get started <ArrowIcon size={17} /></button>
      </motion.div>
      <motion.p className="fine" {...stagger(4)}>No account needed.</motion.p>
    </Frame>
  );
}

export function SoundCheck() {
  const playing = useApp((s) => s.context.playing === 'test');
  const tried = useApp((s) => s.context.soundTried);
  const heard = useApp((s) => s.context.soundSeen);
  const help = useApp((s) => s.context.soundHelp);
  const onSignal = useCallback(() => send({ type: 'SIGNAL' }), []);
  const press = () => send({ type: 'TEST_SOUND' });

  return (
    <Frame>
      <motion.h1 {...stagger(0)}>First, check your sound</motion.h1>
      <motion.p className="sub" {...stagger(1)}>Press play. You should hear a kick and a snare trading places.</motion.p>
      <motion.div className="soundcheck" {...stagger(2)}>
        <PlayButton large playing={playing} onClick={press} label={playing ? 'Pause' : 'Play a test sound'} testId="test-sound" />
        <div className="signal">
          <span className={`text ${heard ? 'yes' : ''}`} data-testid="signal">
            {heard ? '✓ Nadilo is playing sound' : tried ? 'Starting…' : 'Nothing playing yet'}
          </span>
          <Meter onSignal={playing ? onSignal : undefined} />
        </div>
      </motion.div>
      {help && (
        <motion.div className="help" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          If the line above moves, Nadilo is sending sound, so the problem is the output:
          <ul>
            <li><b>Turn up your Mac’s volume</b> with the speaker keys (F11 and F12).</li>
            <li><b>Check the output device</b> in Control Centre → Sound. Headphones might be selected.</li>
            <li><b>Bluetooth headphones</b> sometimes need a moment to connect.</li>
          </ul>
        </motion.div>
      )}
      <motion.div className="actions" {...stagger(3)}>
        {tried && <button type="button" className="btn primary big" onClick={() => send({ type: 'HEARD' })} data-testid="can-hear">I can hear it</button>}
        {tried && !help && <button type="button" className="btn big" onClick={() => send({ type: 'CANT_HEAR' })}>I can’t hear anything</button>}
        {!tried && <button type="button" className="btn tertiary big" onClick={() => send({ type: 'SKIP' })} data-testid="skip-sound">Skip</button>}
      </motion.div>
    </Frame>
  );
}
