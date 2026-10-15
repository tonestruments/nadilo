import { createActor, type Actor } from 'xstate';
import { useSelector } from '@xstate/react';
import { engine } from '../audio/engine';
import { createAppMachine, type AppEvent, type AppMachine, type AppSnapshot, type Persisted } from './appMachine';
import { pick, saveProgress } from './persist';

/**
 * The one running instance of the app's statechart. main.tsx starts it once saved progress is loaded, before the
 * first render. Components read it with `useApp` and talk to it with `send`.
 */
let appActor: Actor<AppMachine> | null = null;

export function startApp(persisted: Partial<Persisted>): Actor<AppMachine> {
  const actor = createActor(createAppMachine(engine), { input: { persisted } });
  let saved = '';
  actor.subscribe((snapshot) => {
    const next = JSON.stringify(pick(snapshot.context));
    if (next !== saved) {
      saved = next;
      saveProgress(snapshot.context);
    }
  });
  actor.start();
  appActor = actor;
  return actor;
}

const running = () => {
  if (!appActor) throw new Error('startApp() must run before the app renders');
  return appActor;
};

export const send = (event: AppEvent) => running().send(event);

/** The statechart as it is right now, for handlers that run outside React (the playhead). */
export const snapshot = (): AppSnapshot => running().getSnapshot();

export function useApp<T>(selector: (s: AppSnapshot) => T, compare?: (a: T, b: T) => boolean): T {
  return useSelector(running(), selector, compare);
}
