# Nadilo

Nadilo is a Mac app that teaches you how a song is made by letting you rebuild one. You don't need an instrument or
any music theory. You start by tapping four pads to make a beat, and level by level you add a snare, hi-hats, a bass
line, chords and a tune, until you have arranged a whole song and know how every part of it works.

If you want the longer story of why we are building it, read [what we are trying to do](docs/VISION.md).

## Try it on your Mac

There is no download yet, because we are still figuring out how to build, sign and ship the releases. Until then,
you can build the app yourself with the steps under For developers.

Nadilo runs on macOS 11 (Big Sur) or later, on Apple silicon and Intel Macs. It needs Safari 16.2 or later, which
every Mac on macOS 11 or later can get from Software Update. Turn your sound up when you play, because Nadilo is made
for laptop speakers, and headphones let you hear more of the bass.

## What's inside

Nadilo School is the main journey. It plays you a short song, and then you rebuild it one part and one bar at a time
while the rest of the song keeps playing. You can switch between The song and Yours (the song with your notes in it)
at any time, hear either of them Up close (your part with the part it plays with), loop one bar, or slow it down.
Stars show how close you came to the song, and you never need all three to move on.

| World | What you rebuild | What you learn |
| --- | --- | --- |
| Pulse | The drums | The beat, the bar, copying a bar, the backbeat, hi-hats and a fill |
| The Floor | The bass line | Notes that last, and a bass that follows the chords |
| Color | The chords | How a chord sets the mood of a bar |
| Voice | The tune | A tune, a motif that comes back, and an ending that lands home |
| Story | The whole song | Intro, verse, break, chorus and outro, and which parts play in each |

After Pulse, Color and Voice, a Make it yours level lets you change the part you rebuilt and keep the change. Once
you have kept one, Home offers one small change to your song each day.

Ear training is a second set of 13 levels on Home. You hear a hidden beat and rebuild it by ear, with a coach that
gives you a hint when you ask for one.

The app keeps its words short on purpose, and the [guide](docs/school.md) explains every level. Space plays and
stops, the left and right arrows move between bars, and Command-Z undoes.

## Your progress stays on your Mac

There is no account and no sign-up. Nadilo saves your song and your progress as you go, in
`~/Library/Application Support/se.tonestruments.nadilo/progress.json`, and updating or reinstalling the app never
changes that file.

## Sounds

Every sound in this repository is synthesized by `scripts/samples/synth.py`, so the repository holds no recordings
and anyone can build the app. Nothing sounds below 80 Hz, because laptop speakers crackle below that. The
measurements are in [docs/SOUNDS.md](docs/SOUNDS.md).

The DMGs that Tonestruments released up to version 0.4.3 used sounds from Cymatics sample packs, which are licensed
to Tonestruments. We thank Cymatics for letting us ship them inside the app. Those sounds are not part of this
repository, and the GPL doesn't cover them.

## For developers

Nadilo is a React and TypeScript app in a [Tauri](https://tauri.app) shell. The music runs on Tone.js and the Web
Audio API, and the app's logic lives in one XState state machine.

You need Node.js 22, and Rust with the `aarch64-apple-darwin` and `x86_64-apple-darwin` targets to build the Mac app.
To make the sounds again, you need Python 3 with numpy and scipy.

| Command | What it does |
| --- | --- |
| `npm install` | Installs everything |
| `npm run dev` | Runs the app in your browser at http://localhost:1420 |
| `npm run app:dev` | Runs it as a desktop app, with live reload |
| `npm run app:build` | Builds the Mac app and the DMG in `src-tauri/target/universal-apple-darwin/release/bundle/` |
| `npm test` | Runs the unit tests |
| `npm run e2e` | Runs the end-to-end tests in Chromium and WebKit, without any sound |
| `npm run e2e:audio` | Runs the tests that play real sound, so only run them where sound is OK |
| `python3 scripts/samples/synth.py` | Makes the sounds again and measures them |

If you add `?fake-audio` to the address (http://localhost:1420/?fake-audio), the app runs without any sound.

| Folder | What's there |
| --- | --- |
| `src/school/` | Nadilo School: the song, the levels made from it, the rules, and what plays |
| `src/components/school/` | The screens of School, styled by `src/styles/school.css` |
| `src/game/` | The ear-training game |
| `src/machine/` | The state machine that runs the app, and saving progress |
| `src/audio/` | The audio engine, the sounds and the mix |
| `docs/` | The guide, the vision, the design and the sound measurements |
| `tests/` | Unit tests, end-to-end tests, and audio tests that render sound offline and measure it |

`CLAUDE.md` lists the detailed rules the app follows, e.g., that nothing on screen moves between levels and that
Stop never clicks. Read it before you change how the app looks or sounds.

## Contributing

Issues, bug reports and ideas are welcome. We don't take code pull requests yet, because we want to keep the option
to offer Nadilo under other terms later, and that needs the copyright of all the code to stay with Tonestruments.

The changes in each version are in [CHANGELOG.md](CHANGELOG.md).

## Licence

Copyright (C) 2026 Tonestruments AB. Nadilo is written by Harshdeep Parmar.

Nadilo is free software. You can share it and change it under the terms of the GNU General Public License, version 3,
in [LICENSE](LICENSE). If you share a changed version, you have to share its source code under the same licence.

The GPL covers the code and the synthesized sounds. It doesn't cover the name Nadilo or the Nadilo logo, which belong
to Tonestruments AB, so a changed version needs its own name and logo.
