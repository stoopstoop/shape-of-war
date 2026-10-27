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
