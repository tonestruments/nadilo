// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/urbanist';
import './styles/app.css';
import './styles/school.css';
import App from './App';
import { engine } from './audio/engine';
import { startApp } from './machine/actor';
import { loadProgress } from './machine/persist';

// Mouse clicks should not leave buttons focused, so Space and Enter stay game shortcuts.
// Keyboard focus (Tab) is unaffected.
document.addEventListener('mousedown', (e) => {
  if ((e.target as Element).closest('button')) e.preventDefault();
});

// Audio may only start from a gesture, and starting it takes a moment: the samples are decoded and the audio thread
// warms up silently (see ToneEngine). So the first click or key press anywhere starts it, well before anything plays.
// Without this, a returning player's first Play did all of that at once, and its first notes crackled.
const unlockOnGesture = () => {
  void engine.unlock().then(() => {
    removeEventListener('pointerdown', unlockOnGesture, true);
    removeEventListener('keydown', unlockOnGesture, true);
  }, () => undefined);
};
addEventListener('pointerdown', unlockOnGesture, true);
addEventListener('keydown', unlockOnGesture, true);

// The statechart boots from saved progress (onboarding or Home), so it is read before the first render.
// If reading it fails in some unforeseen way, the app still starts, as on a first launch.
void loadProgress().catch(() => ({})).then((persisted) => {
  const actor = startApp(persisted);

  // A handle for the end-to-end tests (dev builds, or any build opened with ?debug).
  if (import.meta.env.DEV || location.search.includes('debug')) {
    (window as unknown as { __nadilo: unknown }).__nadilo = { engine, actor };
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
