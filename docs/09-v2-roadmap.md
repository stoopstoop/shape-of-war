# Shape of War: v2 roadmap

Derived from SPEC.md. If this file conflicts with SPEC.md, SPEC.md wins for v1. For v2, this file plus a v2 SPEC addendum written by Scribe at V2 kickoff become canon.

v2 restores everything cut from v1 (SPEC 3.7, 01 section 14, anything taken from the SPEC 8 cut order). It starts only after tag v1.0.0 exists and G4 passed. Same orchestration model (SPEC 7), same roster plus two new agents, same style and engineering rules (CLAUDE.md), with three explicit exceptions listed in section 3: gamepad input, haptics beyond death, and music.

Online leaderboards, accounts, score submission and cloud sync stay cut forever. Personal use only.

## 1. Bad news first: the renderer must change

1. 3D curved arena surfaces cannot be done in PixiJS 2D. Faking them with 2D warps breaks at the torus and sphere. v2 replaces `src/render/` entirely.
2. Recommendation: Three.js (WebGLRenderer, not WebGPURenderer) with `EffectComposer`, `RenderPass`, `UnrealBloomPass` and `OutputPass` from the examples postprocessing addons. Why: UnrealBloomPass is the closest off the shelf match to the v1 bloom look, and the WebGL path matches what v1 already proved on the Fold.
3. What stays: `src/game`, `src/levelgen`, `src/input`, `src/core`, `src/ui`, `src/audio`. What goes: every file in `src/render`, plus `pixi.js` and `pixi-filters` from package.json once V2-G0 passes.
4. This is feasible only because v1's simulation never imports the renderer. The sim consumes a LevelDef and an InputState and writes typed arrays; the renderer reads them. If any v1 file outside `src/render` imports `pixi.js`, fix that first. Gate check: `grep -rln "pixi" src | grep -v src/render` returns nothing.
5. Two v1 hooks make the migration free:
   - LevelDef carries a reserved field `surface: 'flat'` from v1 W2, so v1 LevelDefs, fixtures and hashes stay valid in v2 with no migration.
   - Arena coordinates are abstract arena units (03, knowns table), mapped to pixels only by the renderer. v2 reinterprets the same units as (u, v) surface parameters.

### Main risks

| Risk | Impact | Mitigation |
|---|---|---|
| UnrealBloomPass cost on the main screen (2184 x 1968, DPR cap 2) | Below 60 fps with 400 entities and 2000 particles | Bloom at half resolution, `InstancedMesh` for enemies and bullets, one `Points` or instanced quad buffer for particles, DPR cap 2 kept; fallback is additive glow sprites, same as v1. Decision at V2-G0 |
| Agents mixing Three.js r1xx APIs (`three/examples/jsm` vs `three/addons`, removed `Geometry`, colour management and `outputColorSpace` changes, `BufferGeometry` attribute API) | Code that compiles against nothing or renders washed out | Same mitigation as v1 Pixi: Shipwright pins the exact `three` version at V2-W0 and Lens writes `docs/three-cheatsheet.md` from the installed `@types/three` before any render code. Review rejects any import not in the cheatsheet |
| Camera and touch aim on a curved surface | Aim feels wrong when the camera rolls; motion sickness from a twitchy camera | Aim in the ship's tangent frame (section 2.4), smoothed chase camera, flat levels keep the v1 fixed top view |
| Seek and collision across wrap seams | Enemies chase the long way round; misses at the seam | One `surface.delta()` used everywhere; spatial hash wraps (section 2.3); grep gate on raw subtraction |
| Metric distortion on torus and sphere | Visible speed varies across the surface | Bounded by generator constraints (section 2.2); accepted, not corrected, in v2 |

## 2. Curved surface design

### 2.1 Principle

Simulation stays 2D. Every entity position is (u, v) in arena units, exactly as v1's (x, y). Each surface is a parametric map from (u, v) to xyz plus a topology descriptor. Only the renderer and camera call the map. The sim calls only `delta`, `wrap` and the bounds, all pure and in `src/core/surface.ts`.

