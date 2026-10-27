# Shape of War: test plan and device acceptance

Derived from SPEC.md, `docs/03-architecture.md` and `docs/04-device-and-pwa.md`. SPEC.md wins on any conflict. Wave and owner assignments match `docs/05-build-plan.md`.

## Bad news first

- Vitest runs in node (03 section 10). Nothing touching PixiJS, WebGL, Pointer Events on real hardware, the service worker, fullscreen, install or audio output is covered by unit tests. Those are device only, and the device is checked by one person at five gates.
- Performance is not unit testable. Desktop Chrome with CPU throttle is a proxy only; a gate never passes on proxy numbers.
- Unit tests that use `Math.random`, real timers or real `localStorage` will flake. Every test injects its clock, RNG and storage.
- A stale service worker can make Ryan test an old build. Every device check starts by confirming the on screen build id. A device result without a build id is void.
- If Ryan is unreachable at a gate, Proctor runs browser emulated checks and the gate is provisional (SPEC 9 item 5). Provisional gates are re-run on device before v1.0.0.

## Knowns and unknowns

| Known | Unknown |
|---|---|
| Vitest in node, tests under `tests/**` | Real CSS viewport and DPR on the Fold 7 until G0 |
| SPEC 3.6 base values, SPEC 4 neon endpoints, SPEC 5 perf targets | Whether Motion smoothness is Adaptive (120 Hz possible) or Standard (60 Hz cap) on Ryan's device |
| Perf protocol in 04 section 14 | Whether bloom holds 60 fps on the main screen (G2) |
| Paste-back format per gate in 05 | Thermal behaviour after 15 minutes of play (not gated before G4) |

## 1. Unit test rules

1. Location `tests/<area>/<module>.test.ts`; owner per wave in 05 "Test directory ownership".
2. Pure modules only. No `pixi.js` import in tests; render logic is tested through pure helpers (`neonParams`, shape registry map, devpanel state).
3. Determinism: inject the RNG (`mulberry32(seed)`), the clock (loop tests) and a `Storage` fake (settings tests). No real timers.
4. Hard coded expected values for RNG sequences and level hashes, so an accidental algorithm change fails loudly.
5. `npm test` must be green 5 consecutive runs at G3 and 10 at G4. Any flake is a P1 bug for the test's owner.

## 2. Vitest inventory by module

### 2.1 RNG determinism: `tests/core/rng.test.ts` (Forge, W1)
| Case | Assertion |
|---|---|
| Same seed | `mulberry32(s)` yields an identical 10 000 value sequence on two instances |
| Different seeds | Seeds 1 and 2 differ within the first 4 values |
| Range | Every value in [0, 1) over 100 000 draws |
| rngInt bounds | `rngInt(r, 3, 6)` hits 3 and 6, never 2 or 7, over 10 000 draws |
| rngPick weights | Weights [1, 3] give 25 percent and 75 percent within 2 points over 100 000 draws |
| deriveSeed | Hard coded outputs for (1, 0), (1, 7), (0xDEADBEEF, 42); results are uint32 |
| Golden sequence | First 5 values of `mulberry32(42)` equal hard coded numbers |

### 2.2 Loop: `tests/core/loop.test.ts` (Forge, W1)
| Case | Assertion |
|---|---|
| Steady 60 Hz | 60 frames of 16.67 ms produce 120 steps (plus or minus 1) |
| Clamp | One 500 ms frame produces at most 6 steps (`MAX_FRAME_DT` 0.05) |
| Alpha | Render alpha always in [0, 1) |
| Divisor | `setRenderDivisor(2)` halves render calls, step count unchanged |

