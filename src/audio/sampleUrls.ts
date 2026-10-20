// Copyright (C) 2026 Tonestruments AB
// SPDX-License-Identifier: GPL-3.0-only

import kick from '../assets/audio/kick.wav';
import snare from '../assets/audio/snare.wav';
import hat from '../assets/audio/hat.wav';
import kick2 from '../assets/audio/kick-2.wav';
import kick3 from '../assets/audio/kick-3.wav';
import kick4 from '../assets/audio/kick-4.wav';
import snare2 from '../assets/audio/snare-2.wav';
import snare3 from '../assets/audio/snare-3.wav';
import snare4 from '../assets/audio/snare-4.wav';
import hat2 from '../assets/audio/hat-2.wav';
import hat3 from '../assets/audio/hat-3.wav';
import hat4 from '../assets/audio/hat-4.wav';
import kickRound from '../assets/audio/school/kick-round.wav';
import kickDeep from '../assets/audio/school/kick-deep.wav';
import snareSnap from '../assets/audio/school/snare-snap.wav';
import snareRim from '../assets/audio/school/snare-rim.wav';
import hatBright from '../assets/audio/school/hat-bright.wav';
import hatShaker from '../assets/audio/school/hat-shaker.wav';
import bass from '../assets/audio/school/bass.wav';
import keys from '../assets/audio/school/keys.wav';
import pad from '../assets/audio/school/pad.wav';
import kalimba from '../assets/audio/school/kalimba.wav';
import type { SampleId } from './samples';

/** Where each sample is bundled. Only the real engine needs this. */
export const SAMPLE_URLS: Record<SampleId, string> = {
  kick, snare, hat,
  'kick-2': kick2, 'kick-3': kick3, 'kick-4': kick4,
  'snare-2': snare2, 'snare-3': snare3, 'snare-4': snare4,
  'hat-2': hat2, 'hat-3': hat3, 'hat-4': hat4,
  'kick-round': kickRound, 'kick-deep': kickDeep,
  'snare-snap': snareSnap, 'snare-rim': snareRim,
  'hat-bright': hatBright, 'hat-shaker': hatShaker,
  bass, keys, pad, kalimba,
};