Arena in v2: u in [-W/2, W/2), v in [-H/2, H/2), where W and H are `arena.width` and `arena.height`. Distance, speed and radii stay in arena units measured in parameter space. For flat and cylinder this is exact. For torus and sphere it is an approximation the generator bounds.

Wrapping rule on a wrapped axis of length L: `d = ((d + L/2) mod L + L) mod L - L/2`. Bounded axes use v1 wall collision unchanged.

### 2.2 Surface catalogue

θ = 2πu/W throughout.

| Surface | Map (u, v) to (x, y, z) | Topology | Bounds behaviour |
|---|---|---|---|
| flat | (u, v, 0) | bounded | v1 arena shapes and walls, unchanged |
| cylinder | R = W/2π; (R cos θ, v, R sin θ) | wrap u | walls at v = ±H/2 (rims); no wall in u |
| torus | R = W/2π, r = H/2π, φ = 2πv/H; ((R + r cos φ) cos θ, r sin φ, (R + r cos φ) sin θ) | wrap u and v | no walls at all; obstacles only |
| sphere | ρ = W/2π, λ = v/ρ with abs(λ) up to 60°; (ρ cos λ cos θ, ρ sin λ, ρ cos λ sin θ) | wrap u, v clamped | walls at λ = ±60° (polar caps are off limits and drawn as a glowing ring) |
| capsule | R = W/2π, half length C; for abs(v) up to C: cylinder; beyond: s = (abs(v) - C)/R up to 60°, (R cos s cos θ, sign(v)(C + R sin s), R cos s sin θ) | wrap u, v clamped | walls at s = 60° on each cap |
| twisted band | R = W/2π, k half twists, α = kθ/2; ((R + v cos α) cos θ, v sin α, (R + v cos α) sin θ) | wrap u; if k odd, crossing the u seam maps v to -v (Mobius) | walls at v = ±H/2 (band edges) |

Generator constraints that keep distortion bounded:
- torus: W at least 3H, so inner ring scale (R - r)/R is at least 0.67 and outer (R + r)/R at most 1.33.
- sphere: v range is ±60° of latitude, H = 2ρ x π/3, so u scale at the walls is cos 60° = 0.5. Entities near the walls look squeezed in u; accepted.
- capsule: same 60° cap rule; the cylinder section carries most of the play.
- twisted band: H/2 below 0.5R so the band never self intersects. v2 default k = 2 (one full twist, orientable, plain wrap). k = 1 is an open question (section 6).
- W and H are multiples of the 64 unit hash cell on wrapped axes, so the hash grid tiles the seam exactly.

### 2.3 Distance, seek and collision across seams

- `surface.delta(a, b)` returns the shortest b minus a in parameter space, applying the wrap rule per wrapped axis. On a Mobius band with k odd, the delta also considers the mirrored image (u ± W, -v) and returns the shorter of the two.
- Every seek, dodge, homing, gravity pull, drone orbit and collision test uses `delta`. Raw `bx - ax` in `src/game` is a review failure from V2-W1. Gate check: `grep -rnE "\.x\[[a-z]+\] - |x\[j\] - x\[i\]" src/game` reviewed by Fable, plus a Proctor test that seeds a Grunt and the ship on opposite sides of each seam.
- `surface.wrap(pos)` runs once per entity per step after integration. On a Mobius crossing it also negates the entity's v velocity and mirrors its heading.
- Spatial hash: cell indices are taken modulo the cell count on wrapped axes, and neighbour queries wrap. Same 64 unit cell, same 38 x 38 cap.
- Spawn ring entries (`mode: 'ring'`) place points with `delta` arithmetic and then `wrap`, so rings straddle seams correctly.

### 2.4 Camera and touch aim