### 2.3 Generator invariants: `tests/levelgen/generator.test.ts` (Foundry, written W1 skipped, enabled W2)
| Case | Assertion |
|---|---|
| Determinism | `generateLevel(s, i)` deep equals a second call for 100 (s, i) pairs |
| Purity | Stub `Math.random` and `Date.now` to throw; generation still succeeds |
| Validity sweep | 1000 consecutive seeds at index 0 and 20 all return `validateLevel(def)` of `[]` |
| JSON round trip | `JSON.parse(JSON.stringify(def))` deep equals `def` |
| Roster size | 3 to 6 kinds, all from the SPEC 3.4 catalogue |
| Hazards | 0 to 3 gravity wells |
| Arena scaling | Mean arena area at index 20 above index 0; never above 2400 x 2400 |
| Roster weighting | Harder kinds (Snake, Spawner) appear more often at index 20 than index 0 over 500 seeds |
| Objective | One of scoreInTime, survive, destroyN for Adventure; none for Endless |
| Stars | `stars` equals [par, 2 x par, 4 x par] |
| Edge seeds | Seeds 0 and 0xFFFFFFFF generate valid levels |
| levelHash | Hard coded hashes for seeds 1, 42, 0xDEADBEEF at index 0 and 7 |
| Endless | `generateEndless(s)` has mode endless, objective none, unbounded ramp |

### 2.4 Validator: `tests/levelgen/validate.test.ts` (Foundry, W1)
| Case | Assertion |
|---|---|
| Valid fixtures | All three return `[]` |
| Roster 2 and 7 | Each returns an error naming roster size |
| 4 wells | Error naming hazards |
| Well on ship spawn | Error naming spawn clearance |
| Well outside arena | Error naming bounds |
| Sealed walls | rectWalls that split the arena returns an error |
| Arena too large for 21:9 or 10:9 safe rect | Error naming fit |
| Stars unordered | Error naming stars |
| Non JSON value (function, NaN) | Error naming serialisation |

### 2.5 Scoring: `tests/scoring/scoring.test.ts` (Ledger, W2)
| Case | Assertion |
|---|---|
| Base values | Grunt 50, Wanderer 10, Weaver 100, Pinwheel 25, Dart 30, SnakeHead 200, Spawner 150 at multiplier 1 |
| Multiplier | 5 geoms then a Grunt kill awards 50 x 6 (multiplier starts at 1, +1 per geom) |
| Reset | Death resets multiplier to 1 |
| Bomb | Bomb cleared enemies award 0 |
| Stars | `stars(par - 1, par)` 0, `stars(par, par)` 1, `stars(2 x par, par)` 2, `stars(4 x par, par)` 3 |
| Replay | A recorded event log of 50 kills and geoms produces a hard coded final score (Proctor duplicates this in tests/qa) |

Note: SPEC 3.6 does not state the starting multiplier. This plan assumes 1. Fable confirms and logs it in `docs/DECISIONS.md`.

### 2.6 Spatial hash collisions: `tests/game/collide.test.ts` (Forge, W1)
| Case | Assertion |
|---|---|
| Overlap | Two circles with distance below radius sum are reported |
| Miss | Distance above radius sum not reported |
| Cell edge | Entities straddling a 64 unit cell boundary are found from both sides |
| Dead skip | Killed ids never reported |
| Arena corners | Entities clamped to edge cells at the arena bounds are still found |
| No allocation | `rebuild` called 1000 times does not grow any array (lengths unchanged) |
| Brute force parity | For 400 random entities (seeded), grid query results equal an O(n squared) check |

### 2.7 applyNeon mapping: `tests/render/neon.test.ts` (Glow, W1)
| Case | Assertion |
|---|---|
| n = 0 | bloomScale 0.0, threshold 0.8, saturation 0.4, glowAlpha 0.0, gridAlpha 0.1 |
| n = 100 | bloomScale 2.0, threshold 0.2, saturation 1.3, glowAlpha 0.9, gridAlpha 0.6 |
| n = 70 (default) | bloomScale 1.4, threshold 0.38, saturation 1.03, glowAlpha 0.63, gridAlpha 0.45 (to 1e-9) |
| Clamp | n = -10 equals n = 0; n = 150 equals n = 100 |
| Monotonic | Each output strictly monotonic over 0 to 100 (threshold decreasing) |
| Palette | After `applyNeon(n)`, palette entries equal `hslToRgbInt(h, clamp(s x saturation, 0, 1), l)` for each base colour |
| Event | `applyNeon` emits exactly one `neon:changed` |

