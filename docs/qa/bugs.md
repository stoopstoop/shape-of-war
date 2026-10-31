# Shape of War: bug triage

Owner: Proctor. Written in W4 against main at 5bef4ae (glue: scoring port multiplier getter), after the W3 merges and the glow, swarm and thumbs fix branches. Proctor reports; the owning agent or Fable fixes. Severity: P0 blocks a gate, P1 breaks a SPEC requirement or loses data, P2 wrong but contained, info is worth knowing.

## Bad news first

1. The G3 paste and bugs B5 to B7 that the W4 brief points at are not in the repo. `docs/STATUS.md` at this head says G3 is pending with an empty evidence column and lists open bugs B1 to B4 only. A whole word search for B5, B6 and B7 over the whole worktree (excluding `node_modules`, `dist` and `.git`) finds nothing but stray bytes inside a PNG, and no commit on any branch touched STATUS.md after 3bfc410. The brief says all G3 items passed; this file cannot confirm that and does not record it as a result. B5 to B7 are listed below as untriaged. Fable: paste the G3 line and the three bug texts into the next brief, or into STATUS.md, and Proctor will triage them.
2. Nothing in B1 to B4 is device verified. All four have fix code merged, so each is "fixed in code, open until Ryan looks at the screen". The only things this file can prove are node side: the suite is green and the build is clean.
3. Two spec questions are waiting on Fable and affect the typed seed screen: QA-001 (adjacent run seeds repeat levels shifted by one) and QA-006 (Reset progress leaves the run seed and the Endless table, while docs/02 says the seed is reset only by Reset progress).
4. The Endless high score table cannot be seen anywhere in the app (QA-012). Scores are stored, but only a rank badge and a "Best" line reach the screen, so checklist E1 to E3 can only be judged from those. Fable decides whether a read only table view is wanted for v1.
5. No P0 is known to this file. The P1 items are B1, B3 and B4, each fixed in code and unverified.

## Source conflict between the brief and the repo

| The brief says | The repo says | What this file does |
|---|---|---|
| Ryan's G3 paste is in the STATUS.md gate log | G3 row: result blank, evidence "pending". Position text still reads "Open gate: G3" and "Glow: quality (B4) next" | Records no G3 result. Device columns in `docs/device-checklist.md` stay blank |
| Open bugs B5 to B7 are in STATUS.md | Only B1 to B4 are listed | B5 to B7 are shown as untriaged, with no invented text |
| All G3 items passed | No evidence anywhere in the repo | Not recorded. G4 re-runs every line anyway (docs/06 section 3) |
| (not mentioned) | `git log` shows feat/glow-quality (B4), feat/swarm-fixes and feat/thumbs-overlay merged, none in STATUS.md "Merged branches" | Request to Fable, see the hand-off |

## Summary

| ID | Sev | Status | Owning directory | Owner |
|---|---|---|---|---|
| B1 | P1 | Fix merged, device unverified | `src/ui/` (slider, settings), `src/render/neonApply.ts` | Ledger, Glow |
| B2 | P2 | Fix merged, device unverified | `src/main.ts` (glue, line 693) | Ledger asked in W3, Fable owns glue |
| B3 | P1 | Fixes merged, device unverified, subjective | `src/render/` | Glow |
| B4 | P1 | Fix merged (a16a8bc), device unverified | `src/render/` | Glow |
| B5 to B7 | unknown | Untriaged: text not in the repo | unknown | unknown |
| QA-001 | P2 | Open, decision needed | `src/core/rng.ts` line 33, `src/levelgen/leveldef.ts` line 241 | Forge (code), Foundry (hashes), Fable decides |
| QA-002 | P2 | Open, doc drift | `docs/03-architecture.md` line 478 | Fable |
| QA-004 | P2 | Open, test seam | `src/main.ts` line 34 | Ledger, Fable (glue) |
| QA-005 | P2 | Half fixed | `tests/levelgen/generator.test.ts` lines 224 to 228 | Foundry |
| QA-006 | P2 | Open, spec question | `src/core/settings.ts` lines 308 to 312 | Ledger, Fable decides |
| QA-007 | info | Open, doc drift | `docs/07-install-runbook.md` line 490 | Fable |
| QA-009 | info | Open | `src/render/devpanel.ts` lines 158, 175 to 177 | Glow |
| QA-011 | info | New, doc drift | `docs/06-test-and-acceptance.md` | Fable |
| QA-012 | P2 | New, decision needed | `src/ui/results.ts`, `src/ui/menu.ts`, `src/main.ts` line 458 | Ledger, Fable decides |

## Details

### B1 (P1, was P0): no neon slider on the Settings screen

- Origin: G1 `slider_live=fail` on build 9ece364. Ryan then confirmed the `?debug=1` dev panel slider does change brightness; the gap was that the Settings screen had no slider.
- Repro on the old build: open Settings, look for the Neon slider. It was absent.
- Fix in code: Ledger's `src/ui/slider.ts` and `src/ui/settings.ts` (Neon and Volume sliders, live preview), Glow's `src/render/neonApply.ts`. The dev panel no longer has a neon row (`src/render/devpanelState.ts` line 155).
- Retest on device: checklist N1 to N6, in particular N1 (changes while dragging, not only on release) and N5 (works on the fallback path).
- Owner: Ledger for the screen, Glow for the look.

### B2 (P2): Chrome tab runs portrait on the cover screen

- Origin: STATUS.md. No further repro text exists, so this is the known part only.
- Repro: open the site in a Chrome tab (not the installed icon) on the cover screen and see whether the game renders in portrait.
- Fix in code: `src/main.ts` line 693 calls `screen.orientation.lock('landscape')` after `requestFullscreen` on the first `pointerup`. The installed PWA is separately covered by `orientation: landscape` in `public/manifest.webmanifest`.
- docs/04 "Bad news first" item 3 confirms the lock only works while in fullscreen and throws otherwise.
- Risk, inferred from the code and not seen on device: the call is one shot (the listener removes itself) and the catch is silent, so a refusal leaves the tab in portrait with no retry.
- Retest on device: F1 and F4 from the installed icon, plus one launch from a browser tab to see whether the lock took.
- Owner: Ledger was asked in W3. The call site is glue in `src/main.ts`, so Fable owns any follow-up.

