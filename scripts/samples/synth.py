#!/usr/bin/env python3
"""
Makes Nadilo's free sound set. Every sound is synthesized from sine waves and noise, so the repository holds no
recorded audio and anyone can build the app.

    python3 scripts/samples/synth.py

It writes:

  src/assets/audio/{kick,snare,hat}.wav    the ear game's kit (the first option in each lane)
  src/assets/audio/school/<id>.wav         School's sounds
  src/audio/samples.json                   what the app needs: file, role, root note
  docs/SOUNDS.md                           the measurements, for people

Speaker rules:
  - Nothing sounds below 80 Hz, because small laptop drivers crackle down there. The kicks settle at 85 to 90 Hz,
    and every sound goes through a high-pass filter at 80 Hz. The script refuses to write a sound that keeps more
    than FLOOR_LIMIT_DB of its energy below 80 Hz.
  - The bass is recorded at C2 (65.4 Hz) like the rest of the app expects, but without its fundamental. The ear
    hears the missing note from its harmonics (130 Hz and up), so the bass line keeps its pitch on a laptop.
  - Each sound is as loud as the sound it replaces, measured above 150 Hz (what a laptop speaker plays), so the
    app's mix (VOICE_DB in src/audio/samples.ts) still holds. Peaks never go above -3 dBFS.

The same seed gives the same files every time. Requires python3 with numpy and scipy.
"""
import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
FLOOR_HZ = 80.0
FLOOR_LIMIT_DB = -30.0
PEAK_DBFS = -3.0

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / 'src/assets/audio'
MANIFEST = ROOT / 'src/audio/samples.json'
REPORT = ROOT / 'docs/SOUNDS.md'

rng = np.random.default_rng(1798)


# Building blocks

def t_of(seconds):
    return np.arange(int(seconds * SR)) / SR


def noise(seconds):
    return rng.uniform(-1.0, 1.0, int(seconds * SR))


def filt(x, kind, hz, order=4):
    return sosfilt(butter(order, hz, kind, fs=SR, output='sos'), x)


def sweep(t, start_hz, end_hz, tau):
    """A sine whose pitch falls from start_hz to end_hz with time constant tau."""
    f = end_hz + (start_hz - end_hz) * np.exp(-t / tau)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def drive(x, amount):
    """Soft saturation. It adds harmonics, which a small speaker can play."""
    return np.tanh(amount * x) / np.tanh(amount)


def attack(x, seconds):
    n = max(1, int(seconds * SR))
    x = x.copy()
    x[:n] *= np.linspace(0.0, 1.0, n)
    return x


def fade_out(x, seconds):
    n = int(seconds * SR)
    x = x.copy()
    x[-n:] *= np.cos(np.linspace(0.0, np.pi / 2, n)) ** 2
    return x


def partials(f0, seconds, amps, taus, ratios=None, stretch=0.0, cents=0.0):
    """Additive synthesis: partial n at f0 * ratio_n, amplitude amps[n], decaying with time constant taus[n]."""
    t = t_of(seconds)
    f0 = f0 * 2 ** (cents / 1200)
    out = np.zeros_like(t)
    for i, (a, tau) in enumerate(zip(amps, taus)):
        n = i + 1
        ratio = ratios[i] if ratios is not None else n * np.sqrt(1 + stretch * n * n)
        f = f0 * ratio
        if a == 0 or f > 16000:
            continue
        out += a * np.exp(-t / tau) * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
    return out


# The kit

def kick(end_hz, start_hz, pitch_tau, body_tau, click, heat, seconds):
    t = t_of(seconds)
    body = sweep(t, start_hz, end_hz, pitch_tau) * np.exp(-t / body_tau)
    tick = filt(noise(seconds), 'hp', 2500) * np.exp(-t / 0.003) * click
    return attack(drive(body + tick, heat), 0.0008)


def snare(tones, tone_tau, noise_tau, noise_band, tone_mix, heat, seconds):
    t = t_of(seconds)
    body = sum(np.sin(2 * np.pi * f * t) for f in tones) / len(tones) * np.exp(-t / tone_tau)
    rattle = filt(filt(noise(seconds), 'hp', noise_band[0]), 'lp', noise_band[1], 2) * np.exp(-t / noise_tau)
    return attack(drive(tone_mix * body + (1 - tone_mix) * rattle, heat), 0.0008)


def rim(seconds):
    t = t_of(seconds)
    knock = 0.7 * np.sin(2 * np.pi * 1720 * t) * np.exp(-t / 0.011) + 0.5 * np.sin(2 * np.pi * 820 * t) * np.exp(-t / 0.02)
    tick = filt(noise(seconds), 'hp', 3000) * np.exp(-t / 0.002)
    return attack(drive(knock + 0.6 * tick, 2.0), 0.0005)


def metal(seconds):
    """The six detuned square waves of a classic drum machine's hi-hat."""
    t = t_of(seconds)
    return sum(np.sign(np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)))
               for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0)) / 6