- Flat levels: camera mode `fit`, orthographic, whole arena visible, matching v1 framing pixel for pixel at V2-G0.
- Curved levels: camera mode `chase`. Target point p = map(ship). Frame from `surface.frame(u, v)`: unit tangents du, dv and normal n. Camera position = p + n x height - dv x back, looking at p + dv x lead, up vector dv. Default tilt about 25° from the normal, height and lead tuned at V2-G1. Position smoothed with exponential damping (time constant about 0.12 s); orientation slerped with the same constant. Screen right follows du, screen up follows dv, so the view is stable and never spins with the ship's heading.
- Fold or unfold: only `camera.fov` and `camera.aspect` change, then `updateProjectionMatrix()`. Cover screen (21:9) vertical fov about 38°, main screen (10:9) about 55°, chosen so the visible play area is similar in arena units. Tunable at V2-G1.
- Touch aim: the stick vector is interpreted in the ship's local tangent frame, not screen space. Because the chase camera aligns screen right to du and screen up to dv, stick (x, y) maps to parameter direction (x, y) after removing the camera's residual roll relative to that frame. The camera publishes `rollRad`; glue in `main.ts` rotates both sticks by `-rollRad` before they enter InputState. The sim never sees screen space, so recorded input streams remain deterministic and replayable. Same rule applies to the move stick.

### 2.5 Generator change

`surface` is drawn from a separate PRNG stream, `mulberry32(deriveSeed(seed, SURFACE_SALT))`, after the v1 draw sequence completes. Why: the v1 draw order is untouched, so every flat level keeps its v1 LevelDef and hash.

| Band | Surface weights |
|---|---|
| 1 | flat only |
| 2 | flat 50, cylinder 50 |
| 3 | flat 20, cylinder 30, capsule 25, torus 25 |
| 4 | cylinder 15, capsule 15, torus 25, sphere 25, twistedBand 20 |

Non-flat surfaces force `arena.shape` to `'rect'` or `'rectObstacles'` (axis aligned in uv), then dimensions are adjusted deterministically to meet section 2.2 constraints. Circle, hexagon and roundRect remain flat only. Gravity wells and spawners are placed with `delta` distances. `GENERATOR_VERSION` becomes 2; `LEVELDEF_VERSION` becomes 2.

### 2.6 TypeScript interface additions

```ts
// src/core/surface.ts (v1 ships the flat subset; v2 adds frame, toXYZ for all kinds, params)
export type SurfaceKind = 'flat' | 'cylinder' | 'torus' | 'sphere' | 'capsule' | 'twistedBand';
export interface Vec3 { x: number; y: number; z: number; }
export interface Topology {
  wrapU: boolean;
  wrapV: boolean;
  /** twistedBand with odd halfTwists: crossing the u seam maps v to -v. */
  flipVOnWrapU: boolean;
}
export interface SurfaceFrame { p: Vec3; du: Vec3; dv: Vec3; n: Vec3; } // unit vectors
export interface SurfaceParams {
  /** capsule only: half length of the cylinder section in arena units. */
  halfLength?: number;
  /** twistedBand only: number of half twists, default 2. */
  halfTwists?: number;
  /** sphere and capsule: latitude or cap angle limit in degrees, default 60. */
  clampDeg?: number;
}
export interface Surface {
  readonly kind: SurfaceKind;
  readonly topology: Topology;
  readonly width: number;   // u extent
  readonly height: number;  // v extent
  /** Shortest b minus a in parameter space. Writes into out, returns out. */
  delta(ax: number, ay: number, bx: number, by: number, out: { x: number; y: number }): { x: number; y: number };
  /** Canonicalise a position. Returns true if a Mobius flip occurred (caller mirrors v velocity). */
  wrap(pos: { x: number; y: number }): boolean;
  toXYZ(u: number, v: number, out: Vec3): Vec3;          // render and camera only
  frame(u: number, v: number, out: SurfaceFrame): SurfaceFrame; // v2, render and camera only
}
export function makeSurface(kind: SurfaceKind, width: number, height: number, params?: SurfaceParams): Surface;
export const flatSurface: (width: number, height: number) => Surface; // v1

// src/levelgen/leveldef.ts, v2 deltas
export const LEVELDEF_VERSION = 2;
export interface LevelDef {
  // ...all v1 fields unchanged...
  surface: SurfaceKind;          // v1: literal 'flat'
  surfaceParams?: SurfaceParams; // v2 only, omitted for flat
}

// src/render/camera.ts (Lens)
export interface ArenaCamera {
  readonly mode: 'fit' | 'chase';
  readonly rollRad: number;      // residual roll vs ship tangent frame, for aim glue
  follow(u: number, v: number, dt: number): void;
  resize(cssW: number, cssH: number): void; // fov and aspect only
}
```

