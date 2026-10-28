# Shape of War: game design document

Design reference: the public description of the Geometry Wars 3: Dimensions play loop. No names, assets, sprites, music or sound from that game are used.

Status: draft by Scribe-A for Fable review. Derived from SPEC.md. If anything here conflicts with SPEC.md, SPEC.md wins. Builders implement exactly what is in this file; anything not listed is out of scope.

## 0. Risks and unknowns first

- Unknown: the CSS pixel size of the cover and main screens in Chrome on the Z Fold 7. All HUD sizes below are in CSS px at DPR 1 and must be tuned at G1 from the viewport log captured at G0.
- Unknown: whether bloom holds 60 fps on the main screen. Palette values below are valid for both the bloom path and the glow sprite fallback.
- Risk: whole-arena-visible framing (section 2.3) makes entities small on the 21:9 cover screen. The arena size bounds in section 2.3 exist to cap this. If the ship reads as too small at G1, lower the band 4 arena height cap before touching anything else.
- Risk: gravity well tuning is the most likely source of unfair deaths. All well numbers are in one table (section 6.7) so Swarm can tune in one place.
- Known: every number below is a starting value. Tuning changes after G2 go into `docs/DECISIONS.md`.

## 1. Core loop

1. Level intro card shows objective, par and loadout.
2. Ship spawns at arena centre with 2.0 s invulnerability.
3. Left thumb moves, right thumb aims and auto-fires.
4. Enemies spawn in waves per the LevelDef wave schedule, each preceded by a 0.6 s telegraph marker during which it is harmless and cannot be hit.
5. Killed enemies drop geoms. Each geom collected adds 1 to the multiplier and 1 to super charge.
6. Score per kill = enemy base value x current multiplier.
7. Contact with any enemy, snake body or gravity well kills the ship unless invulnerable. Death resets the multiplier to 1 and clears the arena (no score).
8. Level ends on objective complete (success) or out of lives or out of time (failure).
9. Results screen shows score, stars, par and best.

Simulation runs at a fixed 120 Hz (dt = 1/120 s). All speeds below are in arena units per second (u/s). All radii are in arena units (u).

## 2. Modes and arena framing

### 2.1 Adventure

- Infinite sequence of generated levels. Level n seed is derived from the run seed plus n (see `docs/02-level-generator.md`).
- Completing the objective unlocks level n+1, regardless of stars.
- Stars: 1 at par, 2 at 2x par, 3 at 4x par. A level can be completed with 0 stars (survive and destroy objectives).
- Per level: 3 lives, 3 bombs, 1 drone, 1 super type, all fixed by the LevelDef.
- Retry replays the identical LevelDef.

### 2.2 Endless

- Fixed rectangular arena, 1600 x 1000 u, no obstacles.
- Waves come from the generator, one segment per 30 s, seed per segment (see `docs/02-level-generator.md` section 10).
- No objective. Game ends when lives reach 0.
- Start: 3 lives, 3 bombs. +1 life every 100,000 points, +1 bomb every 150,000 points. Cap 9 lives, 9 bombs.
- Drone: Attack. Super: Turbo. Fixed in Endless for v1.
- No gravity wells or spawners in Endless v1.
- Each Endless game uses a fresh endless seed from `crypto.getRandomValues` (inside `src/core/rng.ts`), shown on the results screen so a run can be reproduced.
- Local high score table: top 10, stored in localStorage.

### 2.3 Arena framing

- Origin at arena centre, +x right, +y down.
- The whole arena is always visible. No camera scroll. Why: a fixed frame needs no camera code and keeps the ship always visible at both aspect ratios.
- Scale: `scale = min(safeW / arenaW, safeH / arenaH)`, arena centred in the safe play rect, remaining space is letterbox (background colour plus grid fade).
- Safe play rect = viewport minus `env(safe-area-inset-*)` minus the HUD top band (section 9).
- Bounds enforced by the generator validator: arena height 700 to 1100 u, width up to 1800 u, aspect W/H 1.0 to 1.8.
- Ship spawn point is always (0, 0).

## 3. Controls

