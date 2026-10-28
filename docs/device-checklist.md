# Shape of War: device checklist (G4)

Owner: Proctor. Source: `docs/06-test-and-acceptance.md` section 3 (58 line items, counted: 4 + 4 + 7 + 4 + 6 + 5 + 5 + 4 + 4 + 4 + 5 + 4 + 2). Steps were checked against the code at main 5bef4ae. Ryan runs every line at G4 on the Z Fold 7, about 20 minutes, and pastes the block at the end back to Fable. The v2 checklist (V2-G4) is the last section of this file.

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

---

# v2 device checklist (V2-G4)

Owner: Proctor. Written in V2-E against main 6f11afb (waves A to D merged, GA to GD passed). Sources: the gate sections of `docs/10-v2-plan.md` (GA to GD), `docs/11-v2-spec-addendum.md` for every number, the GA to GD rows of `docs/STATUS.md`, and `docs/DECISIONS.md` lines 31:10 to 35:50. Ryan runs it on the Z Fold 7 after wave E merges and pastes the block at the end back to Fable. Triage of what is already known is in `docs/qa/bugs.md` (section "v2 triage"); the IDs V2-01 to V2-10 below point there.

## Bad news first (v2)

1. Every Result and Notes cell is blank. Nothing here was run on a device, and no earlier gate result is copied into a Result cell. A line with no result is not a pass. The GA to GD pastes appear only inside "Pass when" as a baseline, so a regression is visible.
2. A result without a build id is void. Write the id from the bottom right label after `build=`. Fable gives you the id; if the label differs, close the app from recents, reopen online, wait 5 seconds, close and reopen. Still different: stop.
3. This is longer than the 25 minutes docs/10 plans for GE: about 55 lines, closer to 45 minutes with the suggested order. If time is short, run these first, in this order: V-X1 to V-X4 (the never cut items), V-D1, V-D2, V-D3, V-D6, V-D7, V-D8, V-D9, V-D12, then the rest. A skipped line is `n/a`, never `pass`.
4. Where docs/10 gives a number, the pass line uses it. Where it does not, the pass line is the earlier paste (no worse than the gate you already passed) and is marked (proposed). Fable may edit the proposed lines before sending this file. The proposed lines are V-A3 to V-A5 (control 4 or better, turn 4 or better), V-D2 and V-D3 (3 or better, from a GD rating of 2), V-D6 (4 or better, from a GD rating of 3), V-D10 and V-D11 (no worse than GD).
5. The two wave E fixes (Glow run 0180 for trails and map effects, Chorus run 0181 for kill voicing, intensity range and glitches) were dispatched in parallel with this file. Their lines (V-D2, V-D3, V-D6, V-D7, V-D12) are written from DECISIONS 35:50, not from their hand-offs. If a hand-off says something else, Fable edits the criteria.
6. The Slime and Splime numbers here are the addendum's (Slime slows by 50 percent for 2 s, a Splime drops every 2 s), not the old 20 percent in `docs/10-v2-plan.md` (V2-07).
7. The expected `#hash` values below come from the generator (pinned in `tests/levelgen/gcTriage.test.ts` and `tests/qa/levelSnapshots.test.ts`, and for seed 42 levels 1 to 5 equal to tag v1.0.0), not from a device. If the HUD shows another hash, you are on the wrong seed or the wrong build: stop and tell Fable.
8. The Low tier measured below Standard at GD (V2-03). V-D1 asks for the three tiers in a fixed order so the number can be trusted this time.

## Before you start (v2)

1. Build id: the dim `build <sha> <date>` label bottom right. Write it down.
2. Motion smoothness: Android Settings, Display, Motion smoothness. Write down Standard or Adaptive. Standard caps the cover screen at 60 and is accepted when recorded.
3. Show FPS: Settings, `Show FPS: On`.
4. Defaults to start from: Settings, Space physics Off, Weapon pickups On, Effects Standard, Music 50, Neon where you like it. V-X1 changes them on purpose and says when to put them back.
5. Stress scene: `https://<gh-user>.github.io/shape-of-war/?stress=400`, or in Settings tap the `build ...` label 5 times within 3 seconds and then `Stress: 400 entities, 2000 particles`. Unfolded unless a line says folded.
6. Opening a level: add `?seed=42&level=<n>` to the URL in a browser tab (the intro card shows the seed). Level hash: the end of the top line during play, `L3  Par 1,000  #<hash>`.
7. Folded means the cover screen, unfolded means the main screen. A fold or unfold pauses the game; tap Resume.
8. Rating lines: 1 to 5 as the line says. Write the numbers in Notes. A line marked `r/d/c` means reaction, drift, control.
9. Result column: `pass`, `fail` or `n/a`. For every fail, write what you saw and on which screen.