v1 LevelDefs (version 1, `surface: 'flat'`) are accepted by the v2 validator unchanged; the validator upgrades `version` in memory only.

## 3. Other cut items restored

Each subsection: scope, modules touched (owner), tests, device check. Items not cut in v1 are verified, not rebuilt; Fable checks `docs/STATUS.md` at v1.0.0 for what was actually cut.

### 3.1 Endless mode (only if cut in v1)
- Scope: as SPEC 3.2 and 01 section 2.2, now on any surface (Endless default: cylinder). Lifts the v1 cuts on Endless arena shapes, wells and spawners.
- Modules: `src/levelgen/` (Foundry), `src/ui/menu.ts` (Ledger).
- Tests: segment determinism, 30 minute soak in vitest at fast step.
- Device: 5 minutes of Endless, score saved after relaunch.

### 3.2 Super abilities
- Scope: Homing, Detonate, Turbo per SPEC 3.5; homing targeting uses `delta`.
- Modules: `src/game/supers.ts` (Swarm), super button (Thumbs).
- Tests: charge from geoms, each super duration, homing across a seam.
- Device: trigger each super once on a cylinder level.

### 3.3 Snake enemy
- Scope: SPEC 3.4. Body segments follow with lag using `delta`, so the body bends across seams.
- Modules: `src/game/enemies/snake.ts` (Swarm), `GenConfig.enableSnake` default true (Foundry).
- Tests: only head vulnerable; segment chain continuous across a wrap.
- Device: snake crosses the cylinder seam without tearing.

### 3.4 Three-star thresholds
- Scope: `stars()` and results UI per SPEC 3.6; best stars per level persisted.
- Modules: `src/game/scoring.ts`, `src/ui/results.ts` (Ledger).
- Tests: par, 2x, 4x and just below each.
- Device: finish one level, stars match score.

### 3.5 Audio and procedural music
- Scope: restore the 01 section 13 sfx if cut. Add music: a Web Audio step sequencer with a lookahead scheduler (timer every 25 ms schedules notes 100 ms ahead on `AudioContext.currentTime`). Tempo, scale and patterns derived from a music Rng seeded from the level seed (separate stream, never the sim Rng). Intensity layers (bass, arp, percussion noise) rise with wave index. Still no audio files.
- Modules: `src/audio/` (Glow), music volume in settings (Ledger).
- Tests: pattern generator determinism per seed, scheduler emits monotonic times (fake clock).
- Device: music starts after first tap, no drift or stutter over 3 minutes, survives fold.

### 3.6 Spawner enemy
- Scope: SPEC 3.4, emits Darts on a timer; placement on curved surfaces uses `delta`.
- Modules: `src/game/enemies/spawner.ts` (Swarm), `GenConfig.enableSpawner` (Foundry).
- Tests: emit cadence, dart count, max live cap respected.
- Device: band 3 level with a spawner.

### 3.7 Drone types Collect and Ram
- Scope: SPEC 3.5. Collect vacuums geoms in a radius; Ram charges the nearest enemy by `delta`.
- Modules: `src/game/drones.ts` (Swarm), `GenConfig.drones` default all (Foundry).
- Tests: collect radius, ram target selection across a seam.
- Device: one level each.

### 3.8 Enemy bullets
- Scope: lifts the 01 section 14 cut. Slow aimed shots from Spawners (band 3 and up) only; no new enemy types. Pooled like player bullets; ship hit counts as death; bombs clear them.
- Modules: `src/game/bullets.ts` (Forge), `src/game/enemies/spawner.ts` (Swarm), render instancing (Lens).
- Tests: pool reuse, collision with ship, wrap.
- Device: dodge enemy bullets for 30 seconds, frame rate holds.