### B3 (P1): visual quality thin

- Origin: Ryan, "graphics need to be improved". STATUS.md points at the Glow W3 brief (particles, trails, shake, stronger bloom).
- Fix in code: feat/glow-fx (live neon controller, particles, trails, shake, grid ripple) and the follow-up a16a8bc (kill ripples, super ring, homing bullets, telegraph flash).
- This is a judgement call and node cannot settle it. Retest on device: N2, N3, P3, and Ryan's own verdict, recorded in the notes column at G4.
- Owner: Glow.

### B4 (P1): pixelation on device

- Origin: STATUS.md. Jagged arena outline, soft glow. Suspects were bloom resolution 0.5, renderer resolution, antialias not applied.
- Fix in code: a16a8bc, "crisp full resolution line layer with MSAA, DPR bloom policy", merged at 17845a3.
- Retest on device: look at the arena outline folded and unfolded (N3, P2, P3). Also re-measure perf, because a full resolution line layer with MSAA costs GPU time: `docs/qa/perf-log.md` section 6 trigger 2 applies.
- Owner: Glow.

### B5 to B7: untriaged

- The brief says they are in STATUS.md. They are not. No severity, repro or owner can be given without inventing it.
- Needed from Fable: for each, one line of what Ryan saw, the screen (folded or unfolded), and the build id. Proctor then adds a block here in the same format as B1 to B4.

### QA-001 (P2): adjacent run seeds produce the same levels shifted by one index

- `deriveSeed(runSeed, n)` is `fmix32(runSeed + n)` (`src/core/rng.ts` line 33), and `levelSeed` (`src/levelgen/leveldef.ts` line 241) uses it. Level n+1 of run s is the same level as level n of run s+1. Runs d apart share `40 - d` of their first 40 level seeds. Random 32 bit run seeds make this negligible in normal play.
- Repro: Settings, Play seed. Start 1234 and note level 2. Start 1235 and note level 1. Same arena, roster and objective (`tests/qa/seedOverlap.test.ts` compares the content; the identity fields differ).
- Effect on the device checklist: D4 compares 1234 with 1235 at level 1, which differ, so D4 passes. Do not compare level 2 of 1234 with level 1 of 1235 and call it a bug.
- Changing it is Fable's call: SPEC 3.2 says "run seed plus n", and a change bumps `GENERATOR_VERSION` and every pinned hash.
- Evidence: `tests/qa/seedOverlap.test.ts` (4 tests).

### QA-002 (P2): doc drift on the unlocked default

- docs/03 line 478 gives `sow.progress.unlocked` a default of 0. The code returns 1 (`FIRST_LEVEL`) and `tests/settings/progress.test.ts` expects 1. Fix the doc.

### QA-004 (P2): the scoring port is private to the DOM boot module

- `src/main.ts` line 34 holds the port Ledger wires into Swarm. No test can import it, so `tests/qa/scoringReplay.test.ts` keeps a mirror. This already drifted once: `5bef4ae` added a `multiplier` getter to the real port and the mirror did not have it, so the old test still passed through Swarm's fallback while no longer exercising the glue. Fixed in this branch (e95a8f8): the mirror has the getter, a no-getter variant covers the fallback, and a stub getter proves the HUD carries the port's value.
- What remains: the mirror can drift again. Request: export `scoringPort` from `src/game/scoring.ts` and import it in `main.ts`, then Proctor deletes the mirror.

### QA-005 (P2): wall clock sensitive tests

- Fixed: `tests/game/stress.test.ts` now takes the median of three runs (be857ca). Seen this run: 0.128 ms per step, heap change about -928 KiB.
- Open: `tests/levelgen/generator.test.ts` lines 224 to 228 asserts 200 levels in under 500 ms. Seen 225 ms, 2.2 times headroom. No flake in 21 full runs this wave (`docs/qa/suite-runs.md`). A heavily loaded machine could trip it. Foundry decides whether to widen or drop it.

### QA-006 (P2): Reset progress leaves the run seed and the Endless table

- docs/02 line 120: the run seed is "reset only by Reset progress". `resetProgress` (`src/core/settings.ts` lines 308 to 312) writes only `sow.progress.unlocked` and `sow.scores.adventure`.
- Repro: note the level 1 hash on the HUD or the results screen. Settings, tap Reset progress twice. Start Adventure. Level 1 has the same hash, so the seed was not reset. The Endless table is also untouched.
- Whether Reset progress should clear either is Fable's call (docs/01 line 328 says only "Reset progress (two-tap confirm)"). Either the doc or the code changes.
- Checklist L2 ("run seed unchanged after reopening the app") is unaffected.

### QA-007 (info): doc drift on who writes the checklist and when

- docs/07 line 490 says Proctor writes `docs/device-checklist.md` in W3. docs/05 and docs/06 say W4. It is written in W4.

### QA-009 (info): click listeners in the dev panel

- `src/render/devpanel.ts` lines 158 and 175 to 177 bind `click` on four buttons. A tap produces a click, so it works on touch, but the hard rule says no mouse handlers. Worth a one line decision from Fable. Everything else in `src/` uses Pointer Events, or `input` on the seed text field.

### QA-011 (info): docs/06 wording differs from the build

- docs/06 P1 says `?debug=1&stress=400`. `?debug=1` no longer opens the dev panel (`src/render/devpanelState.ts` line 155). `?stress=400` still starts the stress scene (`src/main.ts` line 607), and Settings has a hidden stress button: tap the build label at the bottom of Settings 5 times within 3 seconds, then "Stress: 400 entities, 2000 particles" appears (`src/ui/settings.ts` lines 140 to 153 and 265 to 276). `docs/device-checklist.md` uses these.
- docs/06 U2 and U3 do not mention that a fold or unfold auto-pauses the game (docs/01 section 10, `src/main.ts` line 639). The checklist says to tap Resume after each fold.

### QA-012 (P2): the Endless high score table is stored but never shown

