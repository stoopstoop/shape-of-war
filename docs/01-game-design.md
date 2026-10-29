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
- Safe play rect = viewport minus `env(safe-area-inset-*)` minus the HUD columns or bands (section 9). The HUD sits outside the arena on both screens.
- Bounds enforced by the generator validator: arena height 700 to 1100 u, width up to 1800 u, aspect W/H 1.0 to 1.8.
- Ship spawn point is always (0, 0).

## 3. Controls

| Control | Rule |
|---|---|
| Move stick | First pointer down in the left half of the screen (and not on a button) sets the stick origin. Max radius 120 CSS px. Dead zone 12 percent of radius. Velocity = direction x 420 u/s x clamp((len minus dead zone) / (radius minus dead zone), 0, 1). |
| Aim stick | First pointer down in the right half (not on a button). Max radius 120 CSS px. Dead zone 12 percent of radius, the same as the move stick. Past the dead zone, aim angle = stick angle and fire is held. Inside the dead zone, no fire. |
| Stick visuals | Knob only, no base ring: a filled white circle of 21.6 px radius (0.6 x the 36 px knob radius) at 30 percent alpha, at the clamped thumb position. No fade: it disappears the moment the pointer lifts. |
| Bomb button | Bottom right, at the foot of the bomb and super stack (section 9). Tap fires a bomb if bombs > 0 and bomb cooldown elapsed. |
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
| Cap | 512 live player bullets; a new shot at the cap is dropped (shipped behaviour, v1.0.0) |

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
| Live cap | 280; when exceeded, oldest geom removed (shipped behaviour, v1.0.0) |

Geoms dropped per kill: Grunt 1, Wanderer 1, Weaver 2, Pinwheel 1, Dart 1, Snake head 4, Spawner 3, Gravity well (shot down) 5. Snake body segments drop nothing.

Score = base value x multiplier at the moment of the kill. Geoms from that kill do not count for that kill.

## 6. Enemy catalogue

### 6.1 Global rules

- Every enemy spawns with a 0.6 s telegraph: a flashing outline at its spawn point at 50 percent alpha, harmless and untargetable.
- Contact with the ship kills the ship (unless invulnerable).
- Enemies collide with arena walls and obstacles: they slide along them (Wanderer and Pinwheel reflect instead).
- Enemies do not collide with each other, except a soft separation force of 80 u/s between same-type enemies closer than the sum of their radii. Why: prevents stacking into one blob without O(n^2) physics cost on large counts beyond a spatial grid.
- All enemy linear speeds are multiplied by `LevelDef.speedScale` (1.00 to 1.40) and by the arena speed factor (0.88 to 1, section 6.6). Turn rates use `speedScale` only.
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

Enemy linear speeds (the Weaver dodge speed included) are multiplied by `speedScale` x arena factor. Speeds in the section 6.2 table are before scaling.

- `speedScale` per band: 1.00, 1.05, 1.10, 1.20; above level 31, plus 0.005 per level, capped at 1.40. It also scales the Dart turn rate.
- Arena factor: `sqrt(shorter arena span / 900)` clamped to 0.88 to 1 (`src/game/tuning.ts`). A 700 u high arena gives 0.88, 800 u gives 0.94, 900 u and up gives 1. It keeps reaction distance fair when a small arena is drawn small on the cover screen. The Endless arena (1600 x 1000 u) gives 1. It does not scale turn rates.

Neither applies to the ship, bullets or wells.

### 6.7 Gravity well numbers

| Property | Value |
|---|---|
| Base radius | 24 u |
| Pull radius | 320 u |
| Pull on ship | settled pull speed toward well = 160 x (1 minus d / 320)^2 u/s (at most 38 percent of ship speed); pull velocity relaxes toward it at 32 per s, so under 5 percent remains 100 ms after leaving |
| Pull on player bullets | 960 x (1 minus d / 320)^2 u/s^2 |
| Pull on enemies | settled pull speed 107 x (1 minus d / 320)^2 u/s, same 32 per s relaxation (snakes and spawners excluded) |
| Escape | moving directly away, the ship always makes at least 260 u/s (62 percent) |
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

The HUD is a DOM overlay that owns fixed columns or bands at the screen edges. The arena play rect is what is left, and the arena is fitted inside it, so no HUD element sits over the arena. The layout is the pure `hudFrame` in `src/ui/hudFrame.ts`.

### 9.1 Cover screen (21:9)

Two side columns and no top band: the left column is 160 px wide (score and objective text), the right column is 112 px wide (pause, lives, bombs, super and bomb buttons). The play rect is the full height between them.

