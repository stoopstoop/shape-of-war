# Shape of War: performance log

Owner: Proctor. Format from `docs/04-device-and-pwa.md` section 14 step 10 and `docs/06-test-and-acceptance.md` section 4. Targets from SPEC 5.

## Bad news first

- No device number is recorded here yet. The only readings in this file are node proxies (section 5), which never pass a gate.
- Build 9ece364 passed G0 to G2 on device by Ryan's report (section 4), but nobody captured average, minimum or longest frame. Those rows are blank on purpose.
- Every row is valid for its build id only. A row without a build id is void (docs/06 "Bad news first"). `feat/glow-fx` (trails, particles, screen shake, grid ripple) and `feat/glow-quality` (full resolution MSAA line layer, bloom DPR policy) are merged since 9ece364 and change the render load, so rows for 9ece364 do not carry over to the current build.
- Device cells stay blank until Ryan pastes numbers. Proctor never fills one in from memory or from a proxy.

## 1. Pass criteria

| Screen | Target | Accepted as pass | Where it comes from |
|---|---|---|---|
| Cover (folded, about 21:9) | 120 fps | A stable 60 fps only if Motion smoothness is Standard and that setting is recorded in the row | SPEC 5, docs/06 P1 |
| Main (unfolded, about 10:9) | 60 fps | Average 60 or better, minimum not below 55 over 10 s | SPEC 5, docs/06 P2 |
| Both, normal Adventure level for 60 s | 60 fps or better, no visible hitch on explosions | | docs/06 P3 |
| Both, stress: 400 live entities and 2000 particles | As above | | SPEC 5, 04 section 14 |
| Simulation step at 400 entities | Under 1.5 ms per step | | 04 section 13 |
| 10 minutes unfolded | Still 60 fps or better, note any drift | | docs/06 P5, G4 only |

## 2. How to take a reading

Full steps are in `docs/04-device-and-pwa.md` section 14. Short form:

1. Confirm the on screen build id equals the id Fable named. If not, close from recents, reopen online, wait 5 seconds, close and reopen.
2. Start the stress run: debug menu "Stress: 400 entities, 2000 particles", or `window.sowDebug.stress(400, 2000)` in the DevTools console.
3. FPS meter average and minimum over 10 seconds. Longest frame from the Performance recording. Scripting versus GPU share from the same recording.
4. Copy the console line `[sow] viewport ...` for that screen.
5. Repeat folded and unfolded, bloom and fallback: four rows per build.
6. Read Motion smoothness from Settings, Display (Adaptive or Standard) and record it in every row.
7. If USB debugging is not available at G1 or G2, the on screen Show FPS reading is accepted (docs/06 section 4). Mark the Source column "Show FPS" and leave the longest frame and share cells blank. The full protocol runs at G4.

## 3. Stress protocol rows (device)

One block of four rows per build. Copy the block for each new build id. Everything after Glow path is left blank until Ryan pastes it.

| Build id | Screen | Glow path | FPS avg | FPS min | Longest frame (ms) | Motion smoothness | Scripting / GPU share | Viewport line | Source | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| | Cover (folded) | Bloom | | | | | | | | |
| | Cover (folded) | Fallback | | | | | | | | |
| | Main (unfolded) | Bloom | | | | | | | | |
| | Main (unfolded) | Fallback | | | | | | | | |

Gameplay rows (docs/06 P3), one per build and screen once G2 numbers exist:

| Build id | Screen | Glow path | FPS avg | FPS min | Longest frame (ms) | Motion smoothness | Scripting / GPU share | Viewport line | Source | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| | Cover (folded) | Bloom | | | | | | | | Adventure level 1, 60 s |
| | Main (unfolded) | Bloom | | | | | | | | Adventure level 1, 60 s |

Paste template for a single row, for Ryan or Fable:

