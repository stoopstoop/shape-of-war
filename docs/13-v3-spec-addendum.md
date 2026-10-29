# Shape of War: v3 SPEC addendum

This file extends SPEC.md and docs/11-v2-spec-addendum.md for v3 branches only. A v3 branch is any branch cut from main after this file is committed and before tag v3.0.0. For the two conditional clauses only ("Render only tilt" and "Cylinder surface") a v3 branch is also any branch cut after the matching go is logged in docs/DECISIONS.md (docs/12 decisions D12 and D13). Tags v1.0.0, v1.1.0 and v2.0.0 and the v1 and v2 documents are unaffected. "v2.1" below means main when gate G2.1 passes, tagged v2.1.0 if Ryan agrees (default, Q18).

Where a heading below names a SPEC, docs/01 or docs/11 clause and gives replacement or added wording, this file wins for v3 branches. On any conflict not listed here, SPEC.md wins, and docs/11 governs v2 behaviour. Style rules are SPEC.md's: no em or en dashes, sentence case headings, terse prose, bad news first.

Status: draft by Scribe, 2026-10-29, from docs/12 Appendix A. Not canon until Fable commits it (docs/12 decision D1). Ryan has not answered docs/12 "Questions for Ryan". Every line that rests on one is marked "(default, Q<n>)" and uses the bracketed default of docs/12 question n: Q1 to Q16 and Q19. Q17 (credits beyond the second $200) has no clause. Q18 (tag v2.1.0) appears only in the paragraph above. Unmarked lines rest on Ryan's own asks (DECISIONS 27:10 and 42:45) or on docs/12 starting values, which the gates tune. Fable edits marked lines after Ryan answers (`grep -n "default, Q" docs/13-v3-spec-addendum.md` lists them).

Builder reading rule: on a v3 branch, CLAUDE.md's "SPEC.md is canon" and "No feature outside docs/01" mean SPEC.md, docs/01-game-design.md, docs/11 and this file, as amended by this file. Anything this file does not permit stays out of scope.

## Flags for Fable (delete after review)

1. Endless has no par (`par: 0`, src/game/endless.ts), so the plan's boss bonus of 25 percent of par is 0 there. docs/12 question 3 says the Endless reward is "score and geoms only" but gives no score value. SPEC 3.6 below states the formula result (bonus 0, plus 20 geoms) and marks it (default, Q3). A real Endless bonus needs a fixed value from Ryan.
2. Mirage and Prism phase 3 each emit eight lane hazards in one burst, and docs/12 boss rule 5 caps live hazards at 6 (the Performance budget table repeats 6). The draft keeps the cap as written and marks the line. One of two edits is needed before wave A: a cap of 8 for lane bursts (recommended: two more entities, far inside `ENTITY_CAP` 512), or a burst built as one entity.
3. docs/12 Appendix A ends a v3 branch at tag v3.0.0, but V3-G and V3-H start after it. The header extends the definition for the two conditional clauses only.
4. docs/12 Appendix A's docs/01 override list omits sections 2.2 (Endless wave clock pause), 4.4 (armed drone), 4.5 (Detonate against a boss) and 7 (the death clear leaves the boss). Each is a one line consequence of rules docs/12 already states, so the draft adds them. Delete if unwanted.
5. docs/11 SPEC 5 still says a strict 60 (docs/qa/bugs.md V2-08). The SPEC 5 replacement below states the 59 average Ryan accepted at D8 (DECISIONS 35:50) for every tier. That closes V2-08 for v3 branches. docs/11 itself is untouched.
6. Readings docs/12 does not state, each marked "Scribe reading" in the text: a spread pickup collected with no weapon active does nothing; a refresh changes the timer only, never the collection order; a pair that changes ingredients counts as a combination for the upgrade sound; gravity wells do not pull a boss, a part or a hazard; stored boss hit points clamp at 32767 tenths (`Int16Array`, Prism overflows at `hpMul` 3.5, which is pass 11); the 500 rounding is half up.
7. docs/01 9.1 top band on the cover screen is 52 px and already holds the objective bar (offset 8), the par line (28) and the Endless wave label (42). docs/12 puts the boss bar and the drone indicator "inside the existing top band" and gives no slot. The HUD override below keeps that wording; Ledger's no overlap tests decide the slot and report under Requests if it does not fit.

## Permitted v3 features (the complete list)

v3 permits these features, in Ryan's priority order, and nothing else:

1. Bosses: a Boss class of ten bosses in four colour tiers, one per boss level in Adventure and periodic in Endless (SPEC 3.3, 3.4, 3.6, 3.9).
2. Weapon combining and drone weapon drops: six combined weapons, an upgrade sound, an expiry sound, and a pickup that arms the drone (SPEC 3.5).
3. Weapon tuning: advantage tuning and projectile effects per style (SPEC 3.5, 3.8).
4. The High effects tier as the default, only when it holds the bar in SPEC 5 (SPEC 3.8, 5).
5. Render only perspective tilt, behind its own go (section "Render only tilt", decision D12).
6. Cylinder surface, behind its own go (section "Cylinder surface", decision D13).

Each feature is built to the starting values in docs/12. Number tuning goes to docs/DECISIONS.md. A change to a rule in this file needs an edit to this file first. Features 5 and 6 are not cuts: declining either leaves v3.0.0 complete.

## SPEC 3.3 Level generator

SPEC 3.3's hard rule stands: generator output is a plain JSON serialisable LevelDef, and simulation and render never call the PRNG. Added:

1. `LevelDef` and `EndlessSegmentDef` gain an optional `boss?: BossSpec`, where `BossSpec = { id: BossId; tier: BossTier; atSec: number; hpMul: number }`. The field is absent on every level that is not a boss level. `LEVELDEF_VERSION` stays 1. `surface: 'flat'` and `src/core/surface.ts` are unchanged unless the cylinder clause goes live.
2. `GenConfig.enableBosses` defaults on (default, Q1). `V1_GEN_CONFIG` sets it false. A new `V2_GEN_CONFIG` has `enableV2Enemies` on and `enableBosses` off, so the v2 pins and sweeps keep their hashes.
3. Flag off: `generateLevel` and `generateEndless` output is byte identical to v2.1 for every seed.
4. Flag on: only boss levels differ. A boss level carries the `boss` field and `generatorVersion` 3 (`GENERATOR_VERSION_V3`, boss levels only). Every non boss level keeps its v2.1 hash. This replaces docs/11 SPEC 3.4 rule 3's "Levels 1 to 5 ... keep their v1 hashes": level 5 is a boss level, so its hash changes when the flag is on. Levels 1 to 4 and every non boss level keep theirs.
5. Boss levels carry no spawners and at most one gravity well (default, Q19). Foundry applies this as a deterministic post step on boss levels only: spawners are removed and wells beyond the first are removed.
6. The generator draws nothing new. The boss schedule is a table lookup in `src/levelgen/boss.ts` (`BOSS_EVERY`, `BOSS_SCHEDULE`, `bossForLevel`, `bossForSegment`), pure, no PRNG.
7. `validateLevel` accepts the field and adds invariants: B1 a boss is present exactly when `bossForLevel` says so; B2 the id is in `BOSS_IDS` and the tier matches; B3 `atSec` is 20 for a level, and a survive or scoreInTime level has at least 20 s left after it; J7 flag off output has no boss field.
8. Boss levels are different levels from the ones Ryan has played. Saved bests for levels 5, 10 and so on were set without a boss and stay. Progress keys survive. Reset progress exists.

