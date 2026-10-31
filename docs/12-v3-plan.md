# Shape of War: v3 plan (bosses, weapon combining, effects)

Derived from SPEC.md, `docs/11-v2-spec-addendum.md`, `docs/10-v2-plan.md` (shape, conventions, cost table, decision points, cut order), `docs/09-v2-roadmap.md` sections 1, 2 and 4 (3D and curved surfaces, parked), `docs/STATUS.md` and `docs/DECISIONS.md` (entries 27:10 and 42:45 are Ryan's v3 asks). Status: draft by Scribe for Fable review, 2026-10-29, revised the same day for Ryan's v3 answers (DECISIONS 46:00, section "Questions for Ryan"). Not canon until Fable merges it and commits the v3 SPEC addendum (docs/13, decision D1). SPEC.md wins on v1 behaviour, docs/11 on v2 behaviour, docs/13 on v3 additions.

Priority order from Ryan (DECISIONS 27:10 and 42:45, brief v3-plan):

1. Bosses. A Boss enemy class: once per specific Adventure level (this plan proposes which, deterministic from the generator) and periodic in Endless. At least 8 unique bosses, each with distinct movement, attack and counter. Tiered by colour: blue, green or yellow (weakest) up to bright red with thick glow lines (second from top), and a shimmering multicolour top boss. Each boss has a Glow visual, a Chorus boss motif and a Swarm behaviour. Ryan's answer (Q6): three of them also shoot slow telegraphed projectiles, each balanced against its other traits. Owners: Swarm, Foundry, Glow, Chorus, Ledger, and Forge for the enemy bullet pool.
2. Weapon combining and drops. Collecting a second weapon while one is active makes a combined weapon with features of both (six pairs of spread, rapid, pierce, orbit), with an upgrade sound on combining and an expiry sound. Weapon drops for the drone (Ryan calls it the familiar): a separate pickup that arms the drone for 20 s in one of four modes, homing, detach (a decoy), rapid or double (Q13). Weapon projectile and advantage tuning. Owners: Swarm, Glow, Chorus, Ledger.
3. Effects. High effects tier as the default when it holds 60 fps. Then 3D rendering and curved arena surfaces (docs/09) as a separate late wave with its own go or no go. PixiJS v8 stays. The smallest 3D step is a perspective tilt of the flat lattice, before any Three.js talk. Owner: Glow, with Ledger for the setting.

Precondition: the v2.1 fixes (section "Precondition: v2.1") are merged and gate G2.1 has passed.

## Conflicts with canon, to resolve in docs/13

SPEC.md and docs/11 say no to most of this plan. I did not edit either. Fable commits docs/13 before T0 (D1); until then every builder must refuse these briefs.

| Canon says | Where | This plan needs |
|---|---|---|
| Bosses stay cut. Enemy bullets stay cut. Everything in docs/09 not named in docs/11 is not permitted | docs/11 SPEC 3.7, docs/01 section 14 | Bosses lifted. Enemy bullets lifted for bosses only (Ryan, Q6): Spindle, Ember and Bastion fire from a capped enemy bullet pool; every other boss attacks with analytic hazards, summons and drops (sections "Design: boss projectiles" and "Design: the boss roster"). Every other source of enemy bullets stays cut. docs/09 sections 1, 2 and 4 stay parked except waves V3-G and V3-H, each behind its own go or no go |
| Enemies steer toward the ship | docs/01 section 6 and 4.4 | While a detach drone is live (a decoy), enemies within 640 u of it steer toward it instead (section "Design: drone pickups") |
| A different weapon pickup replaces the active weapon | docs/11 SPEC 3.5 rule 4 | A different pickup combines with the active weapon (section "Design: weapon combining") |
| Levels 1 to 5 and every flag-off level keep their v1 hashes | docs/11 SPEC 3.4 rule 3 | Level 5 is a boss level, so its hash changes with `enableBosses` on. Every non boss level keeps its v2.1 hash. Flag off reproduces v2.1 byte for byte |
| A music pattern is a pure function of (level seed, kind, bar) | docs/11 SPEC 3.9 rule 3 | A boss motif is a pure function of (boss id, phase, bar), so a boss sounds the same on every level |
| A bomb removes every enemy | SPEC 3.5, docs/01 section 4.3 | A bomb clears adds, boss hazards and enemy bullets but does not damage or remove a boss |
| High is opt in and becomes the default only if its own numbers hold 60 | docs/11 SPEC 5 | The same rule, measured with a boss on screen (section "Performance budget") |

## Bad news first

1. Money binds this time. The first credit tranche ($192.49) expires today, 2026-10-29 (STATUS line 2), and STATUS puts spend at about $148 of it, so about $44 expires unused unless the v2.1 runs spend it. v3 runs on the second $200, which expires 2026-11-29 (DECISIONS 0:00). The per branch costs STATUS lists for v2 waves W0 to E sum to $72.10 (my arithmetic: W0 4.08, A 4.58, B 8.10, C 15.47 plus 1.31 GC fixes, D 14.10, E 24.46). docs/10 estimated $54 to $76. Wave E was planned at $7 to $10 and cost $24.46: three runs at $7.26 to $8.04 (two stopped by the $8 cap) plus a $1.13 finish run. This plan's total through v3.0.0 is $94 to $181 (section "Cost"), which is 47 to 91 percent of $200. Ryan's answers added $8 to $15: the enemy bullet pool and three shooters, and four drone modes with a decoy. V3-G now misses the pool in the high case ($201 with G) and V3-H does not fit ($244 with G and H), so both are credit gated.
2. Everything here is outside canon (table above). Without docs/13 every builder must refuse its brief.
3. Bosses are the biggest feature so far: ten bosses, each with its own movement, attack, counter, shape and motif. That is thirty deliverables plus a framework. v2's six enemies cost $15.47 across three runs. Bosses take three waves (A to C, with C in two stages) and an estimated $47 to $84, including the bullet pool and the three shooters.
4. Ryan's answer (Q6) lifts the enemy bullet cut for bosses. Every boss keeps five analytic hazards (lane, ring, sweep, tether, pull), summons of existing enemies and drops of Mines and Slime, and three of them (Spindle, Ember, Bastion) also fire slow telegraphed bullets. That is a new subsystem: a capped pool, a ship contact test, a bomb and death clear, and a render layer (section "Design: boss projectiles"). Its dodge numbers are arithmetic (about 0.30 s to clear a bullet from rest under High physics against at least 1.25 s of flight), not a device result. Only Ryan's fairness paste at G3B and G3C can say whether the bullets are fair, and cut 5 removes the shots without touching any boss.
5. Agents cannot judge boss fairness or fun. Only a device paste can. Every boss number here is a starting value, and every boss tier has its own gate.
6. A boss on screen is the new performance worst case. The GE numbers (`fps low 55/52, standard 59/59, high 60/60`, STATUS) had no boss. The High default decision must be measured with one.
7. Three of the six weapon pairs are unreachable under the v2 rules. Spread is the default weapon and never a pickup, so only rapid, pierce and orbit can be collected, which gives three pairs. The plan makes spread a droppable ingredient while a non spread weapon is active (D7). Ryan kept this default (Q11).
8. "Weapon drops for the drone" could be read three ways. Ryan chose the pickup reading and named four modes (Q13): homing, detach, rapid, double. Three modes are cheap. Detach is not: a decoy needs enemy targeting to accept a target other than the ship, and twelve files in `src/game/enemies/` read the ship position or call a ship steer helper (grep count). Detach and double therefore go last in Swarm D's order and are the first drone cuts.
9. Real curved surfaces are the largest change the project could take. Pixi is a 2D renderer, and docs/09 estimates 40 agent hours for the surface waves alone (W0 10, W1 14, W2 16) and replaces `src/render`. This plan stops at a render only tilt and puts the cylinder behind a second go or no go (D13).
10. The generator changes for boss levels. Boss levels 5, 10, 15 and so on become different levels from the ones Ryan has played, and saved bests for them were set without a boss. Progress keys survive. Non boss levels keep their hashes.
11. v2.1 is open. V-A5 (right drift), V-D5 (melody) and the button reach change are not yet verified on device. Wave A waits for G2.1 (D1).
12. The A2 to C9 shorthand in earlier paste backs was unclear to Ryan (DECISIONS 42:50). Every v3 paste back spells each field out, one per line.
13. Enemy bullets are the first thing in the game that shoots at the player, and no device has felt one. The dodge arithmetic covers only the worst physics row (High). On device the first sight is G3B (Spindle, Ember), not G3A, because Forge builds the pool in wave A and Swarm wires it in wave B. A pool defect therefore shows one gate later than a boss defect.
14. Ryan numbered his reply differently from this plan from Q4 on (DECISIONS 46:00). Questions below are mapped by content: his Q4 is Q5 here, his Q5 is Q6, his Q6 is Q13 and his Q7 is Q10. Boss names and colours (Q7 here) were not answered and keep their default. Fable confirms the mapping.

## Knowns and unknowns

| Known | Unknown |
|---|---|
| v2.0.0 is tagged at 13b7d96. On this branch `npm test` passes 128 files, 1728 tests, 1 todo, and `npm run build` passes (run 2026-10-29) | How the v2.1 runs change `src/game/ship.ts`, `src/audio/music/` and the button layout before wave A starts |
| Entity cap 512 (`ENTITY_CAP`), bullet pool 512 (`BULLET_CAP`), `Kind` is a `const enum` in a `Uint8Array` (22 values used, 0 to 21), `hp` is an `Int16Array` (`src/game/world.ts`, `bullets.ts`) | Whether ten bosses plus summons, hazards and parts stay inside 60 fps on the main screen with a lattice at Standard or High |
| Weapon state, the drop schedule and `WEAPON_DURATION` 20 live in `src/game/weapons.ts`; pickups in `pickup.ts`; `WeaponKind` is a four value union in `src/core/events.ts` | Whether four random drone modes feel like drops, and whether a lure range of 640 u pulls the right enemies to the decoy |
| Hazard entities (Mine, Slime) with a render contract on `w.a`, `w.t`, `w.rot`, `w.radius`, `w.vx`, `w.vy` are an accepted pattern (docs/10 wave C). The player bullet pool (`bullets.ts`) is the pattern for an enemy pool. `SPACE_TABLE` High starts at 500 u/s^2 (`src/core/physics.ts`) | Whether slow aimed bullets are dodgeable on the Fold. The 0.30 s from rest at High is arithmetic, not a paste |
| Effects tiers live in `src/render/effects.ts` (`EFFECTS_DEFAULT` standard) and `src/core/settings.ts` (`DEFAULT_EFFECTS`). The setting is written only when tapped (`saveEffects`), so a stored choice survives a changed default | Whether Ryan's phone holds a stored effects choice, and whether High still holds 60 with a boss on screen |
| GE paste (STATUS gate log): `fps low 55/52, standard 59/59, high 60/60, cover 59, main 59` | Whether the Low tier is truly slower than Standard (V2-03 in docs/qa/bugs.md) |
| A Mesh with line-list topology and a per frame buffer update works in 8.22.0 (cheatsheet section 15, source read) | Whether `PerspectiveMesh` is the right 3D step. It is present in the installed package (`node_modules/pixi.js/lib/scene/mesh-perspective/`), but its API is not read yet and nothing here was run on a GPU |
| `surface: 'flat'` and `src/core/surface.ts` are the only curved surface hook (docs/11 SPEC 3.4 rule 4) | Whether Ryan has credits beyond the second $200 (question 17) |
| Dispatcher: `MAX_PARALLEL` 4, `WALL_MS` 90 min per run, `MAX_BUDGET_USD` 12 since Ryan raised the cap (DECISIONS 37:00 and 42:40) | Real cost of boss runs: no precedent above $8.04 per run, and two v2 runs hit the cap |

## Precondition: v2.1

v2.1 is running (STATUS "Current position"). It is not part of this plan, but wave A cannot start until it is merged and G2.1 has passed, because three v3 areas sit on top of it.

| v2.1 run | Owner | What it changes | What v3 reads from it |
|---|---|---|---|
| Move symmetry (V-A5) | Forge | A symmetry test and a fix for moving right drifting more and reacting slower than moving left (GE paste, DECISIONS 42:50). Forge's files are `src/core/physics.ts` and `src/game/ship.ts` (docs/10 wave A) | Boss movement and every boss attack timing assume a symmetric ship. Boss fairness cannot be judged on a lopsided ship |
| Melody and harmony (V-D5) | Chorus | A melody and harmony pass: entrance and kill notes were inconsistent (GE paste, DECISIONS 42:50). Chorus owns `src/audio/` | Chorus builds boss motifs on the finished key, chord and scale rules |
| Button reach | Thumbs | The bomb and super buttons move closer to the right stick (DECISIONS 42:45 and 42:50). The button code is `src/input/buttons.ts` (SPEC 6) | The boss bar and banner in the HUD must not sit under the moved buttons |

Gate G2.1 (Ryan, after the three runs merge): the paste back that follows the v2.1 checklist, covering right versus left symmetry, the melody listen and the button reach. Pass means no fail on those three items. Then Fable tags `v2.1.0` (proposal, D1) and queues V3-W0. If G2.1 fails, the owning v2.1 builder gets one fix run and wave A waits. Open P2s that v3 does not depend on (V2-03 Low tier recheck, V2-08 addendum wording on the 59 fps average) stay open and are listed in Known gaps.

## Scope

In: the three features above (bosses include the enemy bullet pool for three shooters, drone drops include the decoy), their settings (Appendix B), their device gates, a v3 harden wave, a render only 3D tilt behind its own go or no go, and a conditional curved surface wave.

Out, parked: a Three.js migration (reconsidered only if the G3G and D13 decisions say Pixi projection cannot reach a surface Ryan wants), torus and sphere surfaces, gamepad, haptics beyond death, achievements, leaderboards, ship types, enemy bullets from anything except the three boss shooters (Ryan, Q6), any online feature. None is touched. Ideas go under "Known gaps".

## Shared rules for every wave

1. `docs/05-build-plan.md` shared rules 1 to 14 and `docs/10-v2-plan.md` "Shared rules for every wave" items 1 to 7 apply unchanged (dispatcher only, exclusive directories, Fable only edits package.json, CLAUDE.md, SPEC.md, STATUS and DECISIONS, no signature change without approval, glue under 20 lines, the `gh run watch` form, no `~` in commands, the shared gate checks).
2. The Off invariant for v3 (never cut). With `GenConfig.enableBosses` false, weapon pickups off and tilt off, the simulation is bit identical to v2.1 for the same inputs, and the generator output is byte identical to v2.1 for every seed. No enemy bullet pool exists in such a run and `targetOf` returns the ship for every entity. Every v2 invariant stays (docs/11 "Engineering rules that stay").
3. Determinism. Boss choice is a table lookup on the level index or segment index. Boss movement, attack timing and drops use `hash01` or `w.simRng`, never a new PRNG. Enemy bullets use no PRNG at all, and the drone mode choice is a salted `hash01`. Weapon combination is a pure function of the two ingredients. Boss motifs are a pure function of (boss id, phase, bar). Render and music never feed the sim.
4. Every vector between two entities in boss code goes through `steer.ts` helpers, as docs/10 required for v2 enemies. No raw `x[a] - x[b]` in `src/game/bosses/`. Why: a later surface change (V3-H) stays one edit per helper. Fable's gate check: `grep -rnE "\.x\[[a-z]+\] - |\.y\[[a-z]+\] - " src/game/bosses` is read by hand. The chase or aim target of every enemy and boss comes from `targetOf(w, id)` in `steer.ts` (stubbed to return the ship at V3-W0, given the decoy in wave D), so the decoy is one edit.
5. Numbers live in tables so tuning is a one file edit: `BOSS_TABLE` (hit points, speeds, timings), `BOSS_SHOTS` (the three shooters), `COMBO_TABLE`, `DRONE_MODE_TABLE`, `WEAPONS`, `BOSS_DAMAGE`. Fable may edit table values as glue (under 20 lines) after a paste.
6. `applyNeon(n)` stays the only writer of bloom strength, threshold, saturation, glow width and grid base brightness. Boss line weight and shimmer are multipliers on the boss layer. A new tunable that SPEC 4 assigns to the neon slider becomes a `NeonParams` field.
7. New randomness in generator output: none. The boss schedule is a table, so the generator draws nothing new and `GENERATOR_VERSION_V3` (3) marks only boss levels.
8. Debug hooks stay temporary glue, each under 20 lines, written by Fable after the merge that makes them possible: `?boss=<id>` forces a boss on the current level or, in Endless, at 10 s (after wave A); `?weapon=<id>` starts a level with any weapon or pair equipped (after wave D); `?drone=<mode>` starts a level with the drone armed in that mode (after wave D, through Swarm's `debugArmDrone(w, mode)` seam).
9. Gate pastes are spelled out, one field per line, every answer in the words shown (DECISIONS 42:50).

## Performance budget

| Budget | Value | Where enforced |
|---|---|---|
| Main screen fps, stress scene (400 entities, 2000 particles), Standard tier | 60 or better, motion setting recorded, as v2 (the accepted GD and GE average is 59) | Every gate with an fps line |
| Main screen fps with a boss alive and Standard or High tier | Lowest fps seen at least 55 during the fight, average at least 59 | G3A to G3C, G3E |
| High as the default tier | Average at least 59 and the bomb dip at least 50 in two warm runs with a boss on screen, the same bar D8 accepted for Standard | G3E (D9) |
| Extra live entities from a boss | At most 6 hazards, 8 adds, 4 parts and the boss itself, inside `ENTITY_CAP` 512 and `maxLiveEnemies`. The double drone adds one entity (`Kind.DroneTwin`) | Swarm tests |
| Enemy bullets | At most 32 live (`ENEMY_BULLET_CAP`, about 9 needed), speed at most 240 u/s, one draw call, outside `ENTITY_CAP` | Forge and Glow tests |
| Player bullets with a combined weapon | At most 130 live at Turbo (Hail is the worst case), pool 512 | Swarm tests |
| Bullet draw calls | At most 10 player calls (one per style: 4 base plus 6 combined looks; v2 used at most 4) and 1 for enemy bullets | Glow |
| Particle cap | Standard 2048, High 4096 unchanged. A boss death burst is capped by tier | Glow |
| Tilt projection (V3-G) | Starting budget 0.5 ms per frame for up to 8192 lattice nodes plus entities | Glow G0 spike |
| Per step allocation | none in boss, weapon or drone code | tests plus review |

If a tier misses its bar at its gate, that tier is not the default (D8 in docs/10, D9 here).

## Contract stubs (V3-W0)

Parallel branches cannot compile against code that does not exist (docs/05, docs/10). Scribe drafts signature stubs on `feat/scribe-v3-stubs`, Fable reviews and merges them before wave A. Types exact, bodies absent, behaviour unchanged.

| File | Stub |
|---|---|
| `src/game/world.ts` | Append to `Kind`: `Boss, BossPart, BossHazard, DronePickup, DroneTwin`, after `Slime` (existing values unchanged). There is no `Kind.EnemyBullet`: enemy bullets live in their own pool (next rows), outside `ENTITY_CAP`, the grid and every enemy rule |
| `src/game/enemyBullets.ts` (new) | `ENEMY_BULLET_CAP` (32), `ENEMY_BULLET_SPEED_MAX` (240), `ENEMY_BULLET_MIN_RANGE` (300), `EnemyBulletPool` (`alive, x, y, vx, vy, radius, life, arm, tier`, free stack, `liveCount`, `dropped`), `enemyBulletsOf(w)` returning one shared empty pool of cap 0, `spawnEnemyBullet(w, x, y, heading, speed, radius, tier, armSec)` returning -1, and empty `stepEnemyBullets(w, dt)` and `clearEnemyBullets(w)`. Glow imports the type from wave A on; Forge replaces the bodies in wave A and Swarm wires the calls in wave B |
| `src/game/steer.ts` | `targetOf(w, id)` returning 0 (the ship). Boss code calls it for every chase and aim target from wave A on; wave D gives it the decoy. Behaviour unchanged |
| `src/levelgen/leveldef.ts` | `BOSS_IDS` (`warden, brood, spindle, ember, mirage, gravitas, bastion, tempest, twins, prism`), `BossId`, `BossTier` (1 to 4), `BossSpec { id; tier; atSec; hpMul }`, optional `boss?: BossSpec` on `LevelDef` and `EndlessSegmentDef`, `GENERATOR_VERSION_V3 = 3`, `GenConfig.enableBosses` (default true, read by nothing yet), `enableBosses: false` in `V1_GEN_CONFIG`, and a new `V2_GEN_CONFIG` (v2 enemies on, bosses off) |
| `src/game/bosses/view.ts` (new) | `BossView` (`active, id, mode, phase, hp, maxHp, modeT, x, y, rot, radius`) and `readBoss(w, out)` that returns `out` with `active` false. Glow imports it from wave A on |
| `src/game/defs.ts` | `kindOf` and `defOf` cases for the five new Kinds, `defOf` returns null for them |
| `src/core/events.ts` | `BaseWeaponKind` (the four v2 values), `ComboKind` (six pair ids, Appendix B), `WeaponKind = BaseWeaponKind | ComboKind`, `DroneMode` (`homing, detach, rapid, double`) with `DRONE_MODES`, and the event keys in Appendix B (including `fx:bossShot`, `fx:droneArm`, `fx:droneExpire`) |
| `src/game/weapons.ts` | `WEAPONS` stays keyed by `BaseWeaponKind` so v2 behaviour and tests are unchanged |
| `src/render/neon.ts` | Palette keys `bossBlue, bossGreen, bossYellow, bossOrange, bossMagenta, bossViolet, bossRed, bossPrism, dronePickup` (placeholder HSL, Glow tunes them) |
| `src/render/shapeSpecs.ts`, `tests/render/shapes.test.ts` | Placeholder `SHAPE_SPECS` entries for the five new Kinds; the registry test's `LAST_KIND` moves to `Kind.DroneTwin` and its length checks follow |

The same rule as docs/10 covers any exhaustive `Record<Kind, ...>`, `Record<WeaponKind, ...>`, `Record<EnemyKind, ...>`, `GenConfig` literal in a test or switch that `tsc` flags: placeholder entry only, each file listed in the hand-off.

Invariant: `npm test` and `npm run build` green with zero snapshot changes. No roster file is added: v3 uses the ten nicknames of docs/11 and creates none (the docs/13 clause says so).

```text
Scribe: V3 contract stubs. Branch feat/scribe-v3-stubs. Worktree ../sow-wt/scribe-v3-stubs.
This brief overrides your roster: you own exactly the files in the docs/12-v3-plan.md
"Contract stubs" table, plus any file tsc flags for an exhaustive Kind, WeaponKind or
GenConfig record, literal or switch (placeholder entry only, list each in the hand-off).
Types exact, additive only, no behaviour change, no new tests beyond keeping existing ones
green. Run npm ci, npm test, npm run build. The tests/qa snapshots must not change.
Commit "glue: V3 contract stubs". End with your hand-off.
```

Job file shape for every brief below (same as docs/05; the table above each brief gives the values):

```json
{ "type": "agent", "nickname": "<n>", "slug": "<slug>", "model": "claude-opus-5-5", "branch": "feat/<n>-<slug>", "worktree": "../sow-wt/<n>-v3<w>", "brief": "<the text block>" }
```

## Clock summary

T0 is the moment Fable queues the V3-W0 job, after G2.1 passes. Hours after T0, estimates. Evidence: v2 gate to gate times in STATUS ran from 1:15 (GA to GB) to 6:50 (GD to GE, about 5 hours of it with Ryan offline, DECISIONS 37:00), against a 2:00 plan for wave E.

| Wave | Clock | Setup | Build | Merge | Gate | Agents |
|---|---|---|---|---|---|---|
| V3-W0 stubs and addendum | 0:00 to 0:40 | 0:05 | 0:05 to 0:25 | 0:25 to 0:40 | none | Scribe |
| V3-A boss core, tier 1, enemy bullet pool | 0:40 to 4:00 | 0:10 | 0:50 to 2:30 | 2:30 to 2:55 | 2:55 to 4:00 | Swarm, Foundry, Glow, Ledger, Forge |
| V3-B tier 2, boss music | 4:00 to 6:30 | 0:10 | 4:10 to 5:15 | 5:15 to 5:40 | 5:40 to 6:30 | Swarm, Glow, Chorus |
| V3-C tiers 3 and 4 | 6:30 to 10:00 | 0:10 | C1 6:40 to 7:45, C2 8:05 to 9:00 | C1 7:45 to 8:05, C2 9:00 to 9:15 | 9:15 to 10:00 | Swarm, Glow, Chorus, twice |
| V3-D weapon combining, drone drops | 10:00 to 13:00 | 0:10 | 10:10 to 11:30 | 11:30 to 11:55 | 11:55 to 13:00 | Swarm, Glow, Chorus, Ledger |
| V3-E weapon tuning, High default | 13:00 to 15:00 | 0:10 | 13:10 to 14:00 | 14:00 to 14:15 | 14:15 to 15:00 | Swarm, Glow |
| V3-F harden, tag v3.0.0 | 15:00 to 17:30 | 0:10 | 15:10 to 16:20 | 16:20 to 16:50 | 16:50 to 17:30 | Proctor, fixers, Scribe |
| V3-G tilt (D12) | 17:30 to 21:00 | 0:15 | 17:45 to 19:45 (spike, read, build) | 19:45 to 20:05 | 20:05 to 21:00 | Glow, Ledger |
| V3-H cylinder (D13) | D13 to D13 plus 5:00 | 0:15 | plus 0:15 to plus 3:30 | plus 3:30 to plus 4:00 | plus 4:00 to plus 5:00 | Forge, Swarm, Foundry, Glow, Thumbs |

Waves are serial because they share `src/game/`, `src/render/` and `src/audio/`. Lanes on disjoint directories ride along (Chorus in wave B, Ledger in A and D). Wave C runs in two stages so the heaviest boss (Prism, which reuses the other nine) starts only after the three reds are merged. Max 4 parallel runs (dispatcher default). Wave A now has five runs: Forge (a small pure module) and Ledger (Sonnet) are the shortest, so the fifth queues behind whichever of the four finishes first. The clock does not move for Ryan's answers. The boss shots sit last in Swarm's briefs of waves B and C and the detach and double modes last in wave D, so a window that runs out cuts them first (cuts 3 to 5).

Budget check at every gate (D10): Fable compares spend to date with what remains of the second $200 (expires 2026-11-29). A cut or a credit gate is taken only if a trigger in the cut order fires or the pool cannot cover the next wave's high estimate.

## Decision points

| ID | Clock | Decision | Default | Decided by |
|---|---|---|---|---|
| D1 | before T0 | docs/13 addendum committed, this plan approved, G2.1 passed, `v2.1.0` tagged | Scribe drafts, Fable commits, Ryan approves | Fable, Ryan |
| D2 | before T0 | Which levels have a boss and the Endless cadence | Decided (Q1 to Q3): every 5th level, 5 to 50, the top boss at 50. Endless first at 3:00 of wave clock, then every 3 minutes | Ryan, answered |
| D3 | before T0 | Boss attacks: projectiles or not | Decided (Q6): bosses may shoot, not all of them. Three shoot (Spindle, Ember, Bastion) from an enemy bullet pool. Every boss keeps hazards, summons and drops | Ryan, answered |
| D4 | before T0 | What a boss level does to the objective, score and stars | Decided (Q5): the objective holds at success until the boss dies. The kill is a flat bonus of 25 percent of par, no multiplier. Stars from the final score at the unchanged par | Ryan, answered |
| D5 | G3A | Boss framework numbers from the paste: hit points, fight length, the damage table, the bomb rule | Accept, or one Swarm fix run changing `BOSS_TABLE` and `BOSS_DAMAGE` only | Ryan |
| D6 | G3B, G3C | Keep or cut bosses on fairness, in cut order | Keep unless a fairness 1 or 2. Below 8 bosses is below the floor, so Ryan decides | Ryan |
| D7 | D setup | Spread as a droppable ingredient, the six pairs, rolling replacement of the older ingredient, 20 s, and the names | Decided: names kept (Q10), rules as designed (Q11 and Q12, defaults confirmed) | Ryan, answered |
| D8 | D setup, G3D | Reading of "weapon drops for the drone" | Decided (Q13): a separate pickup that arms the drone for 20 s in one of four modes. Open at G3D: keep or cut detach and double (cut 3) if the decoy or the second body is confusing, or the whole pickup (cut 4) | Ryan, answered; G3D open |
| D9 | G3E | High effects tier as the default | Flip only if the bar in "Performance budget" holds with a boss on screen | Fable, Ryan |
| D10 | every gate | Budget check against the pool | No budget cut unless the pool cannot cover the next wave's high estimate | Fable |
| D11 | G3F | Tag v3.0.0 | On a pass, or `v3.0.0-rc1` from the last green gate (as docs/10 GE) | Fable, Ryan |
| D12 | after v3.0.0 | Go or no go for V3-G, the render only tilt | No go if under $40 of credit remains or Ryan is unavailable. Otherwise go | Ryan |
| D13 | after G3G | Go or no go for V3-H, the cylinder, or stop at the tilt | No go unless the tilt paste rates 4 or better and the pool covers the high estimate | Ryan |
| D14 | G3B, G3C | Keep or cut the boss projectiles, in cut order (cut 5, before any boss is cut) | Keep unless a shooter scores fairness 1 or 2 after one Swarm fix run, or the pool or its render misses the fps bar after one fix run. "Up to 3 shooters" is a ceiling, so cutting all three leaves the roster complete | Ryan |

## Cut order

Cut from the top. At most one cut per checkpoint unless a trigger fires twice. Executing a cut follows docs/05: remove it from the remaining briefs, disable it with glue (weight 0, entry removed, table row removed), log it in STATUS "Cuts taken" and DECISIONS, tell Ryan in one line.

| Cut # | Item | Decision clock | Trigger |
|---|---|---|---|
| 1 | Boss motifs for tiers 3 and 4 (keep the shared boss bed and the entry, phase and defeat stingers) | 6:30 or 9:15 | The Chorus B hand-off reports scheduler glitches, or music glitches at G3B persist after one Chorus fix run |
| 2 | Weapon effects tuning in Glow E (keep the combined weapon tints and the High default check) | 13:10 | Glow D runs out of window, or fps is under the bar at G3D |
| 3 | Drone detach and double modes, the first drone cuts (last item in Swarm D's task order; homing and rapid stay) | 11:30 or 11:55 | The decoy retarget moves a v2 golden or breaks the flags off identity and one Swarm fix run does not restore it, or G3D calls the decoy or the second body confusing, or the Swarm D window runs out before them |
| 4 | Drone pickups entirely (the item before the last in Swarm D's task order) | 11:30 or 11:55 | The Swarm D window runs out before it, or G3D says the drone drops are wrong or confusing and Ryan agrees |
| 5 | Boss projectiles, all three shooters (empty the `BOSS_SHOTS` rows; every boss keeps its other attacks; the pool and render path stay unused). Cut before any boss is cut | 5:15, 6:30, 7:45 or 9:15 | A shooter scores fairness 1 or 2 at G3B or G3C after one Swarm fix run, or the pool or its render misses the fps bar after one Glow fix run, or a pool defect survives one Forge fix run |
| 6 | High as the default (stays opt in) | 15:00 | Average under 59 or the bomb dip under 50 with a boss on screen |
| 7 | Prism phases from four to two (keep the shimmer and the white damage window) | 8:05 | The Swarm C2 window runs out |
| 8 | Twins and Tempest (roster of 8, the floor) | 7:45 or 9:15 | Fairness paste "unfair", or the Swarm C1 window runs out |
| 9 | Whirl and Eclipse (rapid and orbit, pierce and orbit), the pairs with the most live bullets or blades (four of six remain, the floor) | 11:55 | A combo is unreadable at G3D or the bullet pool is under pressure |

Cuts 3 and 4 are the drone cuts, double and detach first, because they are the only modes that add an entity or touch shared chase code; homing is a flag on a shot and rapid is a rate. Cut 5 comes before the boss roster cuts (7 and 8) because Ryan said bosses may shoot, not must, and a shot is smaller than a boss. A shooter's trade values (slower Spindle arms, longer Ember rest) sit in its `BOSS_SHOTS` row and revert with it.

Never cut: the Off invariant (shared rule 2), touch controls, generator determinism with flags off, the neon slider, PWA install, the upgrade and expiry sounds (Ryan asked for both and each is a few lines). Floors: at least 8 bosses covering all four tiers (the minimum roster is tier 1 three, tier 2 three, tier 3 one, tier 4 one), and at least 4 of the 6 combined weapons. There is no floor on projectiles or drone modes: Ryan's wording is "may". Below a floor the feature is reported incomplete to Ryan; Fable does not ship a partial feature silently. Cut 8 takes the roster to the floor, so a second cut in the roster needs Ryan's reply.

V3-G and V3-H are not cuts. Each is a separate go or no go (D12, D13), so declining them leaves v3.0.0 complete.

## Cost

Assumptions: Opus run $3 to $8 (brief), Sonnet run $1 to $3, per run cap $12 (`MAX_BUDGET_USD`). v2 per run costs in STATUS ran from $0.17 to $8.04, and two runs hit the old $8 cap. The reserve covers reruns, stale runs and fixers, and is larger than docs/10's because wave E overran its estimate by $14 to $17.

| Wave | Runs | Low | High |
|---|---|---|---|
| V3-W0 | Scribe: docs/13 draft and stubs (Sonnet, two runs) | $2 | $4 |
| V3-A | Forge, Swarm, Foundry, Glow (Opus); Ledger (Sonnet). Includes Forge's bullet pool and Glow's bullet render | $19 | $29 |
| V3-B | Swarm, Glow, Chorus (Opus). Includes the pool wiring, two shooters and the shot cue | $12 | $23 |
| V3-C | C1: Swarm, Glow, Chorus; C2: Swarm, Glow, Chorus (Opus). Includes Bastion's turret shot | $16 | $32 |
| V3-D | Swarm, Glow, Chorus (Opus); Ledger (Sonnet). Includes four drone modes, the decoy and the twin | $15 | $27 |
| V3-E | Swarm, Glow (Opus) | $5 | $10 |
| V3-F | Proctor (Sonnet); two fixers (Opus); Scribe (Sonnet) | $10 | $26 |
| Reserve | five reruns or fixes (Opus) | $15 | $30 |
| Total to v3.0.0 | | $94 | $181 |
| V3-G tilt | Glow spike and build (Opus); Ledger (Sonnet); one fixer | $11 | $20 |
| V3-H cylinder | Forge, Swarm, Foundry, Glow (Opus); Thumbs (Sonnet); fixers | $24 | $43 |
| Total with G and H | | $129 | $244 |

What Ryan's answers added, low to high: boss projectiles $5 to $9 (A $3 to $5: Forge's pool $2 to $3 and Glow's render path $1 to $2; B $1 to $2; C $1 to $2) and the drone modes $3 to $6 in D (Swarm $2 to $4 for the modes and the decoy retarget across `steer.ts` and `enemies/`, Glow $1 to $1.5, Chorus up to $0.5). That is $8 to $15 on top of the earlier $86 to $166. Cutting the shots (cut 5) saves back the B and C parts and leaves the pool unused; cutting detach and double (cut 3) saves about $2 to $4.

The pool is the second $200 less whatever v2.1 spends from it. Through v3.0.0 the plan uses 47 to 91 percent of $200. With G it uses 53 to 101 percent, so G misses the pool in the high case (D12 reads the remaining credit). With H the high case ($244) is over the pool, which is why H is credit gated (D13). Fable runs on Max, not on credits. Nothing here justifies adding scope to spend credits.

## Merge job template

Same shape as docs/05, queued one at a time (docs/05 shared rule 12). Each wave below lists only the order and the glue.

```json
{ "type": "shell", "nickname": "fable", "slug": "merge-v3a-foundry", "cwd": ".", "cmd": "git checkout main && git merge --no-ff feat/foundry-boss-schedule && npm test && npm run build" }
```

After the last merge of a wave: glue commit job, then `git push origin main && sleep 15 && gh run watch $(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status`, Fable reads the deploy result before giving Ryan a build id (DECISIONS 32:30), then `git tag v3-ga` (or gb to gf, gg, gh) and push the tag, then the session split from docs/05 "Session hygiene" with Scribe drafting the STATUS update on `feat/scribe-v3<w>-handoff`.

## Test directory ownership

| Test dir | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| tests/core/ | none | none | none | none | none | fixer |
| tests/game/ | Swarm, and Forge for `enemyBullets.test.ts` and `enemyBulletsSim.test.ts` only | Swarm | Swarm | Swarm | Swarm | fixer |
| tests/scoring/ | Swarm | none | none | none | none | fixer |
| tests/settings/ | none | none | none | none | none | fixer |
| tests/ui/ | Ledger | none | none | Ledger | none | fixer |
| tests/levelgen/ | Foundry | none | none | none | none | fixer |
| tests/render/ | Glow | Glow | Glow | Glow | Glow | fixer |
| tests/audio/ | none | Chorus | Chorus | Chorus | none | fixer |
| tests/qa/ | Foundry (levelSnapshots and the flag sweeps only) | none | none | none | none | Proctor |

---

## Wave V3-A: boss core and tier 1 (T+0:40 to 4:00)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Worktree |
|---|---|---|---|---|
| Swarm | opus | feat/swarm-boss-core | `src/game/` (new `src/game/bosses/`) including `scoring.ts`, `endless.ts`, `objective.ts`, except Forge's three files below; `tests/game/`, `tests/scoring/` | ../sow-wt/swarm-v3a |
| Foundry | opus | feat/foundry-boss-schedule | `src/levelgen/` (new `boss.ts`); `tests/levelgen/`; for this wave only `tests/qa/levelSnapshots.test.ts`, the flag sweep tests under `tests/qa/` and `tests/qa/__snapshots__/levels/` | ../sow-wt/foundry-v3a |
| Glow | opus | feat/glow-boss-fx | `src/render/`, `tests/render/` | ../sow-wt/glow-v3a |
| Ledger | sonnet | feat/ledger-boss-hud | `src/ui/`, `src/main.ts`, `tests/ui/` | ../sow-wt/ledger-v3a |
| Forge | opus | feat/forge-enemy-bullets | exactly `src/game/enemyBullets.ts`, `tests/game/enemyBullets.test.ts`, `tests/game/enemyBulletsSim.test.ts` (a file level carve out of Swarm's `src/game/` for this wave, as Foundry's test files are) | ../sow-wt/forge-v3a |

Not touched in A: `src/audio/` (Chorus starts in B), `src/input/`, `src/core/` (the stubs already carry the events). Swarm owns `scoring.ts`, `endless.ts` and `objective.ts` because the boss bonus, the Endless hook and the hold rule all sit there. Foundry owns the pin and sweep tests because the default `GenConfig` gains `enableBosses` on, which would change the pinned sweeps.

Forge's lane exists because Ryan's Q6 answer adds an enemy bullet pool, and Forge is the roster's owner of physics, ship, bullets and collision. The module is self contained: pool, step, ship contact and clear are all inside `enemyBullets.ts`, and Swarm wires the three call sites (`stepGame`, `killShip`, `triggerBomb`) in wave B, when the real module is on main. Wave A therefore puts no bullet on screen. The pool and its render path are covered by tests, and the first device sight is G3B. A wave A with a serial A0 for the pool was rejected because it would move every later clock by about an hour.

### Design: the boss rules (shared by all ten)

1. Entities. A boss is one `Kind.Boss` entity. Parts that must be destroyed (Brood pods, Gravitas anchors, Bastion turrets) are `Kind.BossPart`. Lethal attack geometry (lanes, rings, sweeps, tethers) and the pull are `Kind.BossHazard` entities, so Glow draws them through the same registry as Mines and Slime. Adds are ordinary enemies (Grunt, Dart, Bulwark) spawned through the normal spawn path.
2. Hit points. `w.hp` is an `Int16Array` and stores tenths of a hit: 3600 means 360 spread hits (the largest, Prism, is 10000 of 32767). `BOSS_TABLE` holds the starting values below. `hpMul` from `BossSpec` multiplies them for Endless loops.
3. Entrance. At `boss.atSec` on the wave clock (which pauses during the respawn delay) a telegraph ring shows for 2.0 s, harmless and untargetable (docs/01 6.1 uses 0.6 s for enemies). The boss slides in from the wall point farthest from the ship. A name banner shows (Ledger). Contact with the boss body kills the ship like any enemy once the entrance ends.
4. Waves. While a boss lives the wave schedule keeps running at 0.6 of its spawn budget, so adds from the schedule thin out and the boss's own adds matter. Starting value, tuned at G3A. Par and stars are unchanged (see rule 9).
5. Fairness (tests assert these). Every lethal hazard shows a telegraph before it can kill: 1.0 s in tier 1, 0.8 s in tier 2, 0.6 s in tiers 3 and 4. A ring has a gap of at least 60 deg (tiers 1 and 2) or 45 deg (3 and 4). A lane is at most 60 u wide. A sweep leaves gaps of at least 90 deg. A lethal hazard is never created overlapping the ship (it waits 0.3 s and rechecks). At most 8 live hazards, 8 live adds, 4 parts and 32 live enemy bullets. `ENTITY_CAP` and `maxLiveEnemies` are hard caps: a spawn that returns -1 is skipped, never thrown.
6. Ship death. The v1 arena clear applies to adds, hazards and enemy bullets. The boss keeps its hit points. Boss attacks pause during the 1.5 s respawn delay and its cycle restarts at its first state. Invulnerability after respawn is honoured by every hazard.
7. Bomb and supers. A bomb clears adds, Mines, Slime, live boss hazards and every enemy bullet, staggers the boss for 1.5 s (it stops attacking, stays vulnerable) and does no damage. Detonate does 10 percent of the boss's maximum hit points if the boss is within 260 u of the drone. Homing steers shots at the boss like any enemy. Turbo doubles weapon rate as always. No super clears an enemy bullet. Starting values (Q9, default confirmed).
8. Weapons against a boss. Damage per hit is in `BOSS_DAMAGE` (tenths of a hit): spread 10, rapid 7, pierce 40, orbit blade 15 with a 0.25 s cooldown per blade (0.12 s against other enemies), drone shot 10, Ram 20. A pierce bullet stops at a boss body. At full accuracy that is about 360 (spread), 364 (rapid), 320 (pierce) and 300 (orbit, four blades plus the forward bullet) tenths of a hit per second, computed from the table and not measured, so no weapon is useless against a lone boss. Weapon tuning is wave E.
9. Objective, score and stars on a boss level (D4, Q5 answered yes). The generated objective, par and stars are untouched. The boss is an extra completion condition: when the objective's success test passes while the boss lives, the level holds (waves stop, the boss and its adds remain, the boss enrages, the timer sits at 0:00 and the HUD says "Defeat the boss") and completes the moment the boss dies with lives left. Lives at 0 loses as usual. The kill awards a flat bonus of 25 percent of par rounded to 500, not multiplied, so stars still reflect play. The boss counts as 1 kill for a destroy objective. Parts and hazards count 0. Adds score normally.
10. Enrage. A boss that is still alive 90 s after its entrance (or at once in the hold state) attacks 30 percent faster. There is no failure timer.
11. Reward. 20 geoms and a large death burst. No weapon, life or bomb (Q8, default confirmed).
12. Boss levels have no spawners and at most one gravity well. Foundry applies this as a deterministic step on boss levels only (spawners removed, wells beyond the first removed). Why: a band 3 or 4 level with two spawners and three wells plus a boss is not a fair fight.
13. Speeds. Boss speeds are not multiplied by `speedScale` (the tier sets difficulty). Adds are.
14. Projectiles. Three bosses also shoot slow telegraphed bullets from a capped pool (Ryan, Q6): Spindle, Ember and Bastion. Section "Design: boss projectiles". Every other boss attacks with hazards, summons and drops only.

### Design: the boss schedule (D2)

A table, so Ryan can read it and change one number. `BOSS_SCHEDULE` in `src/levelgen/boss.ts`:

| Adventure level | Boss | Tier | Colour |
|---|---|---|---|
| 5 | warden | 1 | blue |
| 10 | brood | 1 | green |
| 15 | spindle | 1 | yellow |
| 20 | ember | 2 | orange |
| 25 | mirage | 2 | magenta |
| 30 | gravitas | 2 | violet |
| 35 | bastion | 3 | bright red, thick glow |
| 40 | tempest | 3 | bright red, thick glow |
| 45 | twins | 3 | bright red, thick glow |
| 50 | prism | 4 | shimmering multicolour |

Rule: a level is a boss level when `levelIndex % 5 === 0` (`BOSS_EVERY` 5). Level 5 is the end of band 1, level 15 the end of band 2, level 30 the end of band 3, and 35 to 50 are band 4. Pass 1 is levels 5 to 50 with `hpMul` 1. Pass 2 covers levels 55 to 85 (seven bosses, ember to prism, `hpMul` 1.25), pass 3 repeats them at 1.5, and so on (1 plus 0.25 per completed pass). Endless: `bossForSegment(s)` returns a boss when `s` is a positive multiple of 6 (3:00, 6:00, 9:00 of wave clock). The Endless boss number `j = s / 6` walks the same list (the first is warden, the tenth is prism) with the same pass rule. While an Endless boss lives the wave clock pauses, so segments and bosses never stack. `atSec` is 20 s for Adventure and 10 s after the segment start for Endless. Everything is a pure table lookup: the generator draws nothing new.

### Design: hazard primitives

Five primitives, analytic and O(1) per hazard. Swarm builds them once in `kit.ts` with unit tests, and every boss is a composition.

| Type (`w.a`) | Geometry and fields | Lethal when | Starting numbers |
|---|---|---|---|
| 0 lane | Segment from the entity position along `w.rot`, length `w.vx`, half width `w.radius` | Ship centre within half width plus ship radius of the segment, after the telegraph | length 600 u, half width 22 u, lethal 0.3 s |
| 1 ring | Circle centred on the entity position, radius `w.radius` grows (or shrinks for a collapsing ring), gap of half angle `w.vx` centred on `w.rot` | Ship centre within 7 u of the radius and outside the gap | growth 300 u/s, band 14 u |
| 2 sweep | `w.vy` arms (1 to 3) of length `w.vx` from the entity position, first arm at `w.rot`, turning at a rate stored by the boss | Ship centre within an arm's half width | half width 12 u, arm length 380 u |
| 3 tether | Segment from the entity position to (`w.vx`, `w.vy`), the second body | Ship centre within half width | half width 10 u |
| 4 pull | Not lethal. Pulls the ship toward the entity within `w.radius` through the existing well pull channel | Never | radius 300 u, at most 100 u/s |

`w.t` is the age in seconds. Lethal only once `w.t` passes the tier telegraph. A telegraph shows a thin dim version of the same geometry.

### Design: boss projectiles (Ryan, Q6)

Ryan's answer: bosses may shoot projectiles, not all of them, and each shooter must be balanced against its other traits. This lifts the no enemy bullets cut for bosses only. docs/13 "Boss projectiles" is the clause with the rules and the tests; this section holds what the briefs need. Every number is a starting value in `src/game/enemyBullets.ts` (the pool) and `BOSS_SHOTS` in `src/game/bosses/table.ts` (the shooters).

1. Pool. `src/game/enemyBullets.ts`: a structure of arrays (`alive, x, y, vx, vy, radius, life, arm, tier`) with a free stack, kept per `World` in a WeakMap (`enemyBulletsOf(w)`), created when the first boss spawns so a boss free world never has one. Not a `Kind`, outside `ENTITY_CAP` and the grid. Cap `ENEMY_BULLET_CAP` 32 (about 9 needed), a full pool drops the new shot and counts it, a volley is at most 5 bullets.
2. Motion. Straight, one velocity for life, never homing, no well pull. Speed at most `ENEMY_BULLET_SPEED_MAX` 240 u/s (Dart is 260), radius 6 u, life 8 s, ends on the arena wall or an obstacle (the `confine` test of `bullets.ts`).
3. Telegraph. A new bullet charges for `hazardTelegraph(tier)` seconds (1.0, 0.8, 0.6), harmless, at the muzzle. Its velocity is its heading, fixed when the charge starts, aimed at `targetOf` with no lead, so the render shows the whole path as an aim line.
4. Dodge under High physics (computed). The ship's distance from rest in `t` s is `500 (e^t - 1 - t)` u (`SPACE_TABLE.high`), so clearing the ship's 10 u and the bullet's 6 u with 8 u to spare takes about 0.30 s. A boss fires only while the ship is at least `ENEMY_BULLET_MIN_RANGE` 300 u from the muzzle (else it rechecks every 0.3 s), so a bullet at 240 u/s flies at least 1.25 s before it can arrive. Fan bullets are at least 12 deg apart, which is 50 u between edges at 300 u. Tests assert all three.
5. Contact. Each launched bullet is tested against the ship circle every step. A contact calls `killShip` unless the ship is invulnerable (respawn or the stress scene flag), in which case the bullet is consumed. Charging bullets never collide. Bullets touch nothing else, and player bullets pass through them.
6. Clearing. A bomb clears every bullet, charging or flying. Ship death and level end clear them. No super does.
7. No PRNG. Same `LevelDef` and input log, same pool arrays.

| Boss | Tier, level | Pattern | Speed | Timing | Trade against its other traits |
|---|---|---|---|---|---|
| Spindle | 1, 15 | Pellet: one bullet at the target | 180 u/s | Every 3.0 s, 3.6 s in phase 2. None while an arm reversal telegraph shows | Always hittable with 180 deg arm gaps, so it has no closed window and the pellet is its only answer to a player parked in a gap. It pays with slower arms: 0.4 rad/s instead of 0.5 |
| Ember | 2, 20 | Fan: three bullets 14 deg apart, the middle one at the target | 210 u/s | Once per dash that ends in open floor, charging from the start of the rest and launching 0.8 s in | Hittable only stunned or resting. The fan guards the rest, so on that dash the rest grows from 1.2 s to 1.8 s. A wall hit still stuns it for 2 s with no fan |
| Bastion | 3, 35 | Turret shot: one bullet from a corner turret at the target | 200 u/s | One turret turn every 1.5 s as before; each turret alternates a lane and a bullet on its own turns, so the total attack rate is unchanged. A destroyed turret skips its turns | The turrets (8 HP each) are the only muzzles and the core never fires. Phase 2 has half the bullets and phase 3 none |

Why these three. One per tier from 1 to 3, spread across waves A to C (Spindle is built in A and gets its pellet in B, Ember in B, Bastion in C1). Warden stays shot free so the first boss teaches the hazard language. Prism does not shoot and does not quote the shooters (Known gaps). Twins and Tempest are not chosen so cut 8 leaves all three shooters in. Phase speed ups and enrage never raise a bullet's speed past 240 u/s.

Render path (Glow, `src/render/enemyBullets.ts`, built in wave A). It reads `enemyBulletsOf(w)` and nothing else: one pooled geometry on its own layer and one draw call, no per frame allocation, no per frame `Graphics.clear`. Look: a ring with a white core in the shooter's tier colour (`boss*` palette keys, no new key), drawn at radius 9 for a collision radius of 6, a 3 Hz pulse, and while `arm` is above 0 a thin dim aim line of 300 u with a growing core, then a launch flash. It must read apart from player bullets and pickups at a glance. Honours `neon:changed` on both glow paths and the effects tier (Low drops the pulse, keeps size and the aim line). `applyNeon` stays the only writer of glow width.

### Design: the boss roster (Ryan fills the placeholders)

Roster split. Ten bosses in four tiers, two more than Ryan's floor of eight. Tier 1 (weakest) is three bosses in the colours Ryan named, blue, green and yellow (levels 5, 10, 15). Tier 2 is three warmer colours that continue the climb, orange, magenta and violet (levels 20, 25, 30). Tier 3 is three bosses in bright red with thick glow lines, the vice top (levels 35, 40, 45), told apart by silhouette and mechanic. Tier 4 is one shimmering multicolour top boss (level 50). The two spare bosses are Twins and Tempest, so cut 8 can take the roster to eight and still cover all four tiers. Three bosses shoot (Spindle, Ember, Bastion, marked **Shoots** in the Attack column and detailed in "Design: boss projectiles"); none of them is a spare.

Working names are mine and are placeholders (Q7, default confirmed); ids are stable. Hit points are starting values in spread hits. At about 18 spread hits a second of open fire (36 bullets a second at half accuracy) they take about 20 to 22 s (tier 1), 33 to 39 s (tier 2), 50 to 56 s (tier 3) and 56 s (tier 4) of open fire, so a fight with closed windows lasts longer. Prism takes full damage only in its window and 25 percent outside it, which makes its fight about 117 s (1000 over 18 hits a second at an average multiplier of 0.475). Computed, not measured. Every cell in the Name and HP columns is Ryan's to overwrite. The Swarm behaviour of each boss is its Movement, Attack and Counter cells, written as one file per boss in `src/game/bosses/`.

| # | Tier | Colour | Level | Working name | Movement | Attack | Counter | Phases | HP (start) | Name (Ryan) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | blue | 5 | Warden | Seeks the ship at 55 u/s, turns at most 60 deg/s | Gapped ring every 4.5 s, gap 70 deg facing the ship | A shell blocks every shot except for 2 s after each ring, when the core opens. Fire only then | 2: below 50 percent a ring every 3.5 s with two gaps | 360 | ____ |
| 2 | 1 | green | 10 | Brood | Hugs the arena boundary at 50 u/s, clockwise | Every 6 s three Grunts from its flanks (8 live adds at most) | Three pods orbit at 90 u (1 HP each) and shield it. Kill the pods and the core is open for 5 s. Pods regrow after 10 s | 2: below 50 percent the adds are Darts | 400 | ____ |
| 3 | 1 | yellow | 15 | Spindle | Circles the arena centre at radius 200 u, 0.4 rad/s | Two sweep arms of 380 u turning 0.4 rad/s (0.5 before the pellet trade), reversing every 5 s. **Shoots:** a pellet at the ship every 3.0 s (3.6 s in phase 2) | Always hittable. Fly through the 180 deg gaps and shoot the core. The arm telegraph shows each reversal | 2: below 50 percent three arms | 400 | ____ |
| 4 | 2 | orange | 20 | Ember | Cycle: wind up 0.9 s (a lane is drawn), dash 0.6 s at 760 u/s, bounce off a wall up to 2 times, rest 1.2 s | The body is the weapon. It drops a Mine every 120 u along the dash. **Shoots:** after a dash that ends in open floor the rest lasts 1.8 s instead of 1.2 s and a fan of three bullets launches 0.8 s into it | Lure the dash into a wall: a wall hit stuns it for 2 s, and it is only hittable stunned or resting. Mines can be shot | 3: each phase 15 percent faster | 600 | ____ |
| 5 | 2 | magenta | 25 | Mirage | Warps every 3.0 s to a point 200 to 300 u from the ship, a ring marks it 0.5 s early | On landing, eight lanes radiate (0.8 s telegraph, 0.3 s lethal) | A 70 deg arc of its shield ring is open and spins at 1.5 rad/s. Shots count only through the arc. Stand between two lanes (22.5 deg off) and shoot as the arc passes | 3: warp every 2.5 s, then 2.0 s | 640 | ____ |
| 6 | 2 | violet | 30 | Gravitas | Seeks the ship at 45 u/s | A pull (radius 300 u, up to 100 u/s). Every 5 s a collapsing ring with a 60 deg gap | Three anchors orbit at 140 u (6 HP each). The boss cannot be hurt until all three are gone, and each lost anchor weakens the pull by a third. Back away while firing behind you (aim opposite to move) to beat the pull | 3: ring every 5 s, 4 s, 3 s | 700 | ____ |
| 7 | 3 | bright red | 35 | Bastion | Holds the centre, turns at 0.3 rad/s | One turret turn every 1.5 s across four corner turrets, and each turret alternates a lane and a slow bullet on its own turns. **Shoots:** the turret shots, nothing else. Every 12 s a Bulwark joins | Destroy the four turrets (8 HP each). The core takes damage only once two turrets are down | 3: four turrets, two turrets, none | 900 | ____ |
| 8 | 3 | bright red | 40 | Tempest | Laps the arena wall at 140 u/s, 90 u from the wall | Drops Slime every 1.0 s along its path (8 live at most). Every 6 s it breaks the lap for a lane dash across the arena, then rests 1.5 s at the far wall | Lead it along its lap (pierce works) and hit it during the 1.5 s rest. A bomb clears the trail | 3: dash every 6 s, 5 s, 4 s | 900 | ____ |
| 9 | 3 | bright red | 45 | Twins | Two bodies (500 HP each) orbit each other around the arena centre, 300 to 500 u apart, 0.6 rad/s | A lethal tether between them sweeps like a bar. Each body fires a ring every 7 s, offset by 3.5 s | Kill one and the tether breaks and the other enrages (speed x1.4, ring every 4 s). Choose which to kill first | 2: after the first body falls | 1000 | ____ |
| 10 | 4 | multicolour | 50 | Prism | Drifts between four points at 90 u/s | Quotes the others by phase: 1 ring and pods, 2 arms and a dash, 3 pull and warp lanes, 4 turrets and a tether | Its shield absorbs 75 percent of damage. Every 4 s the outline runs to white (0.5 s) and the shield drops for 1.2 s: full damage then, cued by its motif | 4: at 75, 50 and 25 percent | 1000 | ____ |

Presentation per boss. Glow draws the line weights as multipliers on the boss layer: tier 1 x1.6, tier 2 x2.0, tier 3 x3.0 with a wider outer glow stroke, tier 4 x2.4 with the shimmer. Every boss gets a second concentric rim at 0.6 alpha and a body radius of 44 to 90 u (the largest enemy is 24 u), so a boss never reads as an enemy even where hues overlap docs/01 section 11 (Grunt blue, Weaver green, Spawner yellow, the well ring red). Chorus writes each motif in A minor at 120 BPM as a pure function of (boss id, phase, bar). Tiers raise the tension: tier 1 minor pentatonic, tier 2 natural minor with a raised seventh, tier 3 a phrygian second, tier 4 a loop that quotes the earlier motifs.

| # | Glow visual | Chorus motif | Notes (Ryan) |
|---|---|---|---|
| 1 Warden | Double hexagon. Outer plates slide shut (guarded) and open to a bright core (vulnerable). Ring forms from a notch that marks the gap | Low two note heartbeat (A2, E3), one bar. A rising fifth when the core opens | ____ |
| 2 Brood | Rounded blob with three small orbiting pod circles that pulse. Pods burst into green sparks | Wobbling chromatic drone (A2 to Bb2 glide) with a short chirp at every spawn | ____ |
| 3 Spindle | Four point star with two long beam arms, thin dim lines during the telegraph | Eight note rotating arpeggio per bar that reverses direction when the arms do | ____ |
| 4 Ember | Arrowhead with a flame trail, the lane glows during the wind up, a spark trail on the dash, pulsing Mines | Four note rising wind up, one low hit on the dash, a beat of silence at rest | ____ |
| 5 Mirage | Ring with a bright moving open arc, a ghost afterimage at the old spot, a landing flash | Bright staccato with rests in a glassy timbre, up an octave at each warp | ____ |
| 6 Gravitas | Filled core with three concentric rings and three anchor nodes joined by faint lines. The lattice dimples toward it | Slow wobbling low glide, a downward sweep when a collapsing ring starts | ____ |
| 7 Bastion | Square fortress with four corner turret squares, triple thick outline, a hot core when open | Heavy march: low octave pairs on beats 1 and 3, noise snare on 2 and 4. Each lost turret removes one voice | ____ |
| 8 Tempest | Long kite with a Slime trail and speed streaks, a hot afterimage on the dash | Fast sixteenth arpeggio that rises each lap | ____ |
| 9 Twins | Two linked circles with a thick humming tether beam | Two voice canon, one voice per body, a bar apart. When one dies the other goes solo and doubles its tempo | ____ |
| 10 Prism | Large faceted gem whose outline cycles hue along its length (a full cycle every 3 s) with a chromatic offset ghost. Each phase tints toward the borrowed boss colour. The core flashes white in the damage window | Four bar loop that quotes (transposed) the motif cells of bosses 1 to 9 by phase. A rising arpeggio before each white flash cues the damage window | ____ |

Wave A builds bosses 1 to 3, the framework and all five hazard primitives, and Forge builds the enemy bullet pool. Wave B builds 4 to 6 and wires the pool, adding Spindle's pellet and Ember's fan. Wave C builds 7 to 10, with Bastion's turret shots in C1. The floor is 8 bosses covering all four tiers (cut 8 takes Twins and Tempest).

### Render contract for Glow (parallel branches agree on this table)

Glow reads `readBoss(w, out)` (stubbed at V3-W0, real from Swarm's merge) for the boss and the World arrays for everything else.

| Entity | Fields Glow reads |
|---|---|
| Boss through `readBoss` | `active`, `id` (index in `BOSS_IDS`), `mode` (0 entering, 1 guarded, 2 attacking, 3 vulnerable, 4 stunned, 5 phase change, 6 dying), `phase`, `hp`, `maxHp`, `modeT` seconds in the mode, `x`, `y`, `rot` facing, `radius` |
| `Kind.BossPart` | `w.a[id]` part type (0 pod, 1 anchor, 2 turret), `w.hp[id]`, `w.rot[id]` angle on its orbit, `w.radius[id]` |
| `Kind.BossHazard` | `w.a[id]` primitive type from the table above, `w.t[id]` age, `w.rot[id]`, `w.radius[id]`, `w.vx[id]`, `w.vy[id]` as in the table. The tier telegraph seconds come from `hazardTelegraph(tier)` exported by Swarm in `kit.ts` |
| Enemy bullets (a pool, not a `Kind`) | `enemyBulletsOf(w)` from `src/game/enemyBullets.ts`: for each live id `x, y, vx, vy, radius, tier` and `arm` (seconds of charge left; above 0 the bullet is charging, `vx, vy` are its heading and it does not move). The stub returns an empty pool, so Glow compiles from the start of wave A |
| Bus | `hud:boss`, `sim:bossEnter`, `sim:bossPhase`, `sim:bossDown`, `fx:hit` with `Kind.Boss`, `fx:bossShot` (Appendix B) |

### Brief: Swarm (boss core and tier 1)

```text
Swarm: boss core and tier 1. Branch feat/swarm-boss-core. Worktree ../sow-wt/swarm-v3a.
Read first: docs/12-v3-plan.md "Wave V3-A" (all design sections), the v3 SPEC addendum (docs/13),
docs/11 SPEC 3.4 to 3.6, docs/01 sections 4, 6 and 8, src/game/enemies/ (charger.ts, mine.ts,
slime.ts, bulwark.ts as patterns), defs.ts, spawner.ts, steer.ts, combat.ts, objective.ts,
endless.ts, state.ts, weapons.ts, tests/game/.
Own: src/game/ (new src/game/bosses/) including scoring.ts, endless.ts, objective.ts,
tests/game/, tests/scoring/. src/render is NOT yours: Glow draws from the render contract.
src/game/enemyBullets.ts and its two test files are Forge's this wave: do not edit them and do
not wire the pool (wave B does). Spindle's pellet is a wave B item too.

Task, in order (stop at the deadline, do not reorder):
1. src/game/bosses/: types.ts (BossMode), table.ts (BOSS_TABLE with hit points, speeds and
   timings from the plan; BOSS_DAMAGE), kit.ts (pure geometry for lane, ring, sweep, tether and
   pull, hazardTelegraph(tier), unit tested), state.ts (boss state in a WeakMap keyed by the
   World, as weapons.ts does), core.ts (spawn at boss.atSec, entrance, damage routing, shield
   rule, phases, enrage, death, reward, ship death, bomb and Detonate rules), view.ts (real
   readBoss, no allocation), index.ts (registry keyed by BossId, registerBehaviour for
   Kind.Boss, BossPart and BossHazard).
2. warden.ts, brood.ts, spindle.ts: one file each exporting def and step, using only kit.ts
   primitives, steer.ts helpers for every vector (no raw x[a] - x[b]), targetOf for every chase
   target, hash01 or w.simRng.
3. Combat: pierce stops at a boss body, orbit blade 0.25 s cooldown against a boss, drone
   shots and Ram use BOSS_DAMAGE, parts count 0 kills, hazards never collide with bullets.
4. objective.ts: ObjectiveInput gains bossPending; evaluateObjective holds (returns running)
   when the success test passes while a boss lives. The hold enrages the boss and stops the
   wave schedule. scoring.ts: flat bonus of 25 percent of par rounded to 500, added to the
   score directly and never multiplied; the boss is 1 kill for destroy.
5. Wave schedule runs at 0.6 budget while a boss lives. endless.ts: a segment carrying boss
   spawns it 10 s in and pauses the wave clock until it dies.
6. Bus: emit sim:bossEnter, sim:bossPhase, sim:bossDown, hud:boss (at most every 100 ms and on
   change) and fx:hit with Kind.Boss. Payloads are in the plan Appendix B and reused objects.

Definition of done: npm test and npm run build pass, no any, no new dependency, no per step
allocation, every existing test unmodified and green, flags-off simulation bit identical.
Tests to add: kit geometry per primitive (inside, outside, edge, gap); telegraph minimums per
tier; fairness rules 5 and 6 (no lethal hazard on the ship, caps respected, ENTITY_CAP returns
-1 safely); one test file per boss (warden opens only after a ring, brood is immune until its
pods die and its core closes again, spindle arms reverse and leave 180 deg gaps); damage table;
bomb staggers and clears hazards and adds but deals no damage; Detonate takes 10 percent;
objective hold (survive, scoreInTime and destroy each hold, then win on boss death, lose on
lives 0); flat bonus value; destroy counts the boss once; Endless pause and resume; determinism
(same LevelDef and input log give an identical boss and hazard log over 60 s); boss speeds
ignore speedScale.
End with the hand-off block.
```

### Brief: Foundry (boss schedule and the flag)

```text
Foundry: boss schedule. Branch feat/foundry-boss-schedule. Worktree ../sow-wt/foundry-v3a.
Read first: docs/12-v3-plan.md "Wave V3-A" (schedule and rules 12 and 13), docs/02, src/levelgen/
leveldef.ts, generator.ts, v2enemies.ts, validate.ts, tests/levelgen/, tests/qa/.
Own: src/levelgen/, tests/levelgen/, and for this wave only tests/qa/levelSnapshots.test.ts,
the flag sweep tests under tests/qa/ and tests/qa/__snapshots__/levels/.

Task:
1. src/levelgen/boss.ts (new, pure, no PRNG): BOSS_EVERY 5, BOSS_SCHEDULE (the plan table),
   bossForLevel(levelIndex) returning BossSpec or null, bossForSegment(segment) (multiples of 6),
   the loop rule beyond level 50 (repeat from tier 2, hpMul 1 + 0.25 per full loop), atSec 20
   for levels and 10 for segments.
2. generateLevel and generateEndlessSegment emit the optional boss field when
   GenConfig.enableBosses is true. The field is absent on every other level, so non boss levels
   keep their v2.1 hash. Boss levels carry generatorVersion 3 (GENERATOR_VERSION_V3). On a boss
   level apply rule 12 as a deterministic post step: no spawners, wells beyond the first removed.
3. Flag off: output equals v2.1 byte for byte for every seed. DEFAULT_GEN_CONFIG has
   enableBosses true. Pin the existing sweeps and the five original pins plus the four v2 pins
   to V2_GEN_CONFIG (bosses off) so their hashes and snapshot files do not change.
4. validateLevel accepts the field and adds invariants: B1 boss present exactly when
   bossForLevel says so, B2 id in BOSS_IDS and tier matches, B3 atSec is 20 and a survive or
   scoreInTime level has at least 20 s left after it, J7 flag off output has no boss field.
   Keep surface 'flat'.
5. In the hand-off list, for run seed 42, every boss level index to 50 with its boss id and
   the band, and the objective kind of levels 5, 10 and 15 (Ryan uses them at G3A).
6. Add flag on pins as new files for levels 5, 10 and 50 (seed 42) and one Endless segment 6.

Definition of done: npm test and npm run build pass, no any, no new dependency, pure (no Date,
no Math.random, no DOM).
Tests to add: flag off equals v2.1 over 1000 seeds (hash compare); flag on equals flag off for
every non boss level over 1000 seeds; boss levels differ only by the boss field, version and the
hazard step; schedule table (ten levels, ten ids, tiers 1 1 1 2 2 2 3 3 3 4); loop beyond 50;
bossForSegment multiples of 6 only; validator B1 to B3 and J7 with a bad case each; hazards on
boss levels (0 spawners, 1 well at most); JSON round trip; Math.random stubbed to throw still
generates; surface stays flat; perf budget of the generator test unchanged.
End with the hand-off block.
```

### Brief: Glow (boss and hazard visuals)

```text
Glow: boss and hazard visuals. Branch feat/glow-boss-fx. Worktree ../sow-wt/glow-v3a.
Read first: docs/pixi8-cheatsheet.md (mandatory), docs/12-v3-plan.md "Wave V3-A" (render contract,
roster table, presentation, "Design: boss projectiles") and "Performance budget", src/render/shapes.ts,
shapeSpecs.ts, neon.ts, fx.ts, enemyFx.ts, mapFx.ts, renderer.ts, bulletStyles.ts,
src/game/bosses/view.ts (stub), src/game/enemyBullets.ts (stub).
Own: src/render/, tests/render/. Everything else is read only.

Task:
1. Tune the palette keys bossBlue, bossGreen, bossYellow against docs/01 section 11 so a boss
   never reads as an enemy (second rim, size). Tier line weight multipliers (1.6, 2.0, 3.0, 2.4)
   are constants on the boss layer; applyNeon stays the only writer of glow width.
2. Shapes for Warden, Brood and Spindle with every state of the render contract (shell closed
   and open, pods, arms) and a pure helper per state mapping (mode, modeT) to openness or
   alpha. Boss parts and the entrance telegraph ring.
3. All five hazard primitives as Kind.BossHazard shapes: lane, ring with its gap notch, sweep
   arms, tether, pull. Telegraph is the thin dim form, then bright at lethal. Pooled geometry,
   no per frame allocation, no per frame Graphics.clear.
4. fx: boss hit flash on fx:hit with Kind.Boss (throttled), phase change flash on sim:bossPhase,
   a large death burst on sim:bossDown capped by tier, shake 14 px for 0.6 s on boss death, a
   lattice shock on boss death. All honour 'neon:changed' on both glow paths and the effects
   tier (Low turns trails and map effects off, as v2).
5. Never write bloom strength, threshold, saturation, glow width or grid base alpha outside
   applyNeon.
6. src/render/enemyBullets.ts (new): draw enemyBulletsOf(w) per the plan "Design: boss
   projectiles" render path: one pooled geometry on its own layer and one draw call, no per
   frame allocation, no per frame Graphics.clear. A ring with a white core in the tier colour
   (boss palette keys, no new key), drawn at radius 9 for a collision radius of 6, a 3 Hz
   pulse, and while arm is above 0 a thin dim aim line of 300 u along the heading with a
   growing core, then a launch flash. Distinct from player bullets and pickups at a glance.
   Honour neon:changed on both glow paths and the effects tier (Low: no pulse). Pure helpers
   for aim line alpha, charge radius and pulse. Nothing fires them in wave A, so test with a
   hand filled pool and report a desktop Chrome proxy with the pool full (32).

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency.
Report desktop Chrome stress(400, 2000) with a boss as a proxy only.
Tests to add: shapes registry covers every Kind including the five new ones; mode to openness,
hazard age to telegraph alpha and ring gap to arc as pure functions; tier weight table; death
burst cap per tier; neon tests still assert the SPEC 4 endpoints; enemy bullets: draw call
count is 1 at a full pool of 32, aim line alpha and charge radius as functions of arm, pulse
off at Low, a charging bullet draws the aim line and a flying one does not.
End with the hand-off block.
```

### Brief: Ledger (boss HUD)

```text
Ledger: boss HUD. Branch feat/ledger-boss-hud. Worktree ../sow-wt/ledger-v3a.
Read first: docs/12-v3-plan.md "Wave V3-A" (rule 9 and Appendix B), src/ui/hud.ts, hudFrame.ts,
intro.ts, results.ts, endless.ts, src/main.ts, docs/01 section 9, and the v2.1 button layout.
Own: src/ui/, src/main.ts, tests/ui/.

Task:
1. hud.ts: a boss bar fed by 'hud:boss' ({ id, hp, maxHp, phase, phases, mode }): name, a thick
   hit point bar in the tier colour and phase pips, inside the existing top band under the
   objective bar, no new pointer target, hidden when no boss, updated at most every 100 ms. It
   must not overlap the moved bomb and super buttons.
2. BOSS_NAMES (working names from the plan, a const Ryan edits) and BOSS_TIER colours for the
   bar. The intro card shows "Boss: <name>" on a boss level.
3. Hold state: while the objective holds for the boss the objective label reads "Defeat the
   boss". Endless: the wave label reads "Boss" while one lives.
4. results.ts: a "Boss defeated, bonus N" line on a win with a boss.
5. Fable glue wires nothing else; no settings are added in this wave.

Definition of done: npm test and npm run build pass, no any, no new dependency.
Tests to add: tests/ui/hud.test.ts additions (bar shows and hides, hit points at 0, half and
full, phase pips, no overlap with the buttons on cover and main), intro card line, hold label,
results line, Endless label.
End with the hand-off block.
```

### Brief: Forge (enemy bullet pool)

```text
Forge: enemy bullet pool. Branch feat/forge-enemy-bullets. Worktree ../sow-wt/forge-v3a.
Read first: docs/12-v3-plan.md "Wave V3-A" ("Design: boss projectiles") and Appendix B, the v3 SPEC
addendum (docs/13, "Boss projectiles"), src/game/bullets.ts (the player pool is the pattern),
player.ts (killShip), state.ts (gs), arena.ts (confine), src/core/physics.ts (SPACE_TABLE),
src/game/enemyBullets.ts (the V3-W0 stub), tests/game/.
Own exactly: src/game/enemyBullets.ts, tests/game/enemyBullets.test.ts,
tests/game/enemyBulletsSim.test.ts. Everything else is read only, including game.ts and
player.ts: Swarm wires the three call sites in wave B.

Task, in order (stop at the deadline, do not reorder):
1. Replace the stub bodies: the pool (structure of arrays, free stack, a WeakMap keyed by the
   World, cap 32, created on first spawn so a world that never spawns one has none),
   spawnEnemyBullet (charging for armSec at the muzzle with its heading stored, then launching;
   speed clamped to 240; a full pool drops the shot and counts it; returns the id or -1),
   stepEnemyBullets (charge countdown, straight motion, life, end on the arena wall or an
   obstacle with the same confine test as bullets.ts), clearEnemyBullets.
2. Ship contact inside stepEnemyBullets: a launched bullet inside the ship circle calls
   killShip unless w.ship.invuln > 0 or gs(w).invulnerable, in which case the bullet is
   consumed. A charging bullet never collides. Bullets touch nothing else.
3. Pure helper dodgeSeconds(row, clearance): the time from rest for the ship to cover
   clearance, from a SPACE_TABLE row (distance after t s is aMin tau^2 (e^(t/tau) - 1 - t/tau),
   aMax not reached). Export it for the tests and for Swarm's fairness tests.

Definition of done: npm test and npm run build pass, no any, no new dependency, no per step
allocation, no Math.random and no mulberry32, every existing test unmodified and green.
Tests to add: tests/game/enemyBullets.test.ts: cap 32 and the dropped counter, never throws
when full; a charging bullet does not move or collide and launches along its heading at the
right speed; the speed clamp; velocity constant over life (never homing); life, wall and
obstacle ends; clear empties the pool; a fresh World has an empty pool and two Worlds do not
share one; dodgeSeconds at SPACE_TABLE.high for 24 u is at most 0.35 s and Low and Medium are
faster; ENEMY_BULLET_MIN_RANGE over ENEMY_BULLET_SPEED_MAX is at least 1.25 s.
tests/game/enemyBulletsSim.test.ts: contact kills the ship (lives minus 1); an invulnerable
ship (respawn invuln and the stress flag) is not killed and the bullet is consumed; a bullet
touches no enemy, part, hazard, drone, twin or geom placed on its path; the same spawn script
gives identical pool arrays over 20 s (two runs compared); Math.random stubbed to throw still
runs.
End with the hand-off block.
```

### Merge order and why

1. `feat/foundry-boss-schedule`: pure and flag guarded, the sweeps stay green.
2. `feat/forge-enemy-bullets`: a self contained module nothing calls yet, covered by its own tests.
3. `feat/swarm-boss-core`: the sim, covered by its own tests.
4. `feat/glow-boss-fx`: render only, last of the sim and render pair so a revert is clean.
5. `feat/ledger-boss-hud`, then glue (about 10 lines): the temporary `?boss=<id>` hook (shared rule 8) and anything the registries need.

### Gate G3A (2:55 to 4:00)

Fable verifies: the shared gate checks; flag off goldens unchanged (existing files under `tests/qa/__snapshots__` untouched, the nine hard coded hashes unchanged, new flag on files only added); `git diff main...feat/foundry-boss-schedule -- src/core src/game` is empty; `tests/levelgen/surface.test.ts` unmodified; `grep -rn "mulberry32" src/game/bosses` returns nothing; boss code uses `steer.ts` helpers (read by hand, shared rule 4); `git diff main...feat/swarm-boss-core --stat` stays inside `src/game/` and `tests/game/`, `tests/scoring/` and does not touch the three enemy bullet files; `git diff main...feat/forge-enemy-bullets --stat` shows only `src/game/enemyBullets.ts`, `tests/game/enemyBullets.test.ts` and `tests/game/enemyBulletsSim.test.ts`; `grep -rnE "Math.random|mulberry32" src/game/enemyBullets.ts` returns nothing; the stub's exported names and signatures are unchanged; level 5 differs from its v2.1 definition only by the boss field, version and the hazard step; Foundry's level list is in the hand-off.

Ryan verifies on device (no enemy bullet is fired in this build, so the paste has no bullet fields; the pool and its render path are covered by tests and Glow's proxy report, and the first device sight is G3B):

```text
V3-GA device check, about 20 minutes. Confirm build id <id>.
1. Open ?seed=42&level=5 and fight the boss to the end. Then retry the level once.
2. Open ?seed=42&level=10, then ?seed=42&level=15. Fight each boss.
3. In one fight press the bomb. Note what happened to the boss and to its attacks.
4. In one fight let it kill you once. Note whether the boss kept its damage and whether it
   stopped attacking while you respawned.
5. After a boss dies, note whether the level ended by itself. On a timed level note whether
   the timer had stopped.
6. Open ?seed=42&level=6. Note that no boss appears.
7. Turn Show FPS on and note the lowest number you see during one boss fight.
8. Note which Space physics level is selected (Off, Low, Medium or High) before you start.
Paste back, one answer per line, in the words shown:
build id: <the id on the screen>
Level 5 boss: could you tell what it would do next (yes or no):
Level 5 boss: did you find the way to hurt it (yes or no):
Level 5 boss: fairness (1 unfair to 5 fair):
Level 5 boss: fight length (too short, about right, too long):
Level 10 boss: could you tell what it would do next (yes or no):
Level 10 boss: did you find the way to hurt it (yes or no):
Level 10 boss: fairness (1 unfair to 5 fair):
Level 10 boss: fight length (too short, about right, too long):
Level 15 boss: could you tell what it would do next (yes or no):
Level 15 boss: did you find the way to hurt it (yes or no):
Level 15 boss: fairness (1 unfair to 5 fair):
Level 15 boss: fight length (too short, about right, too long):
Bomb during a fight: what happened (words):
After dying: boss kept its damage (yes or no), attacks paused while you respawned (yes or no):
After the boss died: level ended by itself (yes or no):
Boss bar and name readable on the cover screen (yes or no):
Boss bar and name readable on the main screen (yes or no):
Level 6 shows no boss (yes or no):
Lowest fps during a boss fight, main screen:
Space physics level selected (Off, Low, Medium, High):
Notes:
```

Pass: all three bosses told and countered, no fairness under 3, the level ends by itself, level 6 has no boss. Boss hit points and fight length feed D5. A fairness 1 or 2 on one boss is a Swarm fix run on that file only.

### If G3A fails

| Failure | Action | Deadline |
|---|---|---|
| Flag off differs from v2.1 | P0. Foundry fix run (`src/levelgen/` only) | before B setup |
| A boss is unfair or unreadable | Swarm fix run on that boss file only, or table numbers as glue | before B setup |
| Fight too short or too long | Table numbers (`BOSS_TABLE`, `BOSS_DAMAGE`) as glue, D5 | before B setup |
| The level does not end after the boss dies, or ends before | P0. Swarm fix run (`objective.ts`, `core.ts`) | before B setup |
| fps under the bar with a boss | Glow fix run first (hazard and burst cost), then lower the burst caps | before B setup |

---

## Wave V3-B: tier 2 bosses and boss music (T+4:00 to 6:30)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Worktree |
|---|---|---|---|---|
| Swarm | opus | feat/swarm-boss-tier2 | `src/game/` (`src/game/bosses/`, `game.ts` and `player.ts` for the enemy bullet wiring, `enemyBullets.ts` for fixes only, and any combat edit the bosses need), `tests/game/` | ../sow-wt/swarm-v3b |
| Glow | opus | feat/glow-boss-tier2 | `src/render/`, `tests/render/` | ../sow-wt/glow-v3b |
| Chorus | opus | feat/chorus-boss-music | `src/audio/`, `tests/audio/` | ../sow-wt/chorus-v3b |

Foundry and Ledger idle: the schedule and the HUD are done in A. Chorus is the first run in `src/audio/` since v2.1's melody pass, so it reads that work first.

### Design: boss music (shared by B and C)

1. `sim:bossEnter` plays the entry stinger (one chord hit on the current chord, quantised to the next sixteenth), sets the intensity floor to 0.8, ducks the enemy motifs to 40 percent (kill notes stay), and starts the boss motif on the next bar with a one bar fade in.
2. `sim:bossPhase` plays a phase sting and adds a voice or an octave to the motif on the next bar.
3. `sim:bossDown` plays the defeat stinger (an A major resolution, A C sharp E), stops the boss motif at the next bar, and returns intensity and the enemy motifs by the normal release (3 s).
4. A boss motif is a pure function of (boss id, phase, bar) on `hash01`, a 2 or 4 bar loop of 4 to 8 notes, all notes inside the tier scale (docs/13 clause). No seed. At most 3 boss voices (phase adds one) beside the bed and the enemy motifs inside the 16 voice cap, stealing enemy motif voices first. Summed gain at most 1.0, music master at most 0.35 of the synth master, unchanged.
5. The Music slider covers all of it: 0 is silence. Pause, a hidden tab and fold suspend and resume on the next bar line, as v2.
6. Sound effects (not music): a boss entry rumble, a hit tick for `Kind.Boss` on `fx:hit` that is heavier than the existing per kind ticks (throttled), a boss death cue (a bigKill variant) and a soft shot blip on `fx:bossShot` (Chorus chooses the sound, at most 6 per s). These are cues in `src/audio/cues.ts`, which Chorus owns in this wave.

### Brief: Swarm (tier 2)

```text
Swarm: tier 2 bosses. Branch feat/swarm-boss-tier2. Worktree ../sow-wt/swarm-v3b.
Read first: docs/12-v3-plan.md "Wave V3-A" (rules, hazard primitives, "Design: boss projectiles",
roster rows 3 to 6) and "Wave V3-B", docs/13 "Boss projectiles", src/game/bosses/ (the wave A
framework and the three tier 1 files as patterns), src/game/enemyBullets.ts (Forge's real pool).
Own: src/game/ (src/game/bosses/, game.ts and player.ts for the wiring, enemyBullets.ts for
fixes only, combat edits the bosses need), tests/game/.

Task, in order (stop at the deadline, do not reorder):
1. ember.ts: wind up, dash with up to 2 wall bounces, wall stun 2 s, Mines along the dash (the
   existing Mine rules and caps), three phases each 15 percent faster.
2. mirage.ts: warp with a destination ring 0.5 s early, eight lane burst on landing, a shield
   ring with a 70 deg open arc turning at 1.5 rad/s (shots count only through the arc), three
   phases.
3. gravitas.ts: three BossPart anchors (6 HP each) that gate all damage to the core, a pull
   hazard whose strength falls by a third per lost anchor, a collapsing ring with a 60 deg gap,
   three phases.
4. Register all three. Fairness rules 5 and 6 hold for each (tier 2 telegraph 0.8 s, ring gaps
   at least 60 deg). Every vector through steer.ts helpers, every chase or aim target through
   targetOf.
5. Boss shots (the last item: cut 5 removes it cleanly, so do not interleave it). Wire Forge's
   pool: stepGame calls stepEnemyBullets after shipHits, killShip and triggerBomb call
   clearEnemyBullets. BOSS_SHOTS in table.ts with the three rows from the plan. Spindle's
   pellet in spindle.ts (every 3.0 s, 3.6 s in phase 2, none while an arm reversal telegraph
   shows, arms at 0.4 rad/s) and Ember's fan in ember.ts (three bullets 14 deg apart, only
   after a dash that ends in open floor, that rest 1.8 s, launch 0.8 s in, no fan after a wall
   hit). Each shot waits and rechecks every 0.3 s while the ship is within 300 u of the muzzle,
   charges for hazardTelegraph(tier) with its heading fixed at the charge start from targetOf,
   and emits fx:bossShot once per volley at launch. Bullet speed never exceeds 240.

Definition of done: npm test and npm run build pass, no any, no new dependency, no per step
allocation, every existing test unmodified and green, flags off bit identical (no pool is
created without a boss).
Tests to add: one file per boss (ember stuns only on a wall hit and is hittable only stunned or
resting; mirage damages only through the open arc and its warp lands 200 to 300 u from the ship;
gravitas takes no damage with an anchor alive and its pull falls with each anchor); fairness
checks per boss; determinism over 60 s per boss; Mine caps respected. Shots: the wiring (a bomb
clears charging and flying bullets, ship death clears them, a contact kills the ship in the
same step, a world without a boss has no pool); Spindle's pellet interval, heading fixed at the
charge start, silence during the reversal telegraph and the arm rate; Ember's fan only after an
open floor dash, the 1.8 s rest, the 14 deg spacing and no fan after a wall hit; the 300 u wait
and recheck; fx:bossShot once per volley; speed at most 240 under enrage; the dodge test (a
ship at rest at High with the pure dodgeSeconds from Forge clears every shot pattern in the time
the telegraph and flight allow); determinism over 60 s with shots.
End with the hand-off block.
```

### Brief: Glow (tier 2 visuals)

```text
Glow: tier 2 boss visuals. Branch feat/glow-boss-tier2. Worktree ../sow-wt/glow-v3b.
Read first: docs/pixi8-cheatsheet.md, docs/12-v3-plan.md "Wave V3-A" (render contract, roster
rows 4 to 6 and presentation) and "Wave V3-B", src/render/ (the wave A boss files).
Own: src/render/, tests/render/.

Task:
1. Tune bossOrange, bossMagenta and bossViolet against docs/01 section 11 and the tier 1 keys.
2. Shapes and states for Ember (arrowhead, wind up lane glow, flame and spark trails, Mine
   pulse), Mirage (ring with a moving open arc, ghost afterimage, landing flash) and Gravitas
   (core, three rings, anchor nodes joined by faint lines).
3. Gravitas pulls the lattice: a continuous inward pull on the lattice from the boss position,
   the same channel wells use, render only.
4. Tier 2 line weight x2.0. Pure helpers for arc openness, afterimage alpha and anchor tether
   alpha with tests. Honour neon:changed and the effects tier. Never write glow width outside
   applyNeon.
5. The boss entry cue: a screen edge pulse on sim:bossEnter in the boss colour (a multiplier
   on the map effects layer).

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency.
Tests to add: registry coverage; the helpers above; the lattice pull bounded; tier weight.
End with the hand-off block.
```

### Brief: Chorus (boss music, tiers 1 and 2)

```text
Chorus: boss music. Branch feat/chorus-boss-music. Worktree ../sow-wt/chorus-v3b.
Read first: docs/12-v3-plan.md "Wave V3-B" (Design: boss music) and Appendix B, src/audio/music/
(the v2.1 melody pass is the base), src/audio/cues.ts, src/audio/synth.ts, src/core/events.ts.
Own: src/audio/, tests/audio/. Everything else is read only.

Task:
1. src/audio/music/boss.ts: BOSS_MOTIFS registry keyed by BossId with a motif builder, timbre,
   register and gain, for bosses 1 to 6 now (7 to 10 are empty list entries, not missing keys,
   so wave C only fills them). Motifs per the plan presentation table, in the tier scale.
2. Lifecycle from 'sim:bossEnter', 'sim:bossPhase' and 'sim:bossDown': stinger quantisation,
   the one bar fade in, ducking and restoring the enemy motifs, intensity floor 0.8, the phase
   voice, the defeat stinger. Handle a boss entering while an enemy motif is fading and a
   level restart mid fight.
3. Voice budget: boss voices (at most 3) and enemy motif voices inside 16, stealing enemy
   motifs first. Summed gain at most 1.0.
4. cues.ts: boss entry rumble, boss hit tick (heavier than the existing per kind ticks, throttled), boss
   death cue, and a soft boss shot blip on 'fx:bossShot' (at most 6 per s). Existing cues unchanged.
5. No Math.random, no audio files, no import from src/game, src/ui or src/render. The bus is
   the only link.

Definition of done: npm test and npm run build pass, no any, no new dependency.
Tests to add (tests/audio/music/ and tests/audio/): registry covers every BossId (a missing id
fails); every motif note is in its tier scale; determinism per (boss id, phase, bar); distinct
bosses give distinct motifs; stinger and fade quantisation with a fake clock; ducking restores
after sim:bossDown; voice cap with a boss, 3 boss voices and 6 enemy motifs; gain at most 1.0;
the new cues exist and respect the 24 voice sfx cap; the shot blip is throttled to 6 per s.
End with the hand-off block.
```

### Merge order and why

1. `feat/swarm-boss-tier2`: the sim.
2. `feat/glow-boss-tier2`: render only.
3. `feat/chorus-boss-music`: audio only, covered by the registry test. Then glue (about 4 lines) if a registry needs wiring.

### Gate G3B (5:40 to 6:30)

Fable verifies: the shared gate checks; flags off golden unchanged; `grep -rnE "from '\.\./(game|ui|render)" src/audio` returns nothing; `git diff main...feat/swarm-boss-tier2 -- src/levelgen src/core` is empty; every tier 2 boss file uses steer helpers and `targetOf`; the three enemy bullet call sites are in `game.ts` and `player.ts` and nowhere else; `grep -rnE "Math.random|mulberry32" src/game/enemyBullets.ts src/game/bosses` returns nothing; no enemy bullet pool exists in a flags off run (the Swarm test); `git ls-files | grep -E "\.(mp3|ogg|wav|flac|m4a|png|jpg)$"` shows only the PWA icons.

Ryan verifies on device:

```text
V3-GB device check, about 35 minutes. Confirm build id <id>.
1. Open ?seed=42&level=20, then 25, then 30. Fight each boss to the end.
2. During each fight listen: the entry sound, the boss tune, the change when its phase changes,
   the sound when it dies.
3. Play a normal wave level for 20 seconds, then a boss level, then a normal level again.
   Note whether the enemy sounds quiet down during the boss and come back after.
4. Open ?boss=brood, choose Endless from the menu. Note that the boss arrives about 10 seconds in
   and that waves pause while it lives.
5. Turn Show FPS on and note the lowest number during the level 30 fight.
6. Drag the music slider to 0 during a fight. Note that the music stops and effects stay.
7. Open ?seed=42&level=15 and fight the boss. It fires a slow pellet at you. Note the thin
   line you see before each shot and whether you can step out of its way.
8. In the level 20 fight, after one of its dashes ends in open floor, note the fan of three
   bullets. Then press the bomb while a bullet is in the air in the level 15 or level 20 fight
   and note what happens to it.
9. Note which Space physics level is selected before you start. High is the hardest to dodge
   on, so play the level 15 and level 20 fights on High at least once.
Paste back, one answer per line:
build id:
Level 20 boss: could you tell what it would do next (yes or no):
Level 20 boss: did you find the way to hurt it (yes or no):
Level 20 boss: fairness (1 unfair to 5 fair):
Level 25 boss: could you tell what it would do next (yes or no):
Level 25 boss: did you find the way to hurt it (yes or no):
Level 25 boss: fairness (1 unfair to 5 fair):
Level 30 boss: could you tell what it would do next (yes or no):
Level 30 boss: did you find the way to hurt it (yes or no):
Level 30 boss: fairness (1 unfair to 5 fair):
Boss entry sound heard (yes or no):
Boss tune is different for each of the three bosses (yes or no):
Phase change heard (yes or no):
Defeat sound heard (yes or no):
Enemy sounds quiet down and return (yes or no):
Music glitches (none, some, bad):
Endless boss arrives and waves pause (yes or no):
Lowest fps during the level 30 fight, main screen:
Music slider at 0 silences the music only (yes or no):
Level 15 boss pellet: could you see it coming before it fired (yes or no):
Level 15 boss pellet: could you dodge it without luck (yes or no):
Level 15 boss pellet: fairness (1 unfair to 5 fair):
Level 20 boss fan: could you see it coming before it fired (yes or no):
Level 20 boss fan: could you dodge it without luck (yes or no):
Level 20 boss fan: fairness (1 unfair to 5 fair):
Bomb with a bullet in the air: the bullet vanished (yes or no):
Boss shot sound heard (yes or no):
Lowest fps during the level 20 fight, main screen:
Space physics level selected (Off, Low, Medium, High):
Notes:
```

Pass: all three told and countered, no fairness under 3, no `bad` glitch, Endless ok, and both shooters seen coming and dodged without luck, bomb clears bullets. Chorus glitches that persist after one Chorus fix run trigger cut 1. A shooter fairness of 1 or 2 is a Swarm fix run on that boss file (interval or speed in `BOSS_SHOTS` first); if it persists, cut 5 (D14).

### If G3B fails

| Failure | Action | Deadline |
|---|---|---|
| A boss is unfair or unreadable | Swarm fix run on that file, or table numbers as glue | before C setup |
| Music glitches or stutters | Chorus fix run (voice count, lookahead); if it persists, cut 1 | 6:30 |
| Endless boss does not arrive or waves keep running | Swarm fix run (`endless.ts`) | before C setup |
| A shooter (Spindle, Ember) is unfair, unseen or undodgeable | Table numbers in `BOSS_SHOTS` as glue first (interval, speed, telegraph), then one Swarm fix run on that boss file; if it persists, cut 5 | before C setup |
| A bullet survives a bomb or death, or kills through respawn invulnerability | P0. Forge fix run (`enemyBullets.ts`) or a Swarm wiring fix | before C setup |
| Bullets draw wrongly or hurt fps | Glow fix run (`enemyBullets.ts` render), then the pool cap as a table value | before C setup |
| fps under the bar | Glow fix run first, then burst caps | before C setup |

---

## Wave V3-C: tier 3 and the top boss (T+6:30 to 10:00)

### Agents and ownership

Two stages, each three runs with the same ownership as wave B. Stage C2 starts after C1 is merged, because Prism reuses the earlier bosses' kit calls and visuals.

| Stage | Nickname | Branch | Owns (exclusive) | Worktree |
|---|---|---|---|---|
| C1 | Swarm | feat/swarm-boss-tier3 | `src/game/bosses/`, `tests/game/` | ../sow-wt/swarm-v3c1 |
| C1 | Glow | feat/glow-boss-tier3 | `src/render/`, `tests/render/` | ../sow-wt/glow-v3c1 |
| C1 | Chorus | feat/chorus-boss-tier3 | `src/audio/`, `tests/audio/` | ../sow-wt/chorus-v3c1 |
| C2 | Swarm | feat/swarm-boss-prism | `src/game/bosses/`, `tests/game/` | ../sow-wt/swarm-v3c2 |
| C2 | Glow | feat/glow-boss-prism | `src/render/`, `tests/render/` | ../sow-wt/glow-v3c2 |
| C2 | Chorus | feat/chorus-boss-prism | `src/audio/`, `tests/audio/` | ../sow-wt/chorus-v3c2 |

### Design: tier 3 and tier 4

Tier 3 is "bright red with thick glow lines" (Ryan, vice top). Three bosses share the colour and differ by silhouette and mechanic (roster rows 7 to 9). The line weight is x3.0 on the boss layer with a second, wider outer glow stroke. The neon slider still scales the glow through `applyNeon`; the weight and the extra stroke are constants on the boss layer. The red must stay apart from the gravity well ring red: the boss is far larger, has a white inner core and a second rim.

Tier 4 is Prism (roster row 10): a shimmering multicolour boss. The shimmer is a hue offset per outline vertex that advances with `w.time` (a full hue cycle in 3 s) plus a one frame chromatic ghost. The damage cycle is separate and lasts 4 s, exactly two bars at 120 BPM: 2.3 s of colour (the shield absorbs 75 percent of damage), 0.5 s of the outline running to white, then a 1.2 s white window with the shield down and full damage. The Chorus motif's rising arpeggio cues the run to white. Because the window is audio visual, Prism with music at 0 must still read from the visual alone, which is why the run to white is drawn.

Prism's phases quote earlier bosses by calling the same kit primitives with Prism's own timings, not by spawning those bosses. Its orbiting nodes (phase 4) are `BossPart` turrets with 4 HP.

### Brief: Swarm C1 (tier 3)

```text
Swarm: tier 3 bosses. Branch feat/swarm-boss-tier3. Worktree ../sow-wt/swarm-v3c1.
Read first: docs/12-v3-plan.md "Wave V3-A" (rules, primitives, "Design: boss projectiles", roster
rows 7 to 9) and "Wave V3-C", src/game/bosses/ (tier 1 and 2 files as patterns), src/game/enemyBullets.ts.
Own: src/game/bosses/, tests/game/.

Task, in order (stop at the deadline, do not reorder):
1. bastion.ts: four BossPart turrets (8 HP) firing lanes in turn (item 5 adds the bullets), core
   damage gated on two turrets down, a Bulwark add every 12 s, three phases (four, two, no turrets).
2. tempest.ts: wall lap at 140 u/s and 90 u from the wall, Slime every 1.0 s (8 live, inside the
   12 total Slime cap), a lane dash across the arena every 6 s then a 1.5 s rest at the far
   wall, three phases that shorten the dash interval.
3. twins.ts: two Boss bodies sharing one phase counter, a tether hazard between them, a ring
   from each body offset by 3.5 s, the enrage when one dies (speed x1.4, ring every 4 s, tether
   gone), hit points 500 each. Death of both ends the fight and awards the bonus once.
4. Register all three. Tier 3 telegraph 0.6 s, ring gap at least 45 deg, hazard caps hold.
   Every chase or aim target through targetOf.
5. Bastion's turret shots (the last item: cut 5 removes it cleanly, so do not interleave it).
   A BOSS_SHOTS row: one turret turn every 1.5 s as in item 1, each turret alternating a lane
   and a bullet on its own turns so the total attack rate is unchanged; a destroyed turret skips
   its turns, so phase 2 has half the bullets and phase 3 none; the core never fires. Bullet
   speed 200 u/s, the same rules as Spindle's pellet and Ember's fan (charge for the tier
   telegraph, heading fixed at the charge start from targetOf, wait and recheck every 0.3 s
   while the ship is within 300 u of the muzzle, fx:bossShot once per volley).

Definition of done: npm test and npm run build pass, no any, no new dependency, no per step
allocation, every existing test unmodified and green.
Tests to add: one file per boss (bastion core takes no damage until two turrets fall and phases
follow turret count; tempest keeps its lap offset, Slime stays inside the cap and the rest
window is hittable; twins tether exists only while both live, the survivor enrages, the bonus
awards once); fairness checks; determinism over 60 s per boss. Bastion shots: each turret
alternates lane and bullet on its own turns, the total turn rate stays one per 1.5 s, a
destroyed turret skips its turns, phase 3 fires nothing, speed 200, the 300 u wait and
recheck, the dodge test as in wave B, determinism over 60 s.
End with the hand-off block.
```

### Brief: Glow C1 (tier 3 visuals)

```text
Glow: tier 3 boss visuals. Branch feat/glow-boss-tier3. Worktree ../sow-wt/glow-v3c1.
Read first: docs/pixi8-cheatsheet.md, docs/12-v3-plan.md "Wave V3-A" (roster rows 7 to 9 and
presentation) and "Wave V3-C", src/render/ (the wave A and B boss files).
Own: src/render/, tests/render/.

Task:
1. Tune bossRed against docs/01 section 11 (the gravity well ring is hsl(355, 95%, 55%)): size,
   a white inner core and a second rim keep a boss apart from a well.
2. Thick glow lines for tier 3: line weight x3.0 and a wider outer glow stroke on the boss
   layer, both scaled by the neon slider only through the existing glow alpha from applyNeon.
3. Shapes and states for Bastion (fortress, corner turrets, hot core when open), Tempest (long
   kite, Slime trail, hot dash afterimage) and Twins (two linked circles, thick humming
   tether).
4. Pure helpers with tests for turret state to alpha, afterimage fade and tether pulse.
   Honour neon:changed and the effects tier. Never write glow width outside applyNeon.

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency.
Tests to add: registry coverage; the helpers; line weight table; neon tests assert the endpoints.
End with the hand-off block.
```

### Brief: Chorus C1 (tier 3 motifs)

```text
Chorus: tier 3 boss motifs. Branch feat/chorus-boss-tier3. Worktree ../sow-wt/chorus-v3c1.
Read first: docs/12-v3-plan.md "Wave V3-B" (Design: boss music) and the roster presentation rows
7 to 9, src/audio/music/boss.ts (your wave B work).
Own: src/audio/, tests/audio/.

Task: fill the BOSS_MOTIFS entries for bastion (heavy march, a voice drops per lost turret, which
needs phase and a turret count from the bus: use sim:bossPhase), tempest (fast sixteenth
arpeggio rising each lap) and twins (two voice canon a bar apart, solo and doubled tempo when
one dies, via sim:bossPhase). Tier 3 colour: a phrygian second. Keep every other registry entry
intact. No new events: if a motif needs a field the bus lacks, put it under Requests.

Definition of done: npm test and npm run build pass, no any, no new dependency.
Tests to add: registry still covers every BossId; notes in the tier 3 scale; determinism and
distinct motifs; the voice cap with a tier 3 boss at phase 3.
End with the hand-off block.
```

### Brief: Swarm C2 (Prism)

```text
Swarm: Prism. Branch feat/swarm-boss-prism. Worktree ../sow-wt/swarm-v3c2.
Read first: docs/12-v3-plan.md "Wave V3-A" (rules, primitives, roster row 10) and "Wave V3-C",
src/game/bosses/ (all nine other boss files).
Own: src/game/bosses/, tests/game/.

Task:
1. prism.ts: drift between four points at 90 u/s; four phases at 75, 50 and 25 percent hit points
   that call the kit primitives with Prism's own timings (phase 1 ring and three pods, 2 two
   sweep arms and a dash lane, 3 a pull and warp lane burst, 4 four turret nodes and a tether);
   a 4 s damage cycle (2.3 s colour, 0.5 s run to white, 1.2 s window): full damage in the
   window, 25 percent outside it; hit points 1000.
2. Prism may not spawn another boss entity. Caps hold (6 hazards, 8 adds, 4 parts).
3. Cut 7 note: if Fable cuts the phases to two, keep phases 1 and 4, the cycle and the window.
4. Hit point arithmetic to confirm in a test: with every shot landing, the fight takes about
   117 s at 18 spread hits a second (the average damage multiplier is 0.475).

Definition of done: npm test and npm run build pass, no any, no new dependency, no per step
allocation, every existing test unmodified and green.
Tests to add: full damage inside the window and 25 percent outside it; the 4 s cycle timing;
four phases at the right thresholds; caps never exceeded across 120 s of fuzzed input; fairness checks at tier 4;
determinism over 60 s; the fight ends and awards the bonus once.
End with the hand-off block.
```

### Brief: Glow C2 (shimmer)

```text
Glow: Prism visuals. Branch feat/glow-boss-prism. Worktree ../sow-wt/glow-v3c2.
Read first: docs/pixi8-cheatsheet.md, docs/12-v3-plan.md "Wave V3-C" (Design: tier 3 and tier 4),
roster row 10, src/render/.
Own: src/render/, tests/render/.

Task:
1. A faceted gem outline whose hue cycles along its length, one full cycle in 3 s from w.time,
   plus a chromatic offset ghost. A pure function maps (vertex index, time) to a hue.
2. Phase tint toward the borrowed boss colour, the outline running to white over the 0.5 s
   before the damage window (the 4 s damage cycle: 2.3 s colour, 0.5 s run to white, 1.2 s
   white window), and the white flash in it.
3. Tier 4 line weight x2.4. All of it a multiplier on the boss layer. Saturation still follows
   applyNeon (a shimmer at neon 0 is muted, never off).
4. If the shimmer costs frames, reduce vertex count first, then drop the ghost, and report.

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency.
Tests to add: hue function (full cycle in 3 s, vertex offsets distinct); the white run up and
flash timing; weight table.
End with the hand-off block.
```

### Brief: Chorus C2 (Prism motif)

```text
Chorus: Prism motif. Branch feat/chorus-boss-prism. Worktree ../sow-wt/chorus-v3c2.
Read first: docs/12-v3-plan.md "Wave V3-C" and the roster row 10, src/audio/music/boss.ts.
Own: src/audio/, tests/audio/.

Task: the prism entry: a four bar loop that quotes, transposed, the motif cells of bosses 1 to 9
by phase (phase p quotes the cells of three earlier bosses), tier 4 colour, and a rising
arpeggio across the second half of every second bar. The damage cycle is 4 s, exactly two bars
at 120 BPM, so the run to white is a fixed two bar pattern and the builder stays a pure function
of the bar. If the cue needs the cycle clock, put it under Requests for a bus field.
Definition of done: npm test and npm run build pass, no any, no new dependency.
Tests to add: registry covers every BossId; notes in scale; determinism; the cue lands before
each flash over 16 bars; voice cap and gain.
End with the hand-off block.
```

### Merge order and why

C1: `feat/swarm-boss-tier3`, `feat/glow-boss-tier3`, `feat/chorus-boss-tier3`. Then C2: `feat/swarm-boss-prism`, `feat/glow-boss-prism`, `feat/chorus-boss-prism`. After the last merge, glue (about 4 lines) if a registry needs wiring. Order inside a stage follows B: sim, render, audio.

### Gate G3C (9:15 to 10:00)

Fable verifies: the shared gate checks; flags off golden unchanged; `BOSS_IDS` all ten have a behaviour, a shape and a motif entry (the three registry tests); no `Math.random`, no `mulberry32` in `src/game/bosses`; `git ls-files` shows only PWA icons as binary assets; `git diff main...feat/swarm-boss-prism --stat` stays inside `src/game/bosses/` and `tests/game/`.

Ryan verifies on device:

```text
V3-GC device check, about 30 minutes. Confirm build id <id>.
1. Open ?seed=42&level=35, 40, 45 and 50. Fight each boss to the end.
2. At level 50 watch the outline colours. Say whether you can tell when it is about to be
   vulnerable, once with the music on and once with the music slider at 0.
3. At level 45 kill one body first. Note what the other one does.
4. With Show FPS on note the lowest number in the level 50 fight.
5. Open ?seed=42&level=55. Note which boss appears and that it is tougher than before.
6. At level 35 note the slow bullets from the corner turrets, how many you see at once, and
   what happens to the bullets and the turn rate when a turret is destroyed.
Paste back, one answer per line:
build id:
Level 35 boss: could you tell what it would do next (yes or no):
Level 35 boss: did you find the way to hurt it (yes or no):
Level 35 boss: fairness (1 unfair to 5 fair):
Level 40 boss: could you tell what it would do next (yes or no):
Level 40 boss: did you find the way to hurt it (yes or no):
Level 40 boss: fairness (1 unfair to 5 fair):
Level 45 boss: could you tell what it would do next (yes or no):
Level 45 boss: did you find the way to hurt it (yes or no):
Level 45 boss: fairness (1 unfair to 5 fair):
Level 35 boss turret shots: could you see each one coming before it fired (yes or no):
Level 35 boss turret shots: could you dodge them without luck (yes or no):
Level 35 boss turret shots: fairness (1 unfair to 5 fair):
Level 45 boss: after one body died the other became faster (yes or no):
Level 50 boss: could you tell what it would do next (yes or no):
Level 50 boss: did you find the way to hurt it (yes or no):
Level 50 boss: fairness (1 unfair to 5 fair):
Level 50 boss: the damage window is readable with music on (yes or no):
Level 50 boss: the damage window is readable with music at 0 (yes or no):
Thick red lines look like the top tier but one (1 not at all to 5 exactly):
Shimmer looks like a top boss (1 not at all to 5 exactly):
Level 55 shows the loop with more hit points (yes or no):
Lowest fps during the level 50 fight, main screen:
Music glitches (none, some, bad):
Notes:
```

Pass: all four told and countered, no fairness under 3, the Prism window readable with music at 0, no `bad` glitch. A fairness 1 or 2 on Twins or Tempest triggers cut 8 (D6). A failure on Bastion or Prism is a Swarm fix run, because both are in the floor. A fairness 1 or 2 on Bastion's turret shots follows D14: table numbers in `BOSS_SHOTS`, one Swarm fix run, then cut 5; the boss itself stays.

### If G3C fails

| Failure | Action | Deadline |
|---|---|---|
| Twins or Tempest unfair | Table numbers as glue, then one Swarm fix run; if it persists execute cut 8 (roster of 8, the floor) | 9:15 |
| Bastion's turret shots unfair or unseen | Table numbers in `BOSS_SHOTS` as glue, then one Swarm fix run; if it persists execute cut 5 (cut before any boss) | 9:15 |
| Prism too hard or the window unreadable | Glow fix run (white run up), or table numbers; cut 7 only if the Swarm C2 window ran out | 9:15 |
| Music glitches or persists | Chorus fix run; if unresolved, cut 1 | 9:15 |
| fps under the bar | Glow fix run first (shimmer vertices, ghost), then burst caps | before D setup |

---

## Wave V3-D: weapon combining and drone drops (T+10:00 to 13:00)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Worktree |
|---|---|---|---|---|
| Swarm | opus | feat/swarm-weapon-combine | `src/game/` (`weapons.ts`, `pickup.ts`, `bullets.ts`, `combat.ts`, `drones.ts`, `ship.ts`, `state.ts`, `remove.ts`, `defs.ts`, `steer.ts`, and the chase reads in `enemies/`), `tests/game/` | ../sow-wt/swarm-v3d |
| Glow | opus | feat/glow-weapon-combine | `src/render/`, `tests/render/` | ../sow-wt/glow-v3d |
| Chorus | opus | feat/chorus-weapon-cues | `src/audio/`, `tests/audio/` | ../sow-wt/chorus-v3d |
| Ledger | sonnet | feat/ledger-weapon-names | `src/ui/`, `src/main.ts`, `tests/ui/` | ../sow-wt/ledger-v3d |

Foundry idles. Swarm owns `ship.ts` for the one fire dispatch it already owns from v2 wave B, and `bullets.ts` for the additive `combo` field. The drone modes add: `state.ts` for the drone fields (armed mode, timer, `droneTwinId`), `remove.ts` and `defs.ts` for `Kind.DroneTwin` (the same id reset `droneId` gets), and `steer.ts` plus the chase reads in `src/game/enemies/` for the decoy. In `enemies/` Swarm edits only the lines that read the ship position to chase it, and only to go through `steer.ts` helpers or `targetOf`; `gravitywell.ts`, spawner placement and every kill path stay on the ship.

### Design: weapon combining

Ryan's ask (DECISIONS 42:45): collecting a second weapon while one is active combines them into a new weapon with features of both, with an upgrade sound, plus an expiry sound. Ryan kept the names (Q10) and left Q11 and Q12 at their defaults, so the rules below stand (D7).

Rules:

1. Ingredients are spread, rapid, pierce and orbit. The active weapon is the one with time left. The spread default is no active weapon.
2. Collecting X. Active is spread: equip X (v2 behaviour). Active is X: refresh to 20 s. Active is a different Y: combine into the pair {Y, X} for 20 s. Active is a pair {A, B}: if X is A or B, refresh to 20 s; otherwise X replaces the older ingredient (the one collected earlier) and the new pair gets 20 s. A pair is always two weapons, never three.
3. Spread is a droppable ingredient only while a non spread weapon is active at the moment of the drop. The drop pool then adds `spread` to the v2 pool for the band (band 1 rapid, band 2 rapid and pierce, band 3 and 4 and Endless rapid, pierce and orbit). Why: spread is never a pickup in v2, so without this three of the six pairs (those with spread) could never be reached. Choice stays `pool[floor(hash01(level.seed, dropIndex) x pool.length)]` with the skip-repeat rule, so it is deterministic given the same kills and pickups.
4. Reachability. A pickup lives 8 s and drops come every 25 scoring kills, so a second pickup can miss the first weapon's 20 s. While a non spread weapon is active the next drop falls due after at most 12 more scoring kills (`COMBINE_DROP_KILLS`, starting value, tuned at G3D).
5. A combined weapon ends when its timer runs out or the ship dies: back to spread, with the expiry sound. Single weapons end the same way and play the same sound.
6. Turbo doubles the volley rate of every weapon, combined ones included. Pickups off: nothing spawns, nothing combines (the Off invariant).
7. The HUD shows the combined weapon's name and its two glyphs, and the countdown bar (Ledger).

The six pairs. IDs are canonical (ingredients in the order spread, rapid, pierce, orbit). The names are Ryan's (Q10: Hail, Trident, Halo, Needle, Whirl, Eclipse kept). The index is bullets per second times the hits each can score (pierce 4 hits in v2) plus blade contacts per second, computed from the starting values, not measured, and compared with the best of the two ingredients.

| Pair id | Name | Pattern | Bullet and trait | Volleys per s | Index | Best ingredient | Ratio |
|---|---|---|---|---|---|---|---|
| spread+rapid | Hail | 3 bullets at minus 5, 0, plus 5 deg | rapid bullet (radius 3, speed 1500, life 0.9 s) | 22 | 66 | rapid 52 | 1.27 |
| spread+pierce | Trident | 3 bullets at minus 8, 0, plus 8 deg | pierce bullet (radius 5, speed 1600), 1 pass after the first hit (2 hits) | 10 | 60 | spread 36 | 1.67 |
| spread+orbit | Halo | 3 bullets forward as spread, plus 4 blades (radius 80, 2.4 rev/s) | spread bullet, blade cooldown 0.12 s | 10 forward | 63 | orbit 39 | 1.61 |
| rapid+pierce | Needle | 2 parallel bullets, 5 u either side | pierce bullet (radius 4, speed 1600), 2 passes after the first hit (3 hits) | 14 | 84 | rapid 52 | 1.62 |
| rapid+orbit | Whirl | 2 parallel bullets forward, plus 4 blades at 3.0 rev/s | rapid bullet, blade cooldown 0.12 s | 18 forward | 69 | rapid 52 | 1.33 |
| pierce+orbit | Eclipse | 1 bullet forward, plus 5 blades at radius 100 and 2.0 rev/s | pierce bullet (3 hits), blade cooldown 0.15 s | 8 forward | 57 | orbit 39 | 1.46 |

Arithmetic check: Hail 3 x 22 = 66, Trident 3 x 10 x 2 = 60, Halo 3 x 10 + 4 / 0.12 = 63, Needle 2 x 14 x 3 = 84, Whirl 2 x 18 + 4 / 0.12 = 69, Eclipse 8 x 3 + 5 / 0.15 = 57. The ingredient indices are spread 3 x 12 = 36, rapid 2 x 26 = 52, pierce 8 x 4 = 32 and orbit 4 / 0.12 + 6 = 39. The design band is a ratio of 1.25 to 1.75 over the best ingredient, so a combination always beats both parts and never doubles them. A pure test asserts the band. Live bullets at Turbo (bullets per volley x doubled volleys per second x life): Hail 3 x 44 x 0.9 = 119 (the worst, so its life is 0.9 s, not 1.0), Trident 3 x 20 x 1.0 = 60, Needle 2 x 28 x 1.0 = 56, Whirl 2 x 36 x 1.0 = 72, Halo 3 x 20 x 1.2 = 72 plus 4 blades, Eclipse 1 x 16 x 1.0 = 16 plus 5 blades. The starting budget is 130 and the pool is 512.

Mechanism is Swarm's, with these constraints: spread, rapid, pierce and orbit behaviour and the v2 golden tests are unchanged; `BulletPool` gains an additive `combo: Uint8Array` (0 none, 1 to 6 the pair in the table order) for Glow, and hit rules still read the ingredient style; combos add no new style value. `COMBO_TABLE` holds the numbers.

### Design: drone pickups (Ryan, Q13)

Ryan's answer (D8): "weapon drops for the drone (the familiar)" are a separate pickup that arms the drone for 20 s with one of four modes, homing, detach, rapid or double. The clause with the rules is docs/13 SPEC 3.5 "Drone pickups"; this section holds what the briefs need. Numbers are starting values in `DRONE_MODE_TABLE` (`src/game/drones.ts`), tuned at G3D. Other readings (a permanent drone upgrade for the level, the drone fetching ship pickups) are not built.

1. Pickup. `Kind.DronePickup`, its own counter: first at scoring kill 30, then every 40. One live at a time, independent of the weapon pickup (so one of each can be live). Lives 8 s, collect radius 28 u from the ship, bombs leave it alone, level end clears it. It draws its mode's glyph (`w.a` is the index in `DRONE_MODES`).
2. Mode. `DRONE_MODES[floor(hash01(level.seed ^ 0x44524f4e, droneDropIndex) x 4)]` ("DRON" salt, independent of the ship stream), skipping one step on a repeat.
3. Arming. Collected, it arms the drone for 20 s on its own timer. In every mode the drone fires one shot per volley at the nearest enemy (or the boss) within 450 u at 4 volleys a second, whatever its type. An Attack drone's own shot is that volley, not a second stream; Collect and Ram drones gain the gun on top of their own behaviour.

| Mode | Effect | Starting numbers | Owner |
|---|---|---|---|
| homing | Drone shots are marked homing and steered by the existing `steerHoming` | 300 u acquisition, 540 deg/s | Swarm |
| detach | The drone leaves the ship, holds a post as a decoy and fires from it, then returns at expiry | Post 280 u along the aim at collection (the ship's facing if the stick is idle), clamped inside the arena. Out 700 u/s, back 900 u/s. Lure range 640 u | Swarm, Glow (tether and bait ring) |
| rapid | The drone fires fast with the rapid style | 10 volleys a second, radius 3 | Swarm |
| double | A second body (`Kind.DroneTwin`) orbits opposite the first and fires the same volley | Twin radius 8 u, 60 u orbit, 4 volleys a second from each body | Swarm, Glow (twin look) |

4. Decoy targeting. `targetOf(w, id)` (`steer.ts`) returns the decoy's entity id when a detach drone is live and entity `id` is within 640 u of it, otherwise 0 (the ship). `seekShip`, `angleToShip` and `distToShip` read that target's position, so every chaser using them, boss movement included, follows the decoy. Aimed boss bullets take their aim from `targetOf` (`DECOY_DIVERTS_BOSS_AIM` in the drone table flips this). These stay on the ship: contact and every kill path, well pull, spawner placement, pickups and geoms, the aim of every boss hazard (a ring gap, lane or sweep must always leave the ship a route) and the 300 u range test of boss bullets. The decoy is invulnerable, has no hitbox against enemies, is not pulled by wells and takes no damage; enemies pass through it and one that reaches it stops. With no detach drone live `targetOf` returns 0 for every entity, so flags off and every v2 golden are unchanged.
5. Double slot. One extra body, never two: `droneTwinId` in the game state, same radius and rate as the drone, opposite phase, absent whenever the drone is absent (respawn delay, Detonate's 3 s). It does not collect, ram or vacuum and takes one `ENTITY_CAP` slot.
6. Stacking. A new drone pickup replaces the old mode and restarts the 20 s. Replacing detach ends the decoy at once and the drone flies back; replacing double removes the twin; the same mode is a refresh. The drone never combines modes.
7. Ending. The mode ends at expiry (`fx:droneExpire`) or ship death (the death sound covers it). Detonate's 3 s absence does not pause the timer; a Detonate on a detached drone explodes at its post, and the mode applies again when the drone respawns. Pickups off disables it.
8. HUD. The drone indicator shows the mode glyph, its name and the countdown (Ledger, `DRONE_MODE_NAMES`).

Render contract for Glow (drone). `Kind.DronePickup`: `w.a[id]` mode index, `w.t[id]` age for the blink. `Kind.DroneTwin`: `w.x`, `w.y`, `w.rot` like the drone. The armed mode and countdown arrive on `hud:droneWeapon` (Ledger and Glow subscribe), the moment of arming on `fx:droneArm`, the end on `fx:droneExpire`. A detached drone is the ordinary `Kind.Drone` entity at its post.

### Design: sounds

Two sounds are never cut: the upgrade sound on a combination and the expiry sound (DECISIONS 42:45). Chorus writes both in `src/audio/cues.ts`.

| Cue | Starting values | Rule |
|---|---|---|
| weaponCombine | A square sweep 440 to 1760 Hz over 220 ms plus a triangle arpeggio A4, C5, E5, A5 in 55 ms steps, gain 0.14 | Must not be mistaken for superReady (C5 E5 G5) or levelComplete. Plays once per combination, never on a refresh |
| weaponExpire | Two falling sine notes E5 then A4, 90 ms each, with a lowpass closing 4000 to 400 Hz, gain 0.10 | Plays when any non spread weapon of the ship runs out. Not on death (the death sound covers it) |
| droneArm | A single triangle note A5 with a 40 ms upward bend, gain 0.08 | Plays on `fx:droneArm`, when a drone pickup arms the drone in any mode, a replacement included |
| droneExpire | Two falling triangle notes in the drone's higher register (Chorus chooses the pitches), a lowpass closing, gain at most 0.06 | Plays on `fx:droneExpire`. A quieter relative of weaponExpire that must not be mistaken for it. Not on death, not on a replacement. At most 2 per s |

New events: `fx:weaponCombine`, `fx:weaponExpire`, `fx:droneArm`, `fx:droneExpire` (Appendix B). The existing sfx voice cap of 24 holds.

### Brief: Swarm (combining and drone pickups)

```text
Swarm: weapon combining and drone pickups. Branch feat/swarm-weapon-combine. Worktree ../sow-wt/swarm-v3d.
Read first: docs/12-v3-plan.md "Wave V3-D" (all design sections) and Appendix B, the v3 SPEC
addendum (docs/13, "Drone pickups"), docs/11 SPEC 3.5, src/game/weapons.ts, pickup.ts, bullets.ts,
combat.ts, drones.ts, ship.ts, state.ts, remove.ts, defs.ts, steer.ts, supers.ts (steerHoming,
Detonate), src/game/enemies/ (grep for w.x[0], seekShip, angleToShip, distToShip),
tests/game/weapons.test.ts.
Own: src/game/ (weapons.ts, pickup.ts, bullets.ts, combat.ts, drones.ts, ship.ts, state.ts,
remove.ts, defs.ts, steer.ts, and in src/game/enemies/ only the lines that read the ship position
to chase it), tests/game/. gravitywell.ts, spawner placement and every kill path stay on the ship.
src/render and src/audio are NOT yours: Glow and Chorus use the bus and the render contract.

Task, in order (stop at the deadline, do not reorder):
1. weapons.ts: ComboKind handling, COMBO_TABLE with the plan numbers, pure combineWeapons(active,
   collected) returning the new active weapon (single, pair or refresh), the older ingredient
   rule, canonical pair ids, equipWeapon using it, expiry emitting 'fx:weaponExpire', combining
   emitting 'fx:weaponCombine' (never on a refresh), fireWeapon for the six pairs (patterns,
   rates and traits from the table, blades via the existing orbit code with the pair's count,
   radius and rate). Spread, rapid, pierce and orbit alone must be bit identical to v2 (golden).
2. bullets.ts: additive combo field, zero filled, written for combined bullets and blades.
3. pickup.ts: spread joins the drop pool while a non spread weapon is active
   (chooseDrop stays pure; the caller passes the pool), COMBINE_DROP_KILLS pulls the next drop
   due after at most 12 kills while a weapon is active, pickups of spread (w.a 0) are valid.
4. Debug seams: debugEquip(w, kind) for any WeaponKind including pairs and debugArmDrone(w,
   mode) for any DroneMode (Fable wires ?weapon= and ?drone=).
5. Drone pickups with the two cheap modes (cut 4 removes this and item 6 together): Kind.DronePickup
   with its own counter (first at kill 30, then every 40), the salted hash01 choice over the
   four modes with the skip on a repeat, w.a holding the mode index, collect and arm for 20 s,
   the armed fire (one shot per volley at the nearest enemy or boss within 450 u, 4 volleys a
   second, all three drone types, the Attack drone's own shot being that volley), homing (shots
   marked homing for the existing steerHoming) and rapid (10 volleys a second, rapid bullet),
   replacement by a new pickup, clear on ship death, 'fx:droneArm' on collection, 'fx:droneExpire'
   at expiry (not on death or replacement) and 'hud:droneWeapon' (at most every 100 ms and on
   change).
6. Detach and double, the last item (cut 3 removes it cleanly, so do not interleave it).
   targetOf(w, id) in steer.ts becomes real: the decoy's entity id when a detach drone is live
   and id is within DECOY_LURE_RANGE (640 u), else 0. seekShip, angleToShip and distToShip read
   that target's position; the chase reads in src/game/enemies/ move onto those helpers or
   targetOf; gravitywell.ts, spawner placement, pickups, geoms, every kill path and every boss
   hazard aim stay on the ship. Detach: the drone flies out to a post 280 u along the aim (clamped
   inside the arena by confine) at 700 u/s, holds and fires there, returns at 900 u/s at
   expiry; replaced or dead means the decoy ends at once. Double: Kind.DroneTwin at the
   opposite orbit phase, droneTwinId in the state, reset in remove.ts, absent whenever the drone
   is absent, fires 4 volleys a second, never collects or rams. Numbers in DRONE_MODE_TABLE with
   DECOY_DIVERTS_BOSS_AIM.

Definition of done: npm test and npm run build pass, no any, no new dependency, no per step
allocation, pool cap respected at Turbo, every existing test unmodified and green.
Tests to add: combineWeapons truth table (every active and collected pair, refresh, the older
ingredient replaced, no triples); the six patterns and rates; the index band 1.25 to 1.75 per
pair; live bullets at Turbo at most 130 per combo over 10 s; v2 golden for single weapons;
spread joins the pool only while a weapon is active; drop schedule identical across two runs of
the same LevelDef, kill log and pickup log; COMBINE_DROP_KILLS pulls the drop due; death resets
to spread and clears the drone; pickups off spawns and combines nothing. Drone pickups (items 5
and 6, if not cut): drop schedule identical across two runs, salted mode choice over four with
the repeat skip, w.a mode index, arming and the 20 s expiry with the right events (none on
death or replacement), armed fire rate 4 a second for all three drone types with the Attack
drone not doubled, homing marks shots, rapid 10 a second, a new pickup replaces the mode and
restarts the timer (same mode is a refresh), the timer keeps running through Detonate's
absence, death clears the mode. Item 6 only: targetOf returns the decoy inside 640 u and the
ship outside it, and the ship for every entity with no detach drone live (every v2 golden and
the flags off identity unchanged); a Grunt, a Dart and a Charger scripted for 2 s move toward
the decoy; contact with the decoy is harmless; a gravity well still pulls the ship and not the
decoy; boss movement follows the decoy while boss hazards aim at the ship, and boss bullets aim
at the decoy but the 300 u range test uses the ship; the decoy ends on expiry, replacement,
death and Detonate, and the drone returns at 900 u/s; the twin orbits opposite, vanishes with
the drone, fires, is not targetable and fits ENTITY_CAP; a Detonate on a detached drone
explodes at the post.
End with the hand-off block.
```

### Brief: Glow (combined weapon visuals)

```text
Glow: combined weapon visuals. Branch feat/glow-weapon-combine. Worktree ../sow-wt/glow-v3d.
Read first: docs/pixi8-cheatsheet.md, docs/12-v3-plan.md "Wave V3-D" and "Performance budget",
src/render/bulletStyles.ts, shapes.ts, trails.ts, particles.ts, neon.ts.
Own: src/render/, tests/render/.

Task:
1. Bullet looks for the six pairs from BulletPool.combo and BulletPool.style: the ingredient
   bullet shape with a tint that blends the two ingredient palette keys, distinct enough to read
   apart at a glance. At most 10 bullet draw calls in total. Blades take the blend too.
2. A combine flash: a ring and a short burst at the ship in the blended colour on
   'fx:weaponCombine' (a multiplier on its own layer, capped by tier).
3. Pickup glyphs: spread (the ingredient) and the DronePickup (a teal ring with the glyph of
   its mode from w.a: homing, detach, rapid, double, four distinct marks), blinking in the last
   2 s like the weapon pickup. The armed drone glows in its mode colour (from the existing
   weapon palette keys and dronePickup, no new key) using 'hud:droneWeapon'.
4. Drone mode visuals (the last item, after 1 to 3: cut 3 removes detach and double): a homing
   trail on homing shots and a small bullet look for rapid; for detach a dim tether from the
   ship to the detached drone, a pulsing bait ring around it and a return streak at expiry; for
   double the Kind.DroneTwin look (the drone shape, dimmer) with a spawn flash and a dissolve
   flash. Flashes are multipliers on their own layer, capped by tier. 'fx:droneArm' and
   'fx:droneExpire' carry the moments.
5. Honour neon:changed on both glow paths and the effects tier. Never write glow width or bloom
   outside applyNeon.

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency.
Report desktop Chrome stress(400, 2000) with a Hail volley at Turbo as a proxy only.
Tests to add: registry covers Kind.DronePickup and Kind.DroneTwin; combo to tint mapping (six
distinct blends); four distinct pickup glyphs and four distinct mode colours; draw call count at
most 10 player calls (the enemy bullet call is separate); flash cap per tier; tether alpha and
bait ring pulse as pure functions; neon tests assert the endpoints.
End with the hand-off block.
```

### Brief: Chorus (weapon cues)

```text
Chorus: weapon cues. Branch feat/chorus-weapon-cues. Worktree ../sow-wt/chorus-v3d.
Read first: docs/12-v3-plan.md "Wave V3-D" (Design: sounds) and Appendix B, src/audio/cues.ts,
synth.ts, src/core/events.ts.
Own: src/audio/, tests/audio/.

Task: add the cues weaponCombine, weaponExpire, droneArm and droneExpire from the plan table,
subscribed to 'fx:weaponCombine', 'fx:weaponExpire', 'fx:droneArm' and 'fx:droneExpire'.
Throttle each (combine once per event, weapon expire at most 4 per s, drone expire at most 2 per
s). droneExpire is a quieter relative of weaponExpire (gain at most 0.06) and must not be
mistaken for it. Existing cues unchanged. The 24 voice sfx cap holds. No import from src/game,
src/ui or src/render. No Math.random, no audio files.

Definition of done: npm test and npm run build pass, no any, no new dependency.
Tests to add: each cue exists with the planned duration and gain; weaponCombine is not
identical in notes to superReady or levelComplete; droneExpire differs from weaponExpire in
notes and has gain at most 0.06; droneArm plays for every mode and for a replacement; throttles;
voice cap with ten cues at once.
End with the hand-off block.
```

### Brief: Ledger (names and indicators)

```text
Ledger: weapon names and indicators. Branch feat/ledger-weapon-names. Worktree ../sow-wt/ledger-v3d.
Read first: docs/12-v3-plan.md "Wave V3-D" and Appendix B, src/ui/hud.ts, hudFrame.ts.
Own: src/ui/, src/main.ts, tests/ui/.

Task:
1. COMBO_NAMES: the six names keyed by pair id (Ryan kept Hail, Trident, Halo, Needle, Whirl,
   Eclipse; a const he can still edit) and the glyph pair for each ingredient. DRONE_MODE_NAMES:
   Homing, Detach, Rapid, Double, and a glyph per mode (a const Ryan edits).
2. hud.ts: the weapon indicator shows a pair's name and two glyphs and the countdown bar from
   'hud:weapon' (kind may now be a pair id). A drone indicator from 'hud:droneWeapon' ({ mode,
   remaining, total }) beside it shows the mode glyph, its name and the countdown, same band, no
   new pointer target, hidden when empty, at most every 100 ms.
3. No settings are added. Do not move the bomb and super buttons.

Definition of done: npm test and npm run build pass, no any, no new dependency.
Tests to add: tests/ui/hud.test.ts additions (a pair shows both glyphs and its name; refresh
keeps it; expiry hides it; the drone indicator shows the name and glyph of each of the four
modes, changes mode on a replacement, and hides when empty; no overlap on cover and main).
End with the hand-off block.
```

### Merge order and why

1. `feat/swarm-weapon-combine`: the sim, covered by the golden tests.
2. `feat/glow-weapon-combine`: render only, reads fields that exist.
3. `feat/chorus-weapon-cues`: audio only.
4. `feat/ledger-weapon-names`, then glue (about 12 lines): the temporary `?weapon=<id>` hook that calls `debugEquip` at level start, the temporary `?drone=<mode>` hook that calls `debugArmDrone`, and any registry wiring.

### Gate G3D (11:55 to 13:00)

Fable verifies: the shared gate checks; single weapon golden unchanged (`tests/game/weapons.test.ts` v2 tests unmodified); `tests/qa/__snapshots__` unchanged; `grep -rn "mulberry32" src/game` returns nothing; `git diff main...feat/swarm-weapon-combine --stat` stays inside `src/game/` and `tests/game/`; in `src/game/enemies/` the diff touches only chase reads and none of `gravitywell.ts`'s kill or pull lines (read by hand); `targetOf` returns the ship with no detach drone live (the Swarm test, plus every v2 golden unmodified); the index band test is present.

Ryan verifies on device:

```text
V3-GD device check, about 40 minutes. Confirm build id <id>.
1. Open ?seed=42&level=20 and play until a weapon pickup appears. Collect it, then collect the
   next pickup while the first weapon is still running. Note the name on the screen and the sound.
2. Open ?weapon=spread+rapid. Fire at a crowd for 10 seconds. Then do the same with
   ?weapon=spread+pierce, ?weapon=spread+orbit, ?weapon=rapid+pierce, ?weapon=rapid+orbit
   and ?weapon=pierce+orbit.
3. Let one combined weapon run out. Note the sound.
4. Collect a third weapon while a pair is active. Note which two ingredients remain.
5. Die with a weapon active. Note that you are back to spread.
6. Open ?drone=homing, then ?drone=detach, ?drone=rapid and ?drone=double, each on
   ?seed=42&level=20. For each, play 20 seconds and note what the drone does and what the
   drone indicator shows.
7. With ?drone=detach on a level with several enemies, note whether the enemies go toward the
   drone, and what happens when the 20 seconds run out.
8. Play ?seed=42&level=20 until a teal drone pickup appears by itself. Note the symbol on it,
   collect it, then collect a second one while the first mode is still running. Note which
   mode is active.
9. With a boss on screen (?seed=42&level=20) use any combined weapon. Note the lowest fps.
Paste back, one answer per line:
build id:
Weapon names shown on screen match what I expect (yes or no):
Hail (spread+rapid): reads clearly different from spread and from rapid (yes or no):
Hail: feels stronger than either part (yes or no):
Trident (spread+pierce): reads clearly different (yes or no):
Trident: feels stronger than either part (yes or no):
Halo (spread+orbit): reads clearly different (yes or no):
Halo: feels stronger than either part (yes or no):
Needle (rapid+pierce): reads clearly different (yes or no):
Needle: feels stronger than either part (yes or no):
Whirl (rapid+orbit): reads clearly different (yes or no):
Whirl: feels stronger than either part (yes or no):
Eclipse (pierce+orbit): reads clearly different (yes or no):
Eclipse: feels stronger than either part (yes or no):
Upgrade sound heard on combining (yes or no):
Upgrade sound is clearly its own sound (yes or no):
Expiry sound heard when a weapon runs out (yes or no):
A second pickup arrived in time to combine without luck (yes or no):
A third pickup kept the newer ingredient (yes or no):
After death the weapon is spread again (yes or no):
The teal drone pickup appeared (yes or no):
The pickup showed a symbol that matched the mode it gave (yes or no):
Homing drone: its shots curve toward enemies (yes or no):
Detach drone: it left the ship and enemies went toward it (yes or no):
Detach drone: it came back by itself when time ran out (yes or no):
Rapid drone: it fires clearly faster than normal (yes or no):
Double drone: a second drone appeared and both fire (yes or no):
Drone arm sound heard (yes or no):
Drone expiry sound heard and quieter than a weapon expiry (yes or no):
A second drone pickup replaced the first mode (yes or no):
Which drone mode is most useful (words):
Which drone mode is least useful or confusing (words):
What I think "weapon drops for the drone" should mean if this is wrong (words):
Which weapon feels weakest today (words):
Lowest fps with a combined weapon during a boss fight, main screen:
Notes:
```

Pass: every pair reads different and stronger (a single "no" is a tuning item for wave E, not a fail), both sounds heard and distinct, death reset ok. Two or more pairs unreadable triggers cut 9 (D7). The drone answers feed D8: a "no" on detach or double (enemies do not go to the decoy, it does not come back, or the second body is confusing) triggers cut 3 and homing and rapid stay; a "no" that names a different reading of "weapon drops for the drone" means cut 4 and a Ryan decision.

### If G3D fails

| Failure | Action | Deadline |
|---|---|---|
| A single weapon differs from v2 | P0. Swarm fix run | before E setup |
| Pairs unreadable | Glow fix run (tints, shapes) first, then cut 9 | 11:55 |
| Second pickup never arrives in time | Table: `COMBINE_DROP_KILLS` as glue | before E setup |
| Sounds missing or clash with other cues | Chorus fix run (`cues.ts` only) | before E setup |
| Enemies ignore the decoy, the drone does not return, or the twin is confusing | Table numbers in `DRONE_MODE_TABLE` as glue (lure range, post distance), then one Swarm fix run; if it persists execute cut 3 (homing and rapid stay) | 11:55 |
| A v2 golden or the flags off identity moved after the decoy retarget | P0. Swarm fix run on `steer.ts` and the chase reads; if it does not restore identity execute cut 3 | before E setup |
| Drone drops wrong or confusing | Execute cut 4 and ask Ryan the reading | 11:55 |
| fps under the bar with a pair | Glow fix run (draw calls), then Swarm trims Hail's life | before E setup |

---

## Wave V3-E: weapon tuning and the High default (T+13:00 to 15:00)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) | Worktree |
|---|---|---|---|---|
| Swarm | opus | feat/swarm-weapon-tuning | `src/game/` (`weapons.ts`, `bullets.ts`, `bosses/table.ts`), `tests/game/` | ../sow-wt/swarm-v3e |
| Glow | opus | feat/glow-weapon-fx | `src/render/`, `tests/render/` | ../sow-wt/glow-v3e |

Ledger and Chorus idle. Setup waits for the G3D paste, because tuning starts from "which weapon feels weakest".

### Design: weapon advantage tuning (Ryan, 42:45)

The ask is "weapon effects and projectile advantages tuned". The plan makes it measurable first, then tunable.

1. Each weapon has one stated advantage and one stated cost.

| Weapon | Advantage | Cost |
|---|---|---|
| spread | Crowds: 3 bullets cover a cone | Low damage on one target at range |
| rapid | One target: the highest sustained damage on a single enemy | Narrow, short lived bullets |
| pierce | Lines: one bullet scores up to 4 hits along a line | Low rate, one bullet at a time |
| orbit | Close defence: blades hit anything within 80 u | Short reach, blades do little at range |

2. A deterministic balance harness in `tests/game/weaponBalance.test.ts` (pure, no render): four scripted scenarios with a fixed ship and aim and no PRNG: a lone target at 300 u, 12 enemies in a 30 deg cone, 6 enemies in a line, 8 enemies in a ring at 100 u. It reports kills in 10 s per weapon and per pair. Targets: each single weapon wins its own scenario by at least 1.3x over the best other single weapon, no single weapon scores under 0.6x of spread in any scenario, and every pair beats its better ingredient in the scenarios of both ingredients. The harness is a measurement, so a failing ratio tells Swarm which table value to move (`WEAPONS`, `COMBO_TABLE`, `styleRadius`).
3. Starting tuning levers: bullet radius and speed per style, pierce hit count, blade radius and cooldown, volley rate. Boss damage per second (`BOSS_DAMAGE`) is checked against the same table: no weapon under 0.8 of spread against a lone boss.
4. Projectile effects (Glow): per style muzzle flash, hit sparks (a pierce hit flares and shows its remaining passes, a rapid hit is a tick, a spread hit is a pellet spark, an orbit hit is a blade spark), bullet size and brightness per style so the advantage is visible, a short trail on pierce and rapid (shed first above 80 percent particle use, as v2). Everything a multiplier on its own layer, capped by tier.
5. High effects tier as the default. The bar is in "Performance budget": average at least 59 and bomb dip at least 50, two warm runs with a boss on screen, main screen. If it holds, Fable's glue changes `EFFECTS_DEFAULT` in `src/render/effects.ts` and `DEFAULT_EFFECTS` in `src/core/settings.ts` to `high` and updates the two tests that pin the default (list them in the glue commit). A stored choice is not changed: the setting is written only when tapped, so Ryan taps High once if his phone holds Standard (Q15, default confirmed).

### Brief: Swarm (weapon tuning)

```text
Swarm: weapon tuning. Branch feat/swarm-weapon-tuning. Worktree ../sow-wt/swarm-v3e.
Read first: docs/12-v3-plan.md "Wave V3-E" and "Wave V3-D" (combo table), the G3D paste Fable
supplies, src/game/weapons.ts, bullets.ts, bosses/table.ts, tests/game/weapons.test.ts.
Own: src/game/ (weapons.ts, bullets.ts, bosses/table.ts), tests/game/.

Task:
1. tests/game/weaponBalance.test.ts: the four scenarios from the plan, kills in 10 s per weapon
   and per pair, the three target ratios asserted, results printed in the test output.
2. Move table values (WEAPONS, COMBO_TABLE, styleRadius, BOSS_DAMAGE) until the targets hold,
   starting with the weapon the G3D paste calls weakest. One commit per table. Spread alone
   stays bit identical to v1 (the v2 golden is unmodified). Record every changed number and why
   in the hand-off, for DECISIONS.
3. No new mechanics. If a target cannot be met by numbers, list it under Known gaps.

Definition of done: npm test and npm run build pass, no any, no new dependency, every existing
test green (a v2 golden for rapid, pierce or orbit may change only if the brief names it: list
each in the hand-off for Fable).
End with the hand-off block.
```

### Brief: Glow (weapon projectile effects)

```text
Glow: weapon projectile effects. Branch feat/glow-weapon-fx. Worktree ../sow-wt/glow-v3e.
Read first: docs/pixi8-cheatsheet.md, docs/12-v3-plan.md "Wave V3-E" (Design points 4 and 5)
and "Performance budget", src/render/bulletStyles.ts, hitFx.ts, trails.ts, particles.ts, effects.ts.
Own: src/render/, tests/render/.

Task:
1. Per style muzzle flash and hit sparks, bullet size and brightness per style, trails for pierce
   and rapid, as in the plan. Pairs inherit from their two ingredients.
2. With a boss on screen at the High tier, find and trim the worst cost (bursts, trails, hazard
   draw) and report desktop Chrome stress(400, 2000) with 4x CPU throttle as a proxy only. This
   feeds D9.
3. Cut 2 note: if Fable cuts this brief to tints only, keep the combined weapon tints (wave D)
   and do item 2 only.
4. Never write bloom, threshold, saturation, glow width or grid base alpha outside applyNeon.

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency.
Tests to add: per style effect parameters as pure tables; caps per tier; trail shedding above
80 percent; neon tests assert the endpoints.
End with the hand-off block.
```

### Merge order and why

1. `feat/swarm-weapon-tuning`: numbers, covered by the harness.
2. `feat/glow-weapon-fx`: render only. Then glue (about 4 lines) for the High default only after the G3E paste meets the bar.

### Gate G3E (14:15 to 15:00)

Fable verifies: the shared gate checks; the harness test exists and passes; every changed number is in the hand-off; `git diff main...feat/swarm-weapon-tuning --stat` stays inside the owned files; v1 spread golden unmodified.

Ryan verifies on device:

```text
V3-GE device check, about 25 minutes. Confirm build id <id>.
1. Open ?weapon=spread, then ?weapon=rapid, ?weapon=pierce, ?weapon=orbit, each on
   ?seed=42&level=20. For each, note how it does against a crowd, a single enemy at range and
   a line of enemies.
2. Fight the level 20 boss with each of the four.
3. Settings > Effects > High. Open ?seed=42&level=50 with Show FPS on. Note the average fps
   through the first 30 seconds of the boss fight, then fire a bomb and note the lowest fps.
   Repeat once without closing the page.
4. Do the same with Effects set to Standard.
Paste back, one answer per line:
build id:
Spread: best against a crowd (yes or no):
Rapid: best against a single enemy (yes or no):
Pierce: best against a line (yes or no):
Orbit: best when enemies are close (yes or no):
Every weapon is useful against the boss (yes or no):
The weapon I would still call weakest (words):
Weapon effects (flash, sparks, size) look better than before (1 worse to 5 much better):
High tier, first run: average fps, then the bomb dip:
High tier, second run: average fps, then the bomb dip:
Standard tier, first run: average fps, then the bomb dip:
Standard tier, second run: average fps, then the bomb dip:
The phone already has High selected (yes or no):
Notes:
```

Pass for tuning: three of four advantage lines yes and no weapon useless against the boss. Pass for the High default: both High runs average at least 59 and the bomb dip at least 50 (D9, cut 6 otherwise).

### If G3E fails

| Failure | Action | Deadline |
|---|---|---|
| A weapon is useless or dominant | One more Swarm run on the named table, or table numbers as glue | before F setup |
| Effects hurt fps | Glow fix run (trails and flashes first) | before F setup |
| High under the bar | Execute cut 6: Standard stays the default, High stays opt in | 15:00 |

---

## Wave V3-F: harden and tag v3.0.0 (T+15:00 to 17:30)

### Agents and ownership

| Nickname | Model | Branch | Owns (exclusive) |
|---|---|---|---|
| Proctor | sonnet | feat/proctor-v3-harden | `tests/qa/`, `docs/qa/`, `docs/device-checklist.md` |
| Fixers: the roster builder whose area holds the most open P0 and P1 (default Swarm, then Glow, then Chorus); up to two | opus | feat/<nickname>-v3-fixes | only the files named in the brief |
| Scribe | sonnet | feat/scribe-v3f-handoff | `docs/STATUS.md` and `docs/DECISIONS.md` drafts, `docs/handoffs/` |

### Brief: Proctor (v3 harden)

```text
Proctor: v3 harden. Branch feat/proctor-v3-harden. Worktree ../sow-wt/proctor-v3f.
Read first: docs/12-v3-plan.md, docs/STATUS.md, docs/device-checklist.md, docs/qa/bugs.md.
Own: tests/qa/, docs/qa/, docs/device-checklist.md.

Task:
1. Triage the G2.1 and G3A to G3E pastes (Fable supplies them) and STATUS open bugs into
   docs/qa/bugs.md, a v3 section: id, P0 to P2, repro, owning directory, owner nickname. By 15:30.
2. tests/qa/: generator sweep over 5000 seeds with enableBosses true and false (false equals the
   v2.1 hash; true equals false for every non boss level); the boss schedule golden (levels 5 to
   50 and the loop, segments 6 to 60); a boss replay for each of the ten bosses (same LevelDef
   and input log, identical boss, part and hazard log over 120 s); weapon replay (same LevelDef,
   kill log and pickup log give an identical drop log and weapon timeline, with the spread
   ingredient); a fairness sweep that runs every boss for 120 s of fuzzed input and asserts the
   plan's fairness rules 5 and 6 and the entity caps; the storage key set has no collisions and
   keeps the sow. prefix; no audio, image or font files except the PWA icons; update the
   ownership audit for the v3 table.
3. docs/device-checklist.md: a v3 section, one line per G3A to G3E item with its pass criteria,
   a result column and a notes column, then v1 and v2 regression lines for touch, fold, offline,
   fps and the Off invariant, then one paste back block "V3-G4" with every field spelled out,
   one per line. By 16:00.
4. Run npm test 10 times; list flakes with file and line. Report bundle size from npm run build
   and flag gzipped JS over 1.5 MB.
Definition of done: bugs.md by 15:30, checklist by 16:00, 10 green runs or flakes listed.
End with the hand-off block.
```

### Brief: fixer (template)

```text
<Nickname>: v3 fixes. Branch feat/<nickname>-v3-fixes. Worktree ../sow-wt/<nickname>-v3f.
Read first: docs/STATUS.md, docs/qa/bugs.md, docs/pixi8-cheatsheet.md.
Own only these files: <Fable lists them>. Everything else is read only.

Task: fix in this order: <Fable pastes P0 then P1 ids>.
One commit per bug: "fix(<id>): <summary>". No refactors, no features. Each fix gets a
regression test in the owning tests/<area>/ directory. Stop at 16:20 whatever the state.
Definition of done: npm test and npm run build pass after every commit.
End with the hand-off block listing fixed and unfixed ids.
```

### Merge order

1. `feat/proctor-v3-harden`: tests and docs only. 2. Fixers, one at a time. 3. `feat/scribe-v3f-handoff`.

### Gate G3F (16:50 to 17:30)

Fable verifies: `npm test` green three runs in a row; no P0 open; every fix has a regression test; flags off golden unchanged (the Off invariant); `docs/STATUS.md` current; the shared gate checks.

Ryan verifies: the v3 section of `docs/device-checklist.md`, about 40 minutes, and pastes the `V3-G4` block. On pass:

```json
{ "type": "shell", "nickname": "fable", "slug": "tag-v3", "cwd": ".", "cmd": "git checkout main && git tag -a v3.0.0 -m 'Shape of War v3.0.0' && git push origin v3.0.0" }
```

### If G3F fails

| Failure | Action | Deadline |
|---|---|---|
| The Off invariant, touch, neon slider or PWA install fails | Fixer continues on that item only | until the credits end |
| Other items fail | Execute the next cut, tag with the cut logged | 17:50 |
| Ryan unavailable or credits about to expire | Tag `v3.0.0-rc1` from the last green gate and log unfinished items; `v2.1.0` stays the rollback | at the moment |

---

## Wave V3-G: render only tilt (conditional, D12; T+17:30 on)

Starts only after v3.0.0 is tagged and Ryan says go (D12). It is the smallest 3D step: nothing in `src/game`, `src/levelgen`, `src/input` or `src/audio` changes, and PixiJS v8 stays. Ryan's ask is 3D rendering and curved arena surfaces (DECISIONS 27:10). A tilt is 3D rendering; it is not a curved surface (that is V3-H).

### Agents and ownership

| Stage | Nickname | Model | Branch | Owns (exclusive) | Worktree |
|---|---|---|---|---|---|
| G0 spike | Glow | opus | feat/glow-tilt-spike | `src/render/` (new `project.ts`), `tests/render/` | ../sow-wt/glow-v3g0 |
| G1 build | Glow | opus | feat/glow-tilt | `src/render/`, `tests/render/` | ../sow-wt/glow-v3g1 |
| G1 build | Ledger | sonnet | feat/ledger-tilt-setting | `src/core/settings.ts`, `src/ui/`, `src/main.ts`, `tests/settings/`, `tests/ui/` | ../sow-wt/ledger-v3g1 |

G1 starts after Fable reads the G0 hand-off and picks the route.

### Design: the tilt

1. What it is. The arena plane is tilted about its horizontal centre line by T degrees and viewed through a perspective camera, so the far wall is smaller and higher than the near wall. The lattice gains a z channel, so kills raise the grid, wells pull it into a funnel and shocks ripple in depth. Entities stay flat 2D shapes that are moved and scaled by depth, not rotated.
2. Setting `sow.settings.tilt`: `off`, `low`, `high`, default `off`. Starting values: low 12 deg, high 22 deg. Off is exactly the v3.0 render (a pure test: `project` at tilt 0 is the identity on x and y).
3. Pure `project(x, y, z, tilt, out)` in `src/render/project.ts`: rotate about the x axis (`y' = y cos t minus z sin t`, `z' = y sin t plus z cos t`), then scale by `D / (D plus z')` with the focal distance D starting at 2.5 times the arena height. No allocation, no PRNG.
4. What is projected: lattice nodes, arena walls and obstacles, entity positions and scale, bullets, particles, geoms. Not projected: the HUD, the sticks, the buttons.
5. The whole arena stays visible (docs/01 section 2.3). The letterbox fit is computed from the projected arena bounds.
6. Touch is unchanged. The sticks are vectors in arena axes (screen axes), so aim keeps its meaning. Foreshortening of the vertical axis makes the drawn aim direction differ from the true one by at most about 2.2 deg at 22 deg tilt and 0.6 deg at 12 deg (computed: the maximum of `theta minus atan(cos t x tan theta)`, not measured). Only the device paste can say whether that feels wrong.
7. Cost budget: up to 8192 lattice nodes plus entities projected in 0.5 ms per frame (starting value, the spike measures a proxy). The lattice caps and the spacing governor are unchanged.
8. Two routes, G0 picks one. Route A: project vertices and transforms on the CPU (the default: shapes stay crisp, no extra pass). Route B: render the arena layer to a `RenderTexture` and show it on a `PerspectiveMesh` (one extra full screen pass, text and thin lines resample and blur). `PerspectiveMesh` and `PerspectivePlaneGeometry` are in the installed 8.22.0 package (`lib/scene/mesh-perspective/`); their API is not read yet.

### Brief: Glow G0 (spike)

```text
Glow: tilt spike. Branch feat/glow-tilt-spike. Worktree ../sow-wt/glow-v3g0.
Read first: docs/pixi8-cheatsheet.md (mandatory, sections 15 and the lattice notes), docs/12-v3-plan.md
"Wave V3-G", src/render/lattice/, renderer.ts, layout.ts, gridGeom.ts, and node_modules/pixi.js
types for lib/scene/mesh-perspective/.
Own: src/render/ (new project.ts), tests/render/.

Task:
1. Read the PerspectiveMesh and PerspectivePlaneGeometry types and source. Say in the hand-off
   whether route B can show a RenderTexture of the arena layer, what it costs (an extra pass),
   and what it does to bloom and thin lines. Say which route you recommend and why.
2. src/render/project.ts: the pure project function and a fit helper that computes the
   letterbox scale from the projected arena bounds. Tilt 0 is the identity on x and y.
3. A desktop Chrome proxy: project 8192 nodes per frame and report the time (a proxy only).
4. Write the cheatsheet section text for docs/pixi8-cheatsheet.md in the hand-off. Do not edit
   the cheatsheet (Fable commits it).
5. Do not wire anything into the renderer yet.

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency.
Tests to add: tilt 0 identity; known points at 12 and 22 deg; the fit keeps the whole arena
inside the safe rect for the 1600 x 1000 Endless arena and an 1800 x 1100 level on both aspect
classes; no NaN at the extremes; monotonic depth.
End with the hand-off block.
```

### Brief: Glow G1 (build)

```text
Glow: tilt. Branch feat/glow-tilt. Worktree ../sow-wt/glow-v3g1.
Read first: docs/pixi8-cheatsheet.md, docs/12-v3-plan.md "Wave V3-G", the G0 hand-off Fable
supplies (the chosen route), src/render/project.ts, src/render/lattice/, renderer.ts.
Own: src/render/, tests/render/.

Task:
1. Add a z channel to the lattice sim, driven by the same impulses as the in plane motion (kills
   up, wells down, shocks), bounded like the in plane displacement. Rest state stays at rest.
2. Apply the chosen route to the lattice, walls, entities, bullets, particles and geoms. Export
   setTilt(level) and getTilt(), default 'off'. Off takes the existing code path untouched.
3. Boss hazards and the Prism shimmer project like entities. Do not change boss shapes.
4. applyNeon stays the only writer of glow width and grid base alpha. Depth may scale line alpha
   as a multiplier on the lattice layer only.
5. Report desktop Chrome stress(400, 2000) with 4x CPU throttle at off, low and high as a proxy.

Definition of done: npm test and npm run build pass, no any, no v7 APIs, no new dependency, no
per frame allocation, no per frame Graphics.clear for lattice lines.
Tests to add: z channel at rest, impulse decay, bounded over 20 s of fuzzed impulses; off equals
the v3.0 positions for a recorded frame; whole arena visible for both aspect classes at both
tilts; neon tests assert the endpoints.
End with the hand-off block.
```

### Brief: Ledger (tilt setting)

```text
Ledger: tilt setting. Branch feat/ledger-tilt-setting. Worktree ../sow-wt/ledger-v3g1.
Read first: docs/12-v3-plan.md "Wave V3-G" and Appendix B, src/core/settings.ts (glowPath and
effects are the pattern), src/ui/settings.ts, src/main.ts.
Own: src/core/settings.ts, src/ui/, src/main.ts, tests/settings/, tests/ui/.

Task: sow.settings.tilt ('off' | 'low' | 'high', default 'off', invalid gives 'off', every access
in try/catch), a "Perspective tilt" row with three buttons, 44 CSS px minimum hit height, saved on
tap, reachable from the menu and the pause screen, and one effects port call setTilt(level) that
Fable glue wires to Glow's export. The same literal union is declared here on purpose.
Definition of done: npm test and npm run build pass, no any, no new dependency.
Tests to add: tests/settings/tilt.test.ts (default off, round trip, invalid and null fall back,
storage throwing); tests/ui/settings.test.ts additions (button state, a tap saves and calls the
effect once, pause path).
End with the hand-off block.
```

### Merge order and gate G3G

G0 first (read by Fable, merged), then `feat/glow-tilt`, then `feat/ledger-tilt-setting` and glue (about 4 lines) wiring `setTilt`.

Fable verifies: the shared gate checks; `git diff main...feat/glow-tilt --stat` stays inside `src/render/` and `tests/render/`; tilt Off positions equal v3.0 (the pure test); the DoD v7 grep prints nothing.

Ryan verifies on device:

```text
V3-GG device check, about 15 minutes. Confirm build id <id>.
1. Settings > Perspective tilt. Play ?seed=42&level=20 for 2 minutes on Off, Low, then High.
2. On High fire at the far wall and at the near wall. Note whether your shots go where you aim.
3. Fire a bomb and kill a crowd. Look at the grid.
4. Fight the level 20 boss on High with Show FPS on.
5. Fold and unfold with tilt on.
Paste back, one answer per line:
build id:
Low: depth reads and looks good (1 not at all to 5 very):
High: depth reads and looks good (1 not at all to 5 very):
High: comfortable to play (1 uncomfortable to 5 fine):
Shots go where I aim on High (yes or no):
Whole arena visible on the cover screen at High (yes or no):
Whole arena visible on the main screen at High (yes or no):
Grid depth on kills and bombs looks like a real surface (1 flat to 5 real):
Average fps, Off, main screen:
Average fps, Low, main screen:
Average fps, High, main screen:
Lowest fps during the boss fight on High:
Fold and unfold keep the tilt without a reload (yes or no):
Notes:
```

Pass: comfortable 4 or better and aim yes, the whole arena visible, fps within 2 of Off. D13 reads this paste.

### If G3G fails

| Failure | Action | Deadline |
|---|---|---|
| Aim feels wrong on High | Lower the High tilt as a table value, or drop High (Low only) | before D13 |
| fps under the bar | Glow fix run (node count, depth alpha), then fall back to Route A if on B | before D13 |
| The arena is cut off | Glow fix run (fit helper) | before D13 |
| Ryan rates depth under 3 | Stop here: tilt stays an opt in setting, V3-H is a no go | D13 |

---

## Wave V3-H: cylinder surface (conditional, D13)

Starts only on a go at D13. Everything curved beyond the cylinder (torus, sphere, capsule, twisted band) stays parked, and so does Three.js. This section is an outline: Scribe drafts the full briefs after D13, from docs/09 sections 2 and 4 and the G3G paste, so they do not go stale.

Why the cylinder. It is the smallest real curved surface: u wraps (docs/09 section 2.2, `(R cos theta, v, R sin theta)`), v keeps walls, and the `surface: 'flat'` hook and `src/core/surface.ts` already exist. The projection from V3-G is reused for drawing. The cost of a surface is not the drawing, it is `Surface.delta` in every seek, collision, pull and orbit in `src/game` (docs/09 section 2.3). Shared rule 4 (boss code uses `steer.ts` helpers) exists so bosses are not an extra bill.

| Nickname | Model | Owns (exclusive) | Work |
|---|---|---|---|
| Forge | opus | `src/core/surface.ts`, `src/game/world.ts`, `ship.ts`, `bullets.ts`, `collide.ts` | `Surface` for flat and cylinder, wrap in the world step, wrapped spatial hash |
| Swarm | opus | `src/game/enemies/`, `src/game/bosses/`, `drones.ts`, `supers.ts` | Every raw subtraction through `delta` (the boss files already use steer helpers) |
| Foundry | opus | `src/levelgen/`, `tests/levelgen/` | A salted surface stream, band weights, `surface: 'cylinder'`, validator, a version bump. Boss levels stay flat (boss hazards assume a plane) |
| Glow | opus | `src/render/` | Cylinder drawing from the G projection, seam handling |
| Thumbs | sonnet | `src/input/` | Tangent frame stick rotation if the camera rolls (docs/09 section 2.4); none if the cylinder keeps screen axes |

Gate G3H (outline): fly across the seam five times with no jump and enemies following across it; aim straight up while the surface curves; fold and unfold mid level; the same level hash on retry; fps main. The paste is spelled out one field per line like the others.

Cost: $24 to $43 (section "Cost"). Clock: about 5 hours. It is credit gated: no go if the pool cannot cover the high estimate.

If D13 is no go, v3 ends at the tilt or at v3.0.0, and docs/09 sections 1, 2 and 4 stay parked, not cancelled (DECISIONS 27:10).

---

## Session hygiene

Same as docs/05: split Fable's session at every landing boundary (T+0:40, 4:00, 6:30, 10:00, 13:00, 15:00, 17:30, and after G and H) with the one line "Resume Shape of War from docs/STATUS.md". Scribe drafts the STATUS update on `feat/scribe-v3<w>-handoff` owning only `docs/STATUS.md`, `docs/DECISIONS.md` and `docs/handoffs/`. Clean up worktrees one shell job per merged branch (docs/05 pattern, worktrees under `../sow-wt/`). STATUS gains the rows "v3 gate log" and "Cuts taken (v3)". The first paste of every gate is quoted verbatim in the gate log.

## Questions for Ryan

Ryan answered on 2026-10-29 (DECISIONS 46:00): Q1 to Q6, Q10 and Q13 below, and he confirmed the defaults of the rest. His reply numbers the questions differently from this list from Q4 on (his Q4 is scoring, his Q5 projectiles, his Q6 drone drops, his Q7 weapon names), so each answer is mapped by content and says so. docs/12's Q7 (boss names and colours) has no matching line in his reply and keeps its default. Fable confirms the mapping. Each question keeps its text; the answer replaces the old bracketed default.

1. Which levels have a boss? **Answered yes:** every 5th level, 5 to 50, the top boss at 50, then a loop from tier 2 with 25 percent more health per pass.
2. One boss per boss level, or ever two? **Answered yes:** one. Twins is one boss with two bodies.
3. Endless: first boss at 3:00 of wave clock, then every 3 minutes, the wave clock paused while it lives, the reward score and geoms only? **Answered yes.**
4. Boss health and timers: confirm the hit point column (360 to 1000 spread hits), the fight lengths (20 to 56 s of open fire, Prism about 117 s), an enrage after 90 s and no failure timer. **Answered yes to all** (reply Q4, "yes to all").
5. What happens to score and stars on a boss level? **Answered yes** to the plan default (his Q4): the objective holds at success until the boss dies, the kill is a flat bonus of 25 percent of par not multiplied, stars come from the final score at the unchanged par.
6. Should bosses shoot aimed projectiles? That is a new bullet pool, collision path and render path, and it lifts the enemy bullet cut. **Answered no to the default (his Q5):** bosses may shoot projectiles, but not all of them, and each shooter must be balanced against its other traits. The cut is lifted for bosses only and an enemy bullet pool, collision and render path are in scope: capped, deterministic, cleared by a bomb, killing the ship on contact unless it is invulnerable, telegraphed, slow enough to dodge under High physics and never homing. This plan puts them on three bosses, spread across tiers: Spindle (tier 1), Ember (tier 2), Bastion (tier 3). Section "Design: boss projectiles".
7. Boss names, and the tier colours: tier 1 blue, green, yellow; tier 2 orange, magenta, violet; tier 3 three reds with thick glow; tier 4 shimmering multicolour. Working names (Warden, Brood, Spindle, Ember, Mirage, Gravitas, Bastion, Tempest, Twins, Prism) are placeholders. **Default confirmed:** keep the colours; Ryan names. (His reply under Q7 keeps the combined weapon names, which is Q10.)
8. Should a boss drop anything beyond 20 geoms (a weapon, a life, a bomb)? **Default confirmed:** no.
9. Bomb versus boss: no damage, clears adds and hazards, staggers it 1.5 s. Detonate: 10 percent of its hit points. **Default confirmed:** as written, and the bomb also clears enemy bullets.
10. Names for the six combined weapons. **Answered (his Q7):** keep Hail (spread+rapid), Trident (spread+pierce), Halo (spread+orbit), Needle (rapid+pierce), Whirl (rapid+orbit), Eclipse (pierce+orbit).
11. Should spread be droppable while another weapon is active, so the three pairs with spread can exist? **Default confirmed:** yes.
12. Combination rules: pairs only, 20 s, a third pickup replaces the older ingredient, the next drop within 12 kills while a weapon is active. **Default confirmed:** as written.
13. "Weapon drops for the drone": what do you mean? **Answered (his Q6):** a separate pickup that arms the drone for 20 s with one of four modes. Homing: the drone's shots home. Detach: the drone leaves the ship and acts as a decoy that enemies prefer to target, and returns at expiry. Rapid: the drone fires fast. Double: a second drone body for the duration. Enemy targeting must support a decoy. A new drone pickup replaces the old mode. Section "Design: drone pickups".
14. Which weapon feels weakest today, and which projectile effects should change (size, colour, trail, flash)? **Default confirmed:** Swarm tunes the weakest first; Glow does flash, sparks, size.
15. High tier default: you asked for it when it holds 60 fps. D8 accepted an average of 59 for Standard, so the bar here is an average of at least 59 and a bomb dip of at least 50, two warm runs, a boss on screen. Do you want a strict 60 instead? Does your phone already store an Effects choice? **Default confirmed:** the 59 and 50 bar. You tap High once if the phone holds Standard.
16. After v3.0.0, go on the render only tilt (D12)? Tilt amounts 12 and 22 deg? **Default confirmed:** go if credits allow. Low 12, High 22.
17. Are there credits beyond the second $200? **Default confirmed:** no. The plan assumes $200 less v2.1 spend.
18. Tag `v2.1.0` after G2.1 passes? **Default confirmed:** yes.
19. Hazards on boss levels: no spawners and at most one gravity well. **Default confirmed:** yes.

## Known gaps in this plan

- Every boss number (hit points, speeds, timings, counters) is a starting value. Nothing is measured on the Fold. Boss fairness and fun are judged only by Ryan's pastes.
- Boss fights are not checked per Space physics level. G3A asks which level Ryan has selected, nothing more.
- Boss projectiles are three of ten bosses only (Q6). No shoot down (player bullets pass through enemy bullets), no homing or aimed-with-lead bullets, no per boss bullet sound beyond one shared shot blip, Prism does not quote the shooters, and dodging is checked per Space physics level only as the High arithmetic, never on a device before G3B. No boss drops beyond geoms, no boss practice mode, no per boss best time, no intro skip.
- Saved bests for levels 5, 10 and so on were set without a boss and stay. Reset progress exists.
- Boss rings, lanes and sweeps assume a flat plane. If V3-H goes ahead boss levels stay flat. Curved boss fights are not designed.
- Drone pickups (Q13): the mode is random from the salted hash, not chosen, and there is no pierce mode. A detached drone of any type only holds its post and fires (a Collect drone does not vacuum there, a Ram drone does not charge). The lure range of 640 u, the post distance of 280 u and the 10 volleys a second of rapid are guesses. Boss movement and bullet aim follow the decoy and boss hazards do not, which is a reading Ryan has not seen. The drone cannot combine modes or weapons.
- No sound for collecting a pickup, no low time warning before a weapon expires, no per combination sound. Only upgrade, expiry and drone arm.
- Combined weapons are distinguished by tint, not by new sprites.
- The weapon balance harness measures four scripted scenarios. It does not measure feel.
- A stored effects choice survives the High default flip.
- V2-03 (the Low tier read below Standard at GD and again at GE, 55/52 against 59/59) and V2-08 (addendum wording on the 59 fps average) from docs/qa/bugs.md are still open and do not block v3.
- The tilt is render only. Aim stays in arena axes and the foreshortening error (about 2.2 deg at 22 deg) is computed, not tested on a device.
- `PerspectiveMesh` is present in 8.22.0 but unread. Route B is unproven.
- No Three.js, no torus, sphere, capsule or twisted band. If a later plan wants them it starts from docs/09 section 4 and its roughly 78 agent hour estimate.
- Boss music is judged by Ryan only. The tier scales are a starting design.
- Cost: no run has gone above $8.04. Boss runs may hit the $12 cap. The reserve assumes so.
- docs/13 is drafted (branch feat/scribe-v3-addendum, revised for Ryan's answers) and is not canon until Fable commits it (D1). Appendix A lists what it carries.
- Ryan's reply numbering differs from this plan's from Q4 on (bad news item 14). The mapping by content is Scribe's reading and Fable confirms it.

## Appendix A: v3 SPEC addendum list (docs/13, drafted by Scribe in V3-W0, committed by Fable)

docs/13 follows the shape of docs/11: a header, a builder reading rule (on a v3 branch, "SPEC.md is canon" and "no feature outside docs/01" mean SPEC.md, docs/01, docs/11 and docs/13), a permitted features list and one clause per item below. Where docs/13 and docs/11 conflict on a v3 branch, docs/13 wins. A v3 branch is any branch cut from main after docs/13 is committed and before tag v3.0.0.

| Clause | What docs/13 adds or replaces |
|---|---|
| Permitted v3 features | The complete list: bosses (with slow projectiles on three of them), weapon combining and drone pickups (four modes), weapon tuning, the High default, and (each behind its own go) the render only tilt and the cylinder. Nothing else |
| SPEC 3.3 generator | The optional `boss` field on `LevelDef` and `EndlessSegmentDef`, `GenConfig.enableBosses` (default on), `GENERATOR_VERSION_V3` 3 on boss levels only, invariant J7. Replaces docs/11 SPEC 3.4 rule 3's "levels 1 to 5 keep their hashes" with "every non boss level keeps its v2.1 hash, flag off is byte identical to v2.1". Boss levels carry no spawners and at most one well. `LEVELDEF_VERSION` stays 1 |
| SPEC 3.4 Bosses (new) | The boss entity class, `Kind.Boss`, `BossPart`, `BossHazard`, ten ids, four tiers and colours, the schedule table, the five hazard primitives, rules 1 to 14 of "Wave V3-A", the "Boss projectiles" clause (the enemy bullet pool, the three shooters and what each trades, the dodge rule, the render path), the roster table with Ryan's names and hit points. Bosses are never in a roster and have no `EnemyKind` |
| SPEC 3.5 weapons | Replaces docs/11 SPEC 3.5 rule 4 ("a different one replaces it") with the combining rules, adds spread to the drop pool while a weapon is active, the six pairs and their numbers, `COMBINE_DROP_KILLS`, the "Drone pickups" clause (four modes, 20 s, the decoy targeting rule, the double drone slot, stacking: a new pickup replaces the old mode; D8), and the bomb exception (a bomb does not damage a boss and clears enemy bullets) |
| SPEC 3.6 scoring | Boss kill bonus: flat 25 percent of par rounded to 500, never multiplied. Parts and hazards score 0. Adds score normally. The boss counts 1 for a destroy objective |
| SPEC 3.7 cuts | Lifts bosses, and enemy bullets for Spindle, Ember and Bastion only (Ryan, Q6). Enemy bullets from anything else stay cut. docs/09 sections 1, 2 and 4 stay parked except V3-G and V3-H behind D12 and D13. A Three.js migration stays cut. v3 cut order is docs/12 "Cut order" |
| SPEC 3.8 effects | High as the default when the bar holds, the boss layer line weight multipliers (1.6, 2.0, 3.0, 2.4) as multipliers on their own layer, the lattice z channel and the tilt (V3-G only), `applyNeon` unchanged |
| SPEC 3.9 music | Boss music (Design: boss music): entry, phase and defeat stingers, ducking, motifs as a pure function of (boss id, phase, bar), replacing docs/11 SPEC 3.9 rule 3 for bosses only |
| SPEC 5 performance | The fps bar with a boss alive (average 59, lowest 55) and the High default bar |
| SPEC 7.3 roster | No new nickname. Chorus owns `src/audio/` in waves B to D. Forge owns three enemy bullet files in wave A (a file level carve out of Swarm's directory). The ten nicknames of docs/11 stand |
| docs/01 overrides | 2.2 Endless (the wave clock pause), 4.2 weapon (combos), 4.3 bombs (boss exception, clears enemy bullets), 4.4 drones (armed drone, four modes, the decoy), 4.5 supers (Detonate against a boss and a detached drone), 6 catalogue (bosses outside it, stats in docs/13, chasers follow the decoy), 7 lives (death clears enemy bullets), 8 objectives (the hold rule), 9 HUD (boss bar and drone indicator inside the top band), 11 palette (boss keys), 12 particles (boss death burst cap and the shake source), 13 audio (weaponCombine, weaponExpire, droneArm, droneExpire, boss cues including the shot blip), 14 cut list (bosses lifted, enemy bullets lifted for three bosses, the rest unchanged) |
| docs/11 amendments | The Off invariant extended (enableBosses off, pickups off and tilt off equal v2.1). SPEC 8 is v1 only, docs/10 is v2, docs/12 is v3 |
| Settings keys | `sow.settings.tilt` (V3-G only). No other key. Defaults of existing keys change only for effects, and only after D9 |
| Bus additions | Appendix B |
| Engineering rules that stay | Every v1 and v2 rule, plus shared rule 4 (boss code uses `steer.ts` helpers and `targetOf`) and shared rule 5 (tables for numbers, now including `BOSS_SHOTS` and `DRONE_MODE_TABLE`) |

## Appendix B: settings keys and bus events added

Settings (every read and write in try/catch with a default, docs/03 section 8; the `glowPath` pattern):

| Key | Values | Default | Owner | Wave |
|---|---|---|---|---|
| `sow.settings.tilt` | `off`, `low`, `high` | `off` | Ledger | G (conditional) |

No other setting is added. The effects default changes from `standard` to `high` only after D9, and only in the code defaults.

Bus events, additive to `src/core/events.ts`, stubbed at V3-W0:

| Event | Payload | Emitter | Consumers |
|---|---|---|---|
| `sim:bossEnter` | `{ id: BossId; tier: BossTier }` | Swarm (A) | Chorus, Glow, Ledger |
| `sim:bossPhase` | `{ id: BossId; phase: number; phases: number }` | Swarm (A) | Chorus, Glow |
| `sim:bossDown` | `{ id: BossId; x: number; y: number }` | Swarm (A) | Chorus, Glow, Ledger |
| `hud:boss` | `{ id: BossId; hp: number; maxHp: number; phase: number; phases: number; mode: number }`, at most every 100 ms and on change | Swarm (A) | Ledger |
| `fx:bossShot` | `{ x: number; y: number; id: BossId }`, once per volley at launch | Swarm (B) | Chorus, Glow |
| `fx:weaponCombine` | `{ x: number; y: number; kind: ComboKind; a: BaseWeaponKind; b: BaseWeaponKind }` | Swarm (D) | Glow, Chorus |
| `fx:weaponExpire` | `{ kind: WeaponKind }`, the ship's weapon only | Swarm (D) | Chorus, Glow |
| `fx:droneArm` | `{ x: number; y: number; mode: DroneMode }`, on collection, also on a replacement | Swarm (D) | Glow, Chorus |
| `fx:droneExpire` | `{ x: number; y: number; mode: DroneMode }`, when the 20 s run out (not on death or replacement) | Swarm (D) | Chorus, Glow |
| `hud:droneWeapon` | `{ mode: DroneMode; remaining: number; total: number }`, at most every 100 ms and on change | Swarm (D) | Ledger, Glow |

Extended, not new: `hud:weapon.kind` and `fx:pickup.weapon` are `WeaponKind`, which now includes the six `ComboKind` values. `fx:hit` is unchanged and carries `Kind.Boss` for a boss. `fx:dronePickup` of the first draft is replaced by `fx:droneArm`, and `fx:weaponExpire` lost its `drone` flag because the drone has its own expiry event. Payload objects are reused by the sim, so handlers copy what they need.

Types and values (stubbed at V3-W0): `Kind` appended `Boss, BossPart, BossHazard, DronePickup, DroneTwin`; `BOSS_IDS` (`warden, brood, spindle, ember, mirage, gravitas, bastion, tempest, twins, prism`), `BossId`, `BossTier` (1 to 4), `BossSpec { id; tier; atSec; hpMul }`; `BaseWeaponKind` (`spread, rapid, pierce, orbit`); `ComboKind` (`spread+rapid, spread+pierce, spread+orbit, rapid+pierce, rapid+orbit, pierce+orbit`); `WeaponKind = BaseWeaponKind | ComboKind`; `DroneMode` (`homing, detach, rapid, double`) and `DRONE_MODES`; palette keys `bossBlue, bossGreen, bossYellow, bossOrange, bossMagenta, bossViolet, bossRed, bossPrism, dronePickup`; `BulletPool.combo` (Swarm, wave D); `GenConfig.enableBosses`, `GENERATOR_VERSION_V3`. Also stubbed in `src/game/`: the enemy bullet module (`ENEMY_BULLET_CAP` 32, `ENEMY_BULLET_SPEED_MAX` 240, `ENEMY_BULLET_MIN_RANGE` 300, `EnemyBulletPool`, `enemyBulletsOf`, `spawnEnemyBullet`, `stepEnemyBullets`, `clearEnemyBullets`) and `targetOf(w, id)` in `steer.ts`.

Hazard fields (render contract, wave A): `Kind.BossHazard` uses `w.a`, `w.t`, `w.rot`, `w.radius`, `w.vx`, `w.vy` as the hazard table in wave A defines. They are not bus events. Enemy bullets are read through `enemyBulletsOf(w)` (wave A render contract), and a `Kind.DronePickup` carries its mode index in `w.a` (wave D).

