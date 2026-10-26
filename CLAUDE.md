# Nadilo

Nadilo teaches you to make a song by making one. **Nadilo School** (the main journey): hear a song, then rebuild it,
part by part and bar by bar, in five worlds (Pulse, The Floor, Color, Voice, Story); below it on Home sit the 13
**ear-training** levels (rebuild a hidden beat by ear) from the first Build Day version.
React + Vite + TypeScript in a Tauri 2 shell, for macOS only: one universal build that runs on Intel and Apple Silicon.
`.github/workflows/build.yml` builds just that (a `v*` tag runs it on a macOS runner).

There is no backend, no accounts, no sign-up. Progress lives in a file on the Mac,
`~/Library/Application Support/se.tonestruments.nadilo/progress.json` (the `load_progress` / `save_progress`
Tauri commands), with a copy in `localStorage`, which is the only store in a browser. It sits outside the app, so
reinstalling or updating never touches it, and the dev build shares it. On start-up the two copies are merged so no
solved level is ever lost (`mergeProgress` in `src/machine/persist.ts`).

## Commands

- `npm run e2e`: Playwright tests in Chromium + WebKit (WebKit is what the Mac app runs). **Silent**: UI tests
  load the app with `?fake-audio`, and the timing tests render offline into memory
- `npm run e2e:audio`: the tests tagged `@audio`, which use the real engine and play sound. Run these only
  when sound is OK (never in a public space), and on an idle machine
- `NADILO_CC0_DIR=… python3 scripts/samples/cc0.py`: makes every sound again from the CC0 libraries and measures it
  (see Audio)

The product name is **Nadilo Desktop** (window title, `.app`, Welcome screen). The bundle identifier stays
`se.tonestruments.nadilo`, so saved progress carries over.

The app is not signed with a Developer ID yet: it is ad-hoc signed (`signingIdentity: "-"` in `tauri.conf.json`), so
it runs on Apple silicon and Intel, and Gatekeeper asks once (macOS 15+: System Settings → Privacy & Security → Open
Anyway; earlier: right-click → Open). Signing and notarization come later; `.github/workflows/build.yml` says how.

## Architecture

- `src/machine/appMachine.ts` is the whole app as one XState statechart: onboarding (welcome → soundCheck →
  sync), then `game.home` (the dashboard), `game.school` (`enter` → `meet` once → `level` ⇄ `worldEnd`), `game.level` (the ear game:
  `unsolved`: ready/building/checked, `revealed`: solved/answer) and `game.sync`. `game.school.song` is the player's song on
  its own screen (the journey's end, a twist's end, or from Home); today's twist runs in `game.school.level` with
  `room.twist` set. Components read it with `useApp(selector)` and talk to it with
  `send(event)`; they do not decide what is allowed. Keyboard shortcuts send intents (for example `PRIMARY_PLAY`)
  and the state decides what they mean. Screens are chosen by state tags (`src/machine/view.ts`).
- The audio engine is injected (`AudioEngine` in `src/audio/types.ts`): `ToneEngine` in the app, `FakeEngine`
  (silent, timer-driven) in tests and with `?fake-audio`. The machine commands the engine through actions;
  `transport.ts` reports the engine's start / loop / end back to the machine.
- The playhead listens to the engine's step events directly, not through the machine, so nothing sits
  between the audio clock and the pixels.
- `src/audio/schedule.ts` is the single definition of when each hit sounds (steps, feel offsets, flam, swing).
  The engine and the offline renderer both use it.
- School's rules are pure functions in `src/school/` (`song.ts`: the song and the player's build, per bar, and every
  edit; `levels.ts`: the levels, made from the song; `match.ts`: how close a build is, the stars; `rules.ts`: what a
  press does in a level, what is marked, which levels are open, the save; `mix.ts`: what plays on each step). The
  statechart only wires events to them and to the engine. Test them in `tests/unit/school.test.ts`.
- New behaviour goes into the statechart with a model test in `tests/unit/machine.test.ts`.

## Nadilo School (`src/school/`, `src/components/school/`, `src/styles/school.css`)

Rebuilt from scratch on 2026-10-11 from the *Mend the Song* design (`docs/artifacts/mend-the-song.html`); the
design and its reasons are in `docs/GAME_DESIGN.md`, the player's guide in `docs/school.md`. The 0.3.x School was
deleted.