## SPEC 3.4 Enemy catalogue: bosses

SPEC 3.4's eight rows and docs/11's six enemies and two hazard entities are unchanged. Bosses lift one line of docs/01 section 14 and are a separate class: never in a roster, no `EnemyKind`, never chosen by weight. Add these rows:

| Name | Behaviour | Colour family |
|---|---|---|
| Boss (`Kind.Boss`, ten ids) | One large named enemy, body radius 44 to 90 u. Moves on its own pattern, attacks only with analytic hazards, summons of existing enemies and drops of Mine and Slime, and takes damage only through its own counter rule. Contact kills the ship once its entrance ends | By tier, next table |
| Boss part (`Kind.BossPart`) | A pod, anchor or turret that gates damage to the core. Counts 0 kills, scores 0 | Boss tier colour |
| Boss hazard (`Kind.BossHazard`) | Lethal or pulling geometry made by a boss: lane, ring, sweep, tether or pull. Telegraphed first. Not an enemy: no score, no geoms, no kill | Boss tier colour |

New `Kind` values are appended after `Slime`: `Boss, BossPart, BossHazard, DronePickup`. Existing values do not change.

### Tiers and colours

| Tier | Colour (default, Q7) | Bosses | Hazard telegraph | Ring gap | Boss layer line weight |
|---|---|---|---|---|---|
| 1 | blue, green, yellow | 3 | 1.0 s | at least 60 deg | x1.6 |
| 2 | orange, magenta, violet | 3 | 0.8 s | at least 60 deg | x2.0 |
| 3 | bright red with thick glow lines | 3 | 0.6 s | at least 45 deg | x3.0 and a wider outer glow stroke |
| 4 | shimmering multicolour | 1 | 0.6 s | at least 45 deg | x2.4 and the shimmer |

Ryan's own asks (DECISIONS 42:45): tier 1 blue, green or yellow as the weakest, bright red with thick glow as the second from top, a shimmering multicolour top boss. The three tier 2 colours and the three reds of tier 3 are the plan's (default, Q7). Palette keys are in "Settings keys and bus additions"; no hue is fixed here, Glow tunes them against docs/01 section 11.

### Schedule (default, Q1)

A level is a boss level when `levelIndex % 5 === 0` (`BOSS_EVERY` 5) (default, Q1). One boss per boss level (default, Q2): Twins is one boss, two bodies sharing one phase counter, and its kill and bonus count once.

| Adventure level | Boss id | Tier |
|---|---|---|
| 5 | warden | 1 |
| 10 | brood | 1 |
| 15 | spindle | 1 |
| 20 | ember | 2 |
| 25 | mirage | 2 |
| 30 | gravitas | 2 |
| 35 | bastion | 3 |
| 40 | tempest | 3 |
| 45 | twins | 3 |
| 50 | prism | 4 |

After level 50 the list repeats from Ember in passes of seven bosses (default, Q1). Pass 2 is levels 55 to 85 (ember to prism) with `hpMul` 1.25, pass 3 repeats them at 1.5, and each pass adds 0.25. Pass 1 has `hpMul` 1. `atSec` is 20 s on the wave clock for Adventure.

### Endless cadence (default, Q3)

`bossForSegment(s)` returns a boss when segment `s` is a positive multiple of 6 (default, Q3). Segments last 30 s, so the bosses arrive at 3:00, 6:00 and 9:00 of wave clock and every 3 minutes after. The Endless boss number `j = s / 6` walks the same list with the same pass rule (the first is warden, the tenth is prism). `atSec` is 10 s after the segment start. While an Endless boss lives the wave clock is paused and no wave spawns, so segments and bosses never stack. The Endless arena stays the fixed 1600 x 1000 rectangle.

### Boss rules (all ten)

1. Entities. Parts that must be destroyed (Brood pods, Gravitas anchors, Bastion turrets, Prism nodes) are `Kind.BossPart`. Lethal geometry and the pull are `Kind.BossHazard`. Adds are ordinary enemies (Grunt, Dart, Bulwark) spawned through the normal spawn path.
2. Hit points (default, Q4). `w.hp` is an `Int16Array` holding tenths of a hit: 3600 is 360 spread hits. `BOSS_TABLE` holds the values in the roster table. `hpMul` from `BossSpec` multiplies them. Stored hit points clamp at 32767 (Scribe reading, flag 6).
3. Entrance. At `boss.atSec` on the wave clock (which pauses during the respawn delay) a telegraph ring shows for 2.0 s, harmless and untargetable. The boss slides in from the wall point farthest from the ship. A name banner shows. Contact with the body kills the ship once the entrance ends.
4. Waves. In Adventure the wave schedule keeps running at 0.6 of its spawn budget while a boss lives. Par and stars are unchanged. In Endless the wave clock is paused instead (section "Endless cadence").
5. Fairness (tests assert these). Every lethal hazard shows its tier telegraph (tier table) before it can kill. A ring has a gap of at least the tier's ring gap. A lane is at most 60 u wide. A sweep leaves gaps of at least 90 deg. A lethal hazard is never created overlapping the ship: it waits 0.3 s and rechecks. Invulnerability after respawn is honoured by every hazard. At most 6 live hazards (flag 2), 8 live adds and 4 parts. `ENTITY_CAP` and `maxLiveEnemies` are hard caps: a spawn that returns -1 is skipped, never thrown.
6. Ship death. The v1 arena clear applies to adds and hazards. The boss keeps its hit points. Boss attacks pause during the 1.5 s respawn delay and its cycle restarts at its first state.
7. Bomb and supers (default, Q9). A bomb clears adds, Mines, Slime and live boss hazards, staggers the boss for 1.5 s (it stops attacking, stays vulnerable) and does no damage. Detonate does 10 percent of the boss's maximum hit points if the boss is within 260 u of the drone. Homing steers shots at the boss like any enemy. Turbo doubles weapon rate as always.
8. Weapons against a boss. Damage per hit is in `BOSS_DAMAGE`, in tenths of a hit: spread 10, rapid 7, pierce 40, orbit blade 15 with a 0.25 s cooldown per blade (0.12 s against other enemies), drone shot 10, Ram 20. A pierce bullet stops at a boss body. Open fire gives about 360 (spread), 364 (rapid), 320 (pierce) and 300 (orbit) tenths of a hit per second, computed from the table, not measured. Weapon tuning is "Weapon tuning" in SPEC 3.5.
9. Objective, score and stars on a boss level (default, Q5). The generated objective, par and stars are untouched. The boss is an extra completion condition. When the objective's success test passes while the boss lives, the level holds: waves stop, the boss and its adds remain, the boss enrages, the timer sits at 0:00 and the HUD says "Defeat the boss". The level completes the moment the boss dies with lives left. Lives at 0 loses as usual. If the boss dies before the success test passes, the objective runs as normal. The bonus is in SPEC 3.6. The boss counts 1 kill for a destroy objective. Parts and hazards count 0.
10. Enrage (default, Q4). A boss still alive 90 s after its entrance, or at once in the hold state, attacks 30 percent faster. There is no failure timer (default, Q4).
11. Reward (default, Q8). 20 geoms and a large death burst. No weapon, life or bomb.
12. Hazards on boss levels (default, Q19): no spawners, at most one gravity well (SPEC 3.3 rule 5). Gravity wells do not pull a boss, a part or a boss hazard (Scribe reading, flag 6).
13. Speeds. Boss speeds are not multiplied by `speedScale`; the tier sets difficulty. Adds are multiplied as usual.
14. No aimed projectiles (default, Q6). A boss attack is one of the five hazard primitives, a summon of existing enemies, or a drop of Mine and Slime. No boss, part or hazard fires a projectile. No projectile pool, collision path or render path is added, and the enemy bullet cut of SPEC 3.7 stands.
15. Boss code takes every vector between two entities from `steer.ts` helpers. No raw `x[a] - x[b]` in `src/game/bosses/`. Why: a later surface change stays one edit per helper.

