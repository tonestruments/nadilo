import type { Lane } from '../game/levels';
import type { Part } from './song';

/**
 * Sounds go by plain names (Boom, Crack, Tick, Floor, Color, Voice) until the level that names them is done: do it,
 * hear it, then name it.
 */
const LANE: Record<Lane, { plain: string; real: string; by: string }> = {
  kick: { plain: 'Boom', real: 'Kick', by: 'heartbeat' },
  snare: { plain: 'Crack', real: 'Snare', by: 'clapback' },
  hat: { plain: 'Tick', real: 'Hi-hat', by: 'zoomin' },
};
const PART: Record<Part, { plain: string; real: string; by: string }> = {
  drums: { plain: 'Drums', real: 'Drums', by: '' },
  bass: { plain: 'Floor', real: 'Bass', by: 'floor' },
  chords: { plain: 'Color', real: 'Chords', by: 'colors' },
  melody: { plain: 'Voice', real: 'Tune', by: 'tune' },
};

export const laneName = (lane: Lane, done: readonly string[]) => (done.includes(LANE[lane].by) ? LANE[lane].real : LANE[lane].plain);
export const partName = (part: Part, done: readonly string[]) => (done.includes(PART[part].by) ? PART[part].real : PART[part].plain);
