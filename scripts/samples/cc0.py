#!/usr/bin/env python3
# Copyright (C) 2026 Tonestruments AB
# SPDX-License-Identifier: GPL-3.0-only

"""
Makes Nadilo's sounds from recordings of real instruments, all from free sample libraries released under CC0 (public
domain), so they can sit in this repository and anyone can build the app with them.

    NADILO_CC0_DIR=/path/to/the/libraries python3 scripts/samples/cc0.py

The folder needs five libraries, unzipped as they come. All are CC0. The first four are by Karoryfer Samples; the
last is by Versilian Studios (https://github.com/sgossner/VCSL).

  Virtuosity_Drums_v0.925/     Virtuosity Drums
  Swirly.Drums_1104/           Swirly Drums
  Big_Little_Bass_1000/        Big Little Bass
  Osiris_Piano_0925/           Osiris Piano
  VCSL-1.2.2-RC/               Versilian Community Sample Library

It writes:

  src/assets/audio/{kick,snare,hat}.wav    the kit (the ear game's, and School's), and three more takes of each
  src/assets/audio/school/<id>.wav         School's other sounds
  src/audio/samples.json                   what the app needs: file, role, root note, takes
  docs/SOUNDS.md                           where each sound comes from, and the measurements

Each sound is cut to its hit (1 ms before the attack, to where it has died away, faded so nothing clicks), tuned to
the nearest note, and held to the speaker rules of the sounds before it:
  - Nothing sounds below 80 Hz, because small laptop drivers crackle down there. Every sound goes through the gentlest
    high-pass that leaves at most FLOOR_LIMIT_DB of its energy below 80 Hz, and kicks are tuned up to settle near
    88 Hz.
  - Each sound is as loud as the one it replaces, measured above 150 Hz (what a laptop speaker plays), so the app's
    mix (VOICE_DB in src/audio/samples.ts) still holds. Peaks never go above -3 dBFS: a look-ahead limiter turns down
    the first milliseconds of a hit if it must, by at most 6 dB.
  - A drum has four takes, recorded one after the other, processed with the first take's settings, so a softer take
    stays softer. The app plays them in turn, never the same one twice running, so a beat does not sound like a
    machine.

Requires python3 with numpy and scipy, and ffmpeg (the libraries are FLAC and WAV).
"""
import json
import math
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
FLOOR_HZ = 80.0
FLOOR_LIMIT_DB = -30.0
PEAK_DBFS = -3.0
MAX_LIMIT_DB = 6.0
KICK_SETTLE_HZ = 88.0

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / 'src/assets/audio'
MANIFEST = ROOT / 'src/audio/samples.json'
REPORT = ROOT / 'docs/SOUNDS.md'

# Each role: how long a hit may last, its fade, the note pitched sounds are tuned to, and how loud (dB above 150 Hz,
# over `window` seconds) the sound it replaces was.
ROLES = {
    'kick': dict(max_len=0.45, fade=0.04, target=-25.7, window=0.3),
    'snare': dict(max_len=0.40, fade=0.04, target=-25.5, window=0.3),
    'hat': dict(max_len=0.25, fade=0.03, target=-28.1, window=0.3),
    'bass': dict(max_len=3.0, fade=0.25, root=36, target=-21.9, window=1.0),
    'keys': dict(max_len=3.2, fade=0.5, root=60, target=-13.1, window=1.0),
    'pad': dict(max_len=4.5, fade=0.8, root=60, target=-11.9, window=1.0),
    'lead': dict(max_len=2.4, fade=0.3, root=72, target=-15.3, window=1.0),
}
# Strings and pipes: their partials are whole multiples of the note, so the median of the first four is its pitch.
HARMONIC = {'bass', 'keys', 'pad'}


def library():
    d = os.environ.get('NADILO_CC0_DIR')
    if not d or not Path(d).is_dir():
        sys.exit('Set NADILO_CC0_DIR to the folder that holds the CC0 libraries (see the top of this file).')
    return Path(d)


