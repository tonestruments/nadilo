/**
 * The music under Nadilo School: one key (C minor, like most of the sound library), six chords and two ladders.
 * None of it is shown as theory. A chord is a mood with a colour, a note is a height on a ladder; the words
 * (chord, root, half note) arrive only after the player has used them.
 */

export type Mood = 'home' | 'warm' | 'bright' | 'lift' | 'longing' | 'restless';

/** Pitch classes of each chord (C = 0) and its colour. The ids are internal; the app never shows them. */
export const MOODS: Record<Mood, { pcs: readonly number[]; color: string }> = {
  home: { pcs: [0, 3, 7], color: 'oklch(56% 0.17 268)' },      // C minor, i
  warm: { pcs: [8, 0, 3], color: 'oklch(70% 0.15 58)' },       // A flat, VI
  bright: { pcs: [3, 7, 10], color: 'oklch(80% 0.14 92)' },    // E flat, III
  lift: { pcs: [10, 2, 5], color: 'oklch(66% 0.12 166)' },     // B flat, VII
  longing: { pcs: [5, 8, 0], color: 'oklch(60% 0.15 315)' },   // F minor, iv
  restless: { pcs: [7, 10, 2], color: 'oklch(60% 0.17 18)' },  // G minor, v
};
export const MOOD_ORDER: readonly Mood[] = ['home', 'warm', 'bright', 'lift', 'longing', 'restless'];
export const isMood = (x: unknown): x is Mood => typeof x === 'string' && x in MOODS;

export type Ladder = 'bass' | 'melody';

/**
 * The two ladders, lowest first. Bass: C2 E♭2 F2 G2 A♭2 B♭2; the lowest is 65 Hz, above the 55 Hz floor laptop
 * speakers can still play (docs/SOUNDS.md). Tune: G4 B♭4 C5 E♭5 F5 G5, a minor pentatonic around the kalimba's root.
 */
export const LADDER: Record<Ladder, readonly number[]> = {
  bass: [36, 39, 41, 43, 44, 46],
  melody: [67, 70, 72, 75, 77, 79],
};
/** The row of the home note (C) on each ladder. It is drawn ringed. */
export const HOME_ROW: Record<Ladder, number> = { bass: 0, melody: 2 };
export const ROWS = 6;

export const fits = (mood: Mood, midi: number) => MOODS[mood].pcs.includes(((midi % 12) + 12) % 12);

/** The chord's notes, voiced between G3 and F♯4 so the guitar (root C4) is never moved more than 7 semitones. */
export function voicing(mood: Mood): number[] {
  return MOODS[mood].pcs.map((pc) => (60 + pc > 66 ? 48 + pc : 60 + pc)).sort((a, b) => a - b);
}