| Control | Rule |
|---|---|
| Move stick | First pointer down in the left half of the screen (and not on a button) sets the stick origin. Max radius 120 CSS px. Dead zone 12 percent of radius. Velocity = direction x 420 u/s x clamp((len minus dead zone) / (radius minus dead zone), 0, 1). |
| Aim stick | First pointer down in the right half (not on a button). Max radius 120 CSS px. Dead zone 25 percent of radius. Past the dead zone, aim angle = stick angle and fire is held. Inside the dead zone, no fire. |
| Stick visuals | Base ring 120 px radius at 25 percent alpha, knob 36 px radius at 60 percent alpha. Fade out 150 ms after release. |
| Bomb button | Bottom centre. Tap fires a bomb if bombs > 0 and bomb cooldown elapsed. |
| Super button | Directly above bomb. Tap activates super when charge is full. |
| Pause button | Top right. |
| Multi-touch | Pointer capture per pointerId. A stick follows only its own pointer. Releasing a pointer frees that stick. |

Touch only. No keyboard, mouse or gamepad handlers.

## 4. Player ship kit

### 4.1 Ship

| Property | Value |
|---|---|
| Shape | Isosceles triangle, nose length 18 u, base 20 u, points along move direction (aim direction while firing) |
| Hitbox radius | 10 u |
| Max speed | 420 u/s |
| Acceleration | Instant (velocity set from stick each tick) |
| Wall behaviour | Clamped to arena boundary and obstacle edges, slides along them |
| Lives | 3 per Adventure level; Endless as section 2.2 |
| Respawn delay | 1.5 s after death |
| Invulnerability | 2.0 s after spawn and respawn, ship blinks at 10 Hz |
| Respawn position | Arena centre (0, 0) |
| On death | Vibrate 60 ms, multiplier to 1, arena clear without score (all enemies and telegraphs; gravity wells and spawners stay), geoms removed, wave timer paused for the 1.5 s respawn delay |

### 4.2 Weapon

| Property | Value |
|---|---|
| Pattern | 3-way spread at minus 6, 0, plus 6 degrees from aim |
| Fire rate | 12 volleys per second (period 1/12 s), 24 during Turbo |
| Bullet speed | 1400 u/s plus ship velocity component along aim, clamped to 1600 |
| Bullet radius | 4 u |
| Bullet damage | 1 |
| Lifetime | 1.2 s or until it hits a wall, obstacle, enemy or snake body |
| Spawn offset | 16 u ahead of ship centre |
| Pierce | None |
| Gravity | Pulled by gravity wells (section 6.7) |
| Cap | 300 live player bullets; oldest removed first |

### 4.3 Bombs

| Property | Value |
|---|---|
| Count | 3 per Adventure level |
| Effect | Instantly removes every enemy, telegraph and snake segment; resets each gravity well to base mass; spawners are destroyed |
| Score | None for anything cleared |
| Geoms | None dropped; existing geoms stay |
| Cooldown | 1.0 s |
| Visual | Expanding ring from ship, 0 to 1.5 x arena diagonal over 0.5 s, purely cosmetic |
| Wave timer | Not paused |

### 4.4 Drones

One drone per level from `LevelDef.drone`. Drones are invulnerable, have no hitbox against enemies except Ram, are not pulled by wells, and vanish during the respawn delay.

| Drone | Behaviour | Numbers |
|---|---|---|
| Attack | Orbits ship and fires at nearest enemy head in range | Orbit radius 60 u, 1.5 rev/s, range 450 u, 4 shots/s, bullet as section 4.2 but single shot, damage 1 |
| Collect | Trails ship and vacuums geoms | Trails at 50 u behind ship, geom magnet radius 260 u, pull speed 900 u/s |
| Ram | Orbits, then charges nearest enemy in range | Orbit radius 60 u, range 400 u, charge 700 u/s, damage 2 on contact (kills any 1 HP enemy), 1.2 s cooldown then returns at 900 u/s; passes through snake bodies without effect |

Drone radius 8 u (visual and Ram contact).

### 4.5 Supers

One super type per level from `LevelDef.superType`. Charge requires 60 geoms. Charge resets to 0 on activation and refills from further geoms, so a super may be used more than once per level. Charge is kept on death.

| Super | Effect | Numbers |
|---|---|---|
| Homing | Player bullets home on the nearest enemy | Duration 5.0 s, acquisition radius 300 u, turn rate 540 deg/s |
| Detonate | Drone explodes | Radius 260 u around drone, kills every enemy (snake heads included, gravity wells excluded), awards normal score and geoms; drone absent for 3.0 s then respawns at ship |
| Turbo | Double fire rate | Duration 5.0 s, 24 volleys/s |