def sounds(lib):
    """id, folder, role, label, pack, takes (each a list of files mixed as they are: the mics of one hit)."""
    v = lib / 'Virtuosity_Drums_v0.925/Samples'
    vcsl = lib / 'VCSL-1.2.2-RC'
    swirly = lib / 'Swirly.Drums_1104/Samples'

    def vk(mic, inst, rest):
        return v / mic / inst / f'{mic}_{inst}_{rest}.flac'

    def kit(inst, rest):
        """Virtuosity's basic kit: the kick mic, the snare mic and the overheads, together."""
        return [vk(m, inst, rest) for m in ('kickmic', 'snaremic', 'oh')]

    def osiris(note, vl):
        return [lib / f'Osiris_Piano_0925/Osiris Piano/UC/{m}/Piano_UC_Mic{m}_{note}_vl{vl}.flac' for m in 'ABC']

    four = range(1, 5)
    return [
        # The kit: kick, snare and hi-hat, four takes each. The first lane option of each, everywhere in the app.
        ('kick', '', 'kick', 'Kit kick', 'Virtuosity Drums', [kit('kick', f'snoff_vl3_rr{i}') for i in four]),
        ('snare', '', 'snare', 'Muted snare', 'Virtuosity Drums', [kit('snare', f'muted_vl{n}') for n in (12, 11, 13, 10)]),
        ('hat', '', 'hat', 'Closed hi-hat', 'Virtuosity Drums', [[vk('mid', 'hh', f'closed_vl3_rr{i}')] for i in four]),
        # The other lane options, kept for the sound drawer.
        ('kick-round', 'school', 'kick', 'Middle mic', 'Virtuosity Drums', [[vk('mid', 'kick', 'snoff_vl3_rr1')]]),
        ('kick-deep', 'school', 'kick', 'Harder', 'Virtuosity Drums', [kit('kick', 'snoff_vl4_rr1')]),
        ('snare-snap', 'school', 'snare', 'Open', 'Virtuosity Drums', [kit('snare', 'center_vl26')]),
        ('snare-rim', 'school', 'snare', 'Cross-stick', 'Virtuosity Drums', [kit('snare', 'crossstick_vl12')]),
        ('hat-bright', 'school', 'hat', 'Bright', 'Swirly Drums', [[swirly / 'hat_closed/hh_closed_vl8_rr1.wav']]),
        ('hat-shaker', 'school', 'hat', 'Shaker', 'Virtuosity Drums', [[v / 'perc/mid/shaker/LShaker_Shake1D_rr1_Mid.wav']]),
        # School's pitched sounds.
        ('bass', 'school', 'bass', 'Bass guitar', 'Big Little Bass',
         [[lib / 'Big_Little_Bass_1000/Samples/big_little_pluck_c3_p_rr1.wav']]),
        ('keys', 'school', 'keys', 'Piano', 'Osiris Piano', [osiris('C3', 2)]),
        ('pad', 'school', 'pad', 'Quiet organ', 'VCSL',
         [[vcsl / 'Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet/NT5_Man3Quiet_C3_rr1.wav']]),
        ('kalimba', 'school', 'lead', 'Vibraphone', 'VCSL',
         [[vcsl / 'Idiophones/Struck Idiophones/Vibraphone/Soft Mallets/Vibes_soft_D4_v2_rr1_Main.wav']]),
    ]


# ── reading and measuring ──

def decode(path):
    """Float32 stereo samples at 44.1 kHz, shape (frames, 2). A mono file is the same on both sides."""
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels',
                            '-of', 'csv=p=0', str(path)], capture_output=True, text=True, check=True)
    ch = min(2, int(probe.stdout.strip() or 1))
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()
    return x if ch == 2 else np.repeat(x, 2, axis=1)


def source(paths):
    xs = [decode(p) for p in paths]
    out = np.zeros((max(len(x) for x in xs), 2), np.float32)
    for x in xs:
        out[:len(x)] += x
    return out


