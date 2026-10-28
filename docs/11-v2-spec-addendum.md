# Shape of War: v2 SPEC addendum

This file extends SPEC.md for v2 branches only. A v2 branch is any branch cut from main after this file is committed and before tag v2.0.0. Tags v1.0.0 and v1.1.0 and the v1 documents are unaffected.

Where a heading below names a SPEC or docs/01 clause and gives replacement or added wording, this file wins for v2 branches. On any conflict not listed here, SPEC.md wins. Style rules are SPEC.md's: no em or en dashes, sentence case headings, terse prose, bad news first.

Status: draft by Scribe, 2026-10-28, revised the same day with Ryan's answers. Not canon until Fable commits it (docs/10 decision D1). Ryan's reply answers docs/10 questions 1 to 4, 6, 8, 10 and 11 (his reply numbers its items 1 to 7, which differ from the docs/10 numbers; docs/10 "Questions for Ryan" maps them). Lines marked "(default, Q<n>)" still use the bracketed default of docs/10 question n because the reply did not cover it: Q5, Q7, Q9, Q12, Q14 and Q15. Fable edits those lines when Ryan answers.

Builder reading rule: on a v2 branch, CLAUDE.md's "SPEC.md is canon" and "No feature outside docs/01" mean SPEC.md and docs/01-game-design.md as amended by this file. Anything this file does not permit stays out of scope.

## Permitted v2 features (the complete list)

v2 permits these five features, in Ryan's priority order, and nothing else:

1. Space physics: thrust based ship motion with a four step setting (section "Space physics").
2. Weapon upgrades that change firing style (SPEC 3.5).
3. Advanced enemies: Charger, Bulwark, Blink, Swirl, Sower and Splime, plus the Mine and Slime hazards (SPEC 3.4).
4. A visual pass inside the 60 fps budget: deforming grid, richer trails, more particles, map effects (SPEC 3.8).
5. Dynamic generative music by Chorus (SPEC 3.9 and 7.3).

Each feature is built to the starting values in docs/10. Number tuning goes to docs/DECISIONS.md. A change to a rule in this file needs an edit to this file first.

## SPEC 3.4 Enemy catalogue

SPEC 3.4 is headed "Enemy catalogue (v1)" and lists eight rows, Grunt to Spawner. The eight rows are unchanged. Add:

| Name | Behaviour | Colour family |
|---|---|---|
| Charger | Winds up while turning toward the ship (a lane line is drawn), dashes straight along the locked heading, rests. A wall ends the dash | Glow assigns |
| Bulwark | Slow seeker with a limited turn rate. A frontal shield arc absorbs player bullets, drone shots and orbit blades. Bombs and Detonate ignore it. Flank it | Glow assigns |
| Blink | Drifts toward the ship, then a harmless, untargetable warp phase (ghost at the old spot, ring at the destination), then jumps to a point near the ship | Glow assigns |
| Swirl | Orbits the ship while closing in, then commits to a straight dive | Glow assigns |
| Sower | Hugs the nearest arena boundary and drops Mines on a timer | Glow assigns |
| Splime | Slow seeker, about 0.35 of ship speed. Every few seconds it drops Slime. Contact kills the ship like any enemy | Glow assigns |
| Mine (hazard, never in a roster) | Static. Harmless for a short arming delay after the drop, then kills the ship on contact. 1 HP, expires, no score, no geoms | Glow assigns |
| Slime (hazard, never in a roster) | Static puddle dropped by a Splime. Not deadly. A ship touching it is slowed. Bullets pass through. A bomb clears it. Expires, no score, no geoms | Glow assigns |

Colour: Glow picks the six enemy hues from the gaps left by docs/01 section 11, roughly 10, 240, 335, 160 and 75 degrees for the first five (docs/10 wave C brief), plus one more gap for Splime. Slime shares the Splime hue family at lower alpha. No hue is fixed here. Palette keys are `splime` and `slime`.