### Hazard primitives

Five primitives, analytic and O(1) per hazard, built once in `src/game/bosses/kit.ts` with unit tests. Every boss is a composition. `w.t` is the age in seconds. A hazard is lethal only once `w.t` passes the tier telegraph, and a telegraph is a thin dim form of the same geometry. `hazardTelegraph(tier)` is exported by `kit.ts`. Starting values:

| `w.a` | Name | Geometry | Lethal when | Starting numbers |
|---|---|---|---|---|
| 0 | lane | Segment from the entity position along `w.rot`, length `w.vx`, half width `w.radius` | Ship centre within half width plus ship radius of the segment | length 600 u, half width 22 u, lethal 0.3 s |
| 1 | ring | Circle at the entity position, radius `w.radius` grows (shrinks if collapsing), gap of half angle `w.vx` centred on `w.rot` | Ship centre within 7 u of the radius and outside the gap | growth 300 u/s, band 14 u |
| 2 | sweep | `w.vy` arms (1 to 3) of length `w.vx` from the entity position, first arm at `w.rot`, turning at a rate the boss stores | Ship centre within an arm's half width | half width 12 u, arm length 380 u |
| 3 | tether | Segment from the entity position to (`w.vx`, `w.vy`), the second body | Ship centre within half width | half width 10 u |
| 4 | pull | Circle of radius `w.radius` around the entity | Never lethal. Pulls the ship toward the entity through the existing well pull channel | radius 300 u, at most 100 u/s |

### Roster

Behaviour detail (movement, attack, Glow visual, Chorus motif) is in docs/12 "Design: the boss roster". This table holds the rules tests assert. Hit points are starting values in spread hits, so a fight with closed windows lasts longer than open fire: about 20 to 22 s (tier 1), 33 to 39 s (tier 2), 50 to 56 s (tier 3) and 56 s (tier 4) at 18 spread hits a second, computed, not measured. Names are placeholders.

| # | Id | Tier | Level (default, Q1) | Working name (default, Q7) | Phases | HP (default, Q4) | Damage rule |
|---|---|---|---|---|---|---|---|
| 1 | warden | 1 | 5 | Warden | 2 | 360 | A shell blocks every shot except for 2 s after each ring, when the core opens |
| 2 | brood | 1 | 10 | Brood | 2 | 400 | Immune until its three pods (1 HP each) die, then the core is open 5 s. Pods regrow after 10 s |
| 3 | spindle | 1 | 15 | Spindle | 2 | 400 | Always hittable. Two sweep arms leave 180 deg gaps |
| 4 | ember | 2 | 20 | Ember | 3 | 600 | Hittable only stunned (2 s after a wall hit) or resting |
| 5 | mirage | 2 | 25 | Mirage | 3 | 640 | Shots count only through a 70 deg open arc of its shield ring, turning at 1.5 rad/s |
| 6 | gravitas | 2 | 30 | Gravitas | 3 | 700 | No damage until all three anchors (6 HP each) are gone. Each lost anchor weakens the pull by a third |
| 7 | bastion | 3 | 35 | Bastion | 3 | 900 | Four corner turrets (8 HP each). The core takes damage only once two turrets are down |
| 8 | tempest | 3 | 40 | Tempest | 3 | 900 | Hittable on its lap (lead it) and in its 1.5 s rest at the far wall. A bomb clears its Slime trail |
| 9 | twins | 3 | 45 | Twins | 2 | 1000 (500 each) | A lethal tether joins the two bodies. Killing one breaks the tether and enrages the other (speed x1.4, ring every 4 s) |
| 10 | prism | 4 | 50 | Prism | 4 | 1000 | Shield absorbs 75 percent. Every 4 s a 1.2 s white window drops the shield for full damage |

Prism's damage cycle is 4 s, exactly two bars at 120 BPM: 2.3 s of colour, 0.5 s of the outline running to white, then the 1.2 s window. The window is audio visual, so with music at 0 it must still read from the visual alone: the run to white is always drawn. Prism calls the same kit primitives with its own timings and never spawns another boss entity. At 18 spread hits a second its fight is about 117 s (average damage multiplier 0.475), computed.

Floor: at least 8 bosses covering all four tiers (minimum roster: tier 1 three, tier 2 three, tier 3 one, tier 4 one). Cut 6 in "SPEC 3.7 Cuts for v3" takes Twins and Tempest.

## SPEC 3.5 Player kit

SPEC 3.5 as amended by docs/11 reads "Weapon: four firing styles, spread (the v1 weapon and the default), rapid, pierce and orbit." Replace with:

> Weapon: four base firing styles, spread (the v1 weapon and the default), rapid, pierce and orbit, and six combined weapons, each a pair of two base styles. Auto-fire while the right stick is held, unchanged. Spread alone is exactly the v1 weapon.

docs/11 SPEC 3.5 rule 4 reads "A collected weapon lasts 20 s. The same weapon refreshes the timer; a different one replaces it. Ship death returns to spread." Replace with:

> A collected weapon lasts 20 s. A different pickup combines with the active weapon (rules below). Ship death returns to spread.

docs/11 rules 1 to 3 and 5 to 10 stand, except where "Combining" below changes the drop pool and schedule. The bomb line of SPEC 3.5 ("full-arena clear, no score for cleared enemies") gains: a bomb does not damage or remove a boss (default, Q9).

### Combining (default, Q12)

1. Ingredients are spread, rapid, pierce and orbit. The active weapon is the one with time left. The spread default is no active weapon.
2. Collecting X, by what is active:

| Active | Result |
|---|---|
| none (spread default), X is not spread | Equip X for 20 s (v2 behaviour) |
| none, X is spread | Nothing changes, no timer, no sound (Scribe reading, flag 6) |
| single X | Refresh to 20 s |
| single Y, Y is not X | Combine into the pair {Y, X} for 20 s |
| pair {A, B}, X is A or B | Refresh to 20 s. The order of collection does not change (Scribe reading, flag 6) |
| pair {A, B}, X is neither | X replaces the older ingredient, the one collected earlier. The new pair gets 20 s |