- **Hear a song, then rebuild it.** `FIRST_SONG` (`song.ts`) is the song, in the same `Build` shape as the player's:
  four bars of drums, bass, chords and tune, each bar its own, plus which parts play in each of five sections. The
  first time School opens (`game.school.meet`, once, `met` in the save) it is offered whole on a screen of its own
  (`SongPlayer`), never auto-played: a player with play and pause, a track with the time either side (a press moves
  the song there at once; a drag moves only the handle until let go, so the music never fights the hand; ← → move
  a bar), and the song's sections under the track, each as wide as it lasts. A section pressed loops on its own
  (`songPart`, `partProgram`); pressed again, the whole song plays on from where it is; a move outside it lets it go
  (`songAt`; a song picked up part-way plays what would still be ringing). A playback replaced by one of the same
  kind reports no end (`stop(quiet)`), so a move never jumps back to the old place (0.4.3 did).
- **Never take the song away.** An A and a B (`Listen` in `rules.ts`),
  switched live on the next step: **The song** (the song with the parts already rebuilt in place of its own) and
  **Yours** (the song with the player's notes for this part). Two ways to leave parts out work for either, in one pill
  (**Up close | Solo**, at most one on): **Up close** (`Room.close`) is this level's part with its `partner`; **Solo**
  (`Room.solo`) is this level's part and nothing else, the whole kit in a drums level (`sourcesFor`). Until 0.4.5 the
  song's part was never heard alone (it gives the answer away); after the 0.4.5 playtest the user asked for it in
  every level, to hear what the part itself sounds like (2026-10-24). Story has neither: its part is the arrangement.
  Pressing the one that is playing stops it; Up close or Solo with nothing playing plays. Rows not rebuilt yet are the song's:
  heard, never drawn (basted). Any edit switches to Yours. The loop names what it loops (**Bar n / All 4 bars**, in
  Story **the section / Whole song**: `scope`) and **Slow** (three quarters of the tempo) change the loop live too.
- **One bar on screen.** The instrument shows one bar, big; the strip above it shows the four bars in miniature and
  moves between them (so do the arrows either side of the strip, and ← →). The highlighted tile is the only "which
  bar" there is: no "Bar n of 4" label. **A press changes exactly one thing in exactly that bar**: bars are
  independent, and copying is its own move (*Copy bar n to 2 · 3 · 4 · All*), taught by the level *Copy it on*.
- **The grid coarsens as the parts change**: drums are steps (4, then 8, then 16 a bar); bass and tune are beats, with
  the steps folded into each beat, and a note has a start and a length (`Note`); a chord fills the whole bar; Story
  works in sections.
- **Fifteen levels** (`curriculum` in `levels.ts`), made from the song: twelve that rebuild it, and three Make it yours
  levels (below). A level whose idea the song lacks is left out.
  Each is a title, a goal of at most nine words that names what to touch, a lenient `check` (the idea), and, once met,
  the real `name` and one plain sentence (`named`), shown in place of the goal while the goal is met (clear the bar
  and the goal comes back; the level stays done). The goal or the name sits on the centre line, on one line; the
  tick, the count and the stars sit either side. Marks (`holes`) fade: all, the first
  bar or beat, none (Hint marks the bar on screen). Stars measure the match (★ goal, ★★ three quarters, ★★★ exact; extras
  count against it), are saved (`stars`) and never go down. A bar that is exactly the song is sewn shut in the strip,
  except chords before the level is done (six to try would give it away).
- **Sounds go by plain names** (Boom, Crack, Tick, Floor, Color, Voice) until the level that names them is done
  (`names.ts`).
- **A world ends on the whole song** (`game.school.worldEnd`), from the top, as an A and a B (`worldEndView`): **The
  song**, as first heard, and **Yours so far**, only what the player has made (the parts rebuilt, with every change
  they made their own, in every section, since the arrangement is theirs only in Story). It opens on Yours so far:
  the difference is what is left to build (the user's idea, 0.4.5). The way on from a world's last level says
  **Finish Pulse** (and so on), so it is clear the world ends there. The last world ends on **the player's song**
  (`game.school.song`, `YourSong.tsx`).
- **Make it yours** (since 0.4.2; `yours` on a level, `src/school/yours.ts`): after Pulse, Color and Voice, one level
  changes the player's **own song** (`own` in the save), which starts as the song note for note and is kept apart from
  the rebuild (`build`), so a rebuild's near misses never count as theirs. *Your fill* (bar 4's drums), *Your colours*
  (any bar's chord; the bass moves with it to the new root, `followRoot`), *Your answer* (bars 2 and 4 of the tune, still
  landing home). Whatever differs from the song is **gold**: a hit or note added is ringed, one taken out leaves a faint
  dashed ring, a bar holding a change gets a gold patch in the strip. In the strip and the song's map a change is
  sewn in gold thread (the line or hit itself turns gold), not ringed: the rows are close, and rings ran into each
  other (0.4.3). The song | Yours compare exactly the change. Only
  the level's bars open (the others are locked, heard in the loop); no stars (it is not measured against the song), a
  count of changes instead; the name shows once a change is there, and the level is done when the player presses
  **Keep it**. The sparring partner's **takes** (Busier, Emptier, Surprise, `takeOn`) sit where Copy sits: each is an edit
  Undo takes back, Surprise moves on through fixed fills (never random), and a take with nothing playing loops the bar.
  **Back to the song's** puts the level's bars back. Make it yours never blocks the next world (`unlocked`), so saves
  from 0.4.1 keep every level they had open.
- **The player's song** (`YourSong.tsx`): the whole song (The song is the song as first heard; Yours is the song with
  exactly the changes the player kept, so a rebuild's near misses are neither heard nor drawn there) and a map, one row per part and one tile per bar, each tile drawing that part of that bar, gold-ringed where it holds a
  change. Pressing a tile loops that bar (`barProgram`, mode `bar`); The song and Yours then swap only that part there
  (a colour's tile swaps the bass too), so the A and the B differ by exactly that change. Pressing it again stops it.
  With nothing changed, The song | Yours is not shown: two names for one thing would claim a difference. While the
  whole song plays, the bar it is in is ringed in each playing part's colour, and a part resting in that section fades
  as a whole row, its name with it. A part not rebuilt yet is basted here too.
- **Today's twist** (`src/school/twists.ts`, the Today card on Home): once one Make it yours level is kept, each day
  offers one small change to the player's own song, on a part whose world is rebuilt: one bar, one rule that is checked
  (keep the backbeat, end on home). Twenty twists (`TWISTS`, since 0.4.3), five per part or near it, laid out as a
  calendar from `FIRST_DAY` (2026-10-14): day n offers the n-th twist the player's song allows, leaving out the ones
  already sewn while another is open, so a player with every part rebuilt meets a new one each day to the end of
  October (`tests/unit/school.test.ts` plays every twist through its own level's edits). Same twist all day (`twistOn`,
  by the date), never the same two days running, checked against the song as it was when started (`today.from`), so an
  earlier change never counts. Kept, it is a stitch in the **sampler** (`sewn`) and ends on the player's song. No
  streak, nothing lost by missing a day: the reason to come back is the song, which keeps every change (GAME_DESIGN.md
  §11).
- **The title bar** in School: Back (`SCHOOL.BACK`: the level before, the song before the first level, Home from the
  song) and Home on the left; in the middle only the world you are in, its dots, and an arrow either side to the
  world before and after; Sync on the right.
- **Words are not decoration.** The world and level number live in the title bar only; no line repeats what something
  else on screen already says. Nothing claims more than is true: a copy is not yet the player's own, so the end says
  "Your song" only when something in it differs from the song ("The song, rebuilt" otherwise).
- **The save** is `rebuild` in `progress.json` (`SchoolSaved`: the song, the build, the level, done, stars, met, and since
  0.4.2 `own`, `today`, `sewn`), still file version 5. `level` stays an index into the rebuilding levels only (what
  0.4.1 reads: a Make it yours level saves the level before it); `levelId` names the exact level (`savedSchool`,
  `sanitizeSchool`). 0.4.1 ignores the new fields (and drops them if it saves). The 0.3.x School's `school` field is kept exactly as it was read (`legacySchool`), so 0.3.x
  can still be opened and finds its own School. `sanitizeSchool` repairs anything read back.
- **No explanations in the app**, no pop-ups over the music, nothing appears on its own (Hint is pressed; The song and
  Copy glow until used). **Nothing moves**: head, strip, tools, instrument and dock keep their size in every level and
  state; a tool a level does not offer is hidden, not removed (`tests/e2e/school.spec.ts` checks every level).
- **Stable presses.** Everything acts on `pointerdown` (`press()` in `use.ts`); one press is one change, never a cycle.
  Notes: press to place, drag to hold or change height, press and let go to take away; a drag is one Undo (`merge`).
  No colour transitions on pads. The playhead (`useNeedle`) marks the DOM from the engine's step events.
- **The look**: the instrument is indigo cloth with kinari thread (the app icon's colours); each drum has its own
  stitch (`Stitch`: Boom a satin pill, Crack a cross, Tick a slant), so colour is never the only clue; a note is a
  running stitch with a knot. Not a DAW: no mixer, no piano roll, nothing scrolls.
- **CSS**: `src/styles/school.css`, written to good-css.com (OKLCH tokens, logical properties, hover only under
  `(hover: hover) and (pointer: fine)`, `:active` press feedback, motion only under
  `prefers-reduced-motion: no-preference`, `overflow: clip`, a fluid `pow()` type scale). Every School class starts with
  `s-`, so School and the ear game's `app.css` can never style each other. **WebKit floor: Safari 16.2** (`color-mix()`),
  which macOS 11 gets from Software Update; nothing newer, so no `light-dark()` (17.5), no `:has()`-only layouts, no
  `text-box`. Nadilo has one theme, so tokens are plain values.

## Ear training (the hidden-beat game)

- A 16-step × up-to-3-lane grid. Lanes, top to bottom: hi-hat, snare, kick.
- The ruler counts `1 & 2 & 3 & 4 &` over the even steps. The odd steps (16th notes) show a small dot.
- Loop: Listen to the hidden beat, build it on the grid, then Check.
- **The hidden beat stays hidden until the player checks and gets it right** (or asks for the answer).
  Before that, the only visible notes are the "given" ones. Hidden notes must not be in the DOM
  (no attributes, classes or titles), and they never flash while playing. Every note the player can see fires
  when the playhead reaches it, right or wrong, so a flash never gives away which notes are right.
- Check feedback says which lane is off ("your snare is off"), never where. It shows at once, even while a beat
  is still playing.
- A correct check opens the reward dialog: a 100% stamp, confetti and a trackpad haptic
  (macOS, via the `haptic` Tauri command). "Listen for it" is the hero of that dialog.
  **The reward is silent:** no chime, no drum hit, and no beat plays on its own when the dialog opens.
  The player presses play in "Listen for it" if they want to hear it.
- The level's name is only revealed after solving it: experience first, name it after.
- Solving celebrates once. Coming back to a solved level (from Home or Sync) shows it solved, with no second
  celebration, so the celebration runs on the solving check, not on entering `solved`.
- **Given notes and lanes.** A given note is the lane's colour, softer, with a dot (pinned there); the player's are
  solid. A lane given in full says **All given** beside it and takes no presses (the `editable` guard; its empty steps
  rest, nearly the card), so it can never be "off". A lane with some notes given says **Partly given** until a check
  answers for it. Missed (after Show me the answer) is a dashed outline; it never means given.
- **The coach** (`coachTip` in `src/game/copy.ts`): one short line under the dock, chosen by fixed rules from what the
  player just did, never naming a step. Before the first listen, the level's own tip; while the hidden beat plays and
  nothing is placed, say it out loud ("boom", "tak", "ts" for the sounds still to find); after three listens with
  nothing placed, start with the surest hit. A lane a check finds off gets more specific help each time (`misses` in
  the context): a way to hear it, then what is likely wrong (two sounds on one step, a pattern tidier than the beat,
  too many or too few hits), then that lane alone. Coach tips on: it speaks up on its own, and is quiet with nothing
  to add. Off: it waits to be asked (**Ask the coach**), like the partner in Make it yours; the asked tip lasts until
  the player listens, places or checks.
- **Home** is where returning players land; new players go from the onboarding to the song (its own screen), then
  School's first level. Home leads with School (Continue, and the five worlds, with each level's stars); the ear-training levels are
  cards below, one row per chapter, with their own Continue. A card reads "Level n", the task (or, once solved, the
  name), the beat in miniature, and how it went in words: "First try", "n tries" or "Answer shown".
  Continue brings back the level you were on exactly as you left it, or moves on to the next unsolved level if
  that one is solved. A tile shows the level's name and a thumbnail of its beat only once it is solved; an unsolved
  tile shows the task and an empty thumbnail (hidden notes stay out of the DOM here too). With every level solved,
  Home is finished: "Journey complete", no level is up next, every tile shows how it went, and Continue becomes
  "Start again from level 1".
- Each level's first solve is recorded (`records`: checks, the day, and whether the answer had been shown first).
- Next and Skip go to the next unsolved level (`nextIndex` in `src/game/progress.ts`), so a skipped level is never
  left behind; the button then says where ("Next: level 12"). The solve that completes every level, whichever it
  is, is the finale; its card leads to Home.
- The title bar: Home on the left while in a level; the chapter in the middle, as School shows its worlds (`EarJourney`:
  the name, its levels as dots, an arrow either side to the other chapter); Sync and Coach tips on the right. The
  buttons are hidden while the reward card is open, since it is modal.

## Ear-training curriculum (`src/game/levels.ts`)

- Chapter 1 uses kick and snare only. The hi-hat row is not shown at all.
- Level 1 is the backbeat (kick given, find the snare), with nothing stacked.
- Level 2 teaches stacking: kick and snare on the same single step.
- Chapter 2 introduces the hi-hat the way the music teacher suggested: first the whole hi-hat lane
  is given as a reference, then the whole kick lane plus a few anchors, then fewer anchors each level,
  until nothing is given.
- No two levels may share a pattern. `tests/unit/levels.test.ts` enforces this and the other invariants.

## Audio (hard requirements)

- Tone.js is the clock: its `Transport` runs one 16th-note `scheduleRepeat` callback. Everything plays as a
  `Program` (`src/audio/types.ts`): steps per pass, passes, and `bpm()`, `lean()` and `at(pos)`, all read live on
  every step, so an edit, a new tempo or an A/B switch lands on the next step without a restart. The ear game's
  beats are programs at 96 BPM (`drumProgram`); School's are in `src/school/mix.ts`.
- **Voices** (`src/audio/voices.ts`, shared by the engine and the offline renderer, so what is measured is what is
  heard): one native buffer source per note through its own envelope. Pitched samples are played faster or slower
  from their recorded root. Held notes release smoothly; bass and melody are one voice each, so a new note
  crossfades the last one out in a few ms. Each playback has its own bus: Stop fades exactly its notes (about
  12 ms), cancels notes scheduled ahead that have not started, and a new playback never starts under a fading one.
  Master chain: gain → 40 Hz high-pass → compressor, so stacked hits never clip.
  `tests/e2e/school-audio.spec.ts` renders the real samples offline and checks that the whole song never clips and
  that Stop fades to −60 dB within 100 ms without a click.
- **The sounds are recordings of real instruments from CC0 libraries** (public domain: Karoryfer's Virtuosity Drums,
  Swirly Drums, Big Little Bass and Osiris Piano, and Versilian's VCSL), the set the user picked by ear on the
  listening page as "Late tram" (2026-10-19): a kit kick, a muted snare, a closed hi-hat, a soft bass guitar, piano
  chords over a quiet organ, a vibraphone tune. `scripts/samples/cc0.py` (numpy, scipy, ffmpeg; the libraries in
  `NADILO_CC0_DIR`) cuts, tunes and measures them and writes every WAV in `src/assets/audio/`,
  `src/audio/samples.json` (roles, root notes) and `docs/SOUNDS.md` (credits too). Each sound is as loud above 150 Hz
  as the sound it replaced, so the mix holds; the piano and the organ fall 1 and 1.7 dB short at the -3 dBFS ceiling
  and are made up for in `VOICE_DB`. The sample slot ids stay as they were (`kalimba` is now the vibraphone), so the
  code did not change with the sounds. The DMGs up to 0.4.3 used licensed Cymatics sounds and 0.4.4 synthesized ones;
  neither is in use.
- **Takes.** The kick, snare and hi-hat each have four takes (`kick-2.wav` …, `TAKES` in `samples.ts`), the same hit
  recorded again, processed with the first take's settings so a softer take stays softer. `takeOf` (in `voices.ts`)
  plays them in turn per playback, never the same one twice running, in an order that does not cycle evenly, so a
  beat does not sound like a machine.
- **Laptop speakers.** Nothing sounds below 80 Hz (`floorHz`): every sound is high-passed there, the kicks settle at
  85 to 90 Hz, and `cc0.py` refuses to write a sound with more than -30 dB of its energy below 80 Hz. The bass's
  root is C2, but the high-pass leaves little of its fundamental, so its lowest note (65 Hz) is heard from its
  harmonics. No note's
  fundamental is below 55 Hz (`minFundamentalHz`): `tests/unit/school.test.ts` checks every note School can play
  against it, and that no sample is pitched more than 7 semitones (10 for the bass) from its root.
- **The mix** (`VOICE_DB` in `src/audio/samples.ts`): the drums lead; the tune sits about 1 dB above them, the bass
  and chords 2 to 3 dB under, measured as a laptop speaker hears them (high-passed at 150 Hz). The piano's and the
  organ's levels carry the 1 and 1.7 dB they could not get at the ceiling.
- The ear game's 3 samples live in `src/assets/audio/`.
  Mix, tuned by ear: kick 0 dB, snare −2 dB, hi-hat −7 dB.
  Feel offsets: snare +4 ms, hi-hat +9 ms.
- **Stacked snare:** when the snare shares a step with the kick it is delayed by `STACK_FLAM`
  (30 ms) so the ear can tell it is two sounds.
- **Scheduling:** Tone's clock wakes every 25 ms (`updateInterval`) and schedules 100 ms ahead (`lookAhead`).
  The look-ahead must stay well above the wake-up interval, or a late wake-up schedules hits in the past.
  A playback starts `START_LEAD` (60 ms) after the audio clock's now, not Tone's `'+0.02'`, which is relative to
  the look-ahead and meant 120 ms of silence after every Play. `hear()` (a tap) awaits nothing once the context runs
  and the samples are decoded.
- **Playhead sync:** the playhead takes its step number from the audio scheduler itself. When Tone schedules
  a step, the engine converts that step's audio time (plus output latency where the browser reports it) to a
  `performance.now()` target once, and fires the visual on the animation frame closest to it (`atAudioTime`).
  Tone.Draw is not used: it compares against `currentTime`, which WebKit only updates about every 8 ms.
  Never drive the playhead from a CSS animation or an independent timer. It follows the grid, not the
  feel offsets or the flam; a swung step's visual lands as late as its sound. `tests/e2e/sync.spec.ts` checks this.
- **The playhead is the glowing column** (and the notes firing in it). There is no ball: it ran on its own timer
  between steps and looked out of step with the glow. The glow switches on instantly; a fade-in would lag the sound.
- WebKit (Safari, and so the Mac app) does not report `outputLatency`, so with Bluetooth headphones the
  playhead would run ahead of the sound. The **Sync** screen (in onboarding, and from the title bar) fixes
  this the way rhythm games do: the player taps along to kicks with no visuals, `estimateOffset` turns the
  taps into a visual delay, and the player can check it against a flashing circle and nudge it.
  The offset is saved (`syncOffsetMs`) and applied as `engine.visualOffsetMs`. The slider moves in 1 ms steps, and
  ◀ Earlier / Later ▶ arrows nudge it 1 ms a tap (held, they repeat, then speed up). The estimate is never negative:
  sound cannot arrive early, and most people tap a little ahead of a beat they can predict. Only the nudge
  slider can move the playhead earlier.
- **The first notes must not crackle.** Starting audio decodes every sample and opens the output, and WebKit's audio
  thread is roughest in its first moments: a returning player's first Play used to do all of that at once (about a
  second of silence, then a crackle). Now the first click or key press anywhere starts audio (`main.tsx`), and the
  engine warms up before its first real note: every sample is played once, pitched, at -80 dB through the whole chain,
  for 250 ms (`warmUp` in `toneEngine.ts`). The first Play then sounds in about 100 ms.
- Audio needs a user gesture before it can start (WebKit). The onboarding's "Get started" click calls
  `Tone.start()`. What plays is shown by the button that plays it (Pause in place of Play). There is no sound status
  in the title bar any more: the user found its words and its moving meter a distraction that served nothing
  (0.4.5). The live meter stays in the onboarding's sound check, where it answers "can you hear this?".
- The samples start 1 ms before their attack (`cc0.py`), so there is no lead-in silence to speak of.

## Design direction: "Stage Daylight"

The Nadilo Desktop design language (`Nadilo_Desktop_UI_Design_Language_mockups/Nadilo Studio.dc.html`):

- Urbanist (bundled via `@fontsource-variable/urbanist`, so it works offline).
- A pale indigo daylight, `#eef2fb` at the top to `#e3e9f5`, ink `#1c2547`, muted `#4f5a7a`, accent `#3448c8`.
  White cards with a hairline. The window's `backgroundColor` in `tauri.conf.json` matches the top.
  A faint seigaiha wave pattern along the bottom. Plenty of empty space.
- Part colours: kick `#e0603f`, snare `#e3a12f`, hi-hat `#3a9ea4`, bass `#9a4fa8`, chords `#3d9a6c`,
  melody `#3448c8`. Each world takes the colour of its part (Story: `#d4901f`). The six moods have their own colours.
- One column, read top to bottom, so the eyes do not travel: no side panels.
- No Japanese characters anywhere in the UI.
- No coloured bars or shaded boxes beside the lane names.
- The play button is small (about 60 px), flat, no glow, and no ring around it. Its triangle is optically centred:
  its outline's middle a twelfth of its width right of the button's middle (the centre of mass, in 0.4.0, looked too
  far right). It sits well clear of the grid. In School it is on the page's centre line, under the title.
- Hover pills are symmetric: a fixed height with the words on its centre line, and an icon's own empty margin taken
  back so the pill is as wide on the icon's side as on the words' side. Check them in a screenshot, not by eye in code.
- Buttons come in three weights, all pills of one height, and nothing is underlined. **Primary**: solid ink,
  one per moment. **Secondary** (the default): an ink hairline. **Tertiary**: a fainter hairline and muted words,
  for the ways out. **Accent**: a secondary in a lane's colour.
- Given notes: the lane's colour, softer, with a dot. No stripes or outlines on a note: fine lines across a lane tire
  the eyes. Your notes: solid. Whispers: pale, ringed, half filled.
  Missed: dashed. Extra: ×. The song's notes still to place (a ghost, `data-ghost`): a dashed outline in the lane's
  colour that breathes slowly; a whisper's ghost is half filled. A take's changes: an ink ring.
- The step grid is flat, like GarageBand's step sequencer: no shadows, and nothing lifts or jumps. The steps sit on
  a white card (the lane names outside it on the left, what a check says on the right, the same width either side so
  the card is on the window's centre line). Empty steps are slots darker than the card, in three shades: beats 1 and
  3, beats 2 and 4 (a shade darker), and the playhead's column (darker still), at about 1.25, 1.3 and 1.8 to 1 against
  the card. In 0.4.2 they were 1.03 to 1 against the page, which strained the eyes. A note fires (`data-fire`) when it
  is placed, and flashes (`data-hit`) each time the playhead reaches it.
- Keep text short. In School: the title and one goal (the world is in the title bar). In the ear game: "Level n", the task, one line.
- Pop-ups (the reward cards) are centred: badge, words and buttons on one centre line. Boxes inside them (*Listen for
  it*, the recap) keep their own layout.
- Motion (`motion/react`) for animation.

## Brand

- The logomark is in `src/assets/brand/`; `Logomark.tsx` draws it in `currentColor`. The name Nadilo and the logo
  belong to Tonestruments AB and are not covered by the GPL.
- The app icon is rendered from `design/icon/icon.html` (logomark in kinari on the indigo tile), then
  `npx tauri icon design/icon/icon-1024.png`.

## Layout

- Designed for a 14" MacBook (about 1512 × 982 points). The window is 1440 × 900 by default,
  with a minimum of 1180 × 760. School's instrument grows with the window; everything else keeps its size. The title bar is an overlay: the top 44 px is a drag region
  (`data-tauri-drag-region`), and its left 80 px are reserved for the traffic lights.
