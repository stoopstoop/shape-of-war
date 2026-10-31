# Shape of War: repeated suite runs (W4)

Owner: Proctor. Rule from docs/06 section 1: `npm test` green 10 consecutive runs at G4, and any flake is a P1 bug for the test's owner.

## Bad news first

- Ten green runs say the suite is stable on this Mac, run one at a time. They do not say it is stable on a loaded machine. Two tests are wall clock sensitive in principle (QA-005 in `docs/qa/bugs.md`), and neither was stressed this wave.
- None of this runs on the device. Rendering, touch, the service worker, fullscreen and audio output are outside vitest (docs/06 "Bad news first").

## Result

No flakes. 21 of 21 full runs were green in this wave, 11 on the tree at main 5bef4ae and 10 on the final branch tree. The last 10 runs, on the final tree, are the ones that count for the "10 consecutive" rule.

| Tree | Runs | Result | Files | Tests | Run time (vitest) |
|---|---|---|---|---|---|
| main at 5bef4ae (one timing run, then 10 in a row) | 11 | 11 green | 62 | 633 | 16.0 to 16.7 s |
| `feat/proctor-harden` head after e95a8f8 and the doc commits | 10 | 10 green | 62 | 637 | 15.7 to 16.7 s |

Method: `npx vitest run` started 10 times in sequence from a node script, never in parallel with a build or with each other, default file order, default worker count. Each run's exit code and summary lines were read. No `it.fails` or skipped test is in the suite at this head (the QA-003 expected fail was converted to a plain test when the bug was fixed).

The 4 added tests in the final tree: `tests/qa/storageKeys.test.ts` (2: first launch writes `sow.schema` once, a corrupt Endless table loads empty without touching Adventure) and `tests/qa/scoringReplay.test.ts` (2: a port without the multiplier getter never shows a stale x1, a port getter wins in `hud:score`).

## Not run this wave

- Shuffled order (`--sequence.shuffle`) and oversubscribed workers, which the W3 pass used. Run them again if a flake is ever reported.
- A run on a CPU throttled or otherwise loaded machine.

## Timing sensitive tests still in the suite

| Test | Limit | Seen | Headroom |
|---|---|---|---|
| `tests/levelgen/generator.test.ts` lines 224 to 228, 200 levels | 500 ms | 225 ms | 2.2 times |
| `tests/game/stress.test.ts`, step cost, median of 3 | 4 ms per step | 0.128 ms | about 30 times |
| `tests/game/stress.test.ts`, heap growth, median of 3 | 8 MiB | about -0.9 MiB | not close |

---

# v3 harden: 10 runs and bundle size

Run at branch feat/proctor-v3-harden (base 7263f75, plus the six new test files and the extended ownership tests). Tool: `node tests/qa/repeatSuite.ts 5`, twice (a single call is capped at 10 minutes). Default file order and worker count, one run after another, nothing else running.

## Result

| Item | Value |
|---|---|
| Runs | 10 |
| Green | 10 of 10 |
| Flaky tests | 0 (no file or line to list) |
| Consistent failures | 0 |
| Per run | 206 files, 3003 tests: 3001 passed, 1 todo, 1 skipped, 0 failed |
| Wall time per run | 62.6 to 65.8 s (baseline before the new files: 201 files, 2929 passed, 60.7 s) |
| The one todo | `tests/levelgen/par.test.ts` line 96 (V2-11, Foundry's) |
| The one skip | `tests/qa/weaponReplayV3.test.ts`, the spread ingredient proof, until `COMBO_TABLE` exists (V3-12) |

`npm test` is `vitest run`, the same command the tool runs per pass. Not run: shuffled order, oversubscribed workers, a throttled machine (same note as the sections above).

## What the new files cost

| File | Tests | Time alone |
|---|---|---|
| `tests/qa/bossScheduleGolden.test.ts` | 9 | 3.5 s |
| `tests/qa/bossReplay.test.ts` | 12 (ten bosses, one different log check, one vacuity check) | 2.5 s |
| `tests/qa/bossFairnessSweep.test.ts` | 12 (ten bosses at six sessions each, a pin test, a vacuity check) | 9.6 s |
| `tests/qa/weaponReplayV3.test.ts` | 14 (13 run, 1 skipped) | 6.1 s |
| `tests/qa/storageKeysV3.test.ts` | 10 | 0.1 s |
| `tests/qa/ownership.test.ts` | 44 (16 are new) | 0.1 s |

A 60 s boss session costs about 0.1 s of CPU, so the scope trim from 120 s to 60 s saved nothing worth saving: raising `SESSION_SECONDS` in `tests/qa/bossHarness.ts` to 120 is a one number change and about 10 s more in the fairness sweep. Nothing here is wall clock sensitive (no `performance.now` assertions in the new files).

## Bundle size (`npm run build`, vite 8.3.5, at this branch)

| Item | Value |
|---|---|
| Build | passes (`tsc --noEmit` first, then `vite build`, 1.0 s) |
| JS files in `dist/assets/` | 9 |
| Raw | 969,479 bytes (about 947 KiB) |
| Gzipped (sum of vite's per file figures) | about 306 kB, of which `index-*.js` 228 kB |
| Limit | 1.5 MB gzipped, so about 20 percent of it. Not flagged |
| Service worker precache | 21 entries, 1000.85 KiB |
| Against the v1 reading | 215,698 bytes gzipped at 5bef4ae (docs/qa/perf-log.md section 7), so about +42 percent since v1 |

The build prints the usual "chunk larger than 500 kB" warning for `index-*.js` (702 kB raw). It is a warning, not an error.