### 3.9 Dynamic deforming grid
- Scope: the signature grid reacting to explosions, wells and bombs. Spring mass lattice in (u, v), wrapped on wrapped axes, Verlet integration at a fixed 60 Hz sub rate, impulses from bus events (`fx:explode`, `fx:bomb`, wells as continuous pull). Rendered as lines on the surface: each node displaced along the surface normal and in the tangent plane, positions uploaded to one `LineSegments` buffer per frame. Cosmetic only, never read by the sim, so determinism is untouched. Brightness driven by `applyNeon` grid alpha.
- Modules: `src/fx/lattice/` (pure sim) and `src/render/lattice/` (lines), both Lattice.
- Tests: rest state stable, impulse decays to rest, energy bounded, wrap continuity at seams, node count cap (64 x 64).
- Device: bomb on main screen, grid ripples, fps holds 60.

### 3.10 Achievements stored locally
- Scope: about 20 achievements evaluated by a pure function over bus events; localStorage key `sow.ach`; list screen.
- Modules: `src/game/achievements.ts`, `src/ui/achievements.ts` (Ledger).
- Tests: each trigger, idempotent unlock, corrupt storage recovers.
- Device: unlock one, relaunch, still unlocked.

### 3.11 Haptics beyond death
- Scope: `navigator.vibrate` patterns for bomb, super, level clear, near miss with a well; settings toggle `sow.settings.haptics` default on. Rate limited to one pulse per 150 ms.
- Modules: `src/input/haptics.ts` (Thumbs), toggle (Ledger).
- Tests: rate limiter, disabled toggle sends nothing (stubbed navigator).
- Device: feel each pattern; toggle off silences all.

### 3.12 Multiple ship types
- Scope: three data driven `ShipDef`s (balanced, fast with narrow spread, slow with wide spread). Selected on the menu; scores keyed by ship.
- Modules: `src/game/ship.ts` (Forge), `src/ui/menu.ts` (Ledger), ship shapes (Lens).
- Tests: each ShipDef valid, fire pattern counts.
- Device: play one level with each ship.

### 3.13 Gamepad support (optional)
- Scope: Gamepad API polled once per frame, standard mapping only, mapped into the same InputState (left stick move, right stick aim, triggers bomb and super). Touch stays primary; gamepad is additive. Lifts the v1 "no gamepad code" review rule for `src/input/gamepad.ts` only. Keyboard stays out.
- Modules: `src/input/gamepad.ts` (Thumbs).
- Tests: axis dead zone and mapping with a stubbed `navigator.getGamepads`.
- Device: Bluetooth controller paired to the Fold, play one level, disconnect mid level falls back to touch.

### 3.14 Local leaderboards per seed
- Scope: top 10 per (generatorVersion, runSeed, levelIndex, ship) in localStorage key `sow.lb.<gv>.<runSeed>.<level>`; total store capped at 500 entries, oldest evicted. Initials entry optional.
- Modules: `src/game/leaderboard.ts`, `src/ui/results.ts` (Ledger).
- Tests: insert ordering, cap eviction, version separation.
- Device: play the same seed twice, both scores listed.

## 4. Build plan

Clock free: each wave starts when the previous gate passes. Same rules as v1: one builder per directory per wave, branches `feat/<nickname>-<slug>`, Fable merges with `git merge --no-ff` after `npm test` and `npm run build`, session split at every landing wave.

New agents:
- Lens (Opus): Three.js renderer, camera, bloom, neon mapping, entity instancing. Owns `src/render/` except `src/render/lattice/`.
- Lattice (Opus): deforming grid. Owns `src/fx/lattice/`, `src/render/lattice/`, `tests/lattice/`.
- Glow moves to `src/audio/` for v2. Its Pixi knowledge retires with `src/render`.

Effort figures are estimates in agent hours, not commitments.

### V2-W0 scaffold, gate V2-G0: Three.js renders v1 flat levels identically

