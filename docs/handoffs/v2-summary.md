# Shape of War v2: summary for Ryan

Drafted by Scribe against main 8896202 (waves A to E merged), 2026-10-29. Fable reviews and commits. Every number below comes from `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/qa/` or the code, and says which. Your gate pastes are quoted exactly as they sit in the STATUS gate log.

## Bad news first

1. **GE has not run.** Nothing from wave E (new trails, map effects, kill notes, music fixes) has been seen on the phone. Your last paste is GD on build 6f11afb. Main is now 8896202. v2.0.0 is not tagged (tags today: g0, g2, g3, v1.0.0, v1.1.0).
2. **Your GD ratings were weak where wave E aimed.** Trails 2 and map effects 2 (out of 5), music "some glitches", music intensity 3. Wave E is the attempt to fix those. It is unproven until GE.
3. **Standard holds 59 fps on the main screen, not 60.** You accepted that at D8 (DECISIONS 35:50). The addendum text (docs/11 SPEC 5) still says a strict 60 floor (V2-08).
4. **The Low effects tier read 50 at GD, below Standard at 59.** Low is meant to be the cheap fallback. The paste was ambiguous (`fps_low 50/59`: an average of 50 with a bomb dip of 59 cannot be right), so this is a recheck, not a verdict (V2-03). Checklist line V-D1 re-measures it in a fixed order.
5. **Hit sounds are not built.** They are waiting on a bus event called `fx:hit`. No such event exists in `src/core/events.ts` today (the bus has `fx:kill`, `fx:death`, `fx:bomb`, `fx:geom` and `fx:pickup`), and no doc or code mentions `fx:hit`. My only source for this item is the brief that asked for this file. It is not one of the five v2 features in docs/11, so it needs a docs/11 clause from Fable before anyone builds it.
6. **Kill notes in the music have no clause in docs/11.** Chorus built them from your GD note as Fable wrote it in STATUS (V2-04 in `docs/qa/bugs.md`). They follow the rule in the header of `src/audio/music/kills.ts`. The addendum still lists only stingers, motifs and intensity.
7. **The Glow wave E run stopped at its budget cap before writing a hand-off.** Its work is commit 90f3aa6 (message starts "wip") plus tests in 28a5425, merged at 8896202. The merge message lists comet trails, shock pulses, ambient lattice and embers. Nobody has judged them yet.
8. **STATUS.md is behind.** Its "Current position" still says wave E is running on 6f11afb, and the open bug list still shows B1 to B4 as open (V2-09). Fable updates it.
9. **Wave E costs are not in STATUS.** See the cost section.
10. **The first credit tranche ($192.49) expires on 2026-10-29,** the date of this draft (STATUS line 2). The second $200 expires 2026-11-29 (DECISIONS 0:00).

## Knowns and unknowns

| Known | Unknown |
|---|---|
| GA, GB, GC and GD all passed on device | Whether wave E fixed trails, map effects and the music glitches (GE) |
| With every v2 feature off, play matches v1.0.0 for the same inputs. The generator sweep proves it for 5080 levels, 500 Endless defs and 2000 Endless segments against a golden from the v1.0.0 source (`tests/qa/generatorFlagSweep.test.ts`) | Whether the Low tier is really slower than Standard (V2-03) |
| `npm test` on this branch: 122 files, 1638 tests passed, 1 todo | Cover screen fps at 120 with Motion smoothness on Adaptive (G4 accepted 60) |
| STATUS "Cuts taken": none. All six enemies and all three new weapons shipped | Real wall clock cost of wave E |

## What shipped per wave

### V2-W0: plan and addendum

`docs/10-v2-plan.md` is the plan. `docs/11-v2-spec-addendum.md` is v2 canon next to SPEC.md (approved by Fable at 26:30). Your answers at 26:10 shaped it: thrust physics with brake assist, pickups lost on death and lasting 20 s, six enemies including Splime, music as drafted, and the reference priority grid, trails, particles.

### Wave A: space physics (gate GA)

- **Forge:** thrust model in `src/core/physics.ts`. The longer you hold the stick, the harder the ship accelerates. On release it drifts under drag. Walls slide, no bounce.
- **Ledger:** the Space physics row in Settings.
- **Chorus:** the music engine, built but not wired (it was wired in wave D).
- **Glue 4f61c3b** connects the setting to the ship.
- **D4:** the thrust table was accepted as is, no tuning run.