### 2.8 Settings persistence: `tests/settings/settings.test.ts` (Forge W1, Ledger W2 and W3)
| Case | Assertion |
|---|---|
| Defaults | Empty storage gives neon 70, volume 70, showFps false, glowPath "bloom" |
| Round trip | `saveSetting('neon', 33)` then `loadSettings().neon` is 33 under key `sow.settings.neon` |
| Clamp | Stored "150" loads as 100; "abc" loads as 70 |
| Storage throws | `getItem` and `setItem` throwing do not throw out of settings; defaults used |
| Independent keys | Corrupt `sow.settings.volume` does not affect neon |
| glowPath | Stored "xyz" falls back to "bloom" |

### 2.9 Other modules (owner, wave)
| File | Key assertions |
|---|---|
| tests/core/smoke.test.ts (Shipwright, W0) | Suite runs |
| tests/game/arena.test.ts (Forge, W1) | `confine` keeps a circle inside each of the 5 shapes; wall push out direction correct |
| tests/game/world.test.ts (Forge, W1) | Ship is id 0; spawn to `ENTITY_CAP` then returns -1; kill recycles |
| tests/input/stick.test.ts (Thumbs, W1) | Dead zone 0.12; clamp at 120 CSS px; left and right half assignment; 24 px edge ignore; third finger ignored |
| tests/input/buttons.test.ts (Thumbs, W1) | Button rects for a 21:9 and a 10:9 viewport, with insets; edge trigger once per press |
| tests/input/reanchor.test.ts (Thumbs, W1) | Stick cancelled when its origin leaves the canvas after resize |
| tests/render/shapes.test.ts (Glow, W1) | Every Kind except None has a shape entry |
| tests/render/devpanel.test.ts (Glow, W1) | Show FPS persists; Bloom / Fallback calls `setBloomEnabled` correctly |
| tests/game/enemies.test.ts (Swarm, W2) | Grunt converges; Wanderer bounces; Weaver dodges; Dart turn rate capped; Snake only head vulnerable; well kills, grows, explodes |
| tests/game/spawner.test.ts (Swarm, W2) | Same LevelDef gives an identical spawn log over 60 s of steps |
| tests/game/objective.test.ts (Swarm, W2) | Each objective type completes and fails |
| tests/game/supers.test.ts (Swarm, W3) | Homing, Detonate, Turbo effects and 5 s durations |
| tests/game/endless.test.ts (Swarm, W3) | Spawn rate non decreasing over 300 s; cap respected at 600 s |
| tests/ui/flow.test.ts (Ledger, W2) | Screen state machine; pause on `visibilitychange` hidden |
| tests/ui/settings.test.ts (Ledger, W2) | showFps and glowPath round trip |
| tests/ui/progression.test.ts (Ledger, W3) | Unlock rules; runSeed created once; Endless top 10 insert, sort, cap; corrupt JSON ignored |
| tests/render/particles.test.ts (Glow, W3) | Pool never exceeds 2048; slots reused; fx event to burst mapping |
| tests/audio/synth.test.ts (Glow, W3) | sfx mapping; shot rate limit; `setVolume` clamps 0 to 100 |
| tests/qa/*.test.ts (Proctor, W3) | 5000 seed generate plus validate; 5 LevelDef snapshots; scoring replay; storage keys unique with `sow.` prefix |

## 3. Device acceptance checklist (Z Fold 7)

Rules for every line:
- Start each session by confirming the build id shown on screen equals the id Fable gives. If it differs: close from recents, reopen online, wait 5 seconds, close and reopen.
- Browser: Chrome unless Ryan chose Samsung Internet (SPEC 9 item 4). Record which.
- "Folded" means the cover screen, "unfolded" the main screen.
- Gate column: the earliest gate at which the item must pass. Every item is re-run at G4.
- Proctor turns this section into `docs/device-checklist.md` in W4 with result columns and a paste-back block.

### 3.1 Install (G0)
| ID | Check | Pass criteria |
|---|---|---|
| I1 | Open `https://<gh-user>.github.io/shape-of-war/` in Chrome, folded | Black screen, neon triangle or menu, build id visible within 3 s |
| I2 | Chrome menu > Add to Home screen > Install | Install dialog appears and a Shape of War icon lands on the home screen |
| I3 | Icon appearance | Original neon triangle icon, not a screenshot or letter placeholder |
| I4 | Launch from icon | Opens without the browser address bar |

### 3.2 Fullscreen (G0)
| ID | Check | Pass criteria |
|---|---|---|
| F1 | Launch from icon | No status bar or navigation bar visible (fullscreen display mode) |
| F2 | Browser tab, tap once | Page enters fullscreen on the first tap |
| F3 | Swipe from the left edge once during play | Game pauses, does not exit (history guard, 04 section 11) |
| F4 | Rotate or unfold | Canvas fills the screen, no white or black bars beyond the intended letterbox |

### 3.3 Touch sticks on both halves (G1)
| ID | Check | Pass criteria |
|---|---|---|
| T1 | Left thumb anywhere on the left half, folded | Stick appears under the thumb, ship moves in the drag direction |
| T2 | Right thumb anywhere on the right half, hold | Ship aims at the drag direction and fires a 3-way spread continuously |
| T3 | Both thumbs 10 s, then lift one | Released stick disappears, the other keeps working, no stuck input |
| T4 | Repeat T1 to T3 unfolded | Same behaviour on the main screen |
| T5 | Start a touch within 24 CSS px of a side edge | No stick spawns |
| T6 | Tap bomb (bottom centre), super (above bomb), pause (top right) | Each responds once per tap; a stick thumb resting nearby does not trigger them |
| T7 | Move response | No visible lag between thumb and ship over 30 s of play (subjective; note any) |

### 3.4 Fold and unfold mid level (G0 label, G2 gameplay)
| ID | Check | Pass criteria |
|---|---|---|
| U1 | Unfold while the viewport label is shown (G0 build) | Label changes to new size without a reload |
| U2 | Unfold mid level while holding both sticks | No reload, ship still visible, sticks cancel cleanly and work on next touch |
| U3 | Fold mid level | Same as U2; arena letterboxed for 21:9; HUD at screen edges, not clipped |
| U4 | Fold and unfold 5 times in 20 s | No crash, score and lives preserved, FPS recovers within 2 s |

### 3.5 Neon slider (G1 dev panel, G3 settings screen)
| ID | Check | Pass criteria |
|---|---|---|
| N1 | Drag slider 0 to 100 | Glow intensity, colour saturation and grid brightness change while dragging, not only on release |
| N2 | Slider at 0 | Visibly dim and desaturated, still playable |
| N3 | Slider at 100 | Visibly brightest and most saturated |
| N4 | Set 33, close from recents, reopen | Slider shows 33 and the game looks the same |
| N5 | Switch Bloom / Fallback, then drag the slider | Slider still visibly changes the look on the fallback path |
| N6 | Live preview arena on the settings screen (G3) | Preview animates and reflects the slider while dragging |

### 3.6 Generator reproducibility (G2 via URL, G3 via typed seed)
| ID | Check | Pass criteria |
|---|---|---|
| D1 | Open `?seed=42&level=3` twice | Same level hash and same arena shape both times |
| D2 | Results screen, Retry | Same hash as the attempt just played |
| D3 | Settings > Play seed, type 1234, start, note hash; repeat | Same hash both times |
| D4 | Type 1235 | Different hash from 1234 |
| D5 | Advance from level 1 to 2 | Level 2 has a different hash from level 1 |

### 3.7 Performance targets per screen (G1 stress, G2 gameplay, G4 final)
Use Settings > Show FPS, or the 04 section 14 protocol for exact numbers.
| ID | Check | Pass criteria |
|---|---|---|
| P1 | Folded, `?debug=1&stress=400` (G1) or debug menu stress 400 plus 2000 particles (G3 on) | 120 fps target; pass at a stable 60 only if Motion smoothness is Standard and recorded |
| P2 | Unfolded, same stress | 60 fps or better average, minimum not below 55 over 10 s |
| P3 | Unfolded, normal Adventure level, 60 s | 60 fps or better, no visible hitch on explosions |
| P4 | Bloom versus fallback unfolded (G2) | Both numbers recorded; chosen path holds P2 |
| P5 | 10 minutes continuous play unfolded (G4) | Still 60 fps or better; note any drift (thermal, 04 section 13) |

### 3.8 Offline launch (G3)
| ID | Check | Pass criteria |
|---|---|---|
| O1 | Open app once online, close, reopen (SW install) | Build id matches latest |
| O2 | Airplane mode on, close from recents, open from icon | Menu loads within 3 s |
| O3 | Offline, start Adventure level | Level plays to results |
| O4 | Airplane mode off | No error, app keeps running |

### 3.9 Audio unlock (G3, n/a if audio cut)
| ID | Check | Pass criteria |
|---|---|---|
| A1 | Fresh launch, media volume up, first tap | Sound effects play after the first tap |
| A2 | Kill, pickup, death, bomb | Each has a distinct synthesised sound |
| A3 | Switch to another app and back | Sound resumes, no stuck tone |
| A4 | Volume slider to 0 | Silent |

### 3.10 Pause and resume (G2)
| ID | Check | Pass criteria |
|---|---|---|
| R1 | Tap pause | Simulation freezes, pause overlay shows Resume and Quit |
| R2 | Resume | Play continues from the same state, no lost lives |
| R3 | Home gesture mid level, return after 30 s | Game is paused on return, not dead |
| R4 | Quit from pause | Returns to menu, no crash |

### 3.11 Results screen (G2)
| ID | Check | Pass criteria |
|---|---|---|
| S1 | Finish a level | Results show score, par, stars (n/a if cut), level hash |
| S2 | Next | Starts the next level; unlocks it (G3) |
| S3 | Retry | Same level hash |
| S4 | Menu | Returns to title |
| S5 | Death vibration | Phone vibrates once per death, no other vibration |

### 3.12 Endless high score persistence (G3, n/a if Endless cut)
| ID | Check | Pass criteria |
|---|---|---|
| E1 | Play Endless until death | Score appears in the high score table |
| E2 | Close from recents, reopen | Table unchanged |
| E3 | Play 3 more runs | Table sorted descending, at most 10 entries |
| E4 | Escalation | Enemy pressure visibly rises over 2 minutes |

### 3.13 Progression and persistence (G3)
| ID | Check | Pass criteria |
|---|---|---|
| L1 | Finish level 1, close, reopen | Level 2 still unlocked |
| L2 | Reopen app | Run seed unchanged (level 1 hash same as before) |

Total: 58 line items.

### Gate summary
| Gate | Sections that must be green |
|---|---|
| G0 | 3.1, 3.2 (F1, F2, F4), U1 |
| G1 | 3.3, N1 to N3 via dev panel, P1, P2 |
| G2 | 3.4, 3.6 D1 and D2, P3, P4, 3.10, 3.11, N5 |
| G3 | 3.5 full, 3.6 full, 3.8, 3.9, 3.12, 3.13 |
| G4 | Every line, including F3, T5 to T7, P5 |

## 4. Performance protocol summary

Full steps: `docs/04-device-and-pwa.md` section 14. Summary:
1. Developer options and USB debugging on the Fold, connect to the Mac, accept the fingerprint.
2. Mac Chrome `chrome://inspect/#devices`, inspect the Shape of War tab or installed PWA.
3. Turn on "Show frame rendering stats" in DevTools.
4. Start stress 400 entities, 2000 particles (debug menu, or `window.sowDebug.stress(400, 2000)` in the console).
5. Record 10 s in the Performance tab, folded and unfolded, bloom and fallback.
6. Log FPS average, FPS minimum, longest frame, scripting versus GPU share, viewport line, Motion smoothness setting, build id in `docs/qa/perf-log.md`.
7. Fold or unfold during a run; confirm a new `[sow] viewport` line and no reload.

Pass criteria (SPEC 5): cover 120 fps target (stable 60 accepted only with Motion smoothness Standard recorded), main 60 fps minimum, both at 400 entities and 2000 particles. Sim step under 1.5 ms at 400 entities (04 section 13).

When USB debugging is not available at a gate, the on screen Show FPS reading is accepted for G1 and G2, and the full protocol runs at G4.