def filt(x, kind, hz, order=4):
    sos = butter(order, hz, kind, fs=SR, output='sos')
    return np.stack([sosfilt(sos, x[:, c]) for c in range(2)], axis=1).astype(np.float32)


def db(v):
    return 20 * math.log10(max(v, 1e-12))


def loud150(x, seconds):
    """Loudness as a laptop speaker plays it: RMS above 150 Hz over the first `seconds`, in dB."""
    y = filt(x, 'hp', 150).mean(axis=1)[: int(seconds * SR)]
    return db(float(np.sqrt(np.mean(y ** 2))))


def spectrum(x):
    mono = x.mean(axis=1)
    return np.fft.rfftfreq(len(mono), 1 / SR), np.abs(np.fft.rfft(mono)) ** 2


def below(x, hz):
    """The share of the sound's energy below `hz`, in dB."""
    f, mag = spectrum(x)
    return 10 * math.log10(max(mag[f < hz].sum(), 1e-30) / mag.sum())


def centroid(x):
    f, mag = spectrum(x)
    return float((f * mag).sum() / mag.sum())


def lowest_peak(x):
    """The lowest strong frequency: the first part of the spectrum within 20 dB of its loudest."""
    f, mag = spectrum(x)
    keep = f >= 20
    f, mag = f[keep], mag[keep]
    return float(f[np.argmax(mag >= mag.max() / 100)])


def precise_f0(x, near=None):
    """The fundamental, between FFT bins: the lowest strong peak of the sustain, or the strongest near `near`."""
    mono = x.mean(axis=1)
    start = int(np.argmax(np.abs(mono) > 0.003 * np.abs(mono).max()))
    seg = mono[start + int(0.08 * SR):start + int(0.7 * SR)]
    n = 1 << 19
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n))
    f = np.fft.rfftfreq(n, 1 / SR)
    if near:
        band = (f > near / 2 ** (1.5 / 12)) & (f < near * 2 ** (1.5 / 12))
        i = np.nonzero(band)[0][np.argmax(spec[band])]
    else:
        idx = np.nonzero((f >= 30) & (f <= 2500))[0]
        thr = 0.1 * spec[idx].max()
        i = next(j for j in idx[1:-1] if spec[j] >= thr and spec[j] >= spec[j - 1] and spec[j] >= spec[j + 1])
    a, b, c = np.log(spec[i - 1:i + 2] + 1e-20)
    return float(f[i] + 0.5 * (a - c) / (a - 2 * b + c) * (f[1] - f[0]))


def kick_hz(x):
    """A kick's settling pitch: the strongest partial between 30 and 150 Hz over its first second."""
    mono = x.mean(axis=1)[:SR]
    n = 1 << 19
    spec = np.abs(np.fft.rfft(mono * np.hanning(len(mono)), n))
    f = np.fft.rfftfreq(n, 1 / SR)
    band = (f >= 30) & (f <= 150)
    return float(f[band][np.argmax(spec[band])])


# ── shaping ──

def transpose(x, semitones):
    ratio = 2 ** (semitones / 12)
    src = np.arange(int(len(x) / ratio)) * ratio
    return np.stack([np.interp(src, np.arange(len(x)), x[:, c]) for c in range(2)], axis=1).astype(np.float32)


def fade(x, seconds):
    nf = min(len(x), int(seconds * SR))
    x[-nf:] *= np.linspace(1, 0, nf, dtype=np.float32)[:, None] ** 2
    return x


def cut(x, max_len, fade_s, floor_db=-60.0):
    """From 1 ms before the attack to where the sound has died to `floor_db` under its peak, at most `max_len`."""
    m = np.abs(x).max(axis=1)
    start = int(np.argmax(m > 10 ** (-50 / 20) * m.max()))
    x = x[max(0, start - int(0.001 * SR)):]
    n = int(0.01 * SR)
    k = len(x) // n
    env = 10 * np.log10(np.mean(x.mean(axis=1)[:k * n].reshape(k, n) ** 2, axis=1) + 1e-14)
    above = np.nonzero(env > env.max() + floor_db)[0]
    end = (above[-1] + 1) * n if len(above) else len(x)
    return fade(x[:min(end, int(max_len * SR))].copy(), fade_s)


