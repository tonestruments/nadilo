import kick from '../assets/audio/kick.wav';
import snare from '../assets/audio/snare.wav';
import hat from '../assets/audio/hat.wav';
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
  'kick-round': kickRound, 'kick-deep': kickDeep,
  'snare-snap': snareSnap, 'snare-rim': snareRim,
  'hat-bright': hatBright, 'hat-shaker': hatShaker,
  bass, keys, pad, kalimba,
};
