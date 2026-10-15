import { fromCallback, type EventObject } from 'xstate';
import type { AudioEngine, Mode } from '../audio/types';

export type TransportEvent =
  | { type: 'TRANSPORT.STARTED'; mode: Mode; loops: number }
  | { type: 'TRANSPORT.LOOP'; mode: Mode; loop: number }
  /** `completed`: it played to its end, rather than being stopped. `at`: where a pause would pick up. */
  | { type: 'TRANSPORT.ENDED'; mode: Mode; completed: boolean; at: number };

/**
 * Reports the engine's start / loop / end notifications back to the machine, so `playing` always
 * reflects what the engine is really doing (a beat that finishes its loops on its own, for example).
 * Per-step events deliberately do not pass through the machine: the playhead listens to the engine
 * directly, so nothing sits between the audio clock and the pixels.
 */
export const transportLogic = fromCallback<EventObject, { engine: AudioEngine }>(({ input, sendBack }) => {
  const off = input.engine.subscribe((e) => {
    if (e.type === 'start') sendBack({ type: 'TRANSPORT.STARTED', mode: e.mode, loops: e.loops } satisfies TransportEvent);
    else if (e.type === 'step') { if (e.pos === 0) sendBack({ type: 'TRANSPORT.LOOP', mode: e.mode, loop: e.loop + 1 } satisfies TransportEvent); }
    else sendBack({ type: 'TRANSPORT.ENDED', mode: e.mode, completed: e.completed, at: e.at } satisfies TransportEvent);
  });
  return () => {
    off();
    input.engine.stop();
  };
});