## 5. Geoms and multiplier

| Rule | Value |
|---|---|
| Multiplier start | 1 |
| Increment | plus 1 per geom collected |
| Cap | 999 |
| Reset | To 1 on ship death only |
| Geom radius | 6 u (visual), pickup radius 28 u from ship centre |
| Ship magnet | Geoms within 90 u move toward ship at 600 u/s |
| Lifetime | 4.0 s, blink at 8 Hz during the last 1.0 s |
| Spawn | At the kill position, initial velocity 120 u/s outward at evenly spaced angles, drag 2.5 per second |
| Gravity | Not pulled by wells |
| Live cap | 400; when exceeded, oldest geom removed |

Geoms dropped per kill: Grunt 1, Wanderer 1, Weaver 2, Pinwheel 1, Dart 1, Snake head 4, Spawner 3, Gravity well (shot down) 5. Snake body segments drop nothing.

Score = base value x multiplier at the moment of the kill. Geoms from that kill do not count for that kill.

## 6. Enemy catalogue

### 6.1 Global rules

- Every enemy spawns with a 0.6 s telegraph: a flashing outline at its spawn point at 50 percent alpha, harmless and untargetable.
- Contact with the ship kills the ship (unless invulnerable).
- Enemies collide with arena walls and obstacles: they slide along them (Wanderer and Pinwheel reflect instead).
- Enemies do not collide with each other, except a soft separation force of 80 u/s between same-type enemies closer than the sum of their radii. Why: prevents stacking into one blob without O(n^2) physics cost on large counts beyond a spatial grid.
- All enemy speeds are multiplied by `LevelDef.speedScale` (1.00 to 1.40).
- All variation (Grunt pulse phase, Pinwheel spin direction) comes from LevelDef fields or from the stateless `hash01` in `src/core/rng.ts`. The simulation never constructs or advances a PRNG.

### 6.2 Stats table

| Enemy | Speed (u/s) | HP | Base score | Hitbox radius (u) | Geoms | Spawn unit |
|---|---|---|---|---|---|---|
| Grunt | 150 | 1 | 50 | 14 | 1 | 1 |
| Wanderer | 110 | 1 | 10 | 13 | 1 | 1 |
| Weaver | 190 (dodge 320) | 1 | 100 | 14 | 2 | 1 |
| Pinwheel | 60 | 2 | 25 | 20 | 1 | 1 |
| Dart | 260 | 1 | 30 | 9 | 1 | group of 5 to 8 |
| Snake head | 170 | 6 | 200 | 13 | 4 | 1 (head plus 12 segments) |
| Snake segment | follows head | invulnerable | 0 | 9 | 0 | n/a |
| Spawner | 50 | 12 | 150 | 24 | 3 | hazard, placed by generator |
| Gravity well | 0 | 40 plus 2 per mass | 250 | 24 plus 2 per mass | 5 | hazard, placed by generator |

Gravity well score and HP are an extension of SPEC 3.6, which lists no value for it.

### 6.3 Spawn weight by level index band

Weight 0 means the type is not eligible in that band. The generator samples the roster from eligible types using these weights, without replacement, and then uses the same weights for per-group type choice. Grunt is always forced into the roster.

| Enemy | Band 1 (levels 1 to 5) | Band 2 (6 to 15) | Band 3 (16 to 30) | Band 4 (31+) |
|---|---|---|---|---|
| Grunt | 40 | 30 | 25 | 20 |
| Wanderer | 35 | 20 | 12 | 8 |
| Pinwheel | 25 | 15 | 10 | 8 |
| Weaver | 0 | 20 | 20 | 18 |
| Dart | 0 | 15 | 18 | 20 |
| Snake | 0 | 0 | 15 | 16 |
| Roster size | 3 | 3 to 4 | 4 to 5 | 5 to 6 |
| Spawners per level | 0 | 0 | 0 to 1 | 1 to 2 |
| Gravity wells per level | 0 | 0 to 1 | 1 to 2 | 1 to 3 |

### 6.4 Behaviours