| Agent | Exclusive directories | Brief |
|---|---|---|
| Shipwright (Sonnet) | package.json, vite config, `docs/three-cheatsheet.md` skeleton | Pin `three` and `@types/three`, record versions, branch `feat/shipwright-three` |
| Lens (Opus) | `src/render/` | Write cheatsheet from installed types first. Reimplement `GameRenderer` in Three: `fit` orthographic camera, instanced shapes, UnrealBloomPass at half resolution, glow sprite fallback, `applyNeon` mapped to bloom strength, threshold, radius and material colours |
| Proctor (Sonnet) | `tests/render/` | Golden screenshot harness for 3 fixture LevelDefs, Pixi vs Three side by side |

Estimate: 10 agent hours. Gate checks by Fable: no `pixi` import outside `src/render`; `npm test` green; v1 fixture hashes unchanged.

```text
V2-G0 device check, about 8 minutes. Confirm build id <id>.
1. Play level 1 folded, then unfolded. Expect: looks like v1, bloom visible.
2. Settings > Show FPS on. Unfolded, play 30 seconds. Note FPS. Switch to Fallback, 30 seconds, note FPS.
3. Drag the neon slider 0 to 100. Expect: visible change on both paths.
Paste back:
V2-G0: looks_like_v1=<yes/no> fps_main_bloom=<n> fps_main_sprite=<n> neon_ok=<yes/no> notes=<text>
```

### V2-W1 cylinder, gate V2-G1: cylinder playable

| Agent | Exclusive directories | Brief |
|---|---|---|
| Forge (Opus) | `src/core/surface.ts`, `src/game/world.ts`, `src/game/ship.ts`, `src/game/bullets.ts`, collision | Full `Surface` for flat and cylinder, wrap in world step, wrapped spatial hash |
| Swarm (Opus) | `src/game/enemies/`, `drones.ts`, `supers.ts` | Replace every raw subtraction with `surface.delta` |
| Lens (Opus) | `src/render/` | Cylinder mesh and grid lines, `chase` camera, `rollRad`, fold handling via fov and aspect |
| Thumbs (Sonnet) | `src/input/` | Tangent frame stick rotation helper, pure, tested |

Estimate: 14 agent hours. Fable glue: rotate sticks by `-rollRad` in `main.ts`; temporary `?surface=cylinder` URL override.

```text
V2-G1 device check, about 8 minutes. Open ?seed=42&level=3&surface=cylinder&debug=1
1. Fly across the seam 5 times. Expect: no jump, enemies follow across it.
2. Aim straight up on the stick while the camera tilts. Expect: shots go screen up.
3. Fold and unfold mid level. Expect: only zoom changes, no reload.
Paste back:
V2-G1: seam_ok=<yes/no> aim_ok=<yes/no> fold_ok=<yes/no> fps_cover=<n> fps_main=<n> camera_comfort=<1-5> notes=<text>
```

### V2-W2 torus and sphere, gate V2-G2: all surfaces playable, generator chooses them

| Agent | Exclusive directories | Brief |
|---|---|---|
| Forge (Opus) | `src/core/surface.ts` | Torus, sphere, capsule, twisted band maps, frames, Mobius flip if approved |
| Foundry (Opus) | `src/levelgen/`, `tests/levelgen/` | Surface stream, band weights, dimension constraints, validator v2, 1000 seed test across bands |
| Lens (Opus) | `src/render/` | Meshes for all surfaces, polar ring walls, camera behaviour at sphere walls |

Estimate: 16 agent hours.

```text
V2-G2 device check, about 10 minutes.
1. Open ?level=30 and ?level=45. Note the surface shown in the debug label.
2. Play 60 seconds on a torus and on a sphere. Expect: no seam tears, wall at sphere rims.
3. Retry once. Expect: same surface and same level hash.
Paste back:
V2-G2: torus_ok=<yes/no> sphere_ok=<yes/no> band1_flat=<yes/no> retry_same=<yes/no> fps_main=<n> notes=<text>
```

### V2-W3 grid and restored features, gate V2-G3