Rules:

1. Starting values (speeds, HP, radii, timings, caps) are in docs/10 "Design: six enemies, two hazard entities". Mine cap is 6 live per Sower and 24 in total. Slime cap is 3 live per Splime and 12 in total.
2. docs/01 6.1 global rules apply to the six enemies unchanged: 0.6 s telegraph, contact kills the ship, soft separation, `maxLiveEnemies`, variation only from LevelDef fields, `w.simRng` or `hash01`.
3. The generator adds the six kinds behind `GenConfig.enableV2Enemies`, default on (default, Q9).
   - Flag off: `generateLevel` and `generateEndless` output is byte identical to v1 for every seed.
   - Flag on: band 1 never contains a new kind. Charger, Swirl and Splime may appear from band 2, Bulwark and Blink from band 3, Sower from band 4, at the shares in the docs/01 6.3 note below. Roster stays 3 to 6 types with Grunt forced. Mine and Slime are never in a roster.
   - Output made with the flag on carries generator version 2. Output made with the flag off still reports version 1. `LEVELDEF_VERSION` stays 1 unless a field shape changes. No LevelDef field is added for weapons.
   - Levels 1 to 5 and every level generated with the flag off keep their v1 hashes. For the same run seed, bands 2 and up differ once the flag is on (default, Q9).
4. `surface: 'flat'` and `src/core/surface.ts` are unchanged. Nothing curved is built (default, Q15).
5. Floor: at least five of the six enemies must ship. Sower and Mine are the first cut. Splime and Slime are the second cut, which takes the count to four, below the floor, so that cut is reported to Ryan and never taken silently.
6. The bus gains `sim:enemyEnter`, `sim:enemyExit` and `sim:threat` (see "Settings keys and bus additions").
7. Splime and Slime (Ryan, 2026-10-28):
   - Splime walks toward the ship at about 0.35 x ship speed and every few seconds drops Slime.
   - Slime is a hazard entity, not an enemy: a static puddle, radius about 40 u, lifetime about 8 s, a few live per Splime. It is not deadly, awards no score and no geoms, is not a kill and does not count toward a destroy objective.
   - A ship touching Slime is slowed by 50 percent for 2 s (Ryan, GC). This is a ship speed multiplier channel: the ship state carries `slowUntil` (a `w.time` value) and `slowFactor`. Each contact sets `slowUntil` to now plus 2 s and `slowFactor` to 0.5. The factor is set, never multiplied, so overlapping puddles never stack below 0.5. Splime drops a Slime every 2 s (Ryan, GC).
   - Player bullets, drone shots and orbit blades pass through Slime. Drones ignore Slime. A bomb clears all live Slime. Wells do not pull it.
   - Forge adds `slowUntil` and `slowFactor` to `ShipState` in wave A (defaults 0 and 1) and `stepShip` reads them. Swarm sets them in wave C. While `slowUntil` is in the past the ship path is bit identical to v1.

## SPEC 3.5 Player kit

SPEC 3.5 reads "Weapon: 3-way spread, auto-fire at 12 shots per second while the right stick is held." Replace with:

> Weapon: four firing styles, spread (the v1 weapon and the default), rapid, pierce and orbit. Auto-fire while the right stick is held, unchanged. Spread is exactly the v1 weapon.

Starting values (docs/10 "Design: weapons"):

| Style | Pattern | Volleys per s | Bullet |
|---|---|---|---|
| spread | 3 bullets at minus 6, 0, plus 6 deg | 12 | speed 1400, radius 4, life 1.2 s |
| rapid | 2 parallel bullets, 5 u either side of the aim line | 26 | speed 1500, radius 3, life 1.0 s |
| pierce | 1 bullet, passes through up to 3 enemies after its first hit; stopped by walls, snake segments and wells | 8 | speed 1600, radius 6 |
| orbit | 4 blades circling the ship at radius 80 u, 2.4 rev/s, plus 1 forward bullet while aiming | 6 forward | blade radius 7, hits any enemy it touches, 0.12 s cooldown per blade |

