import { AnimatePresence } from 'motion/react';
import { send, useApp } from './machine/actor';
import { screenOf, type Screen } from './machine/view';
import { EarJourney } from './components/EarJourney';
import { Game } from './components/Game';
import { Home } from './components/Home';
import { HomeIcon } from './components/Icons';
import { SoundCheck, Welcome } from './components/Onboarding';
import { Sync } from './components/Sync';
import { SoundStatus, Switch } from './components/controls';
import { ChevronIcon } from './components/school/Glyphs';
import { Journey } from './components/school/Journey';
import { School } from './components/school/School';

const ONBOARDING: Screen[] = ['welcome', 'sound', 'sync'];

function TitleBar() {
  const screen = useApp(screenOf);
  const onboarding = useApp((s) => s.hasTag('onboarding'));
  // A reward card is modal: while it is up, it offers the only ways on.
  const tools = useApp((s) => s.hasTag('game') && !s.hasTag('sync') && !s.hasTag('reward'));
  const status = useApp((s) => s.hasTag('game') && !s.hasTag('sync'));
  const cues = useApp((s) => s.context.cues);
  // The song's own screens are not steps of a world: the journey is not shown over them.
  const meet = useApp((s) => s.hasTag('schoolMeet') || s.hasTag('schoolSong'));
  const step = ONBOARDING.indexOf(screen);
  return (
    // The whole bar drags the window; the traffic lights sit in its left padding.
    <div className="titlebar" data-tauri-drag-region>
      {onboarding && (
        <div className="center" data-tauri-drag-region>
          <div className="dots" aria-label={`Step ${step + 1} of ${ONBOARDING.length}`}>
            {ONBOARDING.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}
          </div>
        </div>
      )}
      {screen === 'school' && !meet && <div className="center" data-tauri-drag-region><Journey /></div>}
      {screen === 'game' && <div className="center" data-tauri-drag-region><EarJourney /></div>}
      {tools && (screen === 'game' || screen === 'school') && (
        <div className="left">
          {/* School is a path, so it has a way back a step as well as the way home. */}
          {screen === 'school' && (
            <button type="button" className="bar-btn" onClick={() => send({ type: 'SCHOOL.BACK' })} data-testid="back" title="Back a step">
              <ChevronIcon dir="left" /> Back
            </button>
          )}
          <button type="button" className="bar-btn" onClick={() => send({ type: 'HOME' })} data-testid="home" title="Home">
            <HomeIcon size={15} /> Home
          </button>
        </div>
      )}
      {status && (
        // Whether sound plays is always shown, even under a reward card; the buttons beside it are not.
        <div className="right">
          <SoundStatus />
          {tools && <button type="button" className="bar-btn" onClick={() => send({ type: 'SYNC.OPEN' })} data-testid="open-sync" title="Line up the playhead with your headphones">Sync</button>}
          {tools && screen === 'game' && <Switch on={cues} onChange={(on) => send({ type: 'SET_CUES', on })} testId="cues">Coach tips</Switch>}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const screen = useApp(screenOf);
  return (
    <div className="app">
      <TitleBar />
      <AnimatePresence mode="wait">
        {screen === 'welcome' && <Welcome key="welcome" />}
        {screen === 'sound' && <SoundCheck key="sound" />}
        {screen === 'sync' && <Sync key="sync" />}
        {screen === 'home' && <Home key="home" />}
        {screen === 'school' && <School key="school" />}
        {screen === 'game' && <Game key="game" />}
      </AnimatePresence>
    </div>
  );
}