| Level | Hold until thrust is at its maximum | Top speed (u/s) | Coast distance after release at top speed |
|---|---|---|---|
| Low | about 0.4 s | 420 | about 105 u |
| Medium | about 0.7 s | 460 | about 184 u |
| High | about 1.3 s | 520 | about 433 u |

The hold times and coast distances are computed from the table in docs/11, not measured. Off is the exact v1 stick path (420 u/s, stops the instant you let go).

GA paste (Ryan, 27:30):

```text
4f61c3b: off_ok yes, low 4/1/5, medium 4/3/4/4, high 4/4/4/4, wall ok, persist yes, fps 60/60
```

### Wave B: weapons (gate GB)

- **Swarm:** weapon styles and pickups. **Glow:** bullet looks, pickup glyph, first trails. **Ledger:** the Weapon pickups setting and the HUD indicator.
- **Glue aff933f** connects the setting.
- Weapons: spread (the v1 weapon, always the default), rapid, pierce, orbit.
- D5 (pickup based weapons) and D6 (`enableV2Enemies` on) stand (DECISIONS 28:45).

GB paste (Ryan, 28:45):

```text
1612a53: pickup, rapid, pierce, orbit, death reset, toggle, drift orbit all ok; fps_main 60
```

### Wave C: six enemies (gate GC)

- **Foundry:** the generator adds the six kinds behind `enableV2Enemies` (default on). Levels 1 to 5, and any level made with the flag off, keep their v1 hashes. Output made with the flag on in band 2 and up carries generator version 2 (invariant J6, `docs/02-level-generator.md` section 11).
- **Swarm:** the six enemies, the Mine and Slime hazards, scoring, presence events.
- **Glow:** enemy visuals, enemy effects, threat map effects.
- **Glue 1c2a3d1** widens the generator sweep test to the new kinds.
- **GC fixes:** an early partial paste on 374a7b9 did not see Swirl, Blink or Sower. Foundry's triage proved all six spawn early on seed 42 (test pinned in `tests/levelgen/gcTriage.test.ts`), so the likely cause was that your stored seed was played. Glue d117d8e made `?seed` with `?level` start at that level and put the seed on the intro card. Your tuning in e6d6b66: Slime slows by 50 percent, a Splime drops Slime every 2 s.
- **CI:** three deploys failed on GitHub Actions because the sweep tests timed out on the slower runner. Fix c82eb1e raised timeouts. The phone stayed on 374a7b9 meanwhile (DECISIONS 32:30).
- **D7:** you kept the Sower as fair.

GC paste (Ryan, 33:30):

```text
fb25216: charger 4, bulwark 4, splime 5, swirl, blink, sower all read and countered, hashes match seed 42 pins, blink fair under Medium physics, slime ok at 50 percent, fps_main 60
```

### Wave D: lattice grid, effects tiers and music (gate GD)

- **Glow:** a spring lattice grid that deforms, dim drifting dust, the three effects tiers, and the readability tells you asked for at GC (Bulwark shield plate, Charger lane band, Splime drop ring).
- **Chorus:** the layers and motifs per enemy kind, stingers, intensity from threat, and `wireMusic`.
- **Ledger:** the Effects and Music settings.
- **Glue 4113528** connects the tier and the music.
- **D8:** Standard stays the default. High also held 59 but stays opt in. **D9:** music default 50, plays in play only.

GD paste (Ryan, 35:50):

```text
6f11afb: fps low 50/59, standard 59/59, high 59; grid 4, trails 2, particles 3, map 2; music layers ok, intensity 3, some glitches, pause and fold ok, zero ok
```

### Wave E: hardening and fixes (gate GE, pending)

- **Proctor (run 0179):** the v2 device checklist (section "V2-G4" of `docs/device-checklist.md`), extra suites (flag sweep against the v1.0.0 golden, drop replay, physics replay, storage keys, assets, owner tables), a v2 triage in `docs/qa/bugs.md`, perf log and bundle size. Gzipped JS is 241.7 KiB, 16.5 percent of the 1.5 MB flag limit, so not flagged (`docs/qa/perf-log.md` section 9).
- **Glow (run 0180):** comet trails, shock pulses, ambient lattice drift, embers, particle budget.
- **Chorus (run 0181):** kill notes with a selection rule (2 to 6 per bar by threat, about 7 in 10 pass, a streak or big kill becomes one chord, never steals a voice), a wider intensity range, and a 250 ms scheduling lookahead (docs/11 SPEC 3.9 says 250 ms).

