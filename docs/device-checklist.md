# Shape of War: device checklist (G4)

Owner: Proctor. Source: `docs/06-test-and-acceptance.md` section 3 (58 line items, counted: 4 + 4 + 7 + 4 + 6 + 5 + 5 + 4 + 4 + 4 + 5 + 4 + 2). Steps were checked against the code at main 5bef4ae. Ryan runs every line at G4 on the Z Fold 7, about 20 minutes, and pastes the block at the end back to Fable.

## Bad news first

1. Every Result and Notes cell is blank. Nothing here was run on a device, and no earlier gate result is copied in. A line with no result is not a pass.
2. A result without a build id is void (docs/06). Check the build id before the first line and write it in the paste-back block.
3. None of the B1 to B4 fixes (neon slider on Settings, landscape lock, graphics quality, pixelation) has been seen on a device yet. N1 to N6, F4 and P3 are the first real look at them, so use the Notes column freely there. See `docs/qa/bugs.md`.
4. Endless: no screen shows the high score table (QA-012 in `docs/qa/bugs.md`). E1 to E3 are worded below against what you can see, the rank badge and the Best line. Sorting and the 10 entry cap are proven by unit tests only.
5. A fold or unfold auto-pauses the game (docs/01 section 10). After every fold in U2 to U4, tap Resume. That is expected, not a failure.
6. Cuts: `docs/STATUS.md` at main 5bef4ae says "Cuts taken: (none)", so no line is pre marked n/a. If Fable logs a cut before G4: stars cut makes the stars part of S1 n/a, audio cut makes A1 to A4 n/a, Endless cut makes E1 to E4 n/a. Write n/a in the Result cell and say which cut in Notes.

## Before you start

1. Build id. The id is the dim `build <sha> <date>` label at the bottom right of every screen (also at the bottom of Settings). It must equal the id Fable gave you. If it differs: close the app from recents, reopen online, wait 5 seconds, close and reopen. Still different: stop and tell Fable.
2. Browser: Chrome unless you chose Samsung Internet. Write it in the paste-back block.
3. Folded means the cover screen. Unfolded means the main screen.
4. Show FPS: Settings, tap the `Show FPS: Off` button so it reads `Show FPS: On`. Turn it off again at the end if you like.
5. Stress scene (P1, P2, P4, P5 variants): either open `https://<gh-user>.github.io/shape-of-war/?stress=400` in a browser tab, or in Settings tap the `build ...` label at the bottom 5 times within 3 seconds and then tap `Stress: 400 entities, 2000 particles`.
6. Viewport label (U1 only): add `?debug=1` to the URL in a browser tab. A small label appears at the top left.
7. Glow path: Settings, the `Glow: Bloom` button toggles `Glow: Fallback`. Leave it on Bloom except in N5 and P4.
8. Level hash: during play it is the end of the top line, `L3  Par 1,000  #<hash>`. On the results screen it is `Level #<hash>`. In Settings, with a number typed in Play seed, it is `Seed 1234  Level 1 #<hash>`.
9. Motion smoothness: Android Settings, Display, Motion smoothness. Write down Standard or Adaptive. Standard caps the cover screen at 60 fps and is accepted for P1 when recorded.
10. Result column: write `pass`, `fail` or `n/a`. For every fail, write in Notes what you saw and on which screen. For P lines, write the average and minimum fps in Notes.

Suggested order, to save switching: install lines (3.1, 3.2) first, then one folded play session (T1 to T3, T5 to T7, R, S, A, D1, D2, P1), then unfold for T4, U, P2 to P5, then Settings (N, D3 to D5, A4), then Endless (E), then offline (O) last, then L1 and L2 after a final close and reopen.

## 3.1 Install

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| I1 | G0 | Folded. In Chrome open `https://<gh-user>.github.io/shape-of-war/` | Black screen, then the title menu, with the build id visible within 3 s | | |
| I2 | G0 | Chrome menu, Add to Home screen, Install | Install dialog appears and a Shape of War icon lands on the home screen | | |
| I3 | G0 | Look at the icon on the home screen | Original neon triangle icon, not a screenshot or letter placeholder | | |
| I4 | G0 | Tap the icon | Opens without the browser address bar | | |

## 3.2 Fullscreen

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| F1 | G0 | Launch from the icon | No status bar or navigation bar visible (fullscreen display mode) | | |
| F2 | G0 | In a browser tab (not the icon), load the page and tap once anywhere | Page enters fullscreen on the first tap | | |
| F3 | G4 | Start an Adventure level. Swipe in from the left screen edge once | Game pauses (Resume, Restart, Settings, Quit overlay) and does not exit | | |
| F4 | G0 | With the game open, unfold or rotate | Canvas fills the screen, no white or black bars beyond the intended letterbox | | |