3. A pair is always two weapons, never three.
4. The upgrade sound and `fx:weaponCombine` happen when a collection creates a pair or changes a pair's ingredients, never on a refresh (a changed pair counts as a combination: Scribe reading, flag 6).
5. A pair ends when its timer runs out or the ship dies: back to spread, with the expiry sound. A single weapon ends the same way and plays the same sound. Death plays the death sound, not the expiry sound.
6. Turbo doubles the volley rate of every weapon, combined ones included. Weapon pickups off: nothing spawns and nothing combines (the Off invariant).
7. The HUD shows the combined weapon's name, its two glyphs and the countdown (docs/01 section 9 override below).
8. Mechanism is Swarm's. Spread, rapid, pierce and orbit behaviour and the v2 golden tests are unchanged. `BulletPool` gains an additive `combo: Uint8Array` (0 none, 1 to 6 the pair in the table order below) for Glow. Hit rules still read the ingredient style, and combos add no new style value. `COMBO_TABLE` holds the numbers. `WEAPONS` stays keyed by `BaseWeaponKind`.

### Spread as an ingredient (default, Q11)

Spread is never a pickup in v2, so without a change three of the six pairs could not exist. Spread joins the drop pool only while a non spread weapon is active at the moment of the drop. The pool is then the docs/11 pool for the band (band 1 rapid; band 2 rapid and pierce; bands 3 and 4 and Endless rapid, pierce and orbit) plus `spread`. The choice stays `pool[floor(hash01(level.seed, dropIndex) * pool.length)]` with the skip-repeat rule. While spread is the active weapon the pool is the docs/11 pool, so the v2 golden holds.

### Drop schedule (default, Q12)

docs/11 drops come at scoring kill 15, then every 25. While a non spread weapon is active the next drop falls due after at most 12 more scoring kills (`COMBINE_DROP_KILLS` 12, starting value, tuned at G3D). One live pickup at a time still holds: a due drop waits for a live one to clear.

### The six pairs (default, Q10)

Pair ids are canonical, ingredients in the order spread, rapid, pierce, orbit. The working names in the table are placeholders for Ryan (default, Q10). The index is bullets per second times the hits each can score, plus blade contacts per second, computed from starting values, not measured. Ingredient indices: spread 36, rapid 52, pierce 32, orbit 39.

| Pair id | Working name | Pattern | Bullet and trait | Volleys per s | Index | Ratio to best part |
|---|---|---|---|---|---|---|
| spread+rapid | Hail | 3 bullets at minus 5, 0, plus 5 deg | rapid bullet (radius 3, speed 1500, life 0.9 s) | 22 | 66 | 1.27 |
| spread+pierce | Trident | 3 bullets at minus 8, 0, plus 8 deg | pierce bullet (radius 5, speed 1600), 1 pass after the first hit (2 hits) | 10 | 60 | 1.67 |
| spread+orbit | Halo | 3 bullets forward as spread, plus 4 blades (radius 80, 2.4 rev/s) | spread bullet, blade cooldown 0.12 s | 10 forward | 63 | 1.61 |
| rapid+pierce | Needle | 2 parallel bullets, 5 u either side | pierce bullet (radius 4, speed 1600), 2 passes after the first hit (3 hits) | 14 | 84 | 1.62 |
| rapid+orbit | Whirl | 2 parallel bullets forward, plus 4 blades at 3.0 rev/s | rapid bullet, blade cooldown 0.12 s | 18 forward | 69 | 1.33 |
| pierce+orbit | Eclipse | 1 bullet forward, plus 5 blades at radius 100 and 2.0 rev/s | pierce bullet (3 hits), blade cooldown 0.15 s | 8 forward | 57 | 1.46 |

The design band is a ratio of 1.25 to 1.75 over the better ingredient, so a pair always beats both parts and never doubles them. A pure test asserts the band. Live player bullets at Turbo stay at most 130 per combined weapon (Hail is the worst case at about 119, which is why its life is 0.9 s) inside the pool of 512. Blades use the existing orbit code with the pair's count, radius and rate.

### Drone weapon drops (default, Q13)

docs/12 decision D8. "Weapon drops for the drone (the familiar)" is built as a second kind of pickup that arms the drone. Other readings (a permanent drone upgrade for the level, the drone fetching ship pickups) are not built.

1. `Kind.DronePickup` has its own counter: first at scoring kill 30, then every 40. One is live at a time, independent of the weapon pickup. It lives 8 s, blinking the last 2 s, with collect radius 28 u from the ship. Bombs leave it alone. Level end clears it.
2. The weapon is `pool[floor(hash01(level.seed ^ 0x44524f4e, droneDropIndex) * 2)]` over `[rapid, pierce]`, skipping one step on a repeat.
3. Collected, it arms the drone for 20 s on its own timer. While armed, the drone fires volleys of that style at the nearest enemy, or the boss, within 450 u at 4 volleys a second, for all three drone types, on top of the drone's own behaviour. The same style refreshes, a different one replaces. The drone never combines weapons.
4. Ship death clears the armed weapon. Detonate's 3 s drone absence does not pause the timer.
5. Weapon pickups off disables it.
6. The HUD shows a small second countdown with a drone glyph beside the weapon indicator.

### Weapon tuning (default, Q14)

Each weapon has one stated advantage and one cost:

| Weapon | Advantage | Cost |
|---|---|---|
| spread | Crowds: 3 bullets cover a cone | Low damage on one target at range |
| rapid | One target: the highest sustained damage on a single enemy | Narrow, short lived bullets |
| pierce | Lines: one bullet scores up to 4 hits along a line | Low rate, one bullet at a time |
| orbit | Close defence: blades hit anything within 80 u | Short reach, blades do little at range |

1. A deterministic harness, `tests/game/weaponBalance.test.ts`, pure, no render, no PRNG, runs four scripted scenarios with a fixed ship and aim: a lone target at 300 u, 12 enemies in a 30 deg cone, 6 enemies in a line, 8 enemies in a ring at 100 u. It reports kills in 10 s per weapon and per pair.
2. Targets: each single weapon wins its own scenario by at least 1.3x over the best other single weapon; no single weapon scores under 0.6x of spread in any scenario; every pair beats its better ingredient in the scenarios of both ingredients; no weapon is under 0.8 of spread against a lone boss. A failing ratio says which table value to move (`WEAPONS`, `COMBO_TABLE`, `styleRadius`, `BOSS_DAMAGE`).
3. Levers are numbers only: bullet radius and speed per style, pierce hit count, blade radius and cooldown, volley rate. No new mechanics. Spread alone stays bit identical to v1. A v2 golden for rapid, pierce or orbit may change only if the wave brief names it.
4. Projectile effects (Glow, SPEC 3.8) make each advantage visible: muzzle flash, hit sparks, bullet size and brightness per style, and a short trail on pierce and rapid. Pairs inherit from their two ingredients.

## SPEC 3.6 Scoring

