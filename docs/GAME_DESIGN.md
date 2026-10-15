# Nadilo School: hear a song, then rebuild it

This is the design of Nadilo School as rebuilt on 2026-10-11, and the reasons for it. The rules the app follows are in
`CLAUDE.md`; the player-facing guide is `docs/school.md`. The design comes from the *Mend the Song* proposal
(`docs/artifacts/mend-the-song.html`); the lesson behind it is *From Beat to Song* (`docs/artifacts/from-beat-to-song.html`).

The School of 0.3.x was deleted, not patched. The 0.3.2 DMG still installs it.

## 1. What was wrong with 0.3.x

The tester's words, and what was behind each:

| What they said | What was happening |
| --- | --- |
| "I click one block and it does not register" | All four bars of sixteen steps were on screen at once: 64 pads across, about 12 px each at the smallest window. In the levels with whispers, a second press turned a hit into a whisper instead of taking it away. And while *The song* played, an edit changed nothing you could hear. |
| "It is not instantaneous" | Same causes, plus a release that was easy to miss on pads that small. |
| "Another block disappears" | The drums were one bar drawn four times. A press in bar 3 also changed bars 1, 2 and 4. With swing, the in-between pads were pushed sideways with a margin, and in a tight grid some shrank to nothing. |
| "I did not mean cram all the beats of all the bars" | Every instrument showed the whole four-bar loop at full detail. |

## 2. The model: never take the song away

*Mend the Song* answered the question School turns on: when someone hears a song and then rebuilds it, what should they
hear at each step? **The song stays whole.** Every level plays inside it. What changes from level to level is who
plays each part: one by one, the player's parts replace the song's own. Parts not reached yet are still heard ("basted",
in the cloth picture) but never drawn, so nothing is given away.

### The song or Yours, either Up close: never the song's part on its own

Playing the song's part alone would be cheating: it is the answer with nothing around it. So a level offers an A and
a B of the same four bars, and switching between them never stops the music, so the two are compared at the same
moment of the bar. Up close is a second switch, for either of them (0.4.1; in 0.4.0 it only worked on the song, and
the tester asked twice to hear their own part with its partner):

| | Whole | Up close (this part and the one it talks to) |
| --- | --- | --- |
| **The song** | The song, with every part the player has already rebuilt in place of the song's own: the reference | Hearing one line inside a mix is a learned skill: this is the practice |
| **Yours** | The song, with a hole where this part was, filled by the player's notes: the check. Done is when Yours sounds like The song | The player's own part with its partner: what they are making, heard clearly |

Pressing the one that is playing stops it. Any edit switches to Yours: what you hear is what you just did. (In 0.3.x a player could edit while the song's part
played and hear no change, which also read as "my click did not register".)

### What each phase hears Up close

| Phase | Up close | Why |
| --- | --- | --- |
| The kick (Heartbeat, Copy it on) | Kick and bass | The kick and the bass are the low end together; producers mix them as a pair |
| The snare (Clap back) | Snare and kick | The backbeat is the answer to the kick: boom, crack |
| The hi-hat (Zoom in) | Hats over kick and snare | Ticks fill the gaps the other two leave |
| The fill (The turn) | All the drums, nothing else | Three lanes change together; the bass and the tune would hide them |
| The bass (Under the boom) | Bass and kick | Lock to the kick first |
| The bass by ear (Moods move) | Bass and chords | Each bar's bass starts on its chord's root |
| The chords | Chords and bass | Find the bass note first, then the chord on it: the standard way to transcribe a progression |
| The tune | Tune and chords | A tune lands on notes of its chord |
| The arrangement (Story) | none | The part is the arrangement itself; The song and Yours compare it |

Two more tools, from how people learn songs by ear: **loop a short section** (This bar, or All 4 bars; This section,
or Whole song, in Story) and **Slow** (three quarters of the tempo, still a groove). Transcribers loop a few seconds
and slow them down; the order bass first, then chords, then melody is the same one School teaches.

## 3. One bar on screen