GE paste: none yet.

## Cost per run

From the "Merged branches" lines of `docs/STATUS.md`.

| Wave | Runs | Cost |
|---|---|---|
| Plan (v1.1) | scribe-v2-plan $3.03 | $3.03 |
| V2-W0 | scribe-v2-stubs $0.77, scribe-v2-addendum $1.23 plus $1.91 fix, scribe-v2-stubs2 $0.17 | $4.08 |
| A | forge-space-physics $0.87, ledger-space-setting $1.42, chorus-engine $2.29 | $4.58 |
| B | glow-weapon-fx $3.93, swarm-weapons $2.67, ledger-weapon-hud $1.50 | $8.10 |
| C | foundry-v2-enemies $5.18, swarm-enemies $4.43, glow-enemy-fx $5.86 | $15.47 |
| GC fixes | foundry-gc-triage $1.31 | $1.31 |
| D | glow-lattice $7.99, chorus-layers $3.82, ledger-fx-music $2.29 | $14.10 |
| E | proctor-v2-harden, glow-v2-fixes, chorus-v2-fixes | not in STATUS |

- **Sum of the listed v2 runs through wave D:** $47.64, or $50.67 with the plan run. Scribe added these; STATUS does not total them.
- **STATUS project figure:** "Spend so far about $113 of $192", written at wave D. It covers the whole project and does not include wave E.
- **Wave E:** the dispatcher result files for runs 0179 to 0181 hold the numbers. They are not in this worktree. Fable fills the row.
- **Dispatcher cap:** `MAX_BUDGET_USD=8` per run since 26:30 (DECISIONS). Glow's lattice run finished at $7.99, a cent under it.

## What is still open

1. **GE, the final v2 device checklist.** Run `docs/device-checklist.md` section "V2-G4" on the Fold, about 55 lines and 45 minutes. If time is short, the checklist names the order: V-X1 to V-X4 first, then V-D1, V-D2, V-D3, V-D6, V-D7, V-D8, V-D9, V-D12, then the rest. Paste the block at the end back to Fable. The build id comes first: it must match what Fable gives you. On a pass Fable tags v2.0.0 (STATUS "Next session first action").
2. **Hit sounds** wait on `fx:hit` (bad news item 5).
3. **Smaller items,** all in `docs/qa/bugs.md`:
   - V2-03: Low tier fps recheck.
   - V2-04: kill notes need a docs/11 clause.
   - V2-07: `docs/10-v2-plan.md` and one comment in `src/game/ship.ts` still carry the old Slime numbers (20 percent, 3.5 s). The code and docs/11 are right (50 percent, 2 s).
   - V2-08: docs/11 still says a strict 60 floor.
   - V2-09: the STATUS bug list is stale.
   - V2-11: one stale `it.todo` in `tests/levelgen/par.test.ts`.
   - B3 (visual quality) stays open as P2 until GE judges trails and map effects.
4. **v3 backlog** (DECISIONS 27:10; docs/09 sections 1, 2 and 4 stay parked, not cancelled):
   - **High effects tier as the default.** The High tier exists in v2 and is opt in. It held 59 at GD, the same as Standard (D8).
   - **3D rendering.** It needs a Three.js migration, which docs/11 forbids for v2.
   - **Curved arena surfaces.** Only the `surface: 'flat'` hook exists (`src/core/surface.ts`). Nothing curved is built.

## How to play each feature

The site is `https://<gh-user>.github.io/shape-of-war/`. Settings opens from the menu and from the pause screen. Changes save on their own and survive closing the app. Reset progress does not touch any setting.

### Settings rows

| Row | Choices | Default | What it does |
|---|---|---|---|
| Neon | slider 0 to 100 | 70 | Glow strength (v1) |
| Volume | slider 0 to 100 | 70 | Sound effects (v1) |
| Music | slider 0 to 100 | 50 | Generative music. 0 is silence |
| Space physics | Off, Low, Medium, High | Off | Thrust and drift. Off is the v1 stick |
| Weapon pickups | On, Off | On | Off means no pickups drop |
| Effects | Low, Standard, High | Standard | Look tier (see below) |
| Show FPS | On, Off | Off | fps meter |
| Glow | Bloom, Fallback | Bloom | Glow path (v1) |
| Play seed | type a number | none | Plays Adventure on that seed from level 1. A typed seed that differs from your saved one saves no scores and no unlocks |