| Enemy | Behaviour detail |
|---|---|
| Grunt | Moves straight toward the ship's current position each tick. Visual scale pulses 0.85 to 1.15 at 2 Hz, phase = `hash01(entityId)`. Hitbox does not pulse. |
| Wanderer | Moves at constant speed on `headingDeg` from its spawn record. Reflects off walls and obstacles (angle of incidence equals angle of reflection). Rotates visually at 180 deg/s. Ignores the ship. |
| Weaver | Seeks like Grunt. Each tick, if any player bullet is within 140 u and the bullet's velocity points at the Weaver (dot product of unit bullet velocity and unit vector bullet to Weaver above 0.8), the Weaver sidesteps perpendicular to the bullet velocity, on the side away from the bullet's line (sign of the 2D cross product), at 320 u/s for 0.25 s. Dodge cooldown 0.4 s. |
| Pinwheel | Drifts at 60 u/s on `headingDeg`, reflects off walls. Spins at 90 deg/s, direction from `hash01(entityId) < 0.5`. |
| Dart | Spawns as a group of 5 to 8 at adjacent points. Each Dart homes on the ship with max turn rate 140 deg/s, starting heading toward the ship. |
| Snake | Head seeks the ship with max turn rate 120 deg/s plus a sine weave of amplitude 40 deg at 1.2 Hz. 12 body segments follow the head's path at 18 u spacing (path history buffer). Only the head takes damage. Segments absorb player bullets. Segments kill the ship on contact. Killing the head removes all segments with a death burst, no extra score. |
| Spawner | Drifts toward the ship at 50 u/s. Activates at `spawnAtSec`. Emits a Dart group of `dartsPerEmit` (5) every `emitEverySec` (band 3: 6.0 s, band 4: 5.0 s), first emit 2.0 s after activation. Stops emitting while 16 or more of its Darts are alive. Emitted Darts get a 0.4 s telegraph instead of 0.6 s. |
| Gravity well | See section 6.7. |

### 6.5 Spawn position rules at runtime

- Fixed spawn points come from the LevelDef. If a fixed point is within 180 u of the ship when its telegraph would start, the simulation uses the point mirrored through the arena centre. If that is also within 180 u, the spawn is delayed 0.5 s and rechecked.
- Ring-around-ship spawns use the ship position at telegraph start plus the LevelDef ring radius and angles. Points outside the arena or inside an obstacle are pulled toward the arena centre along the ray until valid.
- Max live enemies (`LevelDef.waves.maxLiveEnemies`) is a hard cap. Spawns over the cap wait in a FIFO queue.

### 6.6 Speed scaling

`speedScale` per band: 1.00, 1.05, 1.10, 1.20; above level 31, plus 0.005 per level, capped at 1.40. Applies to enemy speeds and Dart turn rate, not to the ship, bullets or wells.

### 6.7 Gravity well numbers

| Property | Value |
|---|---|
| Base radius | 24 u |
| Pull radius | 320 u |
| Pull on ship | acceleration toward well = 900 x (1 minus d / 320) u/s^2 |
| Pull on player bullets | 1800 x (1 minus d / 320) u/s^2 |
| Pull on enemies | 600 x (1 minus d / 320) u/s^2 (snakes and spawners excluded) |
| Feeding | An enemy whose centre enters the well radius is consumed: mass plus 1, radius plus 2 u, no score |
| Mass limit | 20; at mass 20 the well explodes |
| Explosion | Kills every enemy within 220 u (no score), kills the ship if within 220 u and not invulnerable, then the well is removed |
| HP | 40 plus 2 x mass; each player bullet hit does 1 |
| Shot down | Awards 250 x multiplier, drops 5 geoms, removed |
| Contact | Kills the ship |
| Bomb | Resets mass to 0, does not destroy |
| Pulse | Visual ring pulses at 1 Hz plus 0.1 Hz per mass |

## 7. Lives and respawn summary

| Event | Effect |
|---|---|
| Death | Lives minus 1, multiplier to 1, arena clear (no score), 1.5 s delay, vibrate 60 ms |
| Respawn | At (0, 0), 2.0 s invulnerable; gravity wells keep their mass |
| Last life lost | Adventure: results screen, failure. Endless: results screen with high score check |
| Bombs on death | Not refunded |
| Super charge on death | Kept |

## 8. Objectives

From `LevelDef.objective`. Exact ranges are in `docs/02-level-generator.md`.