Acquisition and rules:

1. Weapons come from pickups dropped by kills, not from the LevelDef. A counter of scoring kills drives drops: first at kill 15, then every 25. One pickup is live at a time; a due drop waits.
2. The pickup appears at the kill position, lives 8 s (blinks the last 2 s), collect radius 28 u from the ship. Bombs leave it alone. Level end clears it.
3. The drop is `pool[floor(hash01(level.seed, dropIndex) * pool.length)]`, skipping one step if it repeats the previous drop. Pool by `level.band`: band 1 rapid; band 2 rapid and pierce; bands 3 and 4 and Endless rapid, pierce and orbit. No PRNG, no LevelDef field.
4. A collected weapon lasts 20 s. The same weapon refreshes the timer; a different one replaces it. Ship death returns to spread.
5. Turbo doubles the volley rate of every weapon. Orbit rotation is unaffected. Bombs, drones, supers, lives and bomb counts are unchanged.
6. Settings switch "Weapon pickups", default on (default, Q7). Off means no pickups spawn and the kill counter does not run.
7. The HUD shows the weapon and a countdown inside the existing top band, hidden while the weapon is spread, with no new pointer target.
8. With pickups off, or while the weapon is spread, bullet output and pool state equal v1 (golden test).
9. Floor: at least two of rapid, pierce and orbit must ship. Orbit is the first weapon cut (cut 7).
10. A level based loadout (a `weapon` field in LevelDef) is not permitted.

## SPEC 3.6 Scoring

SPEC 3.6 lists base values "Grunt 50, Wanderer 10, Weaver 100, Pinwheel 25, Dart 30, Snake head 200, Spawner 150". Add: Charger 120, Bulwark 150, Blink 130, Swirl 80, Sower 180, Splime 140, Mine 0, Slime 0.

Mine and Slime award no score and no geoms, are not counted as kills, and do not count toward a destroy objective. Par and star calculations include the new values; stars stay at par, 2x par and 4x par.

Score tables: one table (default, Q5). Adventure bests and the Endless top 10 keep their v1 keys, with no table per physics level. The results screen shows the Space physics level in effect when the run ends (default, Q5).

## SPEC 3.7 Cuts for v2

SPEC 3.7's last sentence reads "Everything cut here except online leaderboards is scheduled for v2 in docs/09-v2-roadmap.md, which starts only after tag v1.0.0." Replace with:

> Nothing in this list is scheduled for v2. docs/09-v2-roadmap.md is not v2 scope; v2 scope is the five features in the v2 SPEC addendum. Online leaderboards, accounts, score submission and cloud sync stay cut forever.

The SPEC 3.7 list stays cut in v2 in full: 3D curved arena surfaces (the flat hook only) (default, Q15), achievements, multiple ship types, licensed music, campaign narrative, haptics beyond one vibrate on death, gamepad and keyboard. Also not permitted: a Three.js migration, the Lens and Lattice agents, local leaderboards, enemy bullets, bosses and every item in docs/09 not named in this file.

SPEC 8 (the 30 hour clock, waves W0 to W4 and its cut order) applies to v1 only. v2 waves and gates are V2-W0 to V2-E and GA to GE in docs/10.

v2 cut order, cut from the top, at most one cut per checkpoint unless a trigger fires twice:

