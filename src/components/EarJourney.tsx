import { LEVELS } from '../game/levels';
import { send, useApp } from '../machine/actor';
import { ChevronIcon } from './school/Glyphs';

/** The two chapters, with the colour of the sound each one brings in. */
export const CHAPTERS = [
  { n: 1, name: 'Kick and snare', color: 'var(--kick)' },
  { n: 2, name: 'Enter the hi-hat', color: 'var(--hat)' },
] as const;

/**
 * The ear-training journey, in the title bar, the way School shows its worlds: the chapter you are in, by name, its
 * levels as dots, and an arrow either side to the other chapter. One chapter at a time, so the two runs of levels never
 * sit side by side. Solved dots are filled in the chapter's colour; the level on screen is ringed. Any level can be
 * opened, as before.
 */
export function EarJourney() {
  const levelIdx = useApp((s) => s.context.levelIdx);
  const solved = useApp((s) => s.context.solved);
  const ci = LEVELS[levelIdx].chapter - 1;
  const ch = CHAPTERS[ci];
  /** Where an arrow goes: the chapter's first level not solved yet, or its first level. */
  const entry = (n: number) => {
    const inChapter = LEVELS.filter((l) => l.chapter === n);
    return LEVELS.indexOf(inChapter.find((l) => !solved.includes(l.id)) ?? inChapter[0]);
  };
  const go = (index: number) => send({ type: 'GOTO_LEVEL', index });
  return (
    <nav className="journey" aria-label="Ear training" style={{ ['--chapter' as string]: ch.color }} data-testid="ear-journey">
      <button type="button" className="journey-arrow" aria-label={ci > 0 ? CHAPTERS[ci - 1].name : 'Previous chapter'}
        disabled={ci === 0} onClick={() => go(entry(ci))} data-testid="ear-journey-prev">
        <ChevronIcon dir="left" />
      </button>
      <div className="journey-chapter">
        <span className="journey-name">{ch.name}</span>
        {LEVELS.filter((l) => l.chapter === ch.n).map((l) => {
          const i = LEVELS.indexOf(l);
          const done = solved.includes(l.id);
          return (
            <button key={l.id} type="button" className="journey-dot" aria-current={i === levelIdx ? 'step' : undefined}
              data-done={done ? '' : undefined} onClick={() => go(i)} data-testid={`node-${l.id}`}
              title={done ? `Level ${l.id}: ${l.name}` : `Level ${l.id}`} aria-label={`Level ${l.id}`} />
          );
        })}
      </div>
      <button type="button" className="journey-arrow" aria-label={ci < CHAPTERS.length - 1 ? CHAPTERS[ci + 1].name : 'Next chapter'}
        disabled={ci === CHAPTERS.length - 1} onClick={() => go(entry(ci + 2))} data-testid="ear-journey-next">
        <ChevronIcon dir="right" />
      </button>
    </nav>
  );
}