## 3.3 Touch sticks on both halves

Menu, Adventure to start a level. Collect a few geoms before T6 so the super button has charge.

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| T1 | G1 | Folded. Left thumb anywhere on the left half, drag | Stick appears under the thumb and the ship moves in the drag direction | | |
| T2 | G1 | Right thumb anywhere on the right half, hold and drag | Ship aims in the drag direction and fires a 3-way spread continuously | | |
| T3 | G1 | Hold both thumbs for 10 s, then lift one | Released stick disappears, the other keeps working, no stuck input (the ship does not keep drifting or firing) | | |
| T4 | G1 | Unfold. Repeat T1 to T3 | Same behaviour on the main screen | | |
| T5 | G1 | Put a thumb down within 24 CSS px of the left edge, then the right edge. Tap, do not swipe (a left edge swipe is F3) | No stick spawns | | |
| T6 | G1 | Tap bomb (bottom centre), super (above bomb, needs charge), pause (top right), once each. Repeat with the other thumb resting on a stick nearby | Each responds once per tap. A resting stick thumb does not trigger them | | |
| T7 | G1 | Play 30 s | No visible lag between thumb and ship (subjective; note any) | | |

## 3.4 Fold and unfold mid level

Expect the pause overlay after each fold or unfold. Tap Resume.

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| U1 | G0 | In a browser tab with `?debug=1` on the URL so the top left label shows, fold or unfold | Label changes to the new size without a reload (no restart flash) | | |
| U2 | G2 | Mid level, hold both sticks, unfold | No reload, ship still visible, sticks cancel cleanly, after Resume they work on the next touch | | |
| U3 | G2 | Mid level, fold | Same as U2. Arena letterboxed for 21:9, HUD at the screen edges and not clipped | | |
| U4 | G2 | Note score and lives. Fold and unfold 5 times in 20 s, Resume, compare | No crash, score and lives preserved, FPS recovers within 2 s (Show FPS on) | | |

## 3.5 Neon slider

Settings screen. Neon is the first slider.

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| N1 | G1 | Drag the Neon slider from 0 to 100 slowly without lifting | Glow intensity, colour saturation and grid brightness change while dragging, not only on release | | |
| N2 | G1 | Set 0, then start a level and play 10 s | Visibly dim and desaturated, still playable | | |
| N3 | G1 | Set 100. Look at the arena outline and glow | Visibly brightest and most saturated. Note whether the outline looks jagged or soft (bug B4) | | |
| N4 | G3 | Set 33, close from recents, reopen, open Settings | Slider shows 33 and the game looks the same as before closing | | |
| N5 | G2 | Tap `Glow: Bloom` so it reads `Glow: Fallback`, then drag Neon. Set it back to Bloom afterwards | Slider still visibly changes the look on the fallback path | | |
| N6 | G3 | Watch the preview arena on the Settings screen while dragging | Preview animates and reflects the slider while dragging | | |

## 3.6 Generator reproducibility

Compare the whole `#<hash>`, not just the start. In D4 compare level 1 only: level 2 of seed 1234 and level 1 of seed 1235 are the same level by design (QA-001).

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| D1 | G2 | In a browser tab open `.../shape-of-war/?seed=42&level=3` and note the `#hash` and arena shape. Close the tab, open the same URL again | Same hash and same arena shape both times | | |
| D2 | G2 | Finish or lose a level. On the results screen note `Level #<hash>`, tap Retry, note the HUD hash | Same hash as the attempt just played | | |
| D3 | G3 | Settings, Play seed, type 1234, note the `Level 1 #<hash>` line, tap Play seed, note the HUD hash. Back out and repeat | Same hash both times | | |
| D4 | G3 | Settings, Play seed, type 1235 | Level 1 hash differs from the 1234 hash | | |
| D5 | G3 | Win level 1 (Next only appears on a win), tap Next, note the HUD hash | Level 2 hash differs from level 1 | | |

## 3.7 Performance

