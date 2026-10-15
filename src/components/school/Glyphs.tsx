import type { Lane } from '../../game/levels';

/**
 * School is drawn as cloth and thread: every drum has its own stitch, so colour is never the only clue. A solid
 * satin stitch for Boom, a cross for Crack, a slanted stitch for Tick. `hole` draws the same stitch as a dashed
 * outline: where the song's note goes, before it is yours.
 */
export function Stitch({ lane, hole = false }: { lane: Lane; hole?: boolean }) {
  const common = hole
    ? { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeDasharray: '3.2 3', strokeLinecap: 'round' as const }
    : { fill: 'currentColor', stroke: 'none' };
  return (
    <svg className="s-stitch" viewBox="0 0 40 40" aria-hidden>
      {lane === 'kick' && <rect x="5" y="13" width="30" height="14" rx="7" {...common} />}
      {lane === 'snare' && (hole
        ? <path d="M10 10l20 20M30 10L10 30" {...common} />
        : <path d="M8.5 12.7l3.5-3.6 8 8 8-8 3.5 3.6-8 8 8 8-3.5 3.5-8-8-8 8-3.5-3.5 8-8z" fill="currentColor" />)}
      {lane === 'hat' && (hole
        ? <path d="M13 31L27 9" {...common} />
        : <path d="M10.5 30.2L25 7.5a2.6 2.6 0 0 1 4.4 2.8L14.9 33a2.6 2.6 0 0 1-4.4-2.8z" fill="currentColor" />)}
    </svg>
  );
}

const icon = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2 } as const;

/** Up close: two of the four rows of the song, the rest faded. */
export const CloseIcon = () => (
  <svg className="s-ico" viewBox="0 0 24 24" aria-hidden {...icon}>
    <path d="M4 6h16" opacity="0.3" /><path d="M4 10h16" /><path d="M4 14h16" /><path d="M4 18h16" opacity="0.3" />
  </svg>
);

export const ChevronIcon = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden {...icon} strokeWidth={2.4}>
    <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);
export const CopyIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden {...icon}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
);
export const UndoIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden {...icon}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
);
export const ClearIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden {...icon}><path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7" /></svg>
);
export const LoopIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden {...icon}><path d="M17 3l3 3-3 3" /><path d="M4 11V9a3 3 0 0 1 3-3h13" /><path d="M7 21l-3-3 3-3" /><path d="M20 13v2a3 3 0 0 1-3 3H4" /></svg>
);
export const SlowIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden {...icon}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M10 2.5h4" /></svg>
);
export const HintIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden {...icon}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></svg>
);
/** A take from the sparring partner: a small burst. */
export const SparkIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden {...icon}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />
  </svg>
);
/** Yours: a small diamond, the patch sewn onto what the player changed. */
export const PatchIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden><path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" fill="currentColor" /></svg>
);
export const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden {...icon}><path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>
);
export const StarIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden>
    <path d="M12 3.2l2.6 5.5 6 .7-4.5 4.1 1.2 5.9L12 16.4l-5.3 3 1.2-5.9-4.5-4.1 6-.7z" fill="currentColor" />
  </svg>
);
export const TickIcon = () => (
  <svg viewBox="0 0 24 24" className="s-ico" aria-hidden {...icon} strokeWidth={2.8}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

/** Stars: the goal met, three quarters of the way to the song, exactly the song. */
export function Stars({ n, label }: { n: number; label?: string }) {
  return (
    <span className="s-stars" role="img" aria-label={label ?? `${n} of 3 stars`}>
      {[0, 1, 2].map((i) => <i key={i} data-on={i < n ? '' : undefined}><StarIcon /></i>)}
    </span>
  );
}