- SPEC 3.2 and docs/01 line 48 call for a local top 10 high score table. `recordEndlessScore` stores it (`src/main.ts` line 458, `src/core/settings.ts`), and `tests/settings/endless.test.ts` covers insert in score order, the cap at 10, reload and corrupt data. No code reads the table back for display: the only readers of `loadEndlessScores` are tests, and the results screen shows a rank badge (`New high score` or `Top 10: #N`, `src/ui/results.ts` lines 14 to 21) and one `Best` line.
- Repro: Menu, Endless, play to death. The Game over screen shows the score, a badge when the run made the top 10, and `Best <n>`. There is no screen that lists the ten entries.
- Effect on the device checklist: docs/06 E1 to E3 say "score appears in the table", "table unchanged" and "table sorted descending, at most 10 entries". Ryan cannot see a table, so `docs/device-checklist.md` words E1 to E3 against the badge and Best line and says so. Sorting and the 10 entry cap stay proven by the unit tests only, not on a device.
- Fable decides: add a read only table view (Ledger, a few lines of DOM, would need a docs/01 line since the screens list has none) or accept the badge as the v1 table and edit docs/06 E1 to E3. Not a feature this branch can add.

## Resolved or superseded since the last triage

| ID | Note |
|---|---|
| QA-003 | HUD multiplier could flash x1 under Ledger's port. Fixed by be857ca (Swarm reads the port's getter in `emitHud`) and 5bef4ae (the getter in `main.ts`). The test is a plain `it` now and passes. Device check: watch the multiplier while collecting geoms |
| QA-008 | G1 `slider_live` failure. Superseded: Ryan confirmed the dev panel slider works, and B1 was reclassified to the missing Settings slider |
| QA-010 | `sow.scores.endless` and `sow.schema` now exist in `src/core/settings.ts`. `tests/qa/storageKeys.test.ts` lists both as implemented and writes and reads them at run time (e95a8f8) |

## Observations that are not defects

- The 5000 seed sweep found 0 invalid levels and 0 levels that needed the re-derive path (5080 levels).
- Base values, multiplier rules, destroy kill counting and the 999 cap agree between Swarm and Ledger for every kind.
- No `Math.random` outside `src/core/rng.ts`, no keyboard, mouse or gamepad listeners other than the QA-009 clicks, and the only binary assets are the four PWA icons. The 512 px icon is an original cyan neon triangle on black (looked at, not a device result: I3 still needs the home screen).
- Production build: 12 JS files, 716,408 bytes raw, 215,698 bytes gzipped (about 211 KiB). That is 14 percent of the 1.5 MB gzipped limit. See `docs/qa/perf-log.md` section 7.

---

# v2 triage (wave E)

Owner: Proctor. Written in V2-E against main 6f11afb (waves A to D merged, GA to GD passed on device). Sources: the GA, GB, GC and GD rows of `docs/STATUS.md`, the GD paste Fable supplied, `docs/DECISIONS.md` lines 26:10 to 35:50, the open bug list in STATUS, and a re-check of every v1 item above against the code at this head. Severity as above: P0 blocks a gate, P1 breaks a SPEC requirement or loses data, P2 wrong but contained, info is worth knowing. Owner is the roster nickname; the owning directory is where the fix would go. Nothing here was run on a device by Proctor.

## Bad news first (v2)

1. No P0 is open. GA, GB, GC and GD all passed on device, and the Off invariant holds in the code today: with the flag off, 5080 levels (5000 seeds plus both edge seeds over 40 levels) plus 500 Endless defs and 2000 Endless segments hash exactly as they did at tag v1.0.0 (`tests/qa/generatorFlagSweep.test.ts`, golden from the tagged source).
2. The Low effects tier measured slower than Standard at GD (50 against 59). Low is the v1 grid path that held 60 at G4, and it is the escape hatch of v2 cut 4. If the number is real, the fallback does not fall back. The paste is ambiguous (V2-03), so this is a recheck first, not yet a verdict.
3. Standard holds 59, not 60, on the main screen. The addendum (SPEC 5 wording) says 60 is a strict floor for Standard. Ryan accepted 59 at D8 (DECISIONS 35:50). The decision is recorded; the addendum text still says strict (V2-08).
4. Ryan's GD music notes include kill voicing and a selection rule for which kills sound. SPEC 3.9 and docs/11 do not list either. Chorus is working from STATUS wave E text. A builder that follows CLAUDE.md "no feature outside docs/01" must refuse them until Fable adds a docs/11 line (V2-04).
5. Trails (2 of 5) and map effects (2 of 5) are the weakest visual ratings, and trails are second in Ryan's own reference priority (grid, trails, particles). Glow is on it (run 0180).
6. Half of the open items below are paste or document hygiene, not code (V2-06 to V2-10). The v1 bug list in STATUS is stale (V2-09).

## Summary (v2)

| ID | Sev | Status | Owning directory | Owner |
|---|---|---|---|---|
| V2-01 | P1 | Open, fix run 0181 in flight | `src/audio/music/` | Chorus |
| V2-02 | P2 | Open, fix run 0180 in flight | `src/render/` | Glow |
| V2-03 | P2 | Open, recheck on device first | `src/render/` (Low path), measurement | Glow, Ryan |
| V2-04 | P2 | Open, scope decision needed | `docs/11-v2-spec-addendum.md`, `src/audio/music/` | Fable, Chorus |
| V2-05 | P2 | Fix merged in wave D, not rated on device | `src/render/` | Glow |
| V2-06 | info | Open, paste gaps | not code | Fable |
| V2-07 | P2 | Open, doc drift (plan values), one stale code comment | `docs/10-v2-plan.md`, `src/game/ship.ts` (comment) | Fable, Swarm (comment, via Request) |
| V2-08 | P2 | Decided at D8, doc not updated | `docs/11-v2-spec-addendum.md` | Fable |
| V2-09 | info | Open, STATUS drift | `docs/STATUS.md` | Fable |
| V2-10 | info | Measured, no action needed | `src/levelgen/` | Foundry |
| V2-11 | info | Open, stale todo in the suite | `tests/levelgen/par.test.ts` line 96 | Foundry |

## Details (v2)

### V2-01 (P1): music glitches at GD, intensity range not judged good