def hat(tau, highpass, lowpass, noise_mix, seconds):
    """Kept between highpass and lowpass, mostly 3 to 6 kHz, so it sounds soft rather than piercing."""
    t = t_of(seconds)
    x = (1 - noise_mix) * metal(seconds) + noise_mix * noise(seconds)
    x = filt(filt(x, 'hp', highpass), 'lp', lowpass)
    return attack(x * np.exp(-t / tau), 0.0005)


def shaker(seconds):
    t = t_of(seconds)
    shape = (1 - np.exp(-t / 0.008)) * np.exp(-t / 0.065)
    return filt(filt(noise(seconds), 'hp', 2500), 'lp', 7000) * shape


# The instruments

def bass(seconds):
    """A plucked bass at C2 with its fundamental left out (see the speaker rules above)."""
    n = np.arange(1, 25)
    pluck = np.abs(np.sin(np.pi * n * 0.2))
    amps = pluck / n ** 1.1
    amps[0] = 0.0
    amps[1:4] *= [1.6, 1.4, 1.2]
    taus = 2.2 / (1 + 0.12 * n)
    t = t_of(seconds)
    thump = filt(noise(seconds), 'lp', 900, 2) * np.exp(-t / 0.006) * 0.4
    x = partials(65.406, seconds, amps, taus, stretch=0.00005) + thump
    return attack(filt(x, 'lp', 3000, 2), 0.003)


def guitar(seconds):
    """A nylon string at C4: two strings a little apart in tune, plucked near the bridge."""
    n = np.arange(1, 31)
    amps = np.abs(np.sin(np.pi * n * 0.14)) / n ** 0.9
    taus = 2.6 / (1 + 0.22 * n)
    t = t_of(seconds)
    pick = filt(noise(seconds), 'hp', 1500) * np.exp(-t / 0.002) * 0.15
    x = partials(261.63, seconds, amps, taus, stretch=0.00008, cents=-1.5)
    x += partials(261.63, seconds, amps, taus, stretch=0.00008, cents=1.5)
    return attack(filt(x / 2 + pick, 'lp', 5000, 2), 0.002)


def pad(seconds):
    """Three soft sawtooth waves at C4, a few cents apart, through a low-pass filter, swelling in."""
    n = np.arange(1, 41)
    amps = 1 / n
    taus = np.full(len(n), 60.0)
    x = sum(partials(261.63, seconds, amps, taus, cents=c) for c in (-8, 0, 7)) / 3
    t = t_of(seconds)
    swell = np.minimum(1.0, t / 0.35) ** 2
    return drive(filt(x, 'lp', 1300, 2) * 3, 1.6) * swell


def kalimba(seconds):
    """A metal tine at C5: the note, a quiet octave, and the tine's own high overtones, which die fast."""
    t = t_of(seconds)
    wow = 2 ** (4 / 1200 * np.sin(2 * np.pi * 0.5 * t))
    phase = 2 * np.pi * np.cumsum(523.25 * wow) / SR
    x = (np.sin(phase) * np.exp(-t / 1.0)
         + 0.08 * np.sin(2 * phase) * np.exp(-t / 0.5)
         + 0.25 * np.sin(6.0 * phase) * np.exp(-t / 0.12)
         + 0.08 * np.sin(17.5 * phase) * np.exp(-t / 0.03))
    tick = filt(noise(seconds), 'hp', 4000) * np.exp(-t / 0.0015) * 0.2
    return attack(filt(drive(x + tick, 1.3), 'lp', 7000, 2), 0.001)


# id, folder, role, label, root note, loudness above 150 Hz to match (dB RMS), over how many seconds, fade, sound.
# The loudness targets were measured from the sounds each one replaces, so the app's mix holds.
SOUNDS = [
    ('kick', '', 'kick', 'Punchy', None, -25.7, 0.3, 0.05, lambda: kick(88, 230, 0.022, 0.13, 0.5, 2.2, 0.40)),
    ('snare', '', 'snare', 'Dusty', None, -25.5, 0.3, 0.06,
     lambda: filt(snare((185, 330), 0.05, 0.11, (900, 6000), 0.45, 1.6, 0.38), 'lp', 5500, 2)),
    ('hat', '', 'hat', 'Tight', None, -28.1, 0.3, 0.03, lambda: hat(0.028, 3000, 6500, 0.5, 0.30)),
    ('kick-round', 'school', 'kick', 'Round', None, -21.3, 0.3, 0.04, lambda: kick(85, 170, 0.03, 0.16, 0.25, 2.0, 0.45)),
    ('kick-deep', 'school', 'kick', 'Deep', None, -16.9, 0.3, 0.04, lambda: kick(90, 260, 0.04, 0.20, 0.35, 3.0, 0.45)),
    ('snare-snap', 'school', 'snare', 'Snap', None, -16.7, 0.3, 0.04,
     lambda: snare((220, 400), 0.035, 0.08, (1500, 11000), 0.35, 4.0, 0.30)),
    ('snare-rim', 'school', 'snare', 'Rim', None, -18.0, 0.3, 0.03, lambda: rim(0.17)),
    ('hat-bright', 'school', 'hat', 'Bright', None, -25.5, 0.3, 0.03, lambda: hat(0.022, 3500, 8000, 0.6, 0.25)),
    ('hat-shaker', 'school', 'hat', 'Shaker', None, -19.8, 0.3, 0.03, lambda: shaker(0.20)),
    ('bass', 'school', 'bass', 'Bass guitar', 36, -21.9, 1.0, 0.25, lambda: bass(3.0)),
    ('keys', 'school', 'keys', 'Guitar', 60, -13.1, 1.0, 0.5, lambda: guitar(3.2)),
    ('pad', 'school', 'pad', 'Pad', 60, -11.9, 1.0, 0.8, lambda: pad(4.5)),
    ('kalimba', 'school', 'lead', 'Kalimba', 72, -15.3, 1.0, 0.3, lambda: kalimba(2.4)),
]