SPEC 3.6 lists base values for the v1 enemies and docs/11 adds the v2 ones. Bosses have no base value. Add:

1. Boss kill bonus (default, Q5): a flat 25 percent of the level's par, rounded half up to the nearest 500, added to the score directly and never multiplied (Scribe reading on the rounding, flag 6). Stars stay at par, 2x par and 4x par of the final score, so the bonus counts toward them.
2. Endless has no par, so the formula gives a bonus of 0 there. The Endless boss reward is its 20 geoms (default, Q3), see flag 1.
3. Parts and hazards score 0 and drop no geoms. Adds score normally. Mine and Slime rules of docs/11 stand.
4. The boss counts 1 kill for a destroy objective. Parts, hazards and the 0 value Mines and Slime count 0.
5. The 20 geoms of the reward raise the multiplier like any geoms.
6. The results screen shows a "Boss defeated, bonus N" line on a win with a boss.

## SPEC 3.7 Cuts for v3

SPEC 3.7 as amended by docs/11 stays, with these changes for v3:

- Lifted: bosses. The ten bosses of this file only.
- Lifted behind D12 and D13: a render only perspective tilt, and a cylinder surface. Nothing else curved.
- Stay cut: enemy bullets and aimed boss projectiles (default, Q6), a Three.js migration, torus, sphere, capsule and twisted band surfaces, gamepad, haptics beyond one vibrate on death, achievements, leaderboards of any kind, multiple ship types, any online feature.
- docs/09 sections 1, 2 and 4 stay parked, not cancelled, except the two clauses above. docs/09 is not v3 scope.

SPEC 8 applies to v1 only, docs/10 to v2, docs/12 to v3. v3 cut order, cut from the top, at most one cut per checkpoint unless a trigger fires twice. Decision clocks per cut are in docs/12 "Cut order".