| Element | Anchor | Offset (x, y) | Size | Content |
|---|---|---|---|---|
| Score | top left | 16, 8 | 20 px text | Score with thousands separators |
| Multiplier | top left | 16, 32 | 14 px text, 52 px wide box | "x" plus multiplier |
| Weapon indicator | top left, right of the multiplier | 76, 32 | 10 px label, 5 px high bar below it | Weapon name and time left. Hidden while the weapon is Spread (docs/11) |
| Objective bar | top left | 16, 58 | 136 x 12 bar | Progress fill |
| Objective label | top left | 16, 72 | 11 px text, up to 2 lines | Objective text, see below |
| Level line | top left | 16, 106 | 11 px text, up to 2 lines | Adventure: "L3  Par 1,000  #abcd1234" (level, par, level hash). Endless: "Endless  Seed N  m:ss" |
| Pause button | top right | centre 32 in from the top and right edges | 56 x 56 hit area, 20 px icon | Two bars |
| Lives | right column, right aligned | right edge 12 in, y 64 | 12 px icons | Up to 5 icons, then one icon and "x N" |
| Bombs | right column, right aligned | right edge 12 in, y 82 | 10 px icons | As lives |
| Super label | right column, centred | stacked just above the super hit circle | 11 px text | "SUPER: HOMING" (or DETONATE, TURBO) |
| Super hint | right column, centred | directly under the label | 9 px text | "charges with geoms", or "ready: tap ring" at full charge |
| Super button | right column | centre 56 in from the right edge, 120 up from the bottom | 56 px ring, 76 px hit circle | Charge ring, fills clockwise |
| Bomb button | right column | centre 56 in from the right edge, 48 up from the bottom | 64 px ring, 88 px hit circle | Bomb count inside |

Objective text: score in time shows "1,200 / 5,000  1:23" (score, target, time left) and "Target met  1:23" once the target is reached; survive shows "Survive 1:23"; destroy shows "Destroy 4 / 20". Endless shows "Endless" with an empty bar. The Endless wave number is not shown.

### 9.2 Main screen (10:9)

A top band of text rows, 60 px high, then the bomb and super buttons in one of two arrangements. `hudFrame` builds both for the current viewport and arena and keeps the one that leaves the larger arena scale; a tie keeps the right column.

- Right column: the buttons sit in a 92 px wide column at the right edge, below the top band.
- Bottom band: the buttons sit in a full width band at the bottom edge, 158 px high.

Top band rows (both arrangements):

| Element | Anchor | Offset (x, y) | Size | Content |
|---|---|---|---|---|
| Score | top left | 24, 6 | 28 px text | Score |
| Multiplier | top left | 24, 38 | 18 px text, up to 64 px wide box | "x" plus multiplier |
| Weapon indicator | top left, right of the multiplier | 8 px right of the multiplier box, y 38 | 12 px label, 5 px high bar at y 54 | As cover |
| Objective | top centre | 0, 8 | up to 320 x 20 bar with the 14 px label centred over it | Objective text, as cover |
| Level line | top centre | 0, 32 | 14 px text | As cover |
| Lives | top right | right edge 80 in, y 8 | 16 px icons | As cover |
| Bombs | top right | right edge 80 in, y 32 | 14 px icons | As cover |
| Pause button | top right | centre 32 in from the top and right edges | 56 x 56 hit area, 24 px icon | Two bars |

Buttons:

| Element | Anchor | Offset (x, y) | Size | Content |
|---|---|---|---|---|
| Bomb button | bottom right | centre 48 in from the right edge (right column) or 56 in (bottom band), 48 up from the bottom | 72 px ring, 88 px hit circle | Bomb count |
| Super button | stacked above the bomb | same x, 120 up from the bottom | 64 px ring, 76 px hit circle | Charge ring |
| Super label and hint | right column or bottom band | right column: just above the super hit circle, wrapped to 2 lines. Bottom band: left of the super ring, right aligned | right column 12 px label and 10 px hint; bottom band 13 px and 11 px | As cover |

The bomb and super stack hugs the bottom right corner. Its centre is 56 px in from the right edge of the button area, clamped so both hit circles stay inside a narrow column.

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
| Level intro | Level number, objective text, par and star thresholds, drone and super names. 1.5 s auto-advance, tap to skip | Play |
| Play | Arena, HUD | Pause button, objective end |
| Pause | Resume, Restart level, Settings, Quit to menu. Simulation halted. Auto-pause on `visibilitychange` to hidden and on aspect class change (fold or unfold) | Each item |
| Results | Success or failure title, score, stars earned, par, best, new best flag. Buttons: Next (success only), Retry, Menu | Each button |
| Settings | Neon slider 0 to 100 with live preview arena (grid plus one of each enemy drifting), Volume slider 0 to 100 (default 70), Music slider (0 is off), Space physics (Off, Low, Medium, High), Weapon pickups (On, Off), Effects (Low, Standard, High), Show FPS toggle, Glow toggle (Bloom or Fallback), Play seed (a run seed field and button that start Adventure level 1 on that seed, with a line under the field showing its level 1 hash), Reset progress (two-tap confirm). The Music, Space physics, Weapon pickups and Effects rows are specified in docs/11. A "build" version line sits at the foot; five taps on it within 3 s reveal a debug button, "Stress: 400 entities, 2000 particles" | Back |