| Cut # | Item | Trigger |
|---|---|---|
| 1 | Music motifs for enemy kinds beyond the first three (keep stingers, base track, intensity) | The Chorus A hand-off reports scheduler glitches, or music glitches at GD persist after one Chorus fix run |
| 2 | Music entirely (engine stays unwired) | Music glitches at GD persist after cut 1 and a second Chorus fix run |
| 3 | Map effects and dust (keep the lattice) | Glow D incomplete at the 9:00 check |
| 4 | Visual tiers: High, then Standard lattice 25 u to 33 u, then Low (v1 grid and ripple) | `fps_main` under 60 at GD |
| 5 | Sower and Mine (five enemies remain, the floor) | Fairness paste "unfair" or Mine cap trouble |
| 6 | Splime and Slime (four enemies remain, below the floor, so reported to Ryan first) | Fairness paste "unfair" for Splime or Slime, Slime cap trouble, or the Swarm C build window runs out before Splime |
| 7 | Orbit weapon (rapid and pierce remain) | Orbit fails at GB or collides with the pool |
| 8 | Space physics High (low and medium remain) | Paste says High is unplayable and no retune fits |

Decision clocks per cut are in docs/10 "Cut order". Executing a cut follows docs/05: remove it from the remaining briefs, disable it with glue (weight 0, control hidden, tier removed), log it in STATUS "Cuts taken" and DECISIONS, tell Ryan in one line.

Never cut: the Off invariant (section "Engineering rules that stay"), touch controls, generator determinism with flags off, the neon slider, PWA install. Floors: at least five of the six new enemies and at least two new weapon styles. Below a floor the feature is reported incomplete to Ryan; Fable does not ship a partial feature silently.

## SPEC 3.8 Visual effects (new clause)

Permitted: a deforming lattice grid (impulses from kills, deaths, bombs, a continuous pull from wells, a ship wake), more particles, ship and bullet trails, dash and swirl trails, threat driven map effects (wall glow pulse, wall flashes) and dim drifting dust. All of it is render only and cosmetic. The simulation never reads it and no PRNG feeds it; jitter uses `hash01`.

Effects tiers, setting `sow.settings.effects`, default Standard (default, Q12):

| Tier | Particle cap | Grid | Trails and map effects |
|---|---|---|---|
| low | 2048 | v1 grid and ripple, unchanged | off |
| standard | 2048 | lattice at 25 u spacing, 4096 node cap | on |
| high | 4096 | lattice at 16 u spacing, 8192 node cap | on, denser bursts |

Rules:

1. Low reproduces the v1 look. Trails are shed first when the particle pool is above 80 percent live.
2. The lattice draws from one geometry buffer. No per frame `Graphics.clear` for lattice lines, no allocation per frame.
3. A pure governor steps the lattice spacing down one notch after 3 s of sustained overload and never steps back up inside a level.
4. SPEC 4 is unchanged: `applyNeon(n)` is the only writer of bloom strength, threshold, saturation, glow width and grid base brightness, on both glow paths. Transient effects are multipliers on their own layers. A new tunable that SPEC 4 assigns to the neon slider becomes a `NeonParams` field computed in `neonParams(n)`.
5. Reference images live under docs/ref/ for Glow to read (Ryan adds the screenshots). They are docs only and never imported, bundled or placed in public/. Briefs must be satisfiable without them. Priority, Ryan's order: grid deformation, trails, particles.
6. Glow's roster line "Particle budget 2000" is superseded by the tier table above. The stress scene (SPEC 5) stays 400 live entities and 2000 particles.

## SPEC 3.9 Music (new clause)

Permitted: original generative music synthesised with Web Audio (oscillators, noise, gain envelopes). SPEC 2's audio row stands: no audio files, samples, fonts or images. Licensed or third party music stays cut and nothing from Geometry Wars is used (SPEC 1 requirement 5).