| Kind | Success | Failure | HUD |
|---|---|---|---|
| scoreInTime | Score is at or above target when the timer reaches 0 (the level runs its full time; stars come from the final score) | Timer reaches 0 below target, or lives reach 0 | Countdown timer, score / target bar until target is met |
| survive | Timer counts down to 0 with lives remaining | Lives reach 0 | Countdown timer |
| destroy | N enemies killed (Darts and snake heads count 1 each, segments and wells 0; bomb and death clears do not count) | Lives reach 0 | Kills / N bar |

Wave schedule loops after its last wave (see generator doc) so destroy levels never run dry.

## 9. HUD layout

All sizes in CSS px. Offsets are from the named screen edge plus that edge's `env(safe-area-inset-*)`. Aspect class is chosen at every resize: `cover` when viewport width / height is 1.8 or more, `main` otherwise.

### 9.1 Cover screen (21:9)

| Element | Anchor | Offset (x, y) | Size | Content |
|---|---|---|---|---|
| Score | top left | 16, 8 | 20 px text | Score with thousands separators |
| Multiplier | top left | 16, 30 | 14 px text | "x" plus multiplier |
| Objective | top centre | 0, 8 | 220 x 16 bar plus 14 px label | Timer or progress bar |
| Lives | top right | 64, 8 | ship icons 12 px, gap 4 | Up to 5 icons, then "x N" |
| Bombs | top right | 64, 26 | circle icons 10 px, gap 4 | Up to 5 icons, then "x N" |
| Pause button | top right | 12, 8 | 40 x 40 hit area, 20 px icon | Two bars |
| Bomb button | bottom centre | 0, 16 | 64 px diameter | Bomb count inside |
| Super button | bottom centre | 0, 92 | 56 px diameter | Charge ring, fills clockwise |
| Par line | top centre | 0, 28 | 12 px text | "Par N" (Adventure) or "Best N" (Endless) |
| Endless segment | top centre | 0, 42 | 12 px text | "Wave N" (Endless only) |

HUD top band height on cover: 52 px. The safe play rect excludes it.

### 9.2 Main screen (10:9)

| Element | Anchor | Offset (x, y) | Size | Content |
|---|---|---|---|---|
| Score | top left | 24, 12 | 28 px text | Score |
| Multiplier | top left | 24, 44 | 18 px text | "x" plus multiplier |
| Objective | top centre | 0, 12 | 320 x 20 bar plus 16 px label | Timer or progress bar |
| Par line | top centre | 0, 40 | 14 px text | Par or Best |
| Endless segment | top centre | 0, 58 | 14 px text | "Wave N" |
| Lives | top right | 80, 12 | ship icons 16 px, gap 6 | As cover |
| Bombs | top right | 80, 36 | circle icons 14 px, gap 6 | As cover |
| Pause button | top right | 16, 12 | 48 x 48 hit area | Two bars |
| Bomb button | bottom centre | 0, 24 | 72 px diameter | Bomb count |
| Super button | bottom centre | 0, 108 | 64 px diameter | Charge ring |

HUD top band height on main: 76 px.

### 9.3 HUD rules

- HUD is drawn in a separate container above the arena, not affected by screen shake or bloom threshold changes except glow alpha from `applyNeon`.
- Buttons consume their pointers; a pointer that starts on a button never becomes a stick.
- HUD re-anchors on every resize, fold and unfold, without reload.
- Text uses the system sans-serif stack. No web fonts.

## 10. Screen flow

```
boot -> menu -> level intro -> play <-> pause
                                  |
                                  v
                               results -> (next level intro | retry level intro | menu)
menu -> settings -> menu
menu -> endless play (no intro card, 1.5 s "Ready" text) -> results -> menu
```

| Screen | Contents | Exits |
|---|---|---|
| Boot | Title "Shape of War", "Tap to start". The tap requests fullscreen and resumes the AudioContext. | Tap to menu |
| Menu | Continue (Adventure at highest unlocked level), Level select (grid of unlocked levels with best stars), Endless, Settings | Each item |
| Level intro | Level number, objective text, par and star thresholds, drone and super names. 3.0 s auto-advance, tap to skip | Play |
| Play | Arena, HUD | Pause button, objective end |
| Pause | Resume, Restart level, Settings, Quit to menu. Simulation halted. Auto-pause on `visibilitychange` to hidden and on aspect class change (fold or unfold) | Each item |
| Results | Success or failure title, score, stars earned, par, best, new best flag. Buttons: Next (success only), Retry, Menu | Each button |
| Settings | Neon slider 0 to 100 with live preview arena (grid plus one of each enemy drifting), Volume slider 0 to 100 (default 70), Reset progress (two-tap confirm) | Back |

