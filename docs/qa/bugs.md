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