Suggested order, to save switching: V-X4 first (build id, install), then one folded session on Medium physics (V-A2 to V-A8, V-B7, T-reg1 to T-reg3), then unfold for the seed 42 sessions (V-B1 to V-B6, V-C1 to V-C9, V-D2 to V-D12), then the stress scene (V-D1, V-A8, P-reg lines), then V-X1 to V-X3, then fold lines (F-reg), then offline (O-reg) last.

Seed 42 levels used below (hash from the generator):

| Level | Hash | Band | What it is for |
|---|---|---|---|
| 3 | `#E811153A` | 1 | First pickup (rapid only in band 1); same hash as v1.0.0 |
| 6 | `#93A4C56E` | 2 | Charger |
| 7 | `#CC6859DC` | 2 | Swirl |
| 9 | `#5BD14124` | 2 | Splime and Slime (one gravity well) |
| 13 | `#18B193B3` | 2 | Pierce is possible from band 2 (rapid and pierce) |
| 16 | `#D736C51F` | 3 | Bulwark, and orbit is possible from band 3 |
| 17 | `#43CADCE4` | 3 | Blink |
| 20 | `#D25C4D7D` | 3 | A crowded level for look, sound and orbit |
| 31 | `#66AF8BD7` | 4 | Sower (and two spawners) |

## V-A Space physics (gate GA)

Physics is judged folded first: docs/11 risk 13 is thumb ergonomics on the cover screen. GA paste for reference: `off_ok yes, low 4/1/5, medium 4/3/4/4, high 4/4/4/4, wall ok, persist yes, fps 60/60`.

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| V-A1 | GA | Settings, Space physics, tap Off. Play 60 s | Off is highlighted. The ship stops the moment you let go, like v1.1.0, with no drift | | |
| V-A2 | GA | Tap Low. Play 60 s. Rate r/d/c: reaction (1 sluggish, 5 crisp), drift (1 none, 5 far too much), control (1 lost, 5 fine) | Control 4 or better (docs/10 GA pass; GA paste: Low 4/1/5) | | |
| V-A3 | GA | Tap Medium. Play 60 s. Rate r/d/c | Control 4 or better (proposed; GA paste: Medium 4/3/4) | | |
| V-A4 | GA | Tap High. Play 60 s. Rate r/d/c | Control 4 or better (proposed; GA paste: High 4/4/4) | | |
| V-A5 | GA | On Medium hold one direction for 2 s, then flip the stick the other way. Rate the turn around (1 slow, 5 snappy) | Turn 4 or better (proposed; GA paste: 4) | | |
| V-A6 | GA | On Medium fly at a wall at full speed and let go | You slide along the wall and do not stick (GA paste: wall ok) | | |
| V-A7 | GA | Close the app from recents and reopen. Settings | The level you chose (Medium) is still highlighted (GA paste: persist yes) | | |
| V-A8 | GA | Medium, Show FPS on, `?stress=400`. Folded 10 s, then unfolded 10 s | Main 59 or better on average, cover 60 or better with motion recorded (GA paste: 60/60) | | |

## V-B Weapons (gate GB)