```
Build id: <text from the on screen label>
Screen: cover / main
Glow path: bloom / fallback
FPS avg / min: <n> / <n>
Longest frame (ms): <n>
Scripting vs GPU: <n percent> / <n percent>
Motion smoothness: Adaptive / Standard
Viewport line: <copy the [sow] viewport text>
Source: USB protocol / Show FPS
Notes:
```

## 4. Reported on device, not measured

These came from Ryan through Fable. They are observations, not readings, and they do not satisfy any P1 to P5 line.

| Build id | Device and browser | Motion smoothness | What was reported | What is missing |
|---|---|---|---|---|
| 9ece364 | Z Fold 7, Chrome | Standard | G0 to G2: install, fullscreen, fold and unfold, both sticks, firing and a full Adventure level to the results screen all pass at 60 fps on both screens with bloom on | Average, minimum and longest frame. No stress run (400 entities, 2000 particles) was reported. Fallback path not reported. Cover screen is capped at 60 by Standard, so the 120 target is unmeasured |

Related device findings on the same build, listed here because they affect how the look and the cost will change:

- G1 `slider_live` failed: the neon slider did not visibly change the glow (SPEC requirement 4, never cut). Not a perf finding, but a fix goes through `applyNeon` and the glow path, which are the code these rows measure, so it is one more reason to re-measure after it lands.
- Ryan reports "graphics need to be improved": thin lines, faint bloom, few particles, no trails, no screen shake, static grid. More particles, trails and shake raise both the CPU and the GPU load, so the next build needs a full set of rows.

## 5. Proxy readings (node, not a device)

Taken by Proctor from `tests/game/stress.test.ts` (400 spawned entities, about 330 still live after wells, 1200 steps after a 240 step warm up) on the Mac that runs the suite. Simulation only: no rendering, no GPU, no touch. Useful as a trend line for sim cost, never as a gate result.

| Date | Commit | Run | ms per sim step | Heap change | Notes |
|---|---|---|---|---|---|
| 2026-10-27 | 9ece364 plus tests/qa | Suite, workers oversubscribed to 40, run 1 | 0.183 | -901 KiB | Budget is 1.5 ms (04 section 13); the test fails above 4 ms |
| 2026-10-27 | 9ece364 plus tests/qa | Suite, workers oversubscribed to 40, run 2 | 0.191 | +2689 KiB | The test fails above +6 MiB; heap change is GC noise, not a leak signal on its own |
| 2026-10-27 | 5bef4ae (W4, after glow, swarm and thumbs fixes) | `vitest run tests/levelgen/generator.test.ts tests/game/stress.test.ts`, verbose | 0.128 (median of 3 runs) | -928 KiB (median) | About 240 enemies still live after wells. The stress test takes a median since be857ca, so one GC pause no longer moves it. Sim step is under 10 percent of the 1.5 ms budget. Says nothing about rendering |

## 6. Re-measure triggers

Add a new block of rows in section 3 when any of these change:

1. A new build id reaches the device for a gate (G1, G2, G3, G4).
2. Bloom strength, bloom resolution or the default glow path changes (`applyNeon`, `glowPath`).
3. Particle caps, trails, screen shake or the grid effect change (`feat/glow-fx`).
4. The entity cap or the stress scenario changes.
5. Ryan switches Motion smoothness between Standard and Adaptive. Record the new setting in the row and keep the old rows.

## 7. Bundle size (W4)

Taken from `npm run build` on the W4 branch, source identical to main at 5bef4ae. Flag rule from the W4 brief: gzipped JS over 1.5 MB. Sizes are the sum of every `.js` file in `dist/` (maps excluded), gzip level 9 measured with node, so they are a touch smaller than Vite's own per file figures.

| Measure | Bytes | Note |
|---|---|---|
| JS files in `dist/` | 12 | Includes `sw.js`, `workbox-*.js` and `registerSW.js` |
| JS raw | 716,408 | |
| JS gzipped | 215,696 (210.6 KiB) | 14 percent of 1,500,000, so **not flagged** |
| JS brotli | about 185,800 | Measured on the first build of this source; what a host that serves brotli would send |
| Largest chunk | `index-*.js` 430,976 raw, about 132,000 gzipped | Game code plus most of PixiJS |
| All non map files in `dist/` | 771,644 raw | Service worker precache reports 21 entries, 736.54 KiB |