Persistence keys (localStorage): `sow.settings.neon` (SPEC), `sow.settings.volume`, `sow.progress.runSeed`, `sow.progress.unlocked`, `sow.scores.adventure` (map of level index to best score and stars), `sow.scores.endless` (top 10 array). All reads tolerate missing or corrupt values and fall back to defaults.

## 11. Colour palette

Base values at neon = 100 before saturation scaling. `applyNeon(n)` multiplies saturation by the factor from SPEC section 4 (0.4 to 1.3) and clamps to 100 percent. Lightness is not changed by the slider.

| Entity | HSL |
|---|---|
| Background | hsl(230, 40%, 4%) |
| Grid lines | hsl(225, 80%, 45%), alpha 0.1 to 0.6 via applyNeon |
| Arena wall and obstacles | hsl(200, 100%, 70%) |
| Ship | hsl(50, 100%, 85%) |
| Player bullet | hsl(45, 100%, 70%) |
| Drone | hsl(170, 90%, 65%) |
| Grunt | hsl(205, 100%, 60%) |
| Wanderer | hsl(275, 90%, 62%) |
| Weaver | hsl(130, 95%, 55%) |
| Pinwheel | hsl(310, 95%, 62%) |
| Dart | hsl(28, 100%, 58%) |
| Snake head | hsl(185, 100%, 60%) |
| Snake segment | hsl(185, 100%, 45%) |
| Spawner | hsl(55, 100%, 55%) |
| Gravity well core | hsl(0, 0%, 100%) |
| Gravity well ring | hsl(355, 95%, 55%) |
| Geom | hsl(95, 100%, 60%) |
| Telegraph outline | entity colour at 50 percent alpha |
| Bomb ring | hsl(200, 100%, 85%) |
| HUD text | hsl(190, 60%, 90%) |
| Multiplier text | hsl(95, 100%, 65%) |
| Super charge ring | hsl(45, 100%, 60%) |
| Stick ring and knob | hsl(190, 60%, 90%) |

Shapes: Grunt diamond, Wanderer four-point star (two crossed squares), Weaver square with inner diamond, Pinwheel four-blade pinwheel, Dart thin arrowhead, Snake head chevron with circle segments, Spawner hexagon with inner hexagon, Gravity well filled core circle with ring, Geom small rhombus, Drone small circle. All drawn as Pixi Graphics strokes, line width 2.5 u, plus glow per SPEC section 4.

## 12. Particles and screen shake

Budget 2000 live particles. When full, a new emit overwrites the oldest. Particles are render-only; they never affect simulation. Variation uses `hash01(eventId, i)`.

| Event | Count | Speed (u/s) | Lifetime (s) | Drag (per s) | Colour |
|---|---|---|---|---|---|
| Grunt, Wanderer, Weaver, Dart death | 24 | 200 to 600 | 0.4 to 0.9 | 3.0 | Enemy colour |
| Pinwheel death | 28 | 150 to 500 | 0.5 to 1.0 | 3.0 | Enemy colour |
| Snake death (head plus segments) | 48 plus 4 per segment | 200 to 700 | 0.5 to 1.1 | 2.5 | Snake head colour |
| Spawner death | 40 | 200 to 650 | 0.5 to 1.0 | 2.5 | Spawner colour |
| Gravity well shot down or explosion | 120 | 300 to 900 | 0.6 to 1.2 | 2.0 | Ring colour then white |
| Ship death | 120 | 250 to 800 | 0.6 to 1.4 | 2.0 | Ship colour plus white |
| Bomb | 200 | 400 to 1200 | 0.5 to 1.0 | 2.0 | Bomb ring colour |
| Geom pickup | 4 | 80 to 160 | 0.2 | 4.0 | Geom colour |
| Bullet hits wall | 3 | 100 to 250 | 0.15 to 0.25 | 6.0 | Bullet colour |
| Telegraph start | 8 | inward 100 | 0.6 | 0 | Entity colour |

