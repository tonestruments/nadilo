# Changelog

Each version of Nadilo and what changed in it, newest first.

## 0.4.6 (2026-10-24)

- Every level except Story has a Solo button next to Up close. Solo plays only the part the level is about, so you can
  hear what that part sounds like. In a drums level it plays the whole kit. It works with The song and with Yours.
- Up close and Solo now share one pill, and only one of them can be on at a time.

## 0.4.5 (2026-10-20)

- Every sound is now a recording of a real instrument, from free sample libraries in the public domain (CC0). The
  sounds are a drum kit, a bass guitar, a piano over a quiet organ, and a vibraphone. Each drum has four takes that
  take turns, so a beat doesn't sound like the same recording played again and again.
- The song player is new. The track is a thin line with the time at each end, and a press on the track moves the
  song there at once. Playing on from the new place no longer jumps back to the old place first. When you drag, only
  the handle moves until you let go.
- The song's sections (Intro, Verse, Break, Chorus and Outro) sit under the track. Press one to loop it on its own.
- Each world ends with a choice between The song and Yours so far. Yours so far plays only the parts you have made,
  so you can hear what is left to build. The button that leads there names the world, e.g., Finish Pulse.
- On Your song, the bar that is playing has a ring in the colour of each part that plays there. A part that rests
  there fades. If you haven't changed anything yet, the app doesn't offer The song | Yours.
- A change you made is drawn as a gold line in the strip and on the map. Before, it was a gold ring, and the rings ran
  into each other.
- The title bar no longer shows Sound ready, Playing and a moving meter.
- The words are clearer for eighth notes, for the bass in Moods move, and for the bass that moves with your colour.
  Moods move used to name the chord before Color teaches what a chord is.
- Each source file starts with a copyright line for Tonestruments AB and the licence's short name, GPL-3.0-only.

## 0.4.4 (not released yet)

- The source code is public under the GPL, version 3.
- Every sound is synthesized by `scripts/samples/synth.py`, so the repository holds no recordings. Nothing sounds
  below 80 Hz, and the bass keeps its pitch on a laptop because the ear hears its missing low note from the
  harmonics.
- The demo film and its tools are no longer in the repository.

## 0.4.3 (2026-10-14)

- In ear training, the steps sit on a white card and are easier to see. A given note is the lane's colour, softer,
  with a dot.
- A lane that is given in full says All given and can't be changed, and a lane with some notes given says Partly
  given.
- The coach picks its hint from what you just did, and the hint gets more specific each time a lane is still wrong.
  You can turn the hints off, and then the coach waits until you ask.
- The ear-training chapters move into the title bar, the same way School shows its worlds.
- There are 20 daily twists, so a player who has rebuilt every part gets a new one each day to the end of October.

## 0.4.2 (2026-10-14)

- Make it yours: after Pulse, Color and Voice, one level lets you change your own copy of the song and keep the
  change. Everything you changed is drawn in gold, and the partner's takes (Busier, Emptier and Surprise) suggest
  changes only when you ask.
- Your song: the end of the journey shows the whole song as a map of every part and every bar. Pressing a bar loops
  it, so you can compare your change with the song.
- Today's twist: once something in the song is yours, Home offers one small change a day. Nothing is lost if you
  miss a day.

## 0.4.1 (2026-10-14)

- Fixes from the first full playtest of School. You can listen to The song or Yours, and hear either Up close, so
  you never hear the song's part on its own.
- Back in the title bar goes one step back, and the title bar shows only the world you are in.
- The goals name what is on screen, and the tape hiss in the kalimba, the guitar and the bass is turned down.

## 0.4.0 (2026-10-11)

- School is rebuilt from scratch. You hear the song first, and then you rebuild it one part and one bar at a time
  while the rest keeps playing.
- The screen shows one bar, big, with a strip of all four bars above it, and each press changes exactly one thing in
  that bar.
- The 12 levels are made from the song itself. Stars show how close you came, and each world ends on the whole song.

## 0.3.0 to 0.3.2 (2026-10-08 to 2026-10-09)

- The first Nadilo School, with five worlds (Pulse, The Floor, Color, Voice and Story) that build one song.
- Sounds for School, measured and prepared for laptop speakers.
- Home leads with School, and the 13 ear-training levels sit below it.

## 0.2.0 (2026-09-26)

- Home, where returning players see every level and one Continue button.
- Progress is saved on your Mac, so no solved level is lost.
- A flat step grid, and a playhead that stays with the sound.

## 0.1.0 (2026-09-26)

- The first version: 13 ear-training levels where you rebuild a hidden beat by ear, and a Sync screen that lines up
  the playhead with your speakers or headphones.