- Origin: GD paste `music_glitch=some`, `music_intensity` given as 3 of 5 (the template asks ok or fail), `music_layers=ok`, `pause_fold_music=ok`, `music_zero=ok`. DECISIONS 35:50 adds Ryan's note that the glitches must go and the intensity range must widen.
- Rule it breaks: docs/10 GD pass says "no `bad` glitch", so `some` passed the gate. It is still the cut 1 path: docs/10 and docs/11 cut 1 fire if glitches persist after one Chorus fix run, and cut 2 after a second.
- Repro: Settings, Music 50, Effects Standard. Open `?seed=42&level=20` unfolded (a crowded, six kind level), Show FPS on, play two minutes. Listen for clicks, dropouts or stutter, and note whether they line up with an fps dip (the CPU suspects are the 16 voice cap, the 25 ms timer under load and the sfx cap of 24 sharing the main thread). Then repeat with `?seed=42&level=3` for a quiet comparison.
- What the code lets me say without a device: the voice cap, the gain sum and the quantisation are unit tested in `tests/audio/music/`, so a glitch is more likely main thread jank or scheduler lateness than a budget overrun. This is an inference, not a measurement.
- Owner: Chorus, run 0181. Retest: checklist V-D4 to V-D9 and V-D12.

### V2-02 (P2): trails and map effects read dull

- Origin: GD paste `trails=2`, `map=2` (1 dull to 5 close to the reference), `grid=4`, `particles=3`. DECISIONS 35:50 names this as the visual gap.
- Context: B3 (visual quality thin, STATUS) is still listed open. The v2 ratings are the newest evidence on it: grid and particles are fair, trails and map effects are not.
- Repro: Settings, Effects Standard, play two minutes on `?seed=42&level=20`. Judge the ship trail while drifting under Medium space physics, bullet trails on rapid and pierce, Charger dash and Swirl trails, the wall pulse and wall flashes during a crowded wave.
- Owner: Glow, run 0180. Retest: checklist V-D2 and V-D3.

### V2-03 (P2): Low tier 50 against Standard 59 at GD

- Origin: GD paste `fps_low 50/59`, `fps_standard 59/59`, `fps_high 59`. The template reads `<average>/<bomb dip>`.
- Problem 1: Low is the cheapest tier (v1 grid and ripple, trails and map effects off) and it held 60 at G4. A Low that averages below Standard says either a regression on the Low path or a bad measurement.
- Problem 2: the paste cannot be read as written. An average of 50 with a bomb dip of 59 means the lowest value is above the average. Either the two numbers are average and minimum in some other order, or Low was measured first, cold. High gives one number and no bomb figure.
- Candidate causes, none confirmed: the Low path still runs the v1 grid Graphics redraw with the wave C and D tells now drawn on every tier (`enemyFxGates` keeps `tells: true` on Low); a cold first measurement (shader and texture warm up); thermal state after the earlier runs.
- Repro: unfolded, `?stress=400`, Show FPS on, Motion smoothness recorded. Measure Standard first, then High, then Low last, each 10 s for the average, then fire one bomb and write the lowest value seen. Write the three numbers per tier in the order average, bomb dip.
- Severity: P2 because Low is not the default. It becomes P1 if Low is still below Standard after a warm repeat, because the cut 4 fallback is then broken.
- Owner: Glow. Retest: checklist V-D1 (written so the order and the two numbers are unambiguous).

### V2-04 (P2): music kill voicing and a selection rule are not in the addendum

