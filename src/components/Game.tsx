import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { coachTip, nextLabel, statusLine } from '../game/copy';
import { LANE_WORD, type Lane } from '../game/levels';
import { placedCount, wrongLanes } from '../game/logic';
import { send, useApp } from '../machine/actor';
import { revealOf, selectLevel } from '../machine/view';
import { PlayButton } from './controls';
import { Grid } from './Grid';
import { ArrowIcon, CheckIcon, PauseIcon, PlayIcon, SpeakerIcon, TrashIcon, UndoIcon } from './Icons';
import { RewardDialog } from './RewardDialog';

export function Game() {
  useShortcuts();
  const level = useApp(selectLevel);
  return (
    <motion.div className="screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      {/* The chapters and their levels are in the title bar (EarJourney), so the stage is the level alone. */}
      <div style={{ flex: '1 1 0', minHeight: 12 }} />
      <motion.div key={level.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        style={{ display: 'flex', flexDirection: 'column' }}>
        <Head />
        <div style={{ height: 40 }} />
        <Grid />
      </motion.div>
      {/* Room between the grid and the dock, so the play button never crowds the steps. */}
      <div style={{ flex: '1 1 0', minHeight: 40, maxHeight: 72 }} />
      <Dock />
      <div style={{ height: 18 }} />
      <Coach />
      <div style={{ flex: '1.4 1 0', minHeight: 8 }} />
      <StatusBar />
      <RewardDialog />
    </motion.div>
  );
}

/** Everything the copy helpers need, read from the statechart. */
function useView() {
  const level = useApp(selectLevel);
  const placed = useApp((s) => s.context.placed);
  const listens = useApp((s) => s.context.listens);
  const result = useApp((s) => s.context.result);
  const playing = useApp((s) => s.context.playing);
  const reveal = useApp(revealOf);
  return { level, placed, listens, result, reveal, playing };
}

function Head() {
  const v = useView();
  const line = statusLine(v);
  return (
    <header className="head">
      <div className="eyebrow">Level {v.level.id}{v.reveal === 'solved' ? ` · ${v.level.name}` : ''}</div>
      <h1 data-testid="task">{v.level.task}</h1>
      <p className={`line ${line.tone}`} data-testid="line">{line.text}</p>
    </header>
  );
}

/**
 * The coach. With Coach tips on it speaks up on its own, when what the player just did gives it a reason, and is quiet
 * otherwise. With them off it waits to be asked, like the partner in Make it yours: Ask the coach shows the tip for this
 * moment, until the player listens, places or checks again.
 */
function Coach() {
  const v = useView();
  const cues = useApp((s) => s.context.cues);
  const misses = useApp((s) => s.context.misses);
  const checks = useApp((s) => s.context.checks);
  const moment = `${v.level.id}:${v.listens}:${placedCount(v.level, v.placed)}:${checks}:${v.result?.stale ?? ''}`;
  const [askedAt, setAskedAt] = useState<string | null>(null);
  if (v.reveal) return <p className="coach" data-testid="coach" />;
  const asked = askedAt === moment;
  const tip = cues || asked ? coachTip({ ...v, misses }, asked) : null;
  return (
    <p className="coach" data-testid="coach">
      {tip ? <><b>Coach</b>{tip}</> : !cues && (
        <button type="button" className="coach-ask" onClick={() => setAskedAt(moment)} data-testid="coach-ask">Ask the coach</button>
      )}
    </p>
  );
}

/** Button weights: one primary action at a time; secondary (the default) and tertiary for the rest; accent for a lane. */
type Act = { key: string; label: string; onClick: () => void; kind?: 'primary' | 'accent' | 'tertiary'; icon?: React.ReactNode; lane?: Lane };

function Dock() {
  const v = useView();
  const checks = useApp((s) => s.context.checks);
  const checked = useApp((s) => s.hasTag('checked'));
  const next = useApp((s) => nextLabel(s.context));
  const n = placedCount(v.level, v.placed);
  const left: Act[] = [];
  const right: Act[] = [];
  let mid: { playing: boolean; onClick: () => void; caption: string; primary: boolean; testId: string };
  const replaying = v.playing === 'reveal';

  if (v.reveal) {
    mid = { playing: replaying, onClick: () => send({ type: 'REPLAY' }), caption: replaying ? 'Pause' : 'Play the beat', primary: false, testId: 'replay' };
    if (v.reveal === 'answer') {
      left.push({ key: 'retry', label: 'Try again', onClick: () => send({ type: 'RETRY' }), kind: 'primary', icon: <UndoIcon size={17} /> });
      right.push({ key: 'skip', label: 'Skip to the next level', onClick: () => send({ type: 'NEXT' }), kind: 'tertiary' });
    } else {
      right.push({ key: 'next', label: next, onClick: () => send({ type: 'NEXT' }), kind: 'primary', icon: <ArrowIcon size={17} /> });
    }
  } else {
    const tgt = v.playing === 'target';
    const listenPrimary = v.listens === 0 || (tgt && n === 0);
    mid = { playing: tgt, onClick: () => send({ type: 'LISTEN' }), caption: tgt ? 'Pause' : v.listens ? 'Listen again' : 'Listen', primary: listenPrimary, testId: 'listen' };
    if (v.listens > 0 || n > 0) {
      const on = v.playing === 'mine';
      left.push({ key: 'mine', label: on ? 'Pause yours' : 'Play yours', onClick: () => send({ type: 'PLAY_MINE' }), icon: on ? <PauseIcon size={17} /> : <PlayIcon size={17} /> });
    }
    const lane = checked ? wrongLanes(v.level, v.result)[0] : undefined;
    if (lane) {
      const on = v.playing === `solo:${lane}`;
      left.push({ key: 'hint', label: on ? 'Pause' : `Hear the ${LANE_WORD[lane]} alone`, onClick: () => send({ type: 'HINT' }), kind: 'accent', lane, icon: on ? <PauseIcon size={17} /> : <SpeakerIcon size={17} /> });
    }
    if (n > 0) right.push({ key: 'check', label: v.result ? 'Check again' : 'Check', onClick: () => send({ type: 'CHECK' }), kind: listenPrimary ? undefined : 'primary', icon: <CheckIcon size={17} /> });
    if (checked && checks >= 2) right.push({ key: 'answer', label: 'Show me the answer', onClick: () => send({ type: 'SHOW_ANSWER' }), kind: 'tertiary' });
  }

  const btn = (a: Act) => (
    <button key={a.key} type="button" className={`btn ${a.kind ?? ''} ${a.lane ? `lane-${a.lane}` : ''}`} onClick={a.onClick} data-testid={a.key}>
      {a.icon}<span>{a.label}</span>
    </button>
  );
  return (
    <div className="dock">
      <div className="side left">{left.map(btn)}</div>
      <div className="mid">
        <PlayButton playing={mid.playing} onClick={mid.onClick} label={mid.caption} primary={mid.primary} testId={mid.testId} />
        <span className="caption">{mid.caption}</span>
      </div>
      <div className="side right">{right.map(btn)}</div>
    </div>
  );
}

function StatusBar() {
  const editable = useApp((s) => s.hasTag('unsolved'));
  return (
    <div className="statusbar">
      {editable && (
        <div className="edit">
          <button type="button" onClick={() => send({ type: 'UNDO' })} title="Undo (⌘Z)"><UndoIcon size={15} /> Undo</button>
          <button type="button" onClick={() => send({ type: 'CLEAR' })}><TrashIcon size={15} /> Clear</button>
        </div>
      )}
    </div>
  );
}

/** Keys send intents; the statechart decides what they mean in the current state. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); send({ type: 'UNDO' }); return; }
      if (e.key === 'Escape') { send({ type: 'CLOSE_REWARD' }); return; }
      if (e.code === 'Space') { e.preventDefault(); send({ type: 'PRIMARY_PLAY' }); return; }
      if (e.key.toLowerCase() === 'p') send({ type: 'PLAY_MINE' });
      // Enter checks, unless a button has keyboard focus (like "Next level" in the reward), which it then presses.
      if (e.key === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) { e.preventDefault(); send({ type: 'CHECK' }); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}