Persistence keys (localStorage): `sow.settings.neon` (SPEC), `sow.settings.volume`, `sow.progress.runSeed`, `sow.progress.unlocked`, `sow.scores.adventure` (map of level index to best score and stars), `sow.scores.endless` (top 10 array). All reads tolerate missing or corrupt values and fall back to defaults.

## 11. Colour palette

Entity hues are the shipped `BASE_PALETTE` hues in `src/render/neon.ts`. Saturation and lightness cells are starting values; the code's base saturation for the v1 enemies, geom and well ring is 75 percent. `applyNeon(n)` multiplies saturation by the factor from SPEC section 4 (0.4 to 1.3) and clamps to 100 percent. Lightness is not changed by the slider.

| Entity | HSL |
|---|---|
| Background | hsl(230, 40%, 4%) |
| Grid lines | hsl(225, 80%, 45%), alpha 0.1 to 0.6 via applyNeon |
| Arena wall and obstacles | hsl(200, 100%, 70%) |
| Ship | hsl(0, 0%, 100%), white |
| Player bullet | hsl(55, 100%, 70%) |
| Drone | hsl(0, 0%, 95%), white |
| Grunt | hsl(215, 100%, 60%) |
| Wanderer | hsl(275, 90%, 62%) |
| Weaver | hsl(125, 95%, 55%) |
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
| Stick knob (no ring) | white at 30 percent alpha |

Shapes: Grunt square with an inner diamond, Wanderer bow tie (two triangles meeting at the centre), Weaver diamond with an inner square, Pinwheel four-blade pinwheel, Dart thin arrowhead, Snake head hexagon with a centre dot and circle segments, Spawner octagon with an inner square, Gravity well outer and inner ring around a filled white core, Geom small rhombus, Drone circle with a cross. The shape registry is `src/render/shapeSpecs.ts`. All drawn as Pixi Graphics strokes, line width 2.5 u, plus glow per SPEC section 4.

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
| geomPickup | sine | 1200 to 1800 Hz, exponential | 50 ms | 0.05 | Max 20 per s. Every pickup plays the same sweep; the pitch step per multiplier (see 13.1) is not implemented |
| telegraph | sine | 300 to 600 Hz | 60 ms | 0.03 | Max 4 per s |
| bomb | noise through lowpass plus sawtooth | lowpass 2000 to 80 Hz; saw 110 to 40 Hz | 900 ms | 0.30 | |
| shipDeath | sawtooth plus noise | saw 440 to 55 Hz; noise lowpass 4000 to 100 Hz | 700 ms | 0.30 | |
| respawn | sine | 220 to 880 Hz | 300 ms | 0.10 | |
| superReady | triangle | arpeggio 523, 659, 784 Hz, steps of 80 ms | 240 ms | 0.10 | |
| superActivate | square | 330 to 1320 Hz | 250 ms | 0.12 | |
| levelStart | triangle | 392 to 784 Hz | 400 ms | 0.10 | |
| levelComplete | triangle | arpeggio 523, 659, 784, 1047 Hz, steps of 120 ms | 480 ms | 0.14 | |
| levelFail | sawtooth | 330 to 110 Hz | 800 ms | 0.12 | |
| uiTap | sine | 1000 Hz flat | 30 ms | 0.05 | |
All 14 cues in the table are defined in `src/audio/cues.ts` and play at v2.1.

### 13.1 Designed, not implemented

These have no entry in `src/audio/cues.ts` and never play. They are out of scope until Fable queues them. The numbers are the original design.

| Cue | Waveform | Frequency sweep | Duration | Gain | Notes |
|---|---|---|---|---|---|
| geomPickup pitch step | sine | geomPickup sweep plus 10 Hz per multiplier step mod 50 | 50 ms | 0.05 | Max 20 per s, as the shipped geomPickup |
| wellPulse | sine | 55 to 50 Hz | 200 ms | 0.04 | Once per well pulse, only when ship within pull radius |
| wellExplode | noise plus sine | noise lowpass 1500 to 60 Hz; sine 80 to 30 Hz | 1200 ms | 0.30 | |
| extraLife | triangle | 660 then 880 then 1320 Hz, steps of 100 ms | 300 ms | 0.12 | Endless only |
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