- Origin: DECISIONS 35:50 and STATUS wave E, "music needs per enemy kill notes, a selection rule so not every kill sounds, wider intensity range, and the glitches removed" (Ryan's GD note as Fable wrote it).
- Gap: SPEC 3.9 permits a stinger when a kind enters, a motif per kind, intensity from `sim:threat`. A note per kill, and a rule choosing which kills sound, are new behaviour. Kill sounds exist as sfx (`explode`), under the 24 voice sfx cap, and docs/11 section 13 says the sfx table is unchanged.
- Risks if built as stated: music voices 16 plus sfx 24 sharing the main thread is already the V2-01 suspect, and a note per kill at crowd density adds the most scheduler events exactly when threat is highest. The determinism rule (music a pure function of seed, kind, bar via `hash01`) needs a stated input for kill notes, because a kill time is not a bar.
- Needed: one docs/11 line from Fable giving the clause, the voice budget for kill notes and the selection rule, before Chorus builds it. If the run has already started, the line is a retro fit and the hand-off should say which clause it relied on.
- Owner: Fable (addendum), Chorus (build).

### V2-05 (P2): the GC readability fix is not yet judged on a device

- Origin: Ryan's GC note (DECISIONS 33:30): the counters of Charger, Bulwark and Splime were not obvious. Glow's wave D commit 7927293 added the Bulwark shield plate, the Charger lane band and the Splime drop ring on the real 2 s cycle.
- GD asked about layers, fps and music, not about the three tells, so the paste does not rate them.
- Repro and retest: checklist V-C1 to V-C3 (one level per enemy, seed 42, the level indices from Foundry's GC hand-off, which this file does not have).
- Owner: Glow. Open until Ryan answers those lines.

### V2-06 (info): gaps in the pastes

- GA: `low 4/1/5` has three numbers where the template has four, so the Low turn rating is missing (medium and high have all four).
- GB: `music_base` was optional and is not recorded.
- GD: the three items under V2-03, and `music_intensity=3` where the template asks ok or fail (treated here as neither).
- Action: Fable, state the number format in each future paste template and put a default for skipped items in the block. Nothing to fix in code.

### V2-07 (P2): the plan and one code comment still carry the old Slime numbers

- Source of truth is docs/11 and the code: Slime slows the ship by 50 percent (`SLOW_FACTOR = 0.5`, `src/game/enemies/slime.ts`) for 2 s (`SLOW_SEC = 2`), and Splime drops every 2 s (`DROP_SEC = 2`, `src/game/enemies/splime.ts`). Ryan set these at GC and DECISIONS 31:10 applied them.
- docs/10-v2-plan.md still says 20 percent (factor 0.8), a drop every 3.5 s and "slowed by about a fifth" in the Splime and Slime rows, the Forge and Swarm briefs and the GC device check. It is the plan, not canon, so nothing breaks, but a reader of the plan gets the wrong numbers.
- `src/game/ship.ts` line 36: the `slowFactor` comment says "Swarm sets 0.8 in wave C". The value is 0.5. Comment only, no behaviour.
- Owners: Fable for docs/10. The ship.ts comment is outside Proctor's files: Request to Fable, Swarm owns `src/game/` in the wave E fix lane if one is opened.

### V2-08 (P2): Standard at 59, addendum says a strict 60 floor

- docs/11 SPEC 5: "60 fps is a floor ... The floor is strict for Standard". GD measured 59 average and 59 after a bomb. Ryan accepted at D8 (DECISIONS 35:50, "Standard stays the default").
- The deviation is decided but the canon text is unchanged, so a later reader sees a pass that the text calls a miss. Fable: either word the floor "59 or better on the 60 Hz main screen" in docs/11, or log the exception where the floor is stated.
- The v2 checklist uses the GD number as the baseline, not 60: V-D1 passes at 59 or better average with the bomb dip not below 50 (the docs/10 GD rule), and says so.
- Owner: Fable.

### V2-09 (info): STATUS drift

- "Open bugs" still lists B1 (P1), B2 (P2), B3 (P1) and B4 (P1) as open. B1 and B4 have passing device evidence (G3: `slider=yes`, `crisp=yes/yes`), B2 has indirect evidence (G4 passed F2 and F4, with U4 and the stars as the only two fails and both fixed). B3 is subjective and the v2 ratings above are its newest data.
- Recommendation, Fable decides: close B1 and B4; close B2 with the note that no portrait report followed G3 and that the v2 regression lines F-reg2 and F-reg3 retest it; keep B3 open as P2 and let GE judge V2-02.
- "Current position" in STATUS still carries a sentence about "wave D (Glow: look, Chorus: wiring and motifs, Ledger: effects and music settings)" after wave D has merged.
- Owner: Fable.

### V2-10 (info): generator cost with the flag on

- DECISIONS 32:30: the CI deploy missed a 500 ms budget at 957 ms and "Foundry owes a generator perf look (200 levels now about 2x slower than v1)".
- Measured here, same Mac, same seed spread, under a load average of 3 to 7: v1.0.0 sources 3.1 to 3.2 s for 5000 levels (0.63 ms each); current flag off 3.6 s for 5080 (0.71 ms); current flag on 3.9 s (0.76 ms). That is 1.1 times v1 with the flag off and 1.2 times with it on, not 2 times. The slow CI runner is the likelier explanation for the earlier numbers (an inference: nothing here ran on CI).
- No action. `tests/qa/generatorFlagSweep.test.ts` bounds flag on at 4 times flag off, which only catches a blow up. The wall clock budget at `tests/levelgen/generator.test.ts` is still QA-005.
- Owner: Foundry, only if the CI runner misses a budget again.

### V2-11 (info): a stale `it.todo` shows as the one todo in every run

- `tests/levelgen/par.test.ts` line 96: `it.todo('scoreInTime: a competent run that ends at target earns at least 1 star')`. Its comment says the level ends the moment the score reaches the target, so a winning run lands at 0.8 x par and earns 0 stars. That bug was fixed at G4: DECISIONS 21:50, option a, scoreInTime runs the full timer and stars come from the final score.
- The todo now reports a problem that no longer exists and shows as `1 todo` in every suite run (113 files, 1553 tests, 1 todo at this head).
- Foundry: turn it into a real test (a run that reaches target and keeps scoring ends with at least 1 star) or delete it. It is not Proctor's file.

## v1 items carried into v2, status at 6f11afb

Re-checked against the code today. The "Recommended" column is a suggestion; Fable decides.

| ID | Sev | Status at this head | Recommended |
|---|---|---|---|
| B1 | P1 | Device evidence: G3 `slider=yes` | Close |
| B2 | P2 | Indirect only (G4 F2 and F4 pass) | Close with a note, retest in F-reg2 and F-reg3 |
| B3 | P1 | Subjective, GD trails 2 and map 2 | Downgrade to P2, tracked as V2-02 |
| B4 | P1 | Device evidence: G3 `crisp=yes/yes` | Close |
| QA-001 | P2 | Open: `deriveSeed` is still `fmix32(runSeed + index)` (`src/core/rng.ts` line 33) | Unchanged, Fable decides |
| QA-002 | P2 | Open: docs/03 line 478 still says default 0 | Doc fix, Fable |
| QA-004 | P2 | Open: `scoringPort` is still a private const in `src/main.ts` line 38 | Request unchanged |
| QA-005 | P2 | Open: the generator wall clock budget was widened to 2500 ms at c82eb1e after a CI miss; see V2-10 | Foundry decides whether to drop it |
| QA-006 | P2 | Open: `resetProgress` still writes only unlocked and the Adventure table (`src/core/settings.ts` line 417) | Fable decides; note v2 settings are also untouched by it, which matches the addendum |
| QA-007 | info | Open: docs/07 line 490 still says W3 | Doc fix, Fable |
| QA-009 | info | Open: four `click` listeners in `src/render/devpanel.ts` lines 158, 175 to 177 | Fable decision |
| QA-011 | info | Open: docs/06 line 215 still says `?debug=1&stress=400` | Doc fix, Fable |
| QA-012 | P2 | Open: nothing but `recordEndlessScore` reads the Endless table; the results screen shows a badge and Best | Fable decides; G3 `table=yes` fits the badge reading |

## v2 observations that are not defects

- Off invariant, generator side: proven by hash for 5000 seeds (`tests/qa/generatorFlagSweep.test.ts`). Simulation side: `tests/game/ship.space.test.ts` and `tests/game/weapons.test.ts` carry the v1 golden hashes, and `tests/qa/physicsReplay.test.ts` and `tests/qa/weaponDropReplay.test.ts` add cross module replays.
- Settings keys: the four v2 keys (`sow.settings.spacePhysics`, `weaponPickups`, `effects`, `music`) keep the `sow.settings.` prefix, collide with nothing and are the only new keys (`tests/qa/storageKeys.test.ts`, `tests/qa/storageKeysV2.test.ts`).
- Assets: the only binary files in the repo are the PWA icons (`tests/qa/noAssets.test.ts`).

---

# v3 triage (harden)

Owner: Proctor. Written in the v3 harden run against main 7263f75 (V3-A, V3-B, V3-C1, V3-C2, the fix waves and the readability wave merged; the last device paste is G3C on 193db9f, and the G3C retest on e96762b is still to come). Sources: the gate log and the open bugs in `docs/STATUS.md` (G2.1, G3A, G3B, G3C and the two retests), the v2 triage above, and a re-check of every item against the code at this head. Severity: P0 blocks a gate, P1 breaks a SPEC requirement or hurts the core loop, P2 wrong but contained, info is worth knowing. Owner is the roster nickname; the owning directory is where the fix would go. Nothing here was run on a device by Proctor. Ryan's words are quoted from the STATUS gate rows as Fable recorded them.

## Bad news first (v3)

1. No P0 is open. Every boss that has been put in front of Ryan was rated 4 for fairness at G3C and "about right" at G3A, and the node side proves it holds: 10 bosses, 6 fuzzed 60 s sessions each, 60 sessions, zero violations of fairness rules 5 and 6 or of any cap (`tests/qa/bossFairnessSweep.test.ts`).
2. The top open item is V3-01 (P1): the Prism damage window is "not readable with or without music" (G3C, fail). Bastion and Prism are in the boss floor (docs/12 G3C pass text), so Prism cannot be cut the way Twins and Tempest can (cut 8). Three fixes merged in the readability wave (17bfa9e Swarm, 7207b91 Glow, e96762b Chorus) and none is rated on a device yet.
3. V3-09 (P1) is a carry over from v2: the Low effects tier is still slower than Standard. GD measured 50 against 59 and GE measured 55/52 against 59/59. Low is the escape hatch of cut 4; if it is slower than Standard it is not an escape hatch. No v3 merge touched it.
4. The weapon combine and drone mode work (docs/13 "Combining", gate G3D) is not built at this head, and neither is wave V3-E. `weaponCombine` exists only as an event type and a palette stub. The checklist lists the G3D lines so Ryan can see what is coming, but they cannot pass today, and the spread ingredient replay is a skipped test until `COMBO_TABLE` exists (V3-12).
5. Boss levels run at 56 to 58 fps in the pastes (G3A 58, G3B 56 and 57, G3C 58), under the 59 that Ryan accepted at D8. The pastes do not say which screen (V3-10).
6. The G3B paste gave all items yes but no fairness numbers, and G3C gave "4 and about right" for four bosses without the per boss split. Not blocking; the V3-G4 block below asks for every number.

## Summary (v3)

| ID | Sev | Status | Owning directory | Owner |
|---|---|---|---|---|
| V3-01 | P1 | Fix merged (17bfa9e, 7207b91, e96762b), not rated on device | `src/render/` (`bossPrism.ts`, `prismFx.ts`), `src/audio/music/`, `src/game/bosses/prism.ts` | Glow, Chorus, Swarm |
| V3-02 | P2 | Fix merged (7207b91), not rated | `src/render/` (`bossTier3.ts`) | Glow |
| V3-03 | P2 | Fix merged (17bfa9e, Bastion phase 3), not rated | `src/game/bosses/bastion.ts` | Swarm |
| V3-04 | P2 | Partly fixed (7207b91 silhouettes), not rated; three tier 3 bosses still share `bossRed` | `src/render/`, `src/game/bosses/table.ts` | Glow, Swarm |
| V3-05 | P2 | Fix merged (17bfa9e hit events, 7207b91 hit feedback), not rated | `src/render/hitFx.ts`, `src/game/bosses/core.ts` | Glow, Swarm |
| V3-06 | P2 | Built (17bfa9e `sim:bossCrack`, 7207b91 cracks, e96762b stingers), not rated | `src/render/`, `src/game/bosses/core.ts` | Glow, Swarm |
| V3-07 | P2 | Open, intent to confirm | `src/game/bosses/twins.ts` | Swarm |
| V3-08 | P2 | Open, to confirm on device (generator side proven) | `src/render/` (boss look), `src/ui/` (banner) | Glow, Ledger |
| V3-09 | P1 | Open, carried from V2-03, measured twice | `src/render/` (Low path) | Glow |
| V3-10 | P2 | Open, measure per screen | `src/render/` (boss and hazard fx, burst caps) | Glow |
| V3-11 | P2 | Open, doc drift (hazard cap 6 against 8) | `docs/12-v3-plan.md`, `docs/13-v3-spec-addendum.md` | Fable (Scribe) |
| V3-12 | info | Scope fact: G3D and V3-E not built | `src/game/weapons.ts`, `src/game/drones.ts` | Swarm |
| V3-13 | info | Open, paste gaps | not code | Fable |
| V3-14 | info | Open, needs the brief to confirm | `src/core/events.ts` | Fable, Forge |
| V3-15 | info | Open, carried (`it.todo`, `scoringPort`, `click` listeners) | `tests/levelgen/`, `src/main.ts`, `src/render/devpanel.ts` | Foundry, Ledger, Glow |

## Details (v3)

### V3-01 (P1): the Prism damage window is not readable

- Origin: G3C on 193db9f, "Prism window not readable with or without music (fail)". Fairness for Prism was rated 4 and about right, so the fight is fair once the window is understood; the failure is the tell.
- Repro: `?seed=42&level=50` (the level 50 boss is Prism, `tests/qa/bossScheduleGolden.test.ts`), unfolded, Show FPS on. Fight until phase 1 and watch the run up to white. Do it twice: Music 50, then Music 0 (docs/12 asks for the window to read with the music at 0).
- What the code now does, from the merge messages and the event table: Swarm reports `sim:bossWindow` every 100 ms during the run to the window (`windowLead` in `src/game/bosses/types.ts`), Glow flashes the window (7207b91), Chorus plays a window cue (e96762b). Whether that reads is a device question.
- Retest: checklist V3-C2 lines (Prism window with music, without music, the countdown).
- Fallback if it still fails after one fix run: Prism is in the floor (a failure is a Swarm fix run, docs/12 G3C pass text), so cutting it is not an option. The choices are a longer lead, a hold of the white frame, or a text cue. Fable decides.
- Owner: Glow (look), Chorus (cue), Swarm (lead time). Open until Ryan answers.

### V3-02 (P2): tier 3 does not read as the top tier

- Origin: G3C, "tier 3 look does not read as top tier". Prism is the real top (tier 4), so tier 3 should read as the step before it.
- Repro: `?seed=42&level=35`, then 40 and 45. Compare each to a tier 2 boss (level 20, 25, 30) side by side.
- Fix in code: 7207b91 "tier 3 halo". Owner: Glow. Retest: V3-C1 look line.

### V3-03 (P2): Bastion is unthreatening after its turrets are gone

- Origin: G3C, "Bastion unthreatening after turrets". Phase 2 is the turret phase; once the turrets fall the boss has little left to do.
- Repro: `?seed=42&level=35`, destroy the four turrets, keep fighting for the rest of the boss.
- Fix in code: 17bfa9e "Bastion phase 3". Node check: `tests/qa/bossFairnessSweep.test.ts` shows Bastion live with hazards, adds and enemy bullets in the fuzzed sessions and no rule violation, so phase 3 stays inside the caps. Owner: Swarm. Retest: V3-C1 Bastion lines.

### V3-04 (P2): the bosses share a colour, an attack and a shape

- Origin: G3C, "bosses share colour, attack and shape".
- What is in the code: `BOSS_TABLE` gives Bastion, Tempest and Twins the same colour key `bossRed` (`src/game/bosses/table.ts` lines 28 to 30), so tier 3 is one colour by design. Silhouettes were added in 7207b91. Attack variety is per boss def and is not a table value.
- Repro: levels 35, 40 and 45 one after the other.
- If Ryan still reads them as one boss, the cheapest fix is a table value (Swarm: three colour keys for tier 3, Glow: matching palette entries in `src/render/neon.ts`, which Glow owns). Owner: Glow first, then Swarm for the table. Retest: V3-C1 distinct line.

### V3-05 (P2): Bastion and Tempest give no damage feedback

- Origin: G3C. Repro: shoot either boss during a window and look for a response on each hit.
- Fix in code: hit events in 17bfa9e, hit feedback in 7207b91 (`src/render/hitFx.ts`), a boss hit tick sound in e96762b. Owner: Glow. Retest: V3-C1 hit feedback line.

### V3-06 (P2): cracks at 66 and 33 percent (Ryan's request)

- Origin: G3C. Built as `sim:bossCrack` (stage 1 under 66, stage 2 under 33, per body for Twins), drawn in 7207b91, with stingers in e96762b. The event is in the docs/13 bus table.
- Node check: the replay sessions record `sim:bossCrack` in the event log and replay it identically (`tests/qa/bossReplay.test.ts`). In a diagnostic run the bosses that the player model took under 66 percent (Warden, Brood, Spindle, Ember, Mirage and others) emitted crack events and the ones left above it (Bastion at 96 percent) did not, as the rule says.
- Owner: Glow (look), Swarm (event). Retest: V3-C1 cracks line.

### V3-07 (P2): the Twins survivor repositions and then resumes

- Origin: G3C observation, no verdict. The retest list asks for "Twins enrage visible".
- Question for Ryan: is the pause and reposition after one twin falls a good beat or a bug? The file header of `src/game/bosses/twins.ts` says that when the first body falls the tether breaks and the survivor enrages (faster, a ring every 4 s instead of every 3.5 s while both lived), so a change of behaviour at that moment is by design. What the code does not settle is whether the beat before it resumes is too long or too quiet. Not a defect unless Ryan says so.
- Owner: Swarm. Retest: V3-C1 Twins lines.

### V3-08 (P2): level 55 showed "a yellow darting triangle"

- Origin: G3C, "level 55 loop boss seen as a yellow darting triangle (Ember expected, to confirm)".
- Generator side is proven: level 55 carries Ember at tier 2, hit point multiplier 1.25, entrance at 20 s, on every run seed tested (`tests/qa/bossScheduleGolden.test.ts`, five seeds). Ember's colour key is `bossOrange` and Spindle's is `bossYellow`, but Spindle is not in the loop (the loop starts at Ember).
- Inference, not seen: a yellow darting triangle is more likely a Dart add than the boss, seen before the entrance at 20 s or during the fight. Ember's own body should be orange.
- Repro: `?seed=42&level=55`, wait past 22 s, read the boss name banner and note the colour of the boss body. Owner: Glow if the body is the wrong colour, Ledger if the banner names the wrong boss. Close when the banner says Ember.

### V3-09 (P1): the Low effects tier is slower than Standard (V2-03 carried)

- Evidence: GD `fps_low 50/59`, `fps_standard 59/59`; GE `fps low 55/52, standard 59/59, high 60/60` (STATUS gate log). Low is the cheapest tier and the cut 4 fallback, so it must never be below Standard.
- By the rule written in V2-03 above ("P1 if Low is still below Standard after a warm repeat"), two measurements in a row below Standard make this a P1.
- Repro: V-D1 in the v2 checklist, in the fixed order Standard, High, Low last, `?stress=400`, unfolded, 10 s average then a bomb dip per tier.
- Not touched by any v3 merge. Owner: Glow, `src/render/` (the V2-03 suspects stand: the Low path draws the v1 grid Graphics redraw and `enemyFxGates` keeps `tells: true` on Low; none of it is measured). Retest: V3-G4 `fps_low`.

### V3-10 (P2): fps on boss levels is 56 to 58

- Evidence: G3A lowest 58, G3B 56 and 57, G3C 58. The accepted floor is 59 on the 60 Hz main screen (V2-08); the pastes do not say which screen these numbers are from.
- Plan row: "fps under the bar with a boss: Glow fix run first (hazard and burst cost), then lower the burst caps" (docs/12 wave B and C risk tables).
- Node side: a boss level never exceeds 8 hazards, 8 boss adds, 4 parts, 32 enemy bullets or the 512 entity cap (the sweep), so the sim load is bounded; the cost is render.
- Repro: levels 20, 35 and 50, Show FPS, Effects Standard, cover and main separately, average and minimum each. Owner: Glow. Retest: V3-G4 `fps_boss_cover`, `fps_boss_main`.

### V3-11 (P2): the live hazard cap is 8, two lines still say 6

- docs/12 "Design: the boss rules" rule 5 and docs/13 SPEC 3.4 rule 5 (line 94) say "at most 6 live hazards (flag 2)". Fable's ruling on that flag is 8 ("Live hazard cap is 8 (lane bursts)", docs/13 line 13, DECISIONS 47:00), and the code is `MAX_HAZARDS = 8` (`src/game/bosses/table.ts`). Mirage's eight lane burst reaches it: the sweep saw 8 live hazards and never 9.
- The sweep asserts 8. Fix the two doc lines, or the ruling and the code. Owner: Fable (Scribe).

### V3-12 (info): the weapon combine and drone modes are not built

- docs/13 "Combining", "Spread as an ingredient" and the drone modes belong to wave V3-D (gate G3D), and weapon tuning to V3-E. At this head `src/game/weapons.ts` has no `COMBO_TABLE`, `src/core/events.ts` has the `fx:weaponCombine` type and `src/render/neon.ts` a palette stub.
- Effect: `tests/qa/weaponReplayV3.test.ts` runs the log driven replay on the v2 weapons and skips the spread ingredient proof until `COMBO_TABLE` is exported. The skip is visible in every suite run (1 skipped). The device checklist keeps the G3D lines, marked "not built at 7263f75".
- Owner: Swarm (wave D).

### V3-13 (info): gaps in the pastes

- G3B: "all items yes", no fairness numbers, fps 56 and 57 without a screen. G3C: "all fairness 4 and about right" for four bosses with no per boss split, fps 58 without a screen. G3A: fps "lowest 58", physics Low (fine, recorded).
- Action: the V3-G4 block in `docs/device-checklist.md` spells out one field per line, with a screen and a number on every fps and fairness field.

### V3-14 (info): one fix branch touched `src/core/events.ts`

- Audit (`docs/qa/ownership-audit.md`, v3 section): feat/swarm-boss-readability (17bfa9e) changed `src/core/events.ts`, which is outside Swarm's directories in every v3 wave table (the V3-W0 stubs were meant to make `src/core/` untouched). The change adds the `sim:bossWindow` and `sim:bossCrack` events the readability work needed, so it is probably in the fixer brief, but Proctor does not have the brief. If it was not named there, it is a small ownership break; if it was, nothing to do.
- Also seen: feat/swarm-boss-ends-level (115882d) changed `tests/scoring/scoring.boss.test.ts`, which Swarm owns in V3-A (and Ledger owns in v1). Fine under the V3-A table.
- Owner: Fable to confirm against the brief.

### V3-15 (info): v1 and v2 items carried

- `tests/levelgen/par.test.ts` line 96, the stale `it.todo` (V2-11): still the one todo in every run (2929 passed, 1 todo at this head). Foundry.
- `scoringPort` still private to `src/main.ts` (QA-004), four `click` listeners in `src/render/devpanel.ts` (QA-009, unchanged). Ledger, Glow.
- QA-001, QA-002, QA-006, QA-007, QA-011, QA-012: unchanged since the v2 triage; none has a code or doc change in v3.

## Closed since the v2 triage (v3 era), with the evidence

| ID | What | Evidence |
|---|---|---|
| B16 | A level did not end after the boss died | Fixed at 548c9d5 and ee8397f. Retest 2 (ee8397f): "levels 5, 10, 15 end on boss death". Node: `tests/game/bossLevelEnd.test.ts`, `bossLevelEndSeed42.test.ts` |
| B17 | Boss bar unreadable on the cover screen | Fixed (ledger-boss-bar 328f22f). Retest 53:10: "cover bar yes" |
| B18 | "The bomb damaged the boss" | By design: the bomb never damages a boss (verified), the 1.5 s stagger counts as an open window (docs/13 boss rule 7). No defect |
| B19 | Thumb anchor ring overlapped the buttons | Fixed (thumbs-ring-clear e71e9b1). Retest 53:10: "ring overlap no" |
| B20 | The tune did not change across levels | Fixed (chorus-tunes 0789f73, chorus-tune-wiring 4b3117f). Retest 2: "tunes change each level, music 3.7" |
| G2.1 melody | "melody 3, wants multiple tunes" | Closed with B20 |
| G2.1 reach | Ring overlap "yes (fail)" | Closed with B19 |
| G3A Brood | "2, too short, reads as an obstacle, weak point unclear" | Brood reworked (swarm-boss-fixes). Retest: "Brood 4 about right". HIT word too explicit: replaced by a cue without text (ebd0a3e), Retest 2: "weak point reads without text" |
| G3A Spindle | "4, too short" | Hit points 400 to 500. Retest: "Spindle about right" |
| Warden gap | Phase 2 second ring gap not drawn | Fixed in glow-boss-fixes (c4df26e, "Warden second gap") |
| HUD bonus | `src/ui/boss.ts` duplicated `scoring.bossBonus` | Fixed: `src/ui/boss.ts` line 5 says `src/game/scoring.ts` is the only copy (ledger-boss-bar 328f22f) |
| V2-01, V2-02, V2-04, V2-05 | Music glitches, dull trails and map, kill voicing, tell readability | GE paste: glitch none, trails 4, map 4, kill notes yes, C1 to C3 ok. V-D5 (melody) closed by B20 |
| V-A5 | Moving right drifts more and reacts slower | Forge move symmetry tests, G2.1 "symmetry same" |

## What the v3 harden tests found (not defects)

- Boss replay (`tests/qa/bossReplay.test.ts`): for each of the ten bosses, a recorded session on the real generated level replays from JSON copies of the level and input log with an identical per tick digest of boss, parts, hazards, adds, enemy bullets, score and lives, and an identical event log. Math.random throws inside the test.
- Fairness sweep: rules 5 and 6 and every cap held in all 60 sessions. Two assertions failed during development and were test errors, not defects: the boss's hit points fall during the respawn delay because player bullets already in flight can still land (rule 6 forbids a heal, not a hit), and the boss keeps sliding in if the ship dies during the entrance (the slide is not an attack).
- Drop schedule: the weapon of drop n depends only on the level and n. The tick of a drop does depend on the world: with a boss present the orbit blades kill its adds, adds score as scoring kills, and a due drop comes sooner. That follows docs/12 rule 9 ("Adds score normally") and is not a bug.
- Storage: the key set is still the 13 keys of v2. v3 adds none yet; docs/13 allows only `sow.settings.tilt`, and only from wave V3-E.