Pickups drop at the 15th scoring kill and then every 25, at most one on screen, 8 s of life, 20 s of weapon. Band 1 (levels 1 to 5) drops rapid only, pierce arrives in band 2 (level 6 up), orbit in band 3 (level 16 up). GB paste for reference: `pickup, rapid, pierce, orbit, death reset, toggle, drift orbit all ok; fps_main 60`.

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| V-B1 | GB | Open `?seed=42&level=3`. Play until a pickup appears (about 15 kills) and fly onto it | The HUD shows the weapon name and a countdown bar beside the multiplier, the way you fire changes, and the indicator is hidden while you hold the plain spread | | |
| V-B2 | GB | Collect rapid (level 3 is enough). Fire for a few seconds | Clearly different from spread: two parallel fast shots (ok or fail) | | |
| V-B3 | GB | Open `?seed=42&level=13` and collect pierce. Fire down a line of enemies | Clearly different: one long bright shot that passes through several enemies (ok or fail) | | |
| V-B4 | GB | Open `?seed=42&level=20` and collect orbit | Clearly different: four blades circle the ship and hurt what they touch (ok or fail) | | |
| V-B5 | GB | Die while holding a weapon | Back to spread, and no pickup is left on screen | | |
| V-B6 | GB | Settings, Weapon pickups Off. Play 60 s. Close from recents, reopen. Then set it back to On | No pickup appears in the 60 s, and Off is still selected after reopening | | |
| V-B7 | GB | Medium physics, orbit active. Drift across the arena | The blades follow the ship while it drifts | | |

## V-C Enemies (gate GC)

One level per enemy, seed 42, hash from the table above. For each, answer tell (can you see what it will do, yes or no), counter (did you learn how to beat it, yes or no) and fairness (1 unfair, 5 fair). GC paste for reference: `charger 4, bulwark 4, splime 5, swirl, blink, sower all read and countered`. V-C1 to V-C3 are the three Ryan said were not obvious at GC (Glow wave D added the Charger lane band, the Bulwark shield plate and the Splime drop ring); judge those fixes (V2-05).

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| V-C1 | GC | `?seed=42&level=6`, confirm `#93A4C56E`. Meet a Charger | Tell yes (you see the lane line while it winds up), counter yes (leave the lane, shoot it while it rests), fairness 3 or better | | |
| V-C2 | GC | `?seed=42&level=16`, confirm `#D736C51F`. Meet a Bulwark | Tell yes (you see the shield plate on its front), counter yes (flank it), fairness 3 or better | | |
| V-C3 | GC | `?seed=42&level=9`, confirm `#5BD14124`. Meet a Splime | Tell yes (you see its drop ring and the puddles), counter yes (shoot it from range), fairness 3 or better | | |
| V-C4 | GC | `?seed=42&level=7`, confirm `#CC6859DC`. Meet a Swirl | Tell yes, counter yes (lead it along the tangent, sidestep the dive), fairness 3 or better | | |
| V-C5 | GC | `?seed=42&level=17`, confirm `#43CADCE4`. Meet a Blink | Tell yes (ghost at the old spot, ring at the destination), counter yes, fairness 3 or better | | |
| V-C6 | GC | `?seed=42&level=31`, confirm `#66AF8BD7`. Meet a Sower | Tell yes, counter yes (shoot the mines from range, stay off the walls), fairness 3 or better | | |
| V-C7 | GC | Open `?seed=42&level=16` twice (close the tab between) | Same hash and the same enemies at the same times both times | | |
| V-C8 | GC | Medium physics, `?seed=42&level=17`. Meet a Blink | Still fair with drift (GC paste: blink fair under Medium) | | |
| V-C9 | GC | `?seed=42&level=9`. Drive through a Slime puddle, stay in it for a few seconds, fire across it, then fire a bomb | You slow by about half for about 2 s, staying in keeps you slowed, your shots pass through, the bomb clears every puddle, the puddle never kills you, fairness 3 or better (GC paste: slime ok at 50 percent) | | |

## V-D Look and sound (gate GD)