| Cut # | Item | Trigger |
|---|---|---|
| 1 | Boss motifs for tiers 3 and 4 (keep the shared boss bed and the entry, phase and defeat stingers) | The Chorus B hand-off reports scheduler glitches, or music glitches at G3B persist after one Chorus fix run |
| 2 | Weapon effects tuning in Glow E (keep the combined weapon tints and the High default check) | Glow D runs out of window, or fps is under the bar at G3D |
| 3 | Drone weapon drops (last item in Swarm D's task order) | Q13 unresolved at D setup, or the Swarm D window runs out before it |
| 4 | High as the default (stays opt in) | Average under 59 or the bomb dip under 50 with a boss on screen |
| 5 | Prism phases from four to two (keep the shimmer and the white damage window) | The Swarm C2 window runs out |
| 6 | Twins and Tempest (roster of 8, the floor) | Fairness paste "unfair", or the Swarm C1 window runs out |
| 7 | Whirl and Eclipse, rapid+orbit and pierce+orbit (four of six pairs remain, the floor) | A combo is unreadable at G3D or the bullet pool is under pressure |

Executing a cut follows docs/05: remove it from the remaining briefs, disable it with glue (weight 0, entry removed, table row removed), log it in STATUS "Cuts taken (v3)" and DECISIONS, tell Ryan in one line.

Never cut: the Off invariant (section "Engineering rules that stay"), touch controls, generator determinism with flags off, the neon slider, PWA install, the upgrade sound and the expiry sound (Ryan asked for both). Floors: at least 8 bosses covering all four tiers, and at least 4 of the 6 combined weapons. Below a floor the feature is reported incomplete to Ryan; Fable does not ship a partial feature silently. Cut 6 takes the roster to its floor, so a second roster cut needs Ryan's reply.

## SPEC 3.8 Visual effects

docs/11 SPEC 3.8 stands (tiers, lattice, governor, `applyNeon` as the only writer). Added for v3, all render only and cosmetic, never read by the simulation, no PRNG, jitter from `hash01`:

1. Boss layer. Line weight is a multiplier on the boss layer by tier (tier table above): x1.6, x2.0, x3.0 with a wider outer glow stroke, x2.4 with the shimmer. The neon slider still scales glow, only through the alpha `applyNeon` computes. Every boss has a second concentric rim at 0.6 alpha. Tier 3 reds stay apart from the gravity well ring red (hsl(355, 95%, 55%)) by size, a white inner core and the second rim.
2. Prism shimmer: a hue offset per outline vertex advancing with `w.time` (a full hue cycle in 3 s) plus a one frame chromatic ghost. Saturation still follows `applyNeon`: a shimmer at neon 0 is muted, never off. If it costs frames, Glow reduces vertex count first, then drops the ghost.
3. Boss effects: hit flash on `fx:hit` with `Kind.Boss` (throttled), phase flash on `sim:bossPhase`, a screen edge pulse in the boss colour on `sim:bossEnter`, a death burst on `sim:bossDown` capped by effects tier (Standard 2048 and High 4096 particles stay the caps; the burst count is Glow's table and docs/12 gives none), a shake of 14 px for 0.6 s on boss death (inside the docs/01 section 12 hard cap of 16 px) and a lattice shock. Gravitas pulls the lattice through the channel wells use. Low turns trails and map effects off, as docs/11.
4. Weapon effects: a tint per pair that blends its two ingredient palette keys, a combine flash (ring and short burst at the ship, capped by tier), glyphs for spread and the drone pickup, an armed drone glowing in the weapon colour, and the per style projectile effects of "Weapon tuning". At most 10 bullet draw calls (4 base plus 6 combined looks; v2 used at most 4).
5. High as the default (default, Q15). `sow.settings.effects` ships with default `standard`. When the bar in SPEC 5 holds at gate G3E, Fable's glue changes `EFFECTS_DEFAULT` in `src/render/effects.ts` and `DEFAULT_EFFECTS` in `src/core/settings.ts` to `high` and updates the two tests that pin the default. A stored choice is never changed: the setting is written only when tapped, so a phone that holds Standard needs one tap on High.
6. Tilt and the lattice z channel are in section "Render only tilt" and apply only after D12.
7. Reference images stay docs only, as docs/11 says.

## SPEC 3.9 Music

docs/11 SPEC 3.9 stands. Added: boss music. docs/11 rule 3 (a pattern is a pure function of level seed, kind and bar) is replaced for bosses only: a boss motif is a pure function of (boss id, phase, bar) on `hash01`, with no seed, so a boss sounds the same on every level.

1. `sim:bossEnter` plays the entry stinger (a chord hit on the current chord, quantised to the next sixteenth), sets the intensity floor to 0.8, ducks the enemy motifs to 40 percent (kill notes stay) and starts the boss motif on the next bar with a one bar fade in.
2. `sim:bossPhase` plays a phase sting and adds a voice or an octave to the motif on the next bar.
3. `sim:bossDown` plays the defeat stinger (an A major resolution, A C sharp E), stops the boss motif at the next bar, and returns intensity and the enemy motifs by the normal release (3 s).
4. A boss motif is a 2 or 4 bar loop of 4 to 8 notes, in A minor at 120 BPM, inside the tier scale: tier 1 minor pentatonic, tier 2 natural minor with a raised seventh, tier 3 phrygian second, tier 4 a loop that quotes the earlier motifs.
5. Budget: at most 3 boss voices (a phase adds one) beside the bed and the enemy motifs, inside the 16 voice music cap, stealing enemy motif voices first. Summed gain at most 1.0, music master at most 0.35 of the synth master. The 24 voice sfx cap holds. The Music slider covers all of it: 0 is silence. Pause, a hidden tab and fold suspend and resume on the next bar line.
6. Audio still subscribes to the bus and never imports src/game, src/ui or src/render. Music never feeds the simulation.

## SPEC 5 Device and input rules

SPEC 5's last bullet as replaced by docs/11 begins "Target 120 fps on the cover screen, unchanged. On the main screen 60 fps is a floor ...". Replace the whole bullet with:

> Target 120 fps on the cover screen, unchanged. On the main screen the bar is an average of at least 59 fps with a bomb dip of at least 50 fps (the 59 Ryan accepted at v2 gate GD, DECISIONS 35:50), measured on the stress scene (400 live entities, 2000 particles) at the effects tier under test, with the motion setting recorded. With a boss alive the bar is an average of at least 59 and a lowest of at least 55 over the fight. High becomes the default tier only when two warm runs with a boss on screen both meet the average and dip bar (default, Q15). A tier that misses its bar at its gate is not the default.

Unchanged: 120 Hz fixed step, DPR cap 2, Pointer Events only, touch only, one vibrate on death and nothing else. No allocation per step in physics, weapons, enemies, boss, drone or hazard code. Extra live entities from a boss stay inside `ENTITY_CAP` 512. Starting budget for the tilt projection is 0.5 ms per frame for up to 8192 lattice nodes plus entities.

## SPEC 7.3 Roster and git rules

No roster change. v3 uses the ten nicknames of docs/11 and creates no roster file. Lens and Lattice are not created.

1. Chorus owns `src/audio/` and `tests/audio/` in waves B to D, because the wave briefs name `cues.ts` for it. That satisfies docs/11 SPEC 7.3 rule 2. Glow still does not edit `src/audio/`.
2. Chorus never edits src/game, src/ui, src/render, src/levelgen, src/input or src/core. Bus events it needs come from the V3-W0 stubs; anything else goes under "Requests".
3. Swarm owns `src/game/scoring.ts`, `endless.ts` and `objective.ts` in wave A for the bonus, the Endless hook and the hold rule. The wave brief wins on ownership, as docs/11 says.
4. V3-W0: Scribe writes the contract stubs on `feat/scribe-v3-stubs` under a brief that overrides Scribe's roster for the files in docs/12's stub table only. Fable reviews and merges them before wave A. It is the only v3 exception to Scribe's no src rule.
5. The rest of 7.3 is unchanged: branches `feat/<nickname>-<slug>`, one builder per directory per wave, Fable-only merges with `git merge --no-ff` after `npm test && npm run build`.
6. Debug hooks `?boss=<id>` and `?weapon=<id>` are temporary Fable glue, each under 20 lines, written after the merge that makes them possible. Builders do not write them. Swarm provides the `debugEquip(w, kind)` seam in wave D.

## docs/01 overrides

### Section 2.2 Endless

"Waves come from the generator, one segment per 30 s" gains: the wave clock is paused while a boss lives (SPEC 3.4 Endless cadence). "No objective" and "no gravity wells or spawners in Endless" stand.

### Section 4.2 Weapon

The 4.2 rows describe spread. When a base style is active, the docs/11 per style values replace them. When a combined weapon is active, the pair table in SPEC 3.5 above replaces them for pattern, rate, bullet and blades. Damage, spawn offset, gravity pull and the live bullet cap (512) are unchanged.

### Section 4.3 Bombs

The Effect row ("Instantly removes every enemy, telegraph and snake segment ...") gains: a bomb does not damage or remove a boss or a boss part. It clears adds, Mines, Slime and live boss hazards, and staggers the boss for 1.5 s (default, Q9). Score, geoms, cooldown and the wave timer rows are unchanged.

### Section 4.4 Drones

An armed drone (SPEC 3.5 Drone weapon drops) also fires volleys of the armed style at the nearest enemy or boss within 450 u at 4 volleys a second, for all three drone types, on top of the drone's own row (default, Q13). Drone shots deal `BOSS_DAMAGE` 10 to a boss.

### Section 4.5 Supers

Detonate against a boss: 10 percent of the boss's maximum hit points if the boss is within 260 u of the drone (default, Q9). Against every other enemy it is unchanged.

### Section 6 Enemy catalogue

Bosses are outside the section 6 catalogue and its stats table; their stats are in SPEC 3.4 above. 6.1 global rules apply to adds unchanged. They do not apply to a boss as follows: the 0.6 s telegraph is a 2.0 s entrance ring, and `speedScale` is not applied (boss rule 13).

### Section 7 Lives and respawn

The Death row's "arena clear (no score)" applies to adds and hazards. The boss keeps its hit points (boss rule 6).

### Section 8 Objectives

The hold rule of boss rule 9 applies to all three objective kinds on a boss level. The HUD column gains "Defeat the boss" while the objective holds.

### Section 9 HUD layout

All additions sit inside the existing top band and add no pointer target (flag 7):

- A boss bar under the objective bar, fed by `hud:boss`, shown only while a boss lives: the boss name, a thick hit point bar in the tier colour and phase pips. Updated at most every 100 ms and on change. It must not overlap the moved bomb and super buttons on either aspect class.
- The intro card shows "Boss: <name>" on a boss level. In Endless the wave label reads "Boss" while one lives.
- The weapon indicator shows a pair's name and its two glyphs and the countdown bar, fed by `hud:weapon`.
- A drone indicator beside the weapon indicator, fed by `hud:droneWeapon`, hidden when empty.
- `BOSS_NAMES` and `COMBO_NAMES` are consts Ryan edits. The names in this file are placeholders (default, Q7) (default, Q10).

### Section 11 Colour palette

Boss palette keys are `bossBlue`, `bossGreen`, `bossYellow`, `bossOrange`, `bossMagenta`, `bossViolet`, `bossRed`, `bossPrism` and `dronePickup` (a teal ring with the weapon mark). Glow tunes the hues against the table so a boss never reads as an enemy, using the second rim and size (a boss body radius is 44 to 90 u, the largest enemy 24 u). No hue is fixed here. The docs/01 section 11 "Drone" row is unchanged.

### Section 12 Particles and screen shake

The boss death burst is capped by effects tier (SPEC 3.8). The shake table gains one row: boss death, 14 CSS px, 0.6 s. The 16 px hard cap and the max-not-sum rule stand.

### Section 13 Audio cue list

"No music in v1" does not apply (docs/11). The cue table gains:

| Cue | Waveform and sweep | Duration | Gain | Notes |
|---|---|---|---|---|
| weaponCombine | square sweep 440 to 1760 Hz plus a triangle arpeggio A4, C5, E5, A5 in 55 ms steps | about 220 ms | 0.14 | Plays once per combination, never on a refresh. Must not be mistaken for superReady or levelComplete |
| weaponExpire | two falling sine notes E5 then A4, 90 ms each, lowpass closing 4000 to 400 Hz | about 180 ms | 0.10 | Plays when any non spread weapon runs out. The drone's armed weapon plays a quieter copy at 0.06. Not on death |
| droneArm | one triangle note A5 with a 40 ms upward bend | not set by docs/12, Chorus chooses | 0.08 | Plays when the drone is armed |

Boss sound effects, not music: an entry rumble, a hit tick for `Kind.Boss` heavier than the per kind ticks (throttled) and a death cue (a bigKill variant). Throttles: combine once per event, expire at most 4 per s. The 24 voice sfx cap and the master gain formula are unchanged.

### Section 14 Cut from v1

Lifted for v3, each only as scoped here:

- "Boss enemies and enemy types beyond section 6." Lifted for the ten bosses of SPEC 3.4. The docs/11 lift for Charger, Bulwark, Blink, Swirl, Sower, Splime, Mine and Slime stands.
- "Camera scroll or zoom." Stays cut. The tilt keeps the whole arena visible.

Everything else in section 14 as docs/11 left it stays cut, including enemy bullets. The cut order is "SPEC 3.7 Cuts for v3".

## Render only tilt (conditional, D12)

Inactive until Ryan says go at D12 after v3.0.0 is tagged and the go is logged in docs/DECISIONS.md. Default: go if credits allow (default, Q16); no go if under $40 of credit remains or Ryan is unavailable. A builder on a branch cut before the go refuses it. It is a 3D rendering step, not a curved surface. Nothing in src/game, src/levelgen, src/input or src/audio changes, and PixiJS v8 stays. Owners: Glow, with Ledger for the setting.

1. The arena plane is tilted about its horizontal centre line by T degrees and viewed through a perspective camera, so the far wall is smaller and higher than the near wall. The lattice gains a z channel (kills raise it, wells pull it into a funnel, shocks ripple in depth). Entities stay flat 2D shapes, moved and scaled by depth, not rotated.
2. Setting `sow.settings.tilt`: `off`, `low`, `high`, default `off`. Low is 12 deg and High is 22 deg (default, Q16). Off is exactly the v3.0 render, asserted by a pure test: `project` at tilt 0 is the identity on x and y.
3. Pure `project(x, y, z, tilt, out)` in `src/render/project.ts`: rotate about the x axis (`y' = y cos t minus z sin t`, `z' = y sin t plus z cos t`), then scale by `D / (D plus z')` with the focal distance D starting at 2.5 times the arena height. No allocation, no PRNG.
4. Projected: lattice nodes, arena walls and obstacles, entity positions and scale, bullets, particles, geoms, and boss hazards and the Prism shimmer like entities. Not projected: the HUD, the sticks, the buttons.
5. The whole arena stays visible (docs/01 section 2.3). The letterbox fit is computed from the projected arena bounds.
6. Touch is unchanged. Sticks are vectors in screen axes, so aim keeps its meaning. Foreshortening makes the drawn aim differ from the true aim by at most about 2.2 deg at High and 0.6 deg at Low, computed, not measured.
7. `applyNeon` stays the only writer of glow width and grid base alpha. Depth may scale line alpha only as a multiplier on the lattice layer.
8. Two routes, chosen by the G0 spike. Route A projects vertices and transforms on the CPU (the default). Route B renders the arena layer to a `RenderTexture` shown on a `PerspectiveMesh` (one extra full screen pass, thin lines resample). The `PerspectiveMesh` API is unread and Route B is unproven.
9. D13 reads the tilt paste. A cylinder go needs a tilt rating of 4 or better.

## Cylinder surface (conditional, D13)

Inactive until Ryan says go at D13 and the go is logged in docs/DECISIONS.md. Default: no go unless the tilt paste rates 4 or better and the credit pool covers the high estimate. This clause is an outline and a boundary, not a design. After a go, Scribe drafts the full clause by editing this file, from docs/09 sections 2 and 4 and the G3G paste, as docs/12 says. A builder on a branch cut before the go refuses it.

1. Scope: `SurfaceKind` gains `'cylinder'` and nothing else. u wraps, v keeps walls: with `theta = 2 pi u / W` and `R = W / (2 pi)` the map is `(R cos theta, v, R sin theta)` (docs/09 section 2.2).
2. Torus, sphere, capsule, twisted band and Three.js stay cut and parked.
3. Boss levels stay flat. Boss hazards assume a plane. Curved boss fights are not designed.
4. Every flat level keeps its hash. The surface comes from a salted PRNG stream drawn after the existing draw sequence (docs/09 section 2.5), with a generator version bump.
5. Every seek, dodge, homing, pull, orbit and collision between entities uses `Surface.delta` from V3-H on. Boss code already uses `steer.ts` helpers (boss rule 15), so bosses add no bill.
6. Ownership per docs/12 wave V3-H: Forge (`src/core/surface.ts`, world, ship, bullets, collide), Swarm (enemies, bosses, drones, supers), Foundry (generator and validator), Glow (drawing from the tilt projection), Thumbs (tangent frame stick rotation only if the camera rolls).
7. Gate G3H and the cost belong to docs/12. Untested items are a Known gap there.

## Settings keys and bus additions

Settings keys (docs/12 Appendix B). Every read and write is in try/catch with a default, an invalid value falls back to the default, and every key keeps the `sow.` prefix (the `glowPath` pattern):

| Key | Values | Default | Control |
|---|---|---|---|
| `sow.settings.tilt` | `off`, `low`, `high` | `off` | "Perspective tilt" row, three buttons, saved on tap, in the menu and the pause screen. Added only after D12 |

No other key is added. `sow.settings.effects` keeps its key and values; its code default changes from `standard` to `high` only after D9 (SPEC 3.8 rule 5) (default, Q15). Buttons have a 44 CSS px minimum hit height. Reset progress does not reset settings.

Bus events added to `src/core/events.ts` (stubbed at V3-W0, emitted as listed). Payload objects are reused by the sim, so handlers copy what they need:

| Event | Payload | Emitter | Consumers |
|---|---|---|---|
| `sim:bossEnter` | `{ id: BossId; tier: BossTier }` | Swarm (A) | Chorus, Glow, Ledger |
| `sim:bossPhase` | `{ id: BossId; phase: number; phases: number }` | Swarm (A) | Chorus, Glow |
| `sim:bossDown` | `{ id: BossId; x: number; y: number }` | Swarm (A) | Chorus, Glow, Ledger |
| `hud:boss` | `{ id: BossId; hp: number; maxHp: number; phase: number; phases: number; mode: number }`, at most every 100 ms and on change | Swarm (A) | Ledger |
| `fx:weaponCombine` | `{ x: number; y: number; kind: ComboKind; a: BaseWeaponKind; b: BaseWeaponKind }` | Swarm (D) | Glow, Chorus |
| `fx:weaponExpire` | `{ kind: WeaponKind; drone: boolean }` | Swarm (D) | Chorus, Glow |
| `fx:dronePickup` | `{ x: number; y: number; weapon: BaseWeaponKind }` | Swarm (D) | Glow, Chorus |
| `hud:droneWeapon` | `{ kind: BaseWeaponKind; remaining: number; total: number }`, at most every 100 ms and on change | Swarm (D) | Ledger |

Extended, not new: `hud:weapon.kind` and `fx:pickup.weapon` are `WeaponKind`, which now includes the six `ComboKind` values. `fx:hit` is unchanged and carries `Kind.Boss` for a boss.

Types and values:

- `BOSS_IDS` is `warden, brood, spindle, ember, mirage, gravitas, bastion, tempest, twins, prism`; `BossId`; `BossTier` is 1 to 4; `BossSpec { id; tier; atSec; hpMul }`.
- `BaseWeaponKind` is `spread, rapid, pierce, orbit`. `ComboKind` is `spread+rapid, spread+pierce, spread+orbit, rapid+pierce, rapid+orbit, pierce+orbit`. `WeaponKind = BaseWeaponKind | ComboKind`.
- `GenConfig.enableBosses`, `GENERATOR_VERSION_V3` (3), `BulletPool.combo` (Swarm, wave D).
- Render contract for the boss: `readBoss(w, out)` in `src/game/bosses/view.ts` returns a `BossView` (`active, id, mode, phase, hp, maxHp, modeT, x, y, rot, radius`) with no allocation, and is how Glow reads the boss. `id` is the index in `BOSS_IDS`. `mode` is 0 entering, 1 guarded, 2 attacking, 3 vulnerable, 4 stunned, 5 phase change, 6 dying.
- `Kind.BossPart` reads `w.a` part type (0 pod, 1 anchor, 2 turret), `w.hp`, `w.rot` (angle on its orbit) and `w.radius`. `Kind.BossHazard` reads `w.a` (primitive type), `w.t`, `w.rot`, `w.radius`, `w.vx` and `w.vy` as the hazard table defines. These are fields, not bus events.

## Engineering rules that stay

Every v1 and v2 engineering rule stays, including every rule of docs/11 "Engineering rules that stay". In particular:

1. The Off invariant, extended. With `GenConfig.enableBosses` false, weapon pickups off and tilt off, the simulation is bit identical to v2.1 for the same inputs and the generator output is byte identical to v2.1 for every seed. With the v2 switches off as well (space physics off, `enableV2Enemies` false) it is still bit identical to v1.0.0. The Low effects tier and music volume 0 reproduce the v1 look and silence.
2. TypeScript strict, no `any`, no `ts-ignore`; small pure functions; vitest for every pure module.
3. PixiJS v8 only, with docs/pixi8-cheatsheet.md read first. The DoD v7 grep prints nothing.
4. `Math.random()` only in `src/core/rng.ts`. Boss movement, attack timing and drops use `hash01` or `w.simRng`, never a new PRNG, and `src/game/bosses/` never references `mulberry32`. Boss choice is a table lookup. Weapon combination is a pure function of the two ingredients. Boss motifs are a pure function of (boss id, phase, bar). Simulation and render never call a PRNG. Generator output is JSON serialisable.
5. Boss code uses `steer.ts` helpers for every vector between two entities (boss rule 15). Fable's gate check: `grep -rnE "\.x\[[a-z]+\] - |\.y\[[a-z]+\] - " src/game/bosses` read by hand.
6. Numbers live in tables so tuning is a one file edit: `BOSS_TABLE`, `BOSS_DAMAGE`, `COMBO_TABLE`, `WEAPONS`. Fable may edit table values as glue under 20 lines after a paste.
7. Touch only. No keyboard, mouse or gamepad handlers.
8. No audio files, images or fonts beyond the PWA icons.
9. No new dependency. docs/12 requests none. Three.js stays cut; Route B, if chosen, uses `PerspectiveMesh` already in pixi.js 8.22.
10. `applyNeon(n)` stays the only writer of bloom strength, threshold, saturation, glow width and grid base brightness. Boss line weight and shimmer are multipliers on the boss layer.
11. Only Fable edits package.json, CLAUDE.md, SPEC.md, docs/STATUS.md and docs/DECISIONS.md.
12. Conventional commits; no em or en dashes; sentence case headings.
13. Gate pastes are spelled out one field per line, every answer in the words shown (DECISIONS 42:50). Shared gate checks Fable runs at every merge are in docs/12 "Shared rules for every wave" and docs/10 "Shared rules for every wave", item 7.

## Answers and open defaults

None of docs/12's questions is answered yet. Each default below is marked "(default, Q<n>)" above. Fable changes the line after Ryan answers.

| Q | Default used | Section |
|---|---|---|
| Q1 | Every 5th level, 5 to 50, top boss at 50, then a loop from tier 2 with 25 percent more hit points per pass; `enableBosses` on | SPEC 3.3, 3.4 |
| Q2 | One boss per boss level; Twins is one boss with two bodies | SPEC 3.4 |
| Q3 | Endless: first boss at 3:00 of wave clock, then every 3 minutes, wave clock paused while it lives, reward is geoms and the formula bonus (0 in Endless, flag 1) | SPEC 3.4, 3.6 |
| Q4 | Hit points 360 to 1000, fights 20 to 56 s of open fire (Prism about 117 s), enrage at 90 s, no failure timer | SPEC 3.4 |
| Q5 | Objective holds at success until the boss dies; flat bonus of 25 percent of par, not multiplied; stars from the final score at the unchanged par | SPEC 3.4, 3.6, docs/01 8 |
| Q6 | No aimed projectiles; lanes, rings, sweeps, tethers, a pull, summons and drops | SPEC 3.4, 3.7 |
| Q7 | Tier colours kept; working names are placeholders Ryan overwrites | SPEC 3.4, docs/01 9, 11 |
| Q8 | No drop beyond 20 geoms | SPEC 3.4 |
| Q9 | Bomb: no damage, clears adds and hazards, staggers 1.5 s. Detonate: 10 percent of hit points | SPEC 3.4, 3.5, docs/01 4.3, 4.5 |
| Q10 | Names Hail, Trident, Halo, Needle, Whirl, Eclipse | SPEC 3.5, docs/01 9 |
| Q11 | Spread is droppable while another weapon is active | SPEC 3.5 |
| Q12 | Pairs only, 20 s, a third pickup replaces the older ingredient, next drop within 12 kills while a weapon is active | SPEC 3.5 |
| Q13 | A separate pickup arms the drone with rapid or pierce for 20 s | SPEC 3.5, docs/01 4.4 |
| Q14 | Swarm tunes the weakest first; Glow does flash, sparks and size | SPEC 3.5, 3.8 |
| Q15 | High default only on an average of 59 and a bomb dip of 50 in two warm runs with a boss; one tap on High if the phone holds Standard | SPEC 3.8, 5, settings keys |
| Q16 | Go on the tilt if credits allow; Low 12 deg, High 22 deg | Render only tilt |
| Q19 | Boss levels have no spawners and at most one gravity well | SPEC 3.3, 3.4 |

Process answers with no addendum clause: Q17 (credits beyond the second $200; the plan assumes $200 less v2.1 spend) and Q18 (tag v2.1.0, header only).

Known gaps carried from docs/12 "Known gaps in this plan" are not permitted work in v3.