| Agent | Exclusive directories | Brief |
|---|---|---|
| Lattice (Opus) | `src/fx/lattice/`, `src/render/lattice/`, `tests/lattice/` | Section 3.9 |
| Swarm (Opus) | `src/game/enemies/`, `drones.ts`, `supers.ts` | 3.2, 3.3, 3.6, 3.7, Spawner bullets from 3.8 |
| Ledger (Opus) | `src/ui/`, `scoring.ts`, `achievements.ts`, `leaderboard.ts`, settings | 3.1, 3.4, 3.10, 3.14, ship select UI |
| Glow (Opus) | `src/audio/` | 3.5 |
| Thumbs (Sonnet) | `src/input/` | 3.11, 3.13 |
| Forge (Sonnet) | `bullets.ts`, `ship.ts` | Enemy bullet pool, ShipDefs |

Lens does not run in W3; Fable glue adds instancing for new kinds or a short Lens fixer run after Lattice merges. Estimate: 30 agent hours.

```text
V2-G3 device check, about 15 minutes.
1. Bomb on the main screen. Expect: grid ripples, fps holds.
2. Trigger each super; see Snake, Spawner bullets, Collect and Ram drones.
3. Music plays and rises with waves; haptics fire on bomb and level clear.
4. Unlock one achievement, relaunch, check it persists. Check leaderboard after two runs on one seed.
5. Optional: pair a Bluetooth controller and play one level.
Paste back:
V2-G3: grid_ok=<yes/no> fps_main_bomb=<n> supers=<ok/fail> enemies=<ok/fail> music=<ok/fail> haptics=<ok/fail> ach=<ok/fail> lb=<ok/fail> gamepad=<ok/fail/skipped> notes=<text>
```

### V2-W4 harden, gate V2-G4: tag v2.0.0

Proctor (Sonnet) extends `docs/device-checklist.md` with a v2 section; one Opus fixer per failing area, owning only that area's directory. Estimate: 8 agent hours. Gate: full checklist green on device, `git tag v2.0.0`, deploy, offline launch works. Paste back the filled V2-G4 block from the checklist.

## 5. v1 hooks to land before v1 ships

Total budget under 30 minutes. Already in the W2 Foundry brief (05, task 6). Must not expand v1 scope: nothing in v1 reads `surface` beyond the validator and one test.

1. `surface: 'flat'` added to `LevelDef` as a literal type, emitted by `generateLevel`, and checked by `validateLevel` (any other value is an error in v1).
2. `src/core/surface.ts` with the `Surface` interface (section 2.6 minus `frame`) and `flatSurface` only: `delta` returns plain b minus a, `wrap` is a no op returning false, `toXYZ` returns (u, v, 0). Used by nothing in v1 except one unit test in `tests/levelgen/surface.test.ts`.
3. One line in `docs/DECISIONS.md` (already present at 0:00).

Note for Fable: `src/core/` is Forge's directory in W1. Foundry creates one new file there in W2, when no other agent owns `src/core/`, so there is no collision. Review that Foundry touched no other file in `src/core/`.

## 6. Open questions for Ryan

Defaults in brackets.

1. Mobius band (k = 1, crossing the seam mirrors you) or a full twist only? [Full twist only in v2.0; Mobius behind a flag.]
2. Chase camera tilt and height: comfortable, or do you prefer a straight top down view on curved surfaces? [25° tilt, tuned at V2-G1 from your `camera_comfort` score.]
3. Generator v2 changes non-flat level content in bands 2 to 4 for the same seed. Acceptable? [Yes; flat levels keep v1 hashes; leaderboards keyed by generator version.]
4. Do you own a Bluetooth controller to test gamepad? [If not, gamepad ships behind a settings toggle, device check skipped.]
5. Music style: arpeggiated synthwave, or minimal pulse? [Synthwave arps at 120 to 140 BPM.]
6. Enemy bullets from Spawners only, or also a band 4 Weaver variant? [Spawners only.]
7. Should Endless default to cylinder or flat? [Cylinder.]
8. If UnrealBloomPass misses 60 fps on the main screen at V2-G0, accept the glow sprite fallback as the v2 default? [Yes, same rule as v1 G2.]