1. A composed base track with layers: sub bass, pad, kick, hat and arp. A minor, 120 BPM, 4/4, 8 bar loop.
2. When an enemy kind enters the arena it sounds a stinger and its motif joins. The motif leaves 2 bars after the last entity of that kind exits. Intensity follows `sim:threat`. Hazards (wells, spawners, Mine, Slime) add no layer. Splime is an enemy and gets a motif.
3. Deterministic: a note pattern is a pure function of (level seed, kind, bar) built on the stateless `hash01`. Never `Math.random`, never an advancing PRNG. The simulation and render never call music code and music never feeds the simulation.
4. Lookahead scheduling: a timer every 25 ms schedules notes 250 ms ahead on `AudioContext.currentTime`.
5. Budget: music voice cap 16, sfx cap 24 untouched, summed layer gain at most 1.0, music master at most 0.35 of the synth master. Nodes are disposed after each note.
6. Music plays in play only, never in menus. Level start calls `startMusic(seed)`; quit and game over call `stopMusic()`. Pause, a hidden tab and fold suspend scheduling and resume on the next bar line.
7. Setting `sow.settings.music`, 0 to 100, default 50. 0 is silence and reproduces v1 sound.
8. Audio subscribes to the bus and never imports src/game, src/ui or src/render.

## SPEC 5 Device and input rules

SPEC 5's last bullet reads "Target 120 fps on the cover screen, hold 60 fps minimum on the main screen with 400 live entities and 2000 particles." Replace with:

> Target 120 fps on the cover screen, unchanged. On the main screen 60 fps is a floor, measured on the stress scene (400 live entities, 2000 particles) at the Standard effects tier with the motion setting recorded. The floor is strict for Standard (default, Q12). High is opt in and becomes the default only if its own numbers also hold 60 (default, Q12). If a tier misses 60 on the main screen at its gate, that tier is not the default.

Unchanged: 120 Hz fixed step, DPR cap 2, Pointer Events only, touch only, one vibrate on death and nothing else. No allocation per step in physics, weapons or enemies.

## SPEC 7.3 Roster and git rules

SPEC 7.3 lists nine nicknames, "Forge ... Scribe (docs and hand-offs)". Add a tenth (default, Q14):

> Chorus (v2 music only: Web Audio synthesis, no audio assets). Owns src/audio/music/ and tests/audio/music/.

1. The roster file is `.claude/agents/chorus.md`, created at V2-W0. The dispatcher refuses an agent job whose roster file is missing.
2. Glow does not edit src/audio/ in v2. Files in src/audio/ outside music/ (synth.ts, cues.ts) are read only for every builder unless a wave brief names one for Chorus. docs/10 wave A names one: an additive `getAudioGraph()` export in src/audio/synth.ts.
3. Chorus never edits src/game, src/ui, src/render, src/levelgen, src/input or src/core. It consumes bus events and asks for changes under "Requests".
4. No other nickname is added. Lens and Lattice (docs/09) are not created.
5. The rest of 7.3 is unchanged: branches `feat/<nickname>-<slug>`, one builder per directory per wave, Fable-only merges with `git merge --no-ff` after `npm test && npm run build`.

## docs/01 overrides

### Section 4.2 Weapon

The 4.2 rows Pattern, Fire rate, Bullet speed, Bullet radius and Lifetime describe spread. When another style is active, the per style values in SPEC 3.5 above replace them. The row "Pierce: None" becomes:

> Pierce: none for spread and rapid. The pierce style passes through up to 3 enemies after its first hit and is stopped by walls, obstacles, snake segments and wells. Orbit blades damage any enemy they touch, with a 0.12 s cooldown per blade.

Damage, spawn offset, gravity pull and the live bullet cap are unchanged. Rapid at Turbo peaks at about 125 live bullets and orbit uses 4 pool slots, both inside the v1 pool.

### Section 6 Enemy catalogue

6.1 global rules, 6.5 spawn position rules, 6.6 speed scaling and 6.7 well numbers apply to the six new enemies unchanged. Blink destinations are pulled inside the arena as 6.5 describes. Swirl, Blink, Bulwark, Charger, Sower and Splime are pulled by wells like other enemies. A Charger is not pulled while dashing. Mines and Slime are not pulled.

6.2 stats table gains these rows (starting values, tunable):

