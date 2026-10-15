import { useApp } from '../../machine/actor';
import { buildFor, songOf, starsNow } from '../../school/rules';
import { changes } from '../../school/yours';
import { Stars, TickIcon } from './Glyphs';
import { selectLevel, useDone, useLevel, useWorld } from './use';

/**
 * The level: its title, and one goal that names what to touch. The goal counts along when it can do so without
 * giving anything away, and the stars say how close the part is to the song. While the goal is met, the goal gives
 * way to the real name of what was done, in place: nothing pops up over the music. Clear the bar and the goal comes
 * back (the level stays done, and its stars never go down). Where the level sits in its world is in the title bar.
 *
 * In Make it yours there are no stars: the song is the reference, not the target. In their place, how many changes
 * are the player's (gold), and the name comes as soon as the goal is met, before the player keeps it.
 */
export function Head() {
  const level = useLevel();
  const world = useWorld();
  const done = useDone();
  const met = useApp((s) => level.check(buildFor(s.context.school, selectLevel(s))));
  const count = useApp((s) => level.count?.(s.context.school.build) ?? null, (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1]);
  const stars = useApp((s) => (level.yours ? 0 : Math.max(s.context.school.stars[level.id] ?? 0, starsNow(level, songOf(s.context.school), s.context.school.build))));
  const changed = useApp((s) => (level.yours ? changes(songOf(s.context.school), s.context.school.own, level) : 0));
  const named = level.yours ? met : done && met;
  return (
    <header className="s-head" style={{ ['--world' as string]: world.color }} data-done={named ? '' : undefined} data-yours={level.yours ? '' : undefined}>
      <h1 data-testid="level-title">{level.title}</h1>
      {/* The goal sits on the centre line; what marks it (the tick, the count, the stars) sits either side. */}
      <p className="s-goal" data-testid="goal" aria-live="polite">
        <span className="s-goal-side">{named && <span className="s-goal-tick"><TickIcon /></span>}</span>
        {named
          ? <span className="s-goal-text" data-testid="named"><b>{level.name}.</b> {level.named}</span>
          : <span className="s-goal-text">{level.goal}</span>}
        <span className="s-goal-side">
          {level.yours ? (
            <span className="s-changes" data-none={changed ? undefined : ''} data-testid="changes">
              {changed ? `${changed} ${changed === 1 ? 'change' : 'changes'}` : 'No changes yet'}
            </span>
          ) : (
            <>
              {!named && count && <span className="s-count" data-testid="count">{Math.min(count[0], count[1])}/{count[1]}</span>}
              <Stars n={stars} />
            </>
          )}
        </span>
      </p>
    </header>
  );
}