Storage keys for these are in `docs/03-architecture.md` section 8.

### Space physics

Settings, Space physics. Off plays like v1. Low is a short slide. Medium and High drift further and build thrust more slowly. Turning around is fast because of brake assist. You slide along walls.

### Weapons

Leave Weapon pickups On. The first pickup drops at your 15th scoring kill, then one every 25 kills, one on screen at a time. Fly onto it within 8 s. The weapon lasts 20 s, and dying puts you back on spread. The HUD shows the name and a countdown, and hides while you hold spread. Turbo doubles the fire rate of every weapon.

| Weapon | Feels like | Where it can drop |
|---|---|---|
| Rapid | Two parallel fast shots | Every level |
| Pierce | One long shot that goes through up to 3 more enemies after the first hit | Level 6 and up |
| Orbit | Four blades circle the ship and hurt what they touch, plus a forward shot | Level 16 and up, and Endless |

### Enemies

Levels 1 to 5 have none of the new ones. Charger, Swirl and Splime start at level 6, Bulwark and Blink at level 16, Sower at level 31 (docs/11 SPEC 3.4 rule 3 and `bandOf` in `src/levelgen/leveldef.ts`).

| Enemy | Tell | Counter |
|---|---|---|
| Charger | Lane line while it winds up, then a fast dash | Leave the lane, shoot it while it rests |
| Bulwark | Shield plate on its front blocks shots | Flank it. Bombs ignore the shield |
| Blink | Ghost at the old spot, ring at the destination | It cannot be hit while it warps, so wait for it to land |
| Swirl | Circles you, then dives straight | Lead it along its circle, sidestep the dive |
| Sower | Hugs the wall and drops Mines | Shoot Mines from range, stay off the walls |
| Splime | Slow, drops Slime puddles every 2 s | Shoot it from range. Slime never kills: it slows you by 50 percent for 2 s, bullets pass through, a bomb clears every puddle |

### Effects tiers

- **Low:** the v1 look. Static grid with its ripple, no trails, no map effects.
- **Standard:** the deforming lattice grid, trails and map effects. Stays the default.
- **High:** a denser lattice and 4096 particles instead of 2048. Opt in.

### Music

Plays only during a level, never in menus, and starts after your first tap. Pause, a hidden tab or a fold stops it, and it resumes on the next bar. A new enemy kind entering sounds a stinger and its motif joins; the motif leaves about 2 bars after the last one dies. Music 0 is silence.

### The v1 check

Settings: Space physics Off, Weapon pickups Off, Effects Low, Music 0. The game should play like v1.1.0 (checklist V-X1). Put them back to Off, On, Standard, 50 afterwards.

### URL parameters

Add them to the site address in a browser tab.

| Parameter | Effect |
|---|---|
| `?seed=42` | Plays Adventure on seed 42 from level 1. The intro card shows the seed. If 42 is not your saved seed, no scores or unlocks are saved |
| `?seed=42&level=16` | Starts at level 16 on seed 42. Open it twice and the level hash and the enemies must match |
| `?level=16` | Continue opens level 16 on your saved seed |
| `?stress=400` | Starts the stress scene with 400 entities. `&particles=2000` sets the particle target (2000 is the default) |
| `?debug=1` | Shows the viewport label at top left and the move stick readout |
| `?glow=sprite` | Uses the fallback glow path for that session only (v1) |

The level hash is at the end of the top line during play, for example `L3  Par 1,000  #E811153A`. You can also reach the stress scene without the URL: in Settings tap the `build ...` label 5 times within 3 seconds, then tap `Stress: 400 entities, 2000 particles`.

Seed 42 levels with their hashes, from the generator (not a device reading; source `docs/device-checklist.md`):

| Level | Hash | Use |
|---|---|---|
| 3 | `#E811153A` | First pickup, same hash as v1.0.0 |
| 6 | `#93A4C56E` | Charger |
| 7 | `#CC6859DC` | Swirl |
| 9 | `#5BD14124` | Splime and Slime |
| 13 | `#18B193B3` | Pierce possible |
| 16 | `#D736C51F` | Bulwark, orbit possible |
| 17 | `#43CADCE4` | Blink |
| 20 | `#D25C4D7D` | Crowded level for look and sound |
| 31 | `#66AF8BD7` | Sower |

If the HUD shows a different hash, you are on the wrong build or the wrong seed. Stop and tell Fable.