| Enemy | Speed (u/s) | HP | Base score | Hitbox radius (u) | Geoms | Spawn unit |
|---|---|---|---|---|---|---|
| Charger | 720 dash, 0 otherwise | 2 | 120 | 15 | 2 | 1 |
| Bulwark | 90 | 3 | 150 | 18 | 3 | 1 |
| Blink | 100 | 1 | 130 | 13 | 2 | 1 |
| Swirl | about 144 tangential | 1 | 80 | 12 | 1 | 1 |
| Sower | 70 | 4 | 180 | 16 | 3 | 1 |
| Splime | 147 (0.35 of ship speed) | 3 | 140 | 16 | 2 | 1 |
| Mine | 0 | 1 | 0 | 9 | 0 | dropped by a Sower |
| Slime | 0 | none, bullets pass through | 0 | 40 | 0 | dropped by a Splime |

6.3 spawn weight table gains these target shares by band (Foundry picks the mechanism; roster size, spawner and well counts are unchanged):

| Enemy | Band 1 | Band 2 | Band 3 | Band 4 |
|---|---|---|---|---|
| Charger | 0 | 12 | 16 | 18 |
| Swirl | 0 | 10 | 12 | 12 |
| Bulwark | 0 | 0 | 12 | 16 |
| Blink | 0 | 0 | 10 | 14 |
| Sower | 0 | 0 | 0 | 10 |
| Splime | 0 | 8 | 10 | 10 |

6.4 behaviour detail for the six is in docs/10 "Design: six enemies, two hazard entities".

### Section 12 Particles (consequential note)

The line "Budget 2000 live particles" is replaced by the per tier caps in SPEC 3.8. The event table is unchanged.

### Section 13 Audio (consequential note)

"No music in v1" does not apply to v2 branches; music follows SPEC 3.9. The cue table, the 24 voice sfx cap and the master gain formula are unchanged.

### Section 14 Cut from v1

Lifted for v2, each only as scoped here:

- "Reactive spring grid that warps around explosions and wells. Grid is static." Lifted by SPEC 3.8. The Low tier keeps the static grid.
- "Music tracks or generative music." Lifted by SPEC 3.9.
- "Boss enemies and enemy types beyond section 6." Lifted for Charger, Bulwark, Blink, Swirl, Sower, Splime, Mine and Slime only. Bosses stay cut.

Everything else in section 14 stays cut, including the SPEC 3.7 list, enemy bullets, camera scroll or zoom, player choice of drone or super, left handed control swap, screen shake toggle and colour blind palettes, Endless arena shapes other than the fixed rectangle, gravity wells and spawners in Endless, replay recording, haptics beyond death and score submission. "Cut order under clock pressure is SPEC section 8" is replaced by the v2 cut order in "SPEC 3.7 Cuts for v2".

## Space physics (amends SPEC 3.5 and docs/01 3 and 4.1)

Setting `sow.settings.spacePhysics`: off, low, medium, high. Default off. Under low, medium and high the ship is driven by thrust: the longer the stick is held, the harder it accelerates, and on release it drifts under drag. Owner: Forge.

Model (Ryan, 2026-10-28): per sim step, with `dir` the stick vector (magnitude capped at 1) and `held` true when the stick is past its dead zone:

```
if held:
  t = t + dt                          // continuous hold time
  a = min(A_MIN * exp(t / TAU), A_MAX)
  if dot(dir, v) < 0: a = a * BRAKE   // brake assist when reversing
  v = v + a * dir * dt
  if |v| > V_MAX: v = v * V_MAX / |v|
else:
  t = 0
  v = v * exp(-DRAG * dt)             // drift
```

Low, Medium and High each set one row of the table. Starting values, tuned at gate GA:

| Level | A_MIN (u/s2) | TAU (s) | A_MAX (u/s2) | V_MAX (u/s) | DRAG (1/s) | BRAKE |
|---|---|---|---|---|---|---|
| off | none, velocity set from the stick | none | none | 420 | none | none |
| low | 1200 | 0.6 | 2400 | 420 | 4 | 2.5 |
| medium | 800 | 0.8 | 2000 | 460 | 2.5 | 2.0 |
| high | 500 | 1.0 | 1800 | 520 | 1.2 | 1.6 |