# Measuring

def db(x):
    return 20 * np.log10(max(x, 1e-12))


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)))


def loudness(x, seconds):
    return db(rms(filt(x, 'hp', 150)[: int(seconds * SR)]))


def spectrum(x):
    mag = np.abs(np.fft.rfft(x)) ** 2
    return np.fft.rfftfreq(len(x), 1 / SR), mag


def below(x, hz):
    """The share of the sound's energy below hz, in dB."""
    f, mag = spectrum(x)
    return 10 * np.log10(max(mag[f < hz].sum(), 1e-30) / mag.sum())


def centroid(x):
    f, mag = spectrum(x)
    return float((f * mag).sum() / mag.sum())


def lowest_peak(x):
    """The lowest strong frequency: the first spectral peak within 20 dB of the loudest."""
    f, mag = spectrum(x)
    keep = f >= 20
    f, mag = f[keep], mag[keep]
    strong = mag >= mag.max() / 100
    return float(f[np.argmax(strong)])


def main():
    manifest = {'floorHz': FLOOR_HZ, 'minFundamentalHz': 55.0, 'sounds': {}}
    rows = []
    for sid, folder, role, label, root, target, window, fade, make in SOUNDS:
        x = make()
        x = fade_out(filt(x, 'hp', FLOOR_HZ), fade)
        x *= 10 ** ((target - loudness(x, window)) / 20)
        capped = db(np.abs(x).max()) > PEAK_DBFS
        if capped:
            x *= 10 ** (PEAK_DBFS / 20) / np.abs(x).max()
        floor = below(x, FLOOR_HZ)
        if floor > FLOOR_LIMIT_DB:
            raise SystemExit(f'{sid}: {floor:.1f} dB of its energy is below {FLOOR_HZ:.0f} Hz (limit {FLOOR_LIMIT_DB} dB)')

        out = AUDIO / folder / f'{sid}.wav'
        out.parent.mkdir(parents=True, exist_ok=True)
        wavfile.write(out, SR, np.round(x * 32767).astype(np.int16))

        if folder:
            entry = {'role': role, 'label': label, 'file': f'{sid}.wav', 'source': 'scripts/samples/synth.py',
                     'seconds': round(len(x) / SR, 2)}
            if root is not None:
                entry['root'] = root
            manifest['sounds'][sid] = entry
        rows.append((sid, label, root, lowest_peak(x), floor, centroid(x), db(np.abs(x).max()),
                     loudness(x, window), target, capped, len(x) / SR))
        print(f'{sid:11} lowest {lowest_peak(x):6.1f} Hz  below {FLOOR_HZ:.0f} Hz {floor:6.1f} dB  '
              f'peak {db(np.abs(x).max()):5.1f}  loud {loudness(x, window):6.1f} (target {target}){"  CAPPED" if capped else ""}')

    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    write_report(rows)


def write_report(rows):
    names = {36: 'C2', 60: 'C4', 72: 'C5'}
    lines = [
        '# Sounds',
        '',
        'Made by `scripts/samples/synth.py`. Do not edit by hand.',
        '',
        'Every sound in this repository is synthesized, so none of them is a recording. Nothing sounds below '
        f'{FLOOR_HZ:.0f} Hz, because laptop speakers crackle below that. The bass is recorded at C2 without its '
        'fundamental, and the ear hears the note from its harmonics.',
        '',
        'Lowest is the lowest strong frequency in the file. Below 80 Hz is the share of the energy below 80 Hz. '
        'Loudness is measured above 150 Hz, as a laptop speaker plays it, and matches the sound each one replaced.',
        '',
        '| Sound | Name | Root | Lowest | Below 80 Hz | Centroid | Peak | Loudness | Length |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ]
    for sid, label, root, low, floor, cent, peak, loud, target, capped, seconds in rows:
        lines.append(f'| `{sid}` | {label} | {names.get(root, "-")} | {low:.0f} Hz | {floor:.0f} dB | {cent:.0f} Hz | '
                     f'{peak:.1f} dBFS | {loud:.1f} dB{" (capped)" if capped else ""} | {seconds:.2f} s |')
    REPORT.write_text('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