GD paste for reference: `fps_low 50/59, fps_standard 59/59, fps_high 59; grid 4, trails 2, particles 3, map effects 2; music layers ok, intensity 3 of 5, some glitches, pause and fold ok, slider 0 ok`. V-D2, V-D3, V-D6, V-D7 and V-D12 judge the wave E fixes.

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| V-D1 | GD | Unfolded, `?stress=400`, Show FPS on. In this order: Settings Effects Standard, then High, then Low last. For each: 10 s for the average, then one bomb and the lowest value you saw. Write average/bomb dip for each | Standard 59 or better average and a bomb dip not below 50 (docs/10 GD rule says 60 and a dip above 50; 59/59 was accepted at D8, so 59 is the line, V2-08). High recorded (GD: 59). Low average not below Standard's (Low is the cheapest tier; GD paste showed 50, see V2-03). Put Effects back to Standard | | |
| V-D2 | GD | Effects Standard, `?seed=42&level=20`, 2 minutes. Rate trails (ship trail while drifting on Medium, bullet trails, dash and swirl trails), 1 dull to 5 close to your reference | 3 or better (proposed; GD paste: 2) | | |
| V-D3 | GD | Same session. Rate map effects (wall pulse and wall flashes in a crowded wave), 1 dull to 5 | 3 or better (proposed; GD paste: 2) | | |
| V-D4 | GD | Settings, Music 50. Sit in the menus, then start a level and tap once | Silent in the menus, music after the first tap in play | | |
| V-D5 | GD | Watch the layers on `?seed=42&level=20`. When a new enemy type appears, then when the last of that type dies | A note sounds as the type enters, its motif joins within a bar or two, and the motif leaves about 2 bars after the last one is gone (ok or fail; GD paste: ok) | | |
| V-D6 | GD | Compare an empty arena (just after the level starts) with a crowded wave. Rate the difference in drive, 1 flat to 5 huge | 4 or better (proposed; GD paste: 3 of 5, and Ryan asked for a wider range, DECISIONS 35:50) | | |
| V-D7 | GD | Play 3 minutes of crowded waves on `?seed=42&level=20` with the music on and listen for clicks, dropouts or stutter. Write none, some or bad | None (GD paste: some, V2-01). `some` or `bad` is a fail | | |
| V-D8 | GD | Pause and resume. Then fold and unfold mid level. Tap Resume each time | The music stops on pause and picks up again after Resume, there is no reload, and it still plays after the fold | | |
| V-D9 | GD | Drag the Music slider to 0 and play. Drag it back to 50 | Silence from the music while sound effects still play (GD paste: ok). Back at 50 the music returns | | |
| V-D10 | GD | Same 2 minute session on Standard. Rate grid deformation (kill ripples, bomb ring, well dimple, wake), 1 dull to 5 | No worse than the GD paste, 4 (proposed) | | |
| V-D11 | GD | Same session. Rate particles (kill bursts, sparks), 1 dull to 5 | No worse than the GD paste, 3 (proposed) | | |
| V-D12 | GD | Only if Chorus run 0181 shipped kill voicing: kill a few dozen enemies in a crowded wave with the music on | Some kills sound a note and not every kill does (the selection rule, DECISIONS 35:50), and nothing glitches. If it did not ship, write n/a | | |

## V-X Never cut items (docs/11 "Engineering rules that stay")

| ID | Gate | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| V-X1 | all | The Off invariant. Settings: Space physics Off, Weapon pickups Off, Effects Low, Music 0. Play 60 s on `?seed=42&level=3`. Then put them back (Off, On, Standard, 50) | It looks and plays like v1.1.0: the static grid with its ripple, no trails, no music, the ship stops the instant you let go, no pickups | | |
| V-X2 | all | Generator. Open `?seed=42&level=3`, then `?seed=42&level=1` | Level 3 shows `#E811153A` and level 1 shows `#CD2B515B`, the same hashes tag v1.0.0 produced for those seeds. Level 6 shows `#93A4C56E` (the v2 content; v1.0.0 showed `#D56C5986`) | | |
| V-X3 | all | The neon slider. Settings, drag Neon from 0 to 100 slowly, on Effects Standard and again with Glow set to Fallback | Glow, colour and the grid brightness change while you drag, including the new lattice and trails, on both paths | | |
| V-X4 | all | Look at the build label, close the app from recents, open it from the home screen icon | The label is the id Fable gave you and there is no address bar (the install still works) | | |

## v1 regression lines (touch, fold, offline, fps)

Short forms of the v1 lines above. If one fails, say which v1 line it matches (T, F, U, O or P).