Every bar has its own screen. The instrument shows one bar, big: at sixteen steps a bar a pad is 59 × 92 px at the
default window and 51 × 79 px at the smallest (0.3.x: about 13 px wide). Above it, **the strip**: the four bars side by side in miniature, the map of
where you are. Press a bar in the strip (or the arrows, or ← and →) to work on it.

**A press changes exactly one thing, in exactly that bar.** Bars are independent (`Build` in `src/school/song.ts` has
four of everything). Copying is a move of its own, not a side effect: **Copy bar n to 2 · 3 · 4 · All**, over the
instrument.

### "First see what if we copy those bars"

That is the second level, *Copy it on*. Heartbeat builds bar 1 only. Copy it on opens on All 4 bars and Yours, so
when the player presses Play, the first thing they hear is one bar of kicks and three bars of nothing. One press of *All* fills them, and the
level names what just happened: the same bar four times is a phrase; played again and again, a loop. From then on the
player builds bar 1 and copies it on, and Pulse ends with *The turn*, where bar 4 is different (a fill) and the player
has to find what changed, by ear, on bar 4's own screen.

### The steps fall away

The grid gets coarser as the parts change, which is the lesson *From Beat to Song* teaches:

| Part | The grid | A note is |
| --- | --- | --- |
| Drums | Steps: 4 a bar (quarter notes), then 8 (eighths), then 16 (sixteenths) | A hit on a step. No length |
| Bass | Beats: the steps are folded into each beat (the dots after each count) | A start on a beat and a length: drag right to hold it. Two beats is a half note |
| Chords | The whole bar is one block | One chord, held for the whole bar: a whole note |
| Tune | Beats, higher up | A start, a length and a height |
| Story | Sections of the whole song | A part plays or rests |

## 4. Gamified, without the usual tricks

- **Every level is one move**, with a goal that names what to touch ("Copy bar 1 into bars 2, 3 and 4."), never a
  riddle.
- **Support fades**: the song's notes are marked (needle holes) in traced levels, only the first bar or beat in
  carry-it-on levels, and not at all by ear, where Hint marks the bar on screen. This is fading, from worked examples
  to problems of one's own (Sweller, van Merriënboer).
- **It clicks**: a bar that is exactly the song is sewn shut in the strip (a tick). Chords, where there are only six
  to try, show theirs once the level is done, so the tick can never stand in for listening.
- **Do it, hear it, then name it**: the goal is lenient (the idea); meeting it shows the real name of what was done,
  in place, with one plain sentence. No pop-up covers the music.
- **Stars** measure the match: ★ goal met, ★★ three quarters of the way, ★★★ exactly the song. Extra notes count
  against it. Best stars are kept and never go down.
- **The whole song, again**: each world ends on its own screen, the whole song from the top, with the player's part
  in it and the rest still the song's.
