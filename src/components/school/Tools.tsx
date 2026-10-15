import { send, useApp } from '../../machine/actor';
import { barHasNotes, songOf } from '../../school/rules';
import { BARS } from '../../school/song';
import { changes, TAKES } from '../../school/yours';
import { ClearIcon, CopyIcon, SparkIcon, UndoIcon } from './Glyphs';
import { press, useBuild, useLevel, useRoom, useSong } from './use';

/**
 * Over the instrument: what can be done to a whole bar: copy it onto other bars, undo, clear it. Every tool keeps its
 * place in every level; one a level does not offer is hidden, not removed, so nothing moves.
 *
 * In Make it yours the same row holds the sparring partner instead of Copy: three takes on the bar on screen (Busier,
 * Emptier, Surprise), each an edit like any other that Undo takes back; and in place of Clear, the way back to the
 * song's notes for the level's bars.
 */
export function Tools() {
  const level = useLevel();
  const song = useSong();
  const build = useBuild();
  const room = useRoom();
  const copied = useApp((s) => s.context.room.history.length > 0);
  const changed = useApp((s) => (level.yours ? changes(songOf(s.context.school), s.context.school.own, level) > 0 : false));
  const arr = level.editor.kind === 'arr';
  const bar = room.bar;
  const name = arr ? song.sections[bar].name : `Bar ${bar + 1}`;
  const empty = !barHasNotes(level, build, bar);
  const others = Array.from({ length: BARS }, (_, i) => i).filter((i) => i !== bar);
  // The copy level asks for a copy: until one is made, the copy row calls for attention.
  const nudge = level.id === 'copy' && !copied;

  if (level.yours) {
    const takes = level.yours.takes;
    return (
      <div className="s-tools">
        <span aria-hidden />
        <div className="s-copy s-takes" data-hidden={takes ? undefined : ''} data-testid="takes">
          <span className="s-copy-label"><SparkIcon />Try a take</span>
          {TAKES.map((t) => (
            <button key={t.id} type="button" className="s-chip s-wide" data-testid={`take-${t.id}`} tabIndex={takes ? 0 : -1}
              {...press(() => send({ type: 'SCHOOL.TAKE', take: t.id }))}>{t.label}</button>
          ))}
        </div>
        <div className="s-edit">
          <button type="button" className="s-sbtn s-ghost" disabled={room.history.length === 0} data-testid="undo"
            {...press(() => send({ type: 'UNDO' }))}><UndoIcon />Undo</button>
          <button type="button" className="s-sbtn s-ghost" disabled={!changed} data-testid="reset"
            {...press(() => send({ type: 'SCHOOL.EDIT', edit: { kind: 'reset' } }))}>Back to the song’s</button>
        </div>
      </div>
    );
  }

  return (
    <div className="s-tools">
      {/* Which bar is on screen is the highlighted tile in the strip; the copy tools sit on the centre line. */}
      <span aria-hidden />
      <div className="s-copy" data-hidden={level.copy && !arr ? undefined : ''} data-nudge={nudge ? '' : undefined} data-testid="copy">
        <span className="s-copy-label"><CopyIcon />Copy {name.toLowerCase()} to</span>
        {others.map((i) => (
          <button key={i} type="button" className="s-chip" data-testid={`copy-to-${i}`} tabIndex={level.copy ? 0 : -1}
            {...press(() => send({ type: 'SCHOOL.EDIT', edit: { kind: 'copy', from: bar, to: i } }))}>{i + 1}</button>
        ))}
        <button type="button" className="s-chip s-wide" data-testid="copy-to-all" tabIndex={level.copy ? 0 : -1}
          {...press(() => send({ type: 'SCHOOL.EDIT', edit: { kind: 'copy', from: bar, to: 'all' } }))}>All</button>
      </div>
      <div className="s-edit">
        <button type="button" className="s-sbtn s-ghost" disabled={room.history.length === 0} data-testid="undo"
          {...press(() => send({ type: 'UNDO' }))}><UndoIcon />Undo</button>
        <button type="button" className="s-sbtn s-ghost" disabled={arr || empty} data-hidden={arr ? '' : undefined} data-testid="clear"
          {...press(() => send({ type: 'SCHOOL.EDIT', edit: { kind: 'clear', bar } }))}><ClearIcon />Clear {arr ? '' : 'bar'}</button>
      </div>
    </div>
  );
}
