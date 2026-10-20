// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

type P = { size?: number };
const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/**
 * Optically centred in a round button. Centring the outline looks too far left (the point is thin); centring the
 * centre of mass looks too far right (0.4.0, "not centred"). Halfway: the outline's middle sits a twelfth of the
 * triangle's width right of the button's middle.
 */
export const PlayIcon = ({ size = 18 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
    <path d="M6.8 5.2v13.6c0 .8.9 1.3 1.6.9l10.4-6.8a1.05 1.05 0 0 0 0-1.8L8.4 4.3C7.7 3.9 6.8 4.4 6.8 5.2z" fill="currentColor" />
  </svg>
);
export const PauseIcon = ({ size = 18 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
    <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
  </svg>
);
export const CheckIcon = ({ size = 18 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...stroke} strokeWidth={2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const UndoIcon = ({ size = 16 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...stroke} strokeWidth={2}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
);
export const ArrowIcon = ({ size = 18 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...stroke} strokeWidth={2.4}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const SpeakerIcon = ({ size = 18 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...stroke} strokeWidth={2}>
    <path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor" /><path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);
export const HomeIcon = ({ size = 16 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...stroke} strokeWidth={2}><path d="M4 11l8-6.5 8 6.5" /><path d="M6.5 9.5V19h11V9.5" /></svg>
);
export const TrashIcon = ({ size = 16 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...stroke} strokeWidth={2}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
);
export const ShuffleIcon = ({ size = 16 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...stroke} strokeWidth={2}><path d="M4 7h3.5c4 0 5 10 9 10H20M17 14l3 3-3 3M4 17h3.5c1.6 0 2.7-1.6 3.6-3.4M20 7h-3.5c-1.6 0-2.7 1.6-3.6 3.4M17 4l3 3-3 3" /></svg>
);
export const LockIcon = ({ size = 14 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...stroke} strokeWidth={2}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const StarIcon = ({ size = 16 }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
    <path d="M12 3.2l2.6 5.5 6 .7-4.5 4.1 1.2 5.9L12 16.4l-5.3 3 1.2-5.9-4.5-4.1 6-.7z" fill="currentColor" strokeLinejoin="round" />
  </svg>
);