def limit(x, ceiling_db, max_db, look=0.0015, release=0.06):
    """A look-ahead peak limiter: turns down only the first milliseconds of a hit, by at most `max_db`."""
    ceiling = 10 ** (ceiling_db / 20)
    need = np.maximum(np.minimum(1.0, ceiling / np.maximum(np.abs(x).max(axis=1), 1e-12)), 10 ** (-max_db / 20))
    la = int(look * SR)
    win = np.minimum.reduce([np.roll(need, -k) for k in range(la + 1)])
    a = math.exp(-1 / (release * SR))
    g = np.ones(len(x))
    cur = 1.0
    for i in range(len(x)):
        cur = win[i] if win[i] < cur else win[i] + (cur - win[i]) * a
        g[i] = cur
    y = x * g[:, None].astype(np.float32)
    over = np.abs(y).max()
    if over > ceiling:
        y = y * (ceiling / over)
    return y.astype(np.float32), -db(min(g.min(), ceiling / max(over, ceiling)))


def process(sid, role, x, fixed=None):
    """One take through the whole chain. The first take decides the tuning, the high-pass and the gain; the others
    reuse them (`fixed`), so their natural differences stay."""
    r = ROLES[role]
    first = fixed is None
    fixed = fixed or {}
    if 'root' in r:
        if first:
            m = 69 + 12 * math.log2(precise_f0(x) / 440)
            while m < r['root'] - 9:  # the lowest strong peak can be a low resonance
                m += 12
            hz = precise_f0(x, near=440 * 2 ** ((m - 69) / 12))
            if role in HARMONIC:  # even where the fundamental itself is faint
                hz = float(np.median([precise_f0(x, near=k * hz) / k for k in (1, 2, 3, 4)]))
            m = 69 + 12 * math.log2(hz / 440)
            fixed['root'] = int(round(m))
            fixed['shift'] = fixed['root'] - m
        if abs(fixed['shift']) > 0.03:
            x = transpose(x, fixed['shift'])
    x = cut(x, r['max_len'], r['fade'])
    if role == 'kick':
        if first:
            fixed['up'] = max(0, math.ceil(12 * math.log2(KICK_SETTLE_HZ / kick_hz(x))))
        if fixed['up']:
            x = transpose(x, fixed['up'])
    if first:
        # The gentlest high-pass that leaves at most FLOOR_LIMIT_DB of the energy below 80 Hz.
        for hz in range(int(FLOOR_HZ), 161, 5):
            order = next((o for o in (4, 8) if below(fade(filt(x, 'hp', hz, o), r['fade']), FLOOR_HZ) <= FLOOR_LIMIT_DB), None)
            if order:
                break
        else:
            sys.exit(f'{sid}: keeps more than {FLOOR_LIMIT_DB} dB of its energy below {FLOOR_HZ:.0f} Hz')
        fixed.update(hp=hz, order=order)
    x = fade(filt(x, 'hp', fixed['hp'], fixed['order']), r['fade'])
    if first:
        fixed['gain'] = r['target'] - loud150(x, r['window'])
    x = (x * 10 ** (fixed['gain'] / 20)).astype(np.float32)
    limited = 0.0
    if db(np.abs(x).max()) > PEAK_DBFS:
        x, limited = limit(x, PEAK_DBFS, MAX_LIMIT_DB)
    fixed['limited'] = max(fixed.get('limited', 0.0), limited)
    return x, fixed


def write(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(path, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))


