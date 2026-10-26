# Nadilo

Nadilo is a Mac app that teaches you how a song is made by letting you rebuild one, and you don't need an instrument
or any music theory to play it. You start by tapping four pads to make a beat. Level by level, you then add a snare,
hi-hats, a bass line, chords and a tune, until you have arranged the whole song.

## Try it on your Mac

You can download the DMG from [Releases](https://github.com/tonestruments/nadilo/releases). The releases are test
versions for now, because the app isn't signed with an Apple Developer ID yet. The first time you open it, macOS says
that it can't check the app for malware. To open it anyway, go to System Settings, then Privacy & Security, and click
Open Anyway next to the message about Nadilo Desktop. You can also build the app yourself with the steps under For
developers.

Nadilo runs on macOS 11 (Big Sur) or later, on Apple silicon and Intel Macs. It needs Safari 16.2 or later, which
every Mac on macOS 11 or later can get from Software Update. Nadilo is made for laptop speakers, so turn your sound up
when you play. With headphones, you can hear more of the bass.

## What's in the app

Nadilo School is the main part of the app. It plays you a short song, and then you rebuild the song one part and one
bar at a time, while the rest of the song keeps playing. At any time, you can switch between The song and Yours, which
is the song with your notes in it. You can also hear either of them Up close, which plays your part with the part it
plays with, or Solo, which plays your part on its own. Or you can loop one bar, or slow the song down. Stars show how
close you came to the song, and you never need all three stars to move on.

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

The app keeps its words short on purpose. Space plays and stops the song, and the left and right arrows move between
bars. Command-Z undoes your last change.

## Your progress stays on your Mac

There is no account and no sign-up. Nadilo saves your song and your progress as you go, in
`~/Library/Application Support/se.tonestruments.nadilo/progress.json`. Updating or reinstalling the app never changes
the file.

## Sounds

Every sound is a recording of a real instrument, from free sample libraries that are in the public domain (CC0):
Virtuosity Drums, Swirly Drums, Big Little Bass and Osiris Piano by Karoryfer Samples, and the Versilian Community
Sample Library by Versilian Studios. We thank both of them. `scripts/samples/cc0.py` cuts and tunes the recordings
for the app. Nothing sounds below 80 Hz, because laptop speakers crackle below 80 Hz. Each drum has four takes that
take turns, so a beat doesn't sound like the same recording played again and again.

The DMGs that Tonestruments released up to version 0.4.3 used sounds from Cymatics sample packs, which are licensed
to Tonestruments. We thank Cymatics for letting us ship them inside the app. The Cymatics sounds are not part of
this repository, and the GPL doesn't cover them.

## For developers

Nadilo is a React and TypeScript app in a [Tauri](https://tauri.app) shell. The music runs on Tone.js and the Web
Audio API, and the app's logic lives in one XState state machine.

You need Node.js 22, and Rust with the `aarch64-apple-darwin` and `x86_64-apple-darwin` targets to build the Mac app.
To make the sounds again, you need Python 3 with numpy and scipy, ffmpeg, and the five sound libraries.

| Command | What it does |
| --- | --- |
| `npm install` | Installs everything |
| `npm run dev` | Runs the app in your browser at http://localhost:1420 |
| `npm run app:dev` | Runs it as a desktop app, with live reload |
| `npm run app:build` | Builds the Mac app and the DMG in `src-tauri/target/universal-apple-darwin/release/bundle/` |
| `npm test` | Runs the unit tests |
| `npm run e2e` | Runs the end-to-end tests in Chromium and WebKit, without any sound |
| `npm run e2e:audio` | Runs the tests that play real sound, so only run them where sound is OK |
| `NADILO_CC0_DIR=<folder> python3 scripts/samples/cc0.py` | Makes the sounds again from the libraries in `<folder>`, and measures them |

If you add `?fake-audio` to the address (http://localhost:1420/?fake-audio), the app runs without any sound.

| Folder | What's there |
| --- | --- |
| `src/school/` | Nadilo School: the song, the levels made from it, the rules, and what plays |
| `src/components/school/` | The screens of School, styled by `src/styles/school.css` |
| `src/game/` | The ear-training game |
| `src/machine/` | The state machine that runs the app, and saving progress |
| `src/audio/` | The audio engine, the sounds and the mix |
| `tests/` | Unit tests, end-to-end tests, and audio tests that render sound offline and measure it |

`CLAUDE.md` lists the detailed rules the app follows, e.g., that nothing on screen moves between levels and that
Stop never clicks. Read it before you change how the app looks or sounds.

## Contributing

Issues, bug reports and ideas are welcome. We don't take code pull requests yet, because Tonestruments AB wants to
keep the option to offer Nadilo under other terms later. To do that, Tonestruments AB has to hold the copyright of all
the code.

The changes in each version are in [CHANGELOG.md](CHANGELOG.md).

## Licence

Nadilo is the work of Tonestruments AB, and Harshdeep Parmar writes it. Copyright (C) 2026 Tonestruments AB.

Nadilo is free software. You can share it and change it under the terms of the GNU General Public License, version 3
only, which is in [LICENSE](LICENSE). If you share a changed version, you have to share its source code under the same
licence. Each source file starts with the copyright line and the licence's short name, `GPL-3.0-only`.

The GPL covers the code. The sounds are in the public domain (CC0), so you can use them however you like. Neither the
GPL nor CC0 covers the name Nadilo or the Nadilo logo, which belong to Tonestruments AB. If you share a changed
version, give it its own name and logo.