Show FPS on. Run each for the time stated. Record average and minimum in Notes. If any P line fails, Fable will ask for the USB protocol in `docs/04-device-and-pwa.md` section 14 and log it in `docs/qa/perf-log.md`.

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| P1 | G1 | Folded. Start the stress scene (Before you start, step 5). Watch 10 s | 120 fps target. A stable 60 passes only if Motion smoothness is Standard and you wrote that down | | |
| P2 | G1 | Unfolded. Same stress scene, 10 s | 60 fps or better on average, minimum not below 55 | | |
| P3 | G2 | Unfolded. Play a normal Adventure level for 60 s | 60 fps or better, no visible hitch on explosions | | |
| P4 | G2 | Unfolded, same stress scene. Note fps on Bloom, switch to Fallback, note fps. Set it back to Bloom | Both numbers recorded. The chosen path (Bloom) holds P2 | | |
| P5 | G4 | Unfolded. Play 10 minutes without stopping (Endless is fine) | Still 60 fps or better at the end. Note any drift or a warm phone | | |

## 3.8 Offline launch

Do this section late, it changes the connection state.

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| O1 | G3 | With data on, open the app from the icon, close it from recents, open it again | Build id matches the latest | | |
| O2 | G3 | Airplane mode on. Close from recents. Open from the icon | Menu loads within 3 s | | |
| O3 | G3 | Still offline. Start an Adventure level and play it to the results screen | Level plays to results | | |
| O4 | G3 | Airplane mode off | No error and the app keeps running | | |

## 3.9 Audio unlock

Media volume up.

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| A1 | G3 | Fresh launch from the icon. Tap once, then start a level | Sound effects play after the first tap | | |
| A2 | G3 | Cause a kill, a pickup, a death and a bomb | Each has a distinct synthesised sound | | |
| A3 | G3 | Switch to another app, then back | Sound resumes, no stuck tone | | |
| A4 | G3 | Settings, Volume slider to 0, then play | Silent | | |

## 3.10 Pause and resume

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| R1 | G2 | Tap pause (top right) | Simulation freezes. The overlay shows Resume and Quit (it also has Restart and Settings, expected) | | |
| R2 | G2 | Tap Resume | Play continues from the same state, no lost lives | | |
| R3 | G2 | Mid level, do the home gesture, return after 30 s | Game is paused on return, not dead. Resume works | | |
| R4 | G2 | Pause, tap Quit | Returns to the menu, no crash | | |

## 3.11 Results screen

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| S1 | G2 | Finish a level | Results show score, par, stars and the level hash | | |
| S2 | G2 | Tap Next | Starts the next level. At G3 and later the level is unlocked in Level select | | |
| S3 | G2 | On a results screen tap Retry | Same level hash as before | | |
| S4 | G2 | On a results screen tap Menu | Returns to the title | | |
| S5 | G2 | Die a few times in a level | Phone vibrates once per death and nothing else buzzes (not on kills, bombs or taps) | | |

## 3.12 Endless high score persistence

You cannot see the table (QA-012). Judge from the rank badge on the Game over screen (`New high score` for rank 1, `Top 10: #N` for a lower rank) and the `Best <n>` line.

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| E1 | G3 | Menu, Endless, play until death. Write down the score, badge and Best | Score is recorded: the badge says `New high score` or `Top 10: #N` and Best is at least your score | | |
| E2 | G3 | Close from recents, reopen, play Endless to death again with a worse score if you can. Compare | The earlier entry survived: Best still shows the first run's score, or the badge rank counts it | | |
| E3 | G3 | Play 3 more runs and write down the badge each time | Ranks make sense: a higher score never gets a worse rank number than a lower score, and Best never goes down. Fail only if a badge or Best contradicts that | | |
| E4 | G3 | Play one run of at least 2 minutes | Enemy pressure visibly rises over 2 minutes | | |

## 3.13 Progression and persistence

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| L1 | G3 | Finish level 1, close from recents, reopen, open Level select | Level 2 is still unlocked | | |
| L2 | G3 | Reopen the app, start Adventure level 1, read the hash | Same level 1 hash as before closing (run seed unchanged) | | |

## Paste-back for G4

Fill in every `=` with `pass`, `fail` or `n/a`. Put the build id from the bottom right label after `build=`. Copy the whole block, including the second line, into the Desktop chat.

```text
G4: I1= I2= I3= I4= F1= F2= F3= F4= T1= T2= T3= T4= T5= T6= T7= U1= U2= U3= U4= N1= N2= N3= N4= N5= N6= D1= D2= D3= D4= D5= P1= P2= P3= P4= P5= O1= O2= O3= O4= A1= A2= A3= A4= R1= R2= R3= R4= S1= S2= S3= S4= S5= E1= E2= E3= E4= L1= L2= build=
G4 extra: browser=<chrome or samsung> motion=<standard or adaptive> fps_cover=<avg/min> fps_main=<avg/min> notes=<text, one line per fail>
```