def main():
    lib = library()
    manifest = {'floorHz': FLOOR_HZ, 'minFundamentalHz': 55.0, 'sounds': {}}
    rows = []
    for sid, folder, role, label, pack, takes in sounds(lib):
        missing = [p for t in takes for p in t if not Path(p).exists()]
        if missing:
            sys.exit(f'{sid}: missing {missing[0]}')
        x, fixed = process(sid, role, source(takes[0]))
        write(AUDIO / folder / f'{sid}.wav', x)
        others = []
        for i, t in enumerate(takes[1:], start=2):
            y, _ = process(sid, role, source(t), fixed)
            write(AUDIO / folder / f'{sid}-{i}.wav', y)
            others.append(f'{sid}-{i}.wav')
        floor = below(x, FLOOR_HZ)
        if folder:
            entry = {'role': role, 'label': label, 'file': f'{sid}.wav', 'source': pack, 'seconds': round(len(x) / SR, 2)}
            if 'root' in fixed:
                entry['root'] = fixed['root']
            manifest['sounds'][sid] = entry
        rows.append(dict(sid=sid, label=label, pack=pack, takes=len(takes), root=fixed.get('root'), low=lowest_peak(x),
                         floor=floor, cent=centroid(x), peak=db(np.abs(x).max()), loud=loud150(x, ROLES[role]['window']),
                         limited=fixed['limited'], seconds=len(x) / SR, files=[str(Path(p).relative_to(lib)) for p in takes[0]]))
        print(f"{sid:11} {label:14} takes {len(takes)}  lowest {rows[-1]['low']:6.1f} Hz  below 80 Hz {floor:6.1f} dB  "
              f"peak {rows[-1]['peak']:5.1f}  loud {rows[-1]['loud']:6.1f}  limited {fixed['limited']:.1f} dB")
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    report(rows)


NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def report(rows):
    note = lambda m: '-' if m is None else f'{NAMES[m % 12]}{m // 12 - 1}'  # noqa: E731
    lines = [
        '# Sounds',
        '',
        'The script `scripts/samples/cc0.py` writes this file, so don\'t edit it by hand.',
        '',
        'Every sound is a recording of a real instrument from a free sample library released under CC0, which is how '
        'Creative Commons places a work in the public domain. Anyone may use, change and share the sounds for any '
        'purpose, without asking and without giving credit, but we name the libraries anyway, with thanks.',
        '',
        '- Virtuosity Drums and Swirly Drums, by Karoryfer Samples',
        '- Big Little Bass, by Karoryfer Samples',
        '- Osiris Piano, by Karoryfer Samples',
        '- [Versilian Community Sample Library](https://github.com/sgossner/VCSL) (VCSL), by Versilian Studios',
        '',
        f'Nothing sounds below {FLOOR_HZ:.0f} Hz, because laptop speakers crackle below that frequency. Each sound is as '
        'loud above 150 Hz, the way a laptop speaker plays it, as the sound it replaced. A drum with four takes plays '
        'them one after another, never the same take twice in a row.',
        '',
        'The columns of the table are described below.',
        '',
        '- Root is the note a pitched sound was recorded at, and Lowest is the lowest strong frequency in the file.',
        '- Below 80 Hz is the share of the energy below 80 Hz, and Centroid is the average frequency weighted by '
        'energy, so a higher centroid sounds brighter.',
        '- Peak is the loudest point, in decibels below the digital maximum (dBFS), and Loudness is measured above '
        '150 Hz.',
        '',
        '| Sound | Name | Library | Takes | Root | Lowest | Below 80 Hz | Centroid | Peak | Loudness | Length |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ]
    for r in rows:
        lines.append(f"| `{r['sid']}` | {r['label']} | {r['pack']} | {r['takes']} | {note(r['root'])} | {r['low']:.0f} Hz | "
                     f"{r['floor']:.0f} dB | {r['cent']:.0f} Hz | {r['peak']:.1f} dBFS | {r['loud']:.1f} dB | {r['seconds']:.2f} s |")
    lines += ['', '## Source files', '', 'Each sound was made from the files below, which are in its library. For a drum with four takes, the list shows the first take:', '']
    for r in rows:
        lines.append(f"- `{r['sid']}`: " + ', '.join(f'`{f}`' for f in r['files']))
    REPORT.write_text('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