Not measured: transfer size over the real GitHub Pages response headers, and cold start time on the Fold. The precache is about 0.7 MB, so the first offline ready launch needs that much data once.

## 8. v2 device readings (Ryan's pastes, wave E)

Numbers are copied from the gate rows of `docs/STATUS.md` and the GD paste Fable supplied. Proctor measured none of them. Each row is valid for its build id only. The motion setting was not recorded in any of these pastes, so none of them can be filed as an accepted cover screen 60 against the 120 target (section 1); P1 at G4 was accepted at 60 with Adaptive and nothing here changes that.

| Gate | Build | Screen and scene | Reading | Note |
|---|---|---|---|---|
| GA | 4f61c3b | Cover and main, Medium physics, `?stress=400` | fps_cover 60, fps_main 60 | Pass |
| GB | 1612a53 | Main, `?stress=400` | fps_main 60 | Pass |
| GC | fb25216 | Main, `?stress=400` | fps_main 60 | Pass |
| GD | 6f11afb | Main, `?stress=400`, Effects Low | 50 and 59 | Written `fps_low 50/59`; the template says average then bomb dip, which cannot give a dip above the average. Ambiguous, see V2-03 in `docs/qa/bugs.md` |
| GD | 6f11afb | Main, `?stress=400`, Effects Standard | 59 average, 59 after a bomb | Written `fps_standard 59/59`. Below the 60 floor of docs/11 SPEC 5 by 1; accepted at D8 (DECISIONS 35:50). Standard stays the default |
| GD | 6f11afb | Main, `?stress=400`, Effects High | 59 | Written `fps_high 59`, no bomb figure. High stays opt in |

What the rows say together: Standard and High both read 59, which is the ceiling of the 60 Hz main screen, so this scene cannot tell them apart from a display cap. Low reading 50 is the outlier, and Low is the cheapest tier. Either Low carries a cost the lattice tiers do not (the v1 grid redraw, plus the tells that now draw on every tier), or the reading was cold or ordered first. That is a guess from the code, not a measurement. The V-D1 line of `docs/device-checklist.md` asks for Standard, then High, then Low last, average and bomb dip each, to settle it.

Re-measure triggers added by v2, on top of section 6: a change to `SPACE_TABLE`, the effects tier caps, the lattice spacing or node caps, the particle cap per tier, the music voice cap or lookahead, and any Slime or Splime count.

## 9. Bundle size (v2 harden)

Taken from `npm run build` on `feat/proctor-v2-harden`, source identical to main at 6f11afb apart from tests and docs. Same method as section 7: every `.js` file in `dist/`, maps excluded, gzip level 9 measured with node. Flag rule from the wave E brief: gzipped JS over 1.5 MB.

| Measure | Bytes | Against W4 (section 7) |
|---|---|---|
| JS files in `dist/` | 12 | same |
| JS raw | 807,592 | plus 91,184 (12.7 percent) |
| JS gzipped | 247,504 (241.7 KiB) | plus 31,808 (14.7 percent). 16.5 percent of 1,500,000, so **not flagged** |
| JS brotli | 212,954 | plus about 27,000 |
| Largest chunk | `index-*.js` 522,160 raw, 163,779 gzipped | was 430,976 raw |
| All non map files in `dist/` | 862,828 raw | was 771,644 |
| Service worker precache | 21 entries, 825.58 KiB | was 736.54 KiB |

The build prints Vite's warning that a chunk is over 500 kB after minification (`index-*.js` crossed it with wave D). It is a warning, not a limit of this project; the gzipped total is what the flag rule uses.

Not measured: transfer size over the real GitHub Pages headers, cold start time on the Fold, and the memory cost of the lattice and the music voices.
