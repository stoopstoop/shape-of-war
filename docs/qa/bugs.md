# Shape of War: QA findings

Owner: Proctor. Found on build 9ece364 (main) plus the in flight W3 branches named below. Proctor reports; the owning agent or Fable fixes. Severity: P0 blocks a gate, P1 breaks a SPEC requirement or loses data, P2 wrong but contained, info is worth knowing.

## Bad news first

- No P0 or P1 found by the node suite. That says nothing about the device: nothing here proves the neon slider works on the phone (finding QA-008).
- Three P2 defects and one spec question are open. QA-003 can reach the player as a multiplier that flashes x1: the test proves the stale value is emitted, and the HUD listens to both emitters, but nobody has seen it on a screen.
- `npm test` was green 5 consecutive times on the final tree (45 files, 473 tests plus 1 expected fail), and in 10 more runs: 5 earlier in default order, 3 in shuffled order with fixed seeds 101, 202 and 303, 2 with workers oversubscribed to 40. No flake was seen. Two older tests are timing or heap sensitive and could flake on a loaded machine (QA-005).

## Open findings

| ID | Sev | Finding | Owner directory | Evidence |
|---|---|---|---|---|
| QA-001 | P2 | Adjacent run seeds produce the same levels shifted by one index. `deriveSeed(runSeed, n)` is `fmix32(runSeed + n)`, so level n+1 of run s and level n of run s+1 share a level seed; inside one band the levels are identical. Runs d apart share `40 - d` of their first 40 levels. Random 32 bit run seeds make this negligible in normal play, but the typed seed screen (docs/06 D3 to D5, seeds like 1234 and 1235) will show it. It is what SPEC 3.2 says ("run seed plus n"), so changing it is Fable's call and bumps GENERATOR_VERSION and every pinned hash | `src/core/rng.ts` line 33 (`deriveSeed`), `src/levelgen/leveldef.ts` (`levelSeed`) | `tests/qa/seedOverlap.test.ts` (4 tests) |
| QA-003 | P2 | HUD multiplier can flash x1 under Ledger's scoring port. `stepGame` emits `hud:score` every 0.1 s with Swarm's own `g.multiplier`, which only the built in port updates; with Ledger's port wired it stays 1. `main.ts` emits `hud:score` too with Ledger's multiplier, on the same channel the HUD listens to. Whichever fires last wins, so `x1` may show for a frame or more between correct values (inferred from the code, not seen on device). Score, lives, bombs and super charge agree between the two emitters; only the multiplier differs | `src/game/game.ts` lines 58 to 71 (`emitHud`, Swarm), `src/game/state.ts` lines 147 to 158 (`defaultScoring`, Swarm), `src/main.ts` lines 28 and 257 to 268 (port and second emitter, Ledger) | `tests/qa/scoringReplay.test.ts`, test "with Ledger port, carries the multiplier Ledger shows", marked `it.fails` so the suite stays green. Change it to `it` when fixed. The control test with the default port passes |
| QA-004 | P2 | Test seam: the scoring port glue is a private constant in the DOM boot module, so no test can import the real one. `tests/qa` mirrors it. If `main.ts` changes the port, the mirror drifts silently | `src/main.ts` line 28 (Ledger) | `LEDGER_PORT` in `tests/qa/scoringReplay.test.ts`. Request: export `scoringPort` from `src/game/scoring.ts` and import it in `main.ts` |
| QA-005 | P2 | Two older tests depend on wall clock or heap, so they can flake on a loaded machine. Not seen to flake in 15 full runs | `tests/levelgen/generator.test.ts` lines 224 to 228 (200 levels under 500 ms; seen about 220 ms, 2.2x headroom). `tests/game/stress.test.ts` lines 39 to 49 (heap growth under 6 MiB, seen -0.9 to +2.7 MiB; step under 4 ms, seen 0.18 ms) | Verbose run timings and the `[stress]` console line. Owners Foundry and Swarm decide whether to widen or drop the assertions |
| QA-006 | P2 | Spec question: docs/02 line 120 says the run seed is "reset only by Reset progress", but `resetProgress` on `feat/ledger-complete` (df8bcaa) only resets `sow.progress.unlocked` and `sow.scores.adventure`. It leaves the run seed and the Endless table. Either the doc or the code is wrong | `src/core/settings.ts` (`resetProgress`, Ledger, in flight), docs/02 line 120 and docs/01 line 328 (Fable) | Diff `9ece364...feat/ledger-complete -- src/core/settings.ts` |
| QA-002 | P2 | Doc drift: docs/03 line 478 gives `sow.progress.unlocked` a default of 0; the code returns 1 (`FIRST_LEVEL`) | `docs/03-architecture.md` (Fable), `src/core/settings.ts` `loadUnlocked` | `tests/settings/progress.test.ts` expects 1 |
| QA-007 | info | Doc drift: docs/07 line 490 says Proctor writes `docs/device-checklist.md` in W3; docs/05 line 862 and docs/06 line 155 say W4 | `docs/07-install-runbook.md` (Fable) | grep `device-checklist` in docs |
| QA-008 | info | G1 `slider_live` failed on device (build 9ece364). Reading the code on main finds no wiring break: dev panel `input` event, then `neonInput`, then a requestAnimationFrame, then `applyNeon`, then the renderer's `onNeon` sets `bloom.bloomScale` and `bloom.threshold`. `src/ui/settings.ts` line 3 says the Settings screen slider only arrives in W3, so on this build the only slider was the dev panel one. The failure is probably strength of effect (thin strokes, faint bloom) rather than wiring, but that is a guess: node cannot see the screen. `feat/ledger-complete` adds `src/ui/slider.ts` and `src/ui/preview.ts`; `feat/glow-fx` adds `src/render/neonApply.ts` | `src/render/` (Glow), `src/ui/` (Ledger) | Re-test N1 to N3 and N5 on device on the first build that contains both branches |
| QA-009 | info | `src/render/devpanel.ts` lines 175 to 177 bind `click` for three buttons. A tap produces a click, so this works on touch, but the hard rule says no mouse handlers; worth a one line decision | `src/render/` (Glow) | `grep -rn "addEventListener" src` |

## Resolved or expected to resolve on merge

| ID | Note |
|---|---|
| QA-010 | docs/03 section 8 lists `sow.scores.endless` and `sow.schema`; neither exists in code on main. Both appear in `feat/ledger-complete` (`ENDLESS_SCORES_KEY`, `SCHEMA_KEY`). `tests/qa/storageKeys.test.ts` already registers both as reserved, so the merge will not break it. After the merge, move them from `RESERVED_KEYS` to `IMPLEMENTED_KEYS` and add them to the run time write test |

## Observations that are not defects

- The 5000 seed sweep found 0 invalid levels and 0 levels that needed the re-derive path (5080 levels: 5000 seeds over level indices 1, 5, 6, 15, 16, 30, 31, 60, plus both edge seeds over levels 1 to 40).
- Base values, multiplier rules, destroy kill counting and the 999 cap agree between Swarm (`state.ts`, `combat.ts`) and Ledger (`scoring.ts`) for every kind.
- No `Math.random` call outside `src/core/rng.ts` (one comment in `src/levelgen/generator.ts` mentions it), no keyboard, mouse or gamepad listeners, no `any` or ts-ignore, and the only binary assets are the four PWA icons.