Derived values, for reading the paste (computed from the formulas above, not measured):

| Level | Time from rest to V_MAX | Hold time at which a reaches A_MAX | Coast distance after release at V_MAX (V_MAX / DRAG) | Time to 10 percent speed after release | Stop time on reversal after a long hold (V_MAX / (A_MAX x BRAKE)) |
|---|---|---|---|---|---|
| low | 0.28 s | 0.42 s | 105 u | 0.58 s | 0.07 s |
| medium | 0.43 s | 0.73 s | 184 u | 0.92 s | 0.12 s |
| high | 0.71 s | 1.28 s | 433 u | 1.92 s | 0.18 s |

Arenas are 700 to 1100 u high (docs/01 2.3), so High coasts 0.4 to 0.6 of an arena height.

Rules:

1. Off is the exact v1 path: velocity set directly from the stick each tick, as docs/01 4.1 "Acceleration: Instant" says. With Off selected every existing feel test passes unmodified.
2. Under low, medium and high, docs/01 4.1 "Acceleration" reads "Thrust per the table above", and the docs/01 3 move stick velocity formula no longer sets velocity. Speed is capped at the row's V_MAX (420, 460, 520 u/s).
3. Hold time `t` is continuous: it resets to 0 only when the stick is released. Changing direction while held does not reset it.
4. Drag acts only while the stick is released. Below 3 u/s on release the velocity snaps to 0, so every coast ends in finite time (starting value).
5. Brake assist: when `dot(dir, v) < 0` the acceleration for that step is multiplied by BRAKE, so turning around is fast. A_MAX binds on a reversal after a long hold, not on the first push from rest.
6. Walls: slide, no bounce. The into-wall component is removed and the stored velocity is the post slide velocity. Hold time is not reset by a wall hit.
7. Slow channel: while `w.time < ship.slowUntil` the speed cap is V_MAX x `ship.slowFactor` (Off: the stick velocity is multiplied by `slowFactor`). The Off path changes only by guarded added lines that do nothing while `slowUntil` is in the past. `respawnShip` resets `slowUntil` to 0 and `slowFactor` to 1.
8. Gravity wells keep their separate pull channel and do not transfer momentum. Bullets still add the ship velocity along the aim, clamped to 1600. Nose direction is unchanged: aim while aiming, else stick direction.
9. `dir` is not normalised above magnitude 1, so a half deflected stick gives half thrust. The V_MAX cap does not scale with deflection.
10. Respawn zeroes velocity and hold time. Changing the setting mid level takes effect on the next step with the current velocity and hold time.
11. Pure, no allocation per step, no PRNG. The same input stream gives the same path. Thrust integration is first order at the fixed 120 Hz step, so 60 Hz and 120 Hz agree to a tolerance, not exactly. The drag term is exact for any dt.
12. The setting is reachable from the menu and the pause screen.
13. Risk: drift makes fine positioning harder on the 21:9 cover screen, and High's coast is long. Only the GA device paste can judge it.

## Settings keys and bus additions

Settings keys (docs/10 Appendix B). Every read and write is in try/catch with a default, an invalid value falls back to the default, and every key keeps the `sow.` prefix (the `glowPath` pattern):

| Key | Values | Default | Control |
|---|---|---|---|
| `sow.settings.spacePhysics` | `off`, `low`, `medium`, `high` | `off` | "Space physics" row, four buttons |
| `sow.settings.weaponPickups` | `0`, `1` | `1` (default, Q7) | "Weapon pickups" On and Off toggle |
| `sow.settings.effects` | `low`, `standard`, `high` | `standard` (default, Q12) | "Effects" row, three buttons |
| `sow.settings.music` | integer 0 to 100 | 50 | "Music" slider, 0 is off |