Particles are short line segments 6 u long aligned to velocity, alpha fades linearly to 0 over lifetime.

| Shake source | Amplitude (CSS px) | Duration (s) |
|---|---|---|
| Ship death | 14 | 0.50 |
| Gravity well explosion | 12 | 0.45 |
| Bomb | 10 | 0.40 |
| Snake head or Spawner kill | 4 | 0.15 |
| Gravity well shot down | 6 | 0.25 |
| Other kills | 0 | 0 |

Shake: offset = amplitude x (remaining / duration)^2 x direction from `hash01(frame)`. Concurrent shakes take the max amplitude, not the sum. Hard cap 16 px. Applied to the arena container only, never to HUD.

## 13. Audio cue list

All cues are synthesised in `src/audio/synth.ts` with oscillators, a shared white noise buffer, and per-voice gain envelopes (attack 5 ms, exponential release to 0.0001). Master gain = volume / 100 x 0.6. Polyphony cap 24 voices, oldest stolen first.

| Cue | Waveform | Frequency sweep | Duration | Gain | Notes |
|---|---|---|---|---|---|
| fire | square | 880 to 660 Hz, exponential | 40 ms | 0.04 | Max 12 per s (one per volley), 24 during Turbo |
| enemyKill | noise through bandpass | bandpass centre 1200 to 300 Hz | 120 ms | 0.12 | Plus triangle 440 to 110 Hz, 120 ms, gain 0.06 |
| bigKill (Snake, Spawner, well) | noise through lowpass plus sawtooth | lowpass 3000 to 200 Hz; saw 220 to 55 Hz | 400 ms | 0.18 | |
| geomPickup | sine | 1200 to 1800 Hz, plus 10 Hz per multiplier step mod 50 | 50 ms | 0.05 | Max 20 per s |
| telegraph | sine | 300 to 600 Hz | 60 ms | 0.03 | Max 4 per s |
| bomb | noise through lowpass plus sawtooth | lowpass 2000 to 80 Hz; saw 110 to 40 Hz | 900 ms | 0.30 | |
| shipDeath | sawtooth plus noise | saw 440 to 55 Hz; noise lowpass 4000 to 100 Hz | 700 ms | 0.30 | |
| respawn | sine | 220 to 880 Hz | 300 ms | 0.10 | |
| superReady | triangle | arpeggio 523, 659, 784 Hz, steps of 80 ms | 240 ms | 0.10 | |
| superActivate | square | 330 to 1320 Hz | 250 ms | 0.12 | |
| wellPulse | sine | 55 to 50 Hz | 200 ms | 0.04 | Once per well pulse, only when ship within pull radius |
| wellExplode | noise plus sine | noise lowpass 1500 to 60 Hz; sine 80 to 30 Hz | 1200 ms | 0.30 | |
| extraLife | triangle | 660 then 880 then 1320 Hz, steps of 100 ms | 300 ms | 0.12 | Endless only |
| levelStart | triangle | 392 to 784 Hz | 400 ms | 0.10 | |
| levelComplete | triangle | arpeggio 523, 659, 784, 1047 Hz, steps of 120 ms | 480 ms | 0.14 | |
| levelFail | sawtooth | 330 to 110 Hz | 800 ms | 0.12 | |
| uiTap | sine | 1000 Hz flat | 30 ms | 0.05 | |
| uiSlider | sine | 600 plus 6 x value Hz | 20 ms | 0.03 | Max 15 per s while dragging |

No music in v1.

## 14. Cut from v1

Everything in SPEC section 3.7 plus:

- Camera scroll or zoom; the whole arena is always visible.
- Reactive spring grid that warps around explosions and wells. Grid is static.
- Enemy bullets of any kind.
- Music tracks or generative music.
- Player choice of drone or super; both come from the LevelDef (Endless: fixed Attack and Turbo).
- Left-handed control swap.
- Screen shake toggle and colour-blind palettes.
- Boss enemies and enemy types beyond section 6.
- Endless arena shapes other than the fixed rectangle.
- Gravity wells and spawners in Endless.
- Replay recording and ghost runs.
- Haptics beyond the single 60 ms vibrate on death.
- Score submission, cloud sync, accounts.

Cut order under clock pressure is SPEC section 8, unchanged.
