// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import type { Reveal } from '../game/logic';
import { levelOf, type AppSnapshot } from './appMachine';

/** Small selectors so components read the statechart the same way everywhere. */

export type Screen = 'welcome' | 'sound' | 'sync' | 'home' | 'school' | 'game';

export const screenOf = (s: AppSnapshot): Screen =>
  s.hasTag('welcome') ? 'welcome'
    : s.hasTag('soundCheck') ? 'sound'
      : s.hasTag('sync') ? 'sync'
        : s.hasTag('home') ? 'home'
          : s.hasTag('school') ? 'school'
            : 'game';

export const revealOf = (s: AppSnapshot): Reveal => (s.hasTag('solved') ? 'solved' : s.hasTag('answer') ? 'answer' : null);

export const selectLevel = (s: AppSnapshot) => levelOf(s.context);