| ID | v1 | Do | Pass when | Result | Notes |
|---|---|---|---|---|---|
| T-reg1 | T1, T2 | Folded. Left thumb drags to move, right thumb drags to aim and fire | The stick appears under the thumb, the ship follows, and the right stick fires continuously | | |
| T-reg2 | T3, T5 | Hold both thumbs for 10 s, lift one. Then tap within 24 CSS px of each screen edge | The released stick vanishes and the other keeps working, nothing sticks, and an edge tap spawns no stick | | |
| T-reg3 | T6, F3 | Tap bomb, super (after collecting geoms) and pause once each. Swipe in from the left edge | Each responds once per tap, and the edge swipe pauses without exiting | | |
| T-reg4 | T4 | Unfold and repeat T-reg1 to T-reg3 | Same behaviour on the main screen | | |
| F-reg1 | F1 | Launch from the home screen icon | No status or navigation bar | | |
| F-reg2 | F2 | In a browser tab (not the icon), load the page and tap once | The page enters fullscreen on that first tap, and stays landscape (B2) | | |
| F-reg3 | U2, U3 | Mid level, fold, tap Resume, then unfold and tap Resume | No reload, ship visible, sticks work again, the arena is letterboxed on the cover screen and the HUD is not clipped (B2) | | |
| F-reg4 | U4 | Note score and lives. Fold and unfold 5 times in 20 s, Resume | No crash, score and lives preserved, fullscreen kept (U4), and the fps recovers within 2 s | | |
| O-reg1 | O2 | Airplane mode on, close from recents, open from the icon | The menu loads within 3 s | | |
| O-reg2 | O3 | Still offline. Start a level and play it to the results screen | It plays to the results, and the music (synthesised, no files) still plays | | |
| O-reg3 | O4 | Airplane mode off | No error and the app keeps running | | |
| P-reg1 | P1 | Folded, stress scene, 10 s, Standard effects | 60 or better with motion recorded (G4: accepted at 60 with Adaptive) | | |
| P-reg2 | P2 | Unfolded, stress scene, 10 s, Standard effects | Average 59 or better, minimum not below 55 (GD paste: 59) | | |
| P-reg3 | P3 | Unfolded, play a normal level for 60 s on Standard | 59 or better with no visible hitch on explosions | | |
| P-reg4 | P5 | Unfolded, Effects Standard, Music 50, play 10 minutes (Endless is fine) | Still 59 or better at the end, no stutter in the music, no drift, and the phone is not hot | | |

## Paste-back for V2-G4

Fill every `=` with `pass`, `fail` or `n/a`. Put the build id after `build=`. Copy both lines into the Desktop chat; the second line is the numbers, so write them even when the first line says pass.

```text
V2-G4: V-A1= V-A2= V-A3= V-A4= V-A5= V-A6= V-A7= V-A8= V-B1= V-B2= V-B3= V-B4= V-B5= V-B6= V-B7= V-C1= V-C2= V-C3= V-C4= V-C5= V-C6= V-C7= V-C8= V-C9= V-D1= V-D2= V-D3= V-D4= V-D5= V-D6= V-D7= V-D8= V-D9= V-D10= V-D11= V-D12= V-X1= V-X2= V-X3= V-X4= T-reg1= T-reg2= T-reg3= T-reg4= F-reg1= F-reg2= F-reg3= F-reg4= O-reg1= O-reg2= O-reg3= P-reg1= P-reg2= P-reg3= P-reg4= build=
V2-G4 numbers: browser=<chrome or samsung> motion=<standard or adaptive> A2=<r/d/c> A3=<r/d/c> A4=<r/d/c> A5=<turn> fps_low=<avg>/<bomb dip> fps_standard=<avg>/<bomb dip> fps_high=<avg>/<bomb dip> fps_cover=<avg/min> fps_main=<avg/min> trails=<1-5> map=<1-5> grid=<1-5> particles=<1-5> drive=<1-5> glitch=<none/some/bad> C1=<tell>/<counter>/<fair> C2=<tell>/<counter>/<fair> C3=<tell>/<counter>/<fair> C4=<tell>/<counter>/<fair> C5=<tell>/<counter>/<fair> C6=<tell>/<counter>/<fair> C9=<fair> notes=<text, one line per fail>
```