These rows extend the docs/01 10 Settings screen and its persistence list. Buttons have a 44 CSS px minimum hit height. Reset progress does not reset settings.

Bus events added to `src/core/events.ts`: `sim:enemyEnter`, `sim:enemyExit`, `sim:threat` (Swarm, wave C), `fx:pickup`, `hud:weapon` (Swarm, wave B). `WeaponKind` is `'spread' | 'rapid' | 'pierce' | 'orbit'`. New `Kind` values are appended: `WeaponPickup, Charger, Bulwark, Blink, Swirl, Sower, Mine, Splime, Slime`. New `EnemyKind` names: `charger`, `bulwark`, `blink`, `swirl`, `sower`, `splime`. Slime and Mine are hazard Kinds with no `EnemyKind`. New palette keys include `splime` and `slime`. Payloads are in docs/10 Appendix B.

## Engineering rules that stay

Every v1 engineering rule stays. In particular:

1. The Off invariant: with space physics off, weapon pickups off and `enableV2Enemies` false, the simulation is bit identical to v1.0.0 for the same inputs. The Low effects tier and music volume 0 reproduce the v1 look and silence.
2. TypeScript strict, no `any`, no `ts-ignore`; small pure functions; vitest for every pure module.
3. PixiJS v8 only, with docs/pixi8-cheatsheet.md read first. The DoD v7 grep prints nothing.
4. `Math.random()` only in `src/core/rng.ts`. New simulation randomness uses `w.simRng` or `hash01`. Simulation and render never call a PRNG. Generator output is JSON serialisable.
5. Touch only. No keyboard, mouse or gamepad handlers.
6. No audio files, images or fonts beyond the PWA icons.
7. No new dependency. This plan requests none.
8. Only Fable edits package.json, CLAUDE.md, SPEC.md, docs/STATUS.md and docs/DECISIONS.md.
9. Conventional commits; no em or en dashes; sentence case headings.
10. Shared gate checks Fable runs at every merge are listed in docs/10 "Shared rules for every wave", item 7.

## Answers and open defaults

Ryan answered on 2026-10-28. The question numbers are docs/10's; his reply numbers its seven items differently (docs/10 "Questions for Ryan" gives the map).

| Q | Answer | Section |
|---|---|---|
| Q3 | Thrust model with brake assist, three row table | Space physics |
| Q4 | Walls slide, no bounce | Space physics |
| Q6 | Pickups from kills, lost on death, 20 s | SPEC 3.5 |
| Q8 | Enemies as drafted plus a sixth, Splime, with the Slime hazard. Cut order: Sower and Mine first, Splime and Slime second | SPEC 3.4, cut order |
| Q10 | Screenshots go under docs/ref/ (Ryan adds them), docs only. Priority: grid deformation, trails, particles | SPEC 3.8 |
| Q11 | Music as drafted: A minor, 120 BPM, play only, default volume 50 | SPEC 3.9, settings keys |

Still on defaults, not answered in Ryan's reply. Each is marked "(default, Q<n>)" above. Fable changes the line after Ryan answers.

| Q | Default used | Section |
|---|---|---|
| Q5 | One score table, physics level shown on the results line | SPEC 3.6 |
| Q7 | Weapon pickups on by default | settings keys |
| Q9 | `enableV2Enemies` on, bands 2 and up change | SPEC 3.4 |
| Q12 | 60 fps floor strict for Standard, High opt in only if it holds 60 | SPEC 5, SPEC 3.8, settings keys |
| Q14 | Chorus as a tenth roster nickname | SPEC 7.3 |
| Q15 | Curved surfaces stay a flat hook only | SPEC 3.4, SPEC 3.7 |

Process answers with no addendum clause: Q1 (the second $200 credit is usable, so budget is not the constraint) and Q2 (Ryan can attend all five gates). Q13 (dispatcher budget cap) is unanswered and has no addendum clause.

Known gaps carried from docs/10 "Known gaps in this plan" are not permitted work in v2.