- **No energy, no timers, no streaks, nothing to lose** (Octalysis' black-hat drives, avoided, as in VISION.md).

## 5. Scalable

A song is data (`Song` in `src/school/song.ts`: tempo, sections, and the parts per bar). The levels are made from it
(`curriculum` in `src/school/levels.ts`): which bar has a fill, which bar repeats the tune, what each level's goal
counts. A level whose idea a song does not have (no fill, no repeated phrase) is left out. Adding a song is adding
data; a unit test plays every level in order from nothing and checks that it rebuilds the whole song exactly.

## 6. Not another app

| The usual way | Where | Nadilo School |
| --- | --- | --- |
| Pads in a long grid | Drum machines, GarageBand's step sequencer | One bar at a time, stitches on cloth, a map of the four bars |
| Piano roll | Every DAW | A ladder of six heights; a note is a running stitch with a knot |
| Solo, mute, a mixer | Every DAW | The song, Yours, Up close: named for what you are doing |
| Notes scrolling at you | Guitar Hero, Yousician, Melodics | Nothing scrolls; the song waits while you work |
| Points, streaks | Most learning apps | Bars sew shut; stars only go up |

## 7. Stable clicks, stable sound

- Every press acts on `pointerdown` (`press()` in `src/components/school/use.ts`); keyboard activation still works.
- One press, one change: toggles only, no cycles. A note: press to place, drag to hold or change height, press and let go
  to take away. A drag is one Undo.
- A pad's colour has no transition. Measured in WebKit with the loop playing: 38 ms median from press to painted frame,
  50 ms worst, every press registered (`tests/e2e/school.spec.ts` presses as fast as Playwright can).
- Nothing on screen moves between levels or when a level is done (tested on every level).
- The playhead comes from the audio clock, marks the DOM directly, and never re-renders React.
- The whole song never clips, and Stop fades to −60 dB within 100 ms with no click
  (`tests/e2e/school-audio.spec.ts`, rendered offline with the real samples).

## 8. Not built yet

- More songs to choose from after the first (the data model is ready).
- Takes for the colours and the bass, and a partner that offers a take on its own (now it acts only when asked).
- A level for swing: the first song is straight, so there was nothing to rebuild.
- Up close for Story as two contrasting sections back to back.

## 9. What to watch in the next test

- Time to the first press, and whether it lands on a marked beat.
- Whether players switch between The song and Yours, when they reach for Up close, and in what order.
- In Copy it on: does hearing three empty bars make them reach for Copy before they read the goal?
- In The turn: how long to find the fill, and whether they use This bar and Slow.
- Afterwards, in their own words: what is a bar? what did the snare do? how long is a half note?

## 10. 0.4.1: after the first full playtest

The designer played 0.4.0 end to end and wrote a note per screen (kept outside the repo, in `SS-NADILO-DESKTOP`). What
changed, and why:

- **Every euphoric moment was a search by ear against the song** (the fill in bar 4, the bass in bar 2, the held note
  in Answer it, the outro with no bass or tune). Tracing never got that reaction. Keep the by-ear "turns"; every world
  should have one.
- **Hearing your own part.** Up close now works for Yours too (section 2). The rule stays: the song's part is never
  heard on its own.
- **One thing on screen says each thing once.** The world and level number moved to the title bar (one world at a time,
  arrows either side); "Bar n of 4" went, since the highlighted tile says it; the sound status moved up beside Sync.
- **A copy you cannot see is a copy that "does not work".** Copying to one bar worked, but the strip drew the kick and
  snare about 1.5 px tall. The miniature is now drawn in CSS, each drum with its stitch.
- **Words before the thing.** "Like beat 1" came before "beat" had a meaning; "1 and 2 and" described a ruler that
  says `1 & 2 &`. Goals now name what is on screen.
- **Nothing claims more than is true.** A part rebuilt exactly is still the song's; the end says "You rebuilt the
  whole song". Making it your own is the next step (section 8), to be prototyped and shown before it is built.
- **Tape hiss** recorded into the kalimba (and, less, the guitar and bass) is turned down when the sounds are built
  (by the script that prepared the licensed sounds): the tester heard it start and stop with every tune note in IE 200s.

## 11. 0.4.2: make it yours, the player's song, and a reason to come back

The 0.4.0 playtest ended on "now what?", and on the tester noticing that a rebuilt part sounds exactly like the song,
so "yours" was not yet true. The *Make it yours* prototype (`docs/artifacts/make-it-yours.html`) answered both; the
tester's one objection was its last screen, where every part of every bar was a thin pill too small to read, and
pressing one did nothing.

**Make it yours.** Each of Pulse, Color and Voice ends with one more level. The song stays the reference, but the
question changes from "does mine match?" to "what did my change do?". It works on the player's own song, kept apart
from the rebuild, which starts as the song: a near miss in a rebuild is a mistake, not a choice, and must never be
drawn as the player's. Gold marks only what differs from the song, so "Gold is yours" is true by construction. The
level is done when the player presses Keep it: deciding to keep a change is the act of ownership (and the moment a
partner's suggestion becomes the player's, which is the question in VISION.md's sparring partner). The partner acts
only when asked, its takes are fixed and repeatable (no dice), and Undo takes any of them back.

**The player's song.** The map is now tiles of the same cloth as the strip, each drawing its part of its bar at a size
that reads (about 66 × 255 px at the default window, against 26 px pills). A tile is a place to listen: pressed, its
bar loops with every part playing, and The song | Yours swap only that part there. That is the A/B the whole of
School teaches, aimed at one change. Drawing follows what is heard: in The song, the tile shows the song's notes.

**A reason to come back.** VISION.md rules out streaks, lives and timers, and the evidence backs it: in Silverman and
colleagues' experiments people came to care about the streak rather than the goal, and breaking one was demotivating
(University of Delaware, 2024). What the design uses instead:

| Idea | Where it comes from | In Nadilo |
| --- | --- | --- |
| One small thing a day, the same all day | Wordle's single daily puzzle | Today's twist: one bar, one rule, a few minutes |
| The world changes with the real calendar; missing a day costs nothing | Animal Crossing's real-time clock | A new twist each day; the sampler only counts days sewn, never days in a row |
| We value what we made, if we finished it | The IKEA effect (Norton, Mochon and Ariely, 2012) | Every twist stays in the player's song; each is small enough to finish |
| Stop where you know what comes next | Hemingway's habit, the Zeigarnik effect | Done, the card says a new twist comes tomorrow |
| Autonomy and competence predict wanting to play again | Ryan, Rigby and Przybylski (2006) | A constraint to meet, and the player's own choice of how |

A twist is checked against the song as it was when the twist started, so it always asks for a new change. What to
watch: whether players come back the next day, and, separately, whether they can say what their change did (return
alone does not explain why someone came back).

Since 0.4.3 there are twenty twists, laid out as a calendar from 14 October 2026: day n offers the n-th twist the
player's song allows, and a twist already sewn is left out while another is open. The parts take turns down the list,
and each twist names one idea once it is kept (a kick drop, offbeat hats, half time, a pedal note, quarter notes, a held
chord, coming home, a peak, a leap, an open ending, and the ten from 0.4.2).

## Sources

- Raph Koster, *A Theory of Fun for Game Design* (local PDF): fun as learning a pattern, chunking, multiple success
  states.
- Lucy Green and Musical Futures, learning by copying real recordings: [UCL](https://www.ucl.ac.uk/ioe/research-projects/2022/jan/adapting-popular-musicians-practices-classroom).
- Music Minus One (1950), play-along records with one part left out: the model for Yours.
- Albert S. Bregman, *Auditory Scene Analysis* (1990); Zendel and Alain, "Concurrent sound segregation is enhanced in
  musicians" (2009): hearing one line in a mix is learned.
- John Sweller and Jeroen van Merriënboer on worked examples and fading support.
- Transcribing by ear: loop a short section, slow it down, find the bass note first, then the chord
  ([TalkingBass](https://www.talkingbass.net/beginner-transcription-tips/),
  [Songscription](https://www.songscription.ai/blog/ear-training-for-transcription)). Bass is easily lost on small
  speakers ([No Treble](https://www.notreble.com/?p=29951)), one reason the bass is heard Up close with the kick.
- Antonios Liapis, Georgios Yannakakis and Julian Togelius, *Sentient Sketchbook* (2013): live evaluation after every
  action (the stars and the sewn bars).
- Yu-kai Chou, [Octalysis](https://yukaichou.com/gamification-examples/octalysis-gamification-framework/).
- Jackie Silverman and colleagues on streaks, as reported by the [University of Delaware](https://udel.edu/udaily/2024/march/power-of-streaks-motivation-jackie-silverman) (2024).
- Michael Norton, Daniel Mochon and Dan Ariely, "The IKEA effect: when labor leads to love", *Journal of Consumer
  Psychology* 22(3), 2012 ([Harvard DASH](https://dash.harvard.edu/handle/1/12136084)).
- Richard Ryan, Scott Rigby and Andrew Przybylski, "The motivational pull of video games: a self-determination theory
  approach", *Motivation and Emotion*, 2006.
- On Hemingway's way of stopping and the Zeigarnik effect: [Big Think](https://bigthink.com/the-learning-curve/the-hemingway-effect/).
