# Shape of War: technical architecture

Derived from SPEC.md. If this file conflicts with SPEC.md, SPEC.md wins.

## Bad news first

1. PixiJS v8 is not v7. Most agent training data is v7. Every snippet in the "PixiJS v8 pitfalls" section was checked against pixi.js 8.22.0 and pixi-filters 6.1.5 type definitions on 2026-10-26. Anything not checked carries the line "verify against node_modules/pixi.js types at W0".
2. AdvancedBloomFilter is the slower of the two pixi-filters bloom filters (its own doc comment says so). At 400 entities and 2000 particles on the main screen it may not hold 60 fps. The fallback glow sprite path is designed in from W1, not bolted on at G2.
3. vite-plugin-pwa is now at 2.0.0 (SPEC says ^0.21 or later, so 2.x is in range). Its peer range includes Vite 6. Config keys below are for the 1.x and 2.x line; Shipwright confirms at W0.
4. Shared GraphicsContext rebuild on neon change is the plan for stroke glow. If clearing and redrawing a shared context does not propagate to instances on device, fall back to rebuilding Graphics instances per kind (10 kinds, cheap).

## Knowns and unknowns

| Item | Status |
|---|---|
| Sim rate 120 Hz, dt 1/120, clamp 50 ms | Known (SPEC 5) |
| DPR cap 2 | Known (SPEC 5) |
| Spatial hash cell 64 arena units | Known (orchestrator brief) |
| Arena unit to CSS px ratio | Decided here: arena is authored in arena units, world container scales to fit the safe play rect |
| Bloom cost on Fold 7 main screen | Unknown until G2 |
| Max arena size in units | Decided here: 2400 x 2400 upper bound, so grid is at most 38 x 38 cells. Foundry may lower it |
| rAF rate on the cover screen in Chrome | Unknown. Samsung adaptive refresh may deliver 60 or 120. Measured at G1 |

## 1. Module map

One builder owns one directory per wave (SPEC 6, 7). Public interfaces below are the contract between agents. Changing a signature requires Fable approval.

### src/main.ts (Forge, glue by Fable)
Boot order: load settings, create renderer, create world, attach input, start loop, register resize.
```ts
async function boot(): Promise<void>;
```

### src/core/loop.ts (Forge)
```ts
export interface LoopHooks {
  step(dt: number): void;          // fixed dt = 1/120, called 0..n times per frame
  render(alpha: number): void;     // alpha in [0,1) for interpolation
}
export interface Loop { start(): void; stop(): void; setRenderDivisor(d: 1 | 2): void; readonly running: boolean; }
export function createLoop(hooks: LoopHooks): Loop;
export const SIM_DT = 1 / 120;
export const MAX_FRAME_DT = 0.05;
```

### src/core/rng.ts (Forge)
```ts
export type Rng = () => number;                  // uniform [0,1)
export function mulberry32(seed: number): Rng;
export function deriveSeed(runSeed: number, index: number): number; // 32-bit mix, deterministic
export function rngInt(r: Rng, minIncl: number, maxIncl: number): number;
export function rngPick<T>(r: Rng, items: readonly T[], weights?: readonly number[]): T;
```
Only `levelgen/` calls the PRNG for level content. Simulation randomness (particle spray, Wanderer heading) uses a separate sim Rng seeded from the LevelDef seed, created in `world.ts`. Rendering never calls any Rng for gameplay state.

### src/core/math.ts (Forge)
```ts
export const clamp: (v: number, lo: number, hi: number) => number;
export const lerp: (a: number, b: number, t: number) => number;
export function len(x: number, y: number): number;
export function angle(x: number, y: number): number;
export function wrapAngle(a: number): number;
export function hslToRgbInt(h: number, s: number, l: number): number; // 0xRRGGBB
```

### src/core/events.ts (Forge)
Typed event bus, see section 9.

### src/core/settings.ts (Ledger owns from W2, Forge stubs in W1)
```ts
export interface Settings { neon: number; volume: number; showFps: boolean; }
export function loadSettings(): Settings;
export function saveSetting<K extends keyof Settings>(k: K, v: Settings[K]): void;
```

### src/game/world.ts (Forge)
Entity store, see section 3.
```ts
export interface World { /* typed arrays, section 3 */ }
export function createWorld(level: LevelDef, capacity?: number): World;
export function spawn(w: World, kind: Kind, x: number, y: number): number; // returns id or -1 if full
export function kill(w: World, id: number): void;
export function stepWorld(w: World, dt: number, input: InputState): void;
```

### src/game/ship.ts, bullets.ts (Forge)
```ts
export function stepShip(w: World, dt: number, input: InputState): void;
export function stepBullets(w: World, dt: number): void;
export function fireSpread(w: World, x: number, y: number, aimAngle: number): void; // 3-way
```

### src/game/enemies/*.ts (Swarm)
One file per catalogue entry: grunt.ts, wanderer.ts, weaver.ts, pinwheel.ts, dart.ts, snake.ts, gravitywell.ts, spawner.ts. Each exports:
```ts
export const def: EnemyDef; // { kind, radius, speed, value, colour: PaletteKey }
export function step(w: World, id: number, dt: number): void;
```

### src/game/drones.ts, supers.ts, spawner.ts, scoring.ts (Swarm, Ledger for scoring)
```ts
export function stepDrone(w: World, dt: number): void;
export function triggerSuper(w: World): boolean;
export function stepSpawner(w: World, dt: number): void;          // consumes LevelDef wave schedule
export function awardKill(w: World, kind: Kind): number;           // returns points awarded
export function stars(score: number, par: number): 0 | 1 | 2 | 3;  // par, 2x, 4x
```

### src/levelgen/ (Foundry)
```ts
export interface LevelDef { /* JSON-serialisable, SPEC 3.3 */ }
export function generateLevel(seed: number, index: number): LevelDef; // pure
export function validateLevel(def: LevelDef): string[];               // [] means valid
```

### src/render/ (Glow)
```ts
// renderer.ts
export interface GameRenderer {
  readonly app: import('pixi.js').Application;
  resize(cssW: number, cssH: number, dpr: number): void;
  setArena(def: LevelDef): void;
  draw(w: World, alpha: number): void;
  setBloomEnabled(on: boolean): void;   // false selects fallback glow sprites
}
export async function createRenderer(host: HTMLElement): Promise<GameRenderer>;
// neon.ts
export interface NeonParams { bloomScale: number; threshold: number; saturation: number; glowAlpha: number; gridAlpha: number; }
export function neonParams(n: number): NeonParams;
export function applyNeon(n: number): void;
// particles.ts
export function burst(x: number, y: number, colour: number, count: number): void;
// shapes.ts
export function shapeContext(kind: Kind): import('pixi.js').GraphicsContext;
```

### src/input/ (Thumbs)
```ts
export interface StickState { active: boolean; x: number; y: number; } // x,y in [-1,1] after dead zone
export interface InputState { move: StickState; aim: StickState; bomb: boolean; superPressed: boolean; pause: boolean; }
export function attachTouch(canvas: HTMLCanvasElement): { state: InputState; reanchor(): void; detach(): void };
export function layoutButtons(cssW: number, cssH: number, insets: Insets): ButtonRects;
```

### src/ui/ (Ledger)
DOM overlays above the canvas (not Pixi Text) for menu, settings, results. HUD is Pixi BitmapText or DOM; Ledger decides at W2 with Glow. UI talks to the game only through the event bus.

### src/audio/synth.ts (Glow hooks in W3)
```ts
export function unlockAudio(): Promise<void>;
export function play(sfx: 'shot' | 'explode' | 'geom' | 'bomb' | 'death' | 'spawn'): void;
export function setVolume(v: number): void; // 0..100
```

## 2. Fixed timestep loop

SPEC 5: 120 Hz sim, accumulator, render every animation frame, clamp frame dt at 50 ms. Pixi's ticker is not used to drive the sim. Create the app with `autoStart: false` and call `app.render()` from our own rAF loop, so one owner controls timing.

```ts
// src/core/loop.ts
export const SIM_DT = 1 / 120;
export const MAX_FRAME_DT = 0.05;
const MAX_STEPS = 6; // 50 ms / 8.33 ms

export function createLoop(hooks: LoopHooks): Loop {
  let last = 0, acc = 0, raf = 0, running = false, divisor: 1 | 2 = 1, frame = 0;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;   // spiral of death guard, tab switch guard
    if (dt < 0) dt = 0;
    acc += dt;
    let steps = 0;
    while (acc >= SIM_DT && steps < MAX_STEPS) {
      hooks.step(SIM_DT);
      acc -= SIM_DT;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;           // drop backlog rather than catch up
    frame++;
    if (divisor === 2 && (frame & 1)) return;    // 60 fps render mode, sim unaffected
    hooks.render(acc / SIM_DT);
  };

  return {
    start() { if (running) return; running = true; last = performance.now(); acc = 0; raf = requestAnimationFrame(tick); },
    stop() { running = false; cancelAnimationFrame(raf); },
    setRenderDivisor(d) { divisor = d; },
    get running() { return running; },
  };
}
```
Pause on `document.visibilitychange` to hidden: call `stop()`; on visible, `start()` resets `last` so no 50 ms lurch.

Interpolation: world keeps `prevX/prevY` per entity, copied at the start of each step. Render uses `lerp(prev, cur, alpha)`. If interpolation causes bugs in W1, render `cur` directly; at 120 Hz sim the visual cost is small.

## 3. Entity store

Struct of arrays, fixed capacity, no ECS library. Why: 400 entities fit in a few typed arrays, iteration is cache friendly, no GC churn, and agents cannot misuse an ECS API they half remember.

```ts
// src/game/world.ts
export const enum Kind { None = 0, Ship, Grunt, Wanderer, Weaver, Pinwheel, Dart, SnakeHead, SnakeBody, GravityWell, Spawner, Geom, Drone }
export const ENTITY_CAP = 512;

export interface World {
  cap: number;
  alive: Uint8Array;     // 0 or 1
  kind: Uint8Array;      // Kind
  x: Float32Array; y: Float32Array;
  prevX: Float32Array; prevY: Float32Array;
  vx: Float32Array; vy: Float32Array;
  rot: Float32Array;
  radius: Float32Array;
  hp: Int16Array;
  t: Float32Array;       // per entity timer, behaviour specific
  a: Int32Array;         // behaviour scratch (snake parent id, spawner cooldown index)
  free: Int32Array; freeTop: number;   // free list stack
  liveCount: number;
  level: LevelDef;
  simRng: Rng;
  // bullets live in their own pool, section 5
}

export function spawn(w: World, kind: Kind, x: number, y: number): number {
  if (w.freeTop === 0) return -1;
  const id = w.free[--w.freeTop];
  w.alive[id] = 1; w.kind[id] = kind;
  w.x[id] = w.prevX[id] = x; w.y[id] = w.prevY[id] = y;
  w.vx[id] = w.vy[id] = w.rot[id] = w.t[id] = 0; w.a[id] = -1;
  w.liveCount++;
  return id;
}

export function kill(w: World, id: number): void {
  if (!w.alive[id]) return;
  w.alive[id] = 0; w.kind[id] = Kind.None;
  w.free[w.freeTop++] = id;
  w.liveCount--;
}
```
Rules:
1. Never hold an id across a kill without checking `alive[id]` and `kind[id]`. Snake segments store the parent id and check both each step.
2. Kills during iteration are allowed because iteration is index based over `0..cap`.
3. Ship is always id 0, reserved at world creation.

## 4. Collision: uniform spatial hash grid

Cell size 64 arena units. Rebuilt every sim step with a counting sort into flat arrays (no Maps, no per-step allocation).

```ts
// src/game/collide.ts (Forge)
export const CELL = 64;

export interface Grid {
  cols: number; rows: number; originX: number; originY: number;
  cellStart: Int32Array;   // length cols*rows + 1
  cellItems: Int32Array;   // entity ids sorted by cell
  cellOf: Int32Array;      // per entity cell index, -1 if dead
}

export function createGrid(arenaW: number, arenaH: number, cap: number): Grid {
  const cols = Math.ceil(arenaW / CELL) + 1, rows = Math.ceil(arenaH / CELL) + 1;
  return { cols, rows, originX: -arenaW / 2, originY: -arenaH / 2,
    cellStart: new Int32Array(cols * rows + 1), cellItems: new Int32Array(cap), cellOf: new Int32Array(cap) };
}

export function rebuild(g: Grid, w: World): void {
  const n = g.cols * g.rows, start = g.cellStart;
  start.fill(0);
  for (let i = 0; i < w.cap; i++) {
    if (!w.alive[i]) { g.cellOf[i] = -1; continue; }
    const cx = Math.min(g.cols - 1, Math.max(0, ((w.x[i] - g.originX) / CELL) | 0));
    const cy = Math.min(g.rows - 1, Math.max(0, ((w.y[i] - g.originY) / CELL) | 0));
    const c = cy * g.cols + cx;
    g.cellOf[i] = c;
    start[c + 1]++;
  }
  for (let c = 0; c < n; c++) start[c + 1] += start[c];       // prefix sum
  const fill = scratch(n); fill.set(start.subarray(0, n));    // reuse a module level Int32Array
  for (let i = 0; i < w.cap; i++) { const c = g.cellOf[i]; if (c >= 0) g.cellItems[fill[c]++] = i; }
}

// Query entities overlapping a circle; calls fn(id). Radius must be <= CELL * 2 for the 5x5 bound below.
export function queryCircle(g: Grid, w: World, x: number, y: number, r: number, fn: (id: number) => void): void {
  const x0 = Math.max(0, ((x - r - g.originX) / CELL) | 0), x1 = Math.min(g.cols - 1, ((x + r - g.originX) / CELL) | 0);
  const y0 = Math.max(0, ((y - r - g.originY) / CELL) | 0), y1 = Math.min(g.rows - 1, ((y + r - g.originY) / CELL) | 0);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const c = cy * g.cols + cx;
    for (let k = g.cellStart[c]; k < g.cellStart[c + 1]; k++) {
      const id = g.cellItems[k];
      const dx = w.x[id] - x, dy = w.y[id] - y, rr = r + w.radius[id];
      if (dx * dx + dy * dy <= rr * rr) fn(id);
    }
  }
}
```
Pairs checked per step: bullets vs enemies (bullets query the grid), ship vs enemies, ship vs geoms (pickup radius), gravity wells use a direct loop over all live entities because their pull radius exceeds two cells and there are at most 3. Avoid closures in the hot path if profiling shows GC: pass a preallocated result Int32Array instead of `fn`.

Walls and arena shape: collision against the LevelDef arena is analytic per shape (rect, rounded rect, circle, hexagon, plus up to 3 rectangular obstacles). Implemented in `game/arena.ts` by Forge as `confine(x, y, r): {x, y, nx, ny, hit}` writing into a reused object.

## 5. Bullet and particle pooling

Bullets (simulation, Forge): separate SoA pool, capacity 512. At 12 shots per second x 3 spread x up to 2x Turbo = 72 bullets per second; at roughly 1.5 s lifetime that is about 110 live, so 512 leaves headroom for Attack drone fire.
```ts
export interface BulletPool { cap: number; alive: Uint8Array; x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; life: Float32Array; homing: Uint8Array; free: Int32Array; freeTop: number; }
```
If the pool is full, the oldest is not recycled; the shot is dropped. Why: simpler and invisible at these rates.

Particles (render only, Glow): no simulation coupling, never read by gameplay. Capacity 2048 (SPEC target is 2000). One `ParticleContainer` with pre-created `Particle` objects sharing one small radial glow texture, additive blend. Dead particles are moved offscreen and `alpha = 0`, never removed from `particleChildren`, so the buffer never re-uploads its length.

```ts
import { ParticleContainer, Particle, Texture } from 'pixi.js';

const container = new ParticleContainer({
  texture: dotTexture,
  blendMode: 'add',
  dynamicProperties: { position: true, rotation: false, uvs: false, vertex: false, color: true },
});
const pool: Particle[] = [];
for (let i = 0; i < 2048; i++) {
  const p = new Particle({ texture: dotTexture, x: -9999, y: -9999, alpha: 0, anchorX: 0.5, anchorY: 0.5 });
  pool.push(p); container.addParticle(p);
}
// per particle state lives in parallel Float32Arrays: vx, vy, life, maxLife
```
Keys `vertex`, `position`, `rotation`, `uvs`, `color` confirmed in pixi.js 8.22.0 `ParticleProperties`.
verify against node_modules/pixi.js types at W0 (whether `color: true` makes per frame `alpha` and `tint` changes upload; the d.ts does not say).

## 6. Render pipeline (PixiJS v8)

### Scene graph
```
app.stage
  world (Container)               scaled and centred to fit arena in the safe play rect
    grid (Graphics)               redrawn on resize, arena change, neon change only
    glowLayer (Container)         filters = [AdvancedBloomFilter] in bloom path; no filters in fallback
      glowSprites (Container)     fallback path only: one additive Sprite per entity
      entities (Container)        one Graphics per live entity, sharing a GraphicsContext per Kind
      bullets (ParticleContainer)
      particles (ParticleContainer)
  sticks (Graphics)               virtual stick rings, outside bloom
hud (DOM overlay or Pixi container outside world), outside bloom
```
Why the HUD and sticks sit outside the bloom container: text under bloom smears and costs fill rate.

### Graphics vs sprites
1. Entity shapes: one `GraphicsContext` per Kind built once in `shapes.ts`, white strokes. Each entity view is `new Graphics(context)` and only its transform and `tint` change per frame. Shared contexts mean geometry is built once, not per entity per frame.
2. Never call `graphics.clear()` and redraw per entity per frame. That is the v7 habit that kills frame rate.
3. Bullets and particles: textures in `ParticleContainer`, not Graphics.
4. Entity view pool: Glow keeps `views: Graphics[]` indexed by entity id, created lazily, `visible = false` when the slot is dead, context swapped when the slot's Kind changes.

```ts
// render/shapes.ts
import { GraphicsContext } from 'pixi.js';
export function buildGrunt(glowAlpha: number): GraphicsContext {
  return new GraphicsContext()
    .rect(-14, -14, 28, 28).stroke({ width: 8, color: 0xffffff, alpha: glowAlpha * 0.35 }) // outer glow stroke
    .rect(-14, -14, 28, 28).stroke({ width: 2.5, color: 0xffffff, alpha: 1 });            // core line
}
// usage
const g = new Graphics(gruntContext); g.tint = palette.blue; entities.addChild(g);
```
On neon change, rebuild the 10 contexts (glow stroke alpha changes) and reassign `view.context` for live views. `Graphics.context` has a setter in pixi.js 8.22.0 types.
verify against node_modules/pixi.js types at W0 (runtime behaviour of swapping `context` on a live Graphics; confirm in the browser).

### Bloom path
```ts
import { AdvancedBloomFilter } from 'pixi-filters';
const bloom = new AdvancedBloomFilter({ threshold: 0.5, bloomScale: 1.4, brightness: 1, blur: 6, quality: 4 });
bloom.resolution = 0.5;           // half res blur, main perf knob
glowLayer.filters = [bloom];
glowLayer.filterArea = new Rectangle(0, 0, renderer.width / renderer.resolution, renderer.height / renderer.resolution); // skip bounds calc every frame
```
Notes:
1. Import from `'pixi-filters'` (root) works in v6. Per filter subpath imports (`'pixi-filters/advanced-bloom'`) are in the 6.1.5 exports map; root import is the default for this project.
2. `filterArea` must be updated in `resize()`.
3. Perf knobs in order: `bloom.resolution` (0.5 then 0.35), `quality` (4 then 3), `blur` (6 then 4), then fallback.

### Fallback glow sprite path
Selected at G2 if bloom cannot hold 60 fps on the main screen with the stress scene (SPEC 2, 8).
1. At boot (and on neon change) render each Kind's shape with wide low alpha strokes into a texture once using `renderer.generateTexture({ target: tmpGraphics, resolution: 1 })`, with a one off `BlurFilter` applied to `tmpGraphics` before the capture.
2. Each live entity gets a `Sprite(glowTexture[kind])`, `blendMode = 'add'`, `anchor.set(0.5)`, `tint = palette colour`, `alpha = params.glowAlpha`, positioned under its Graphics in `glowSprites`.
3. `glowLayer.filters = null`. No post pass.
4. Brightness slider still works: saturation through palette tint, glow intensity through sprite alpha, grid through grid alpha. bloomScale and threshold scale the glow sprite (`scale = 1 + params.bloomScale * 0.25`) so the slider has a visible range.

### Resolution
```ts
await app.init({
  resizeTo: undefined,            // we size manually from visualViewport
  width: cssW, height: cssH,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
  antialias: false,                // strokes are thick, bloom hides aliasing, MSAA costs fill rate
  background: 0x000000,
  preference: 'webgl',
  powerPreference: 'high-performance',
  autoStart: false,
});
```
`preference: 'webgl'` because SPEC fixes WebGL; do not let v8 pick WebGPU on Android. On resize: `app.renderer.resize(cssW, cssH, Math.min(devicePixelRatio, 2))`.

## 7. applyNeon(n)

SPEC 4 mapping, one integer 0 to 100, default 70, key `sow.settings.neon`.

| Output | n = 0 | n = 100 | Applied to |
|---|---|---|---|
| bloomScale | 0.0 | 2.0 | `bloom.bloomScale` (fallback: glow sprite scale) |
| threshold | 0.8 | 0.2 | `bloom.threshold` |
| saturation | 0.4 | 1.3 | palette HSL S multiplier, recomputed once per change |
| glowAlpha | 0.0 | 0.9 | outer stroke alpha in shape contexts, fallback sprite alpha |
| gridAlpha | 0.1 | 0.6 | grid Graphics alpha |

```ts
// src/render/neon.ts
import { clamp, lerp, hslToRgbInt } from '../core/math';
import { bus } from '../core/events';

export interface NeonParams { bloomScale: number; threshold: number; saturation: number; glowAlpha: number; gridAlpha: number; }

// Base palette in HSL. Base S is 0.75 so the 1.3 multiplier clips only slightly (0.975).
export const BASE_PALETTE = {
  blue: [215, 0.75, 0.55], purple: [275, 0.75, 0.6], green: [125, 0.75, 0.5], magenta: [310, 0.75, 0.6],
  orange: [28, 0.75, 0.55], cyan: [185, 0.75, 0.55], white: [0, 0, 0.95], red: [355, 0.75, 0.55],
  yellow: [55, 0.75, 0.55], ship: [0, 0, 1], geom: [95, 0.75, 0.6], grid: [230, 0.6, 0.45],
} as const satisfies Record<string, readonly [number, number, number]>;
export type PaletteKey = keyof typeof BASE_PALETTE;
export const palette = {} as Record<PaletteKey, number>;

export function neonParams(n: number): NeonParams {
  const t = clamp(Math.round(n), 0, 100) / 100;
  return {
    bloomScale: lerp(0.0, 2.0, t),
    threshold: lerp(0.8, 0.2, t),
    saturation: lerp(0.4, 1.3, t),
    glowAlpha: lerp(0.0, 0.9, t),
    gridAlpha: lerp(0.1, 0.6, t),
  };
}

export let current: NeonParams = neonParams(70);

export function applyNeon(n: number): void {
  const p = neonParams(n);
  current = p;
  for (const k in BASE_PALETTE) {
    const [h, s, l] = BASE_PALETTE[k as PaletteKey];
    palette[k as PaletteKey] = hslToRgbInt(h, clamp(s * p.saturation, 0, 1), l);
  }
  bus.emit('neon:changed', p); // renderer listens: updates bloom uniforms, rebuilds contexts, grid alpha, sprite alpha
}
```
Renderer listener:
```ts
bus.on('neon:changed', (p) => {
  if (bloom) { bloom.bloomScale = p.bloomScale; bloom.threshold = p.threshold; }
  grid.alpha = p.gridAlpha;
  rebuildShapeContexts(p.glowAlpha);   // 10 contexts
  if (!bloomEnabled) rebuildGlowTextures(p);
  retintLiveViews();                    // views read palette[kind colour]
});
```
Dragging the slider fires `input` events at up to 120 Hz. Throttle `applyNeon` to one call per animation frame; persist on `change` only (finger up). Why: context rebuild and localStorage writes per input event cause jank on the preview arena.

## 8. Settings persistence

localStorage only (SPEC 2). Each value has its own key so a corrupt value cannot poison the rest. Every read and write is wrapped in try/catch; on failure the default is used and the game still runs.

| Key | Type (stored as string) | Default | Owner |
|---|---|---|---|
| `sow.settings.neon` | integer 0 to 100 | 70 | Ledger (key fixed by SPEC 4) |
| `sow.settings.volume` | integer 0 to 100 | 70 | Ledger |
| `sow.settings.showFps` | `"0"` or `"1"` | `"0"` | Ledger |
| `sow.progress.runSeed` | uint32 decimal | random at first launch | Ledger |
| `sow.progress.unlocked` | integer level index | 0 | Ledger |
| `sow.scores.adventure` | JSON `{ [index: string]: { best: number, stars: 0..3 } }` | `{}` | Ledger |
| `sow.scores.endless` | JSON `Array<{ score: number, at: number }>`, top 10, sorted desc | `[]` | Ledger |
| `sow.schema` | integer | 1 | Ledger; bump and migrate if a shape changes |
| `sow.settings.glowPath` | `"bloom"` or `"fallback"` | `"bloom"` | Ledger |
| `sow.settings.spacePhysics` | `"off"`, `"low"`, `"medium"` or `"high"` | `"off"` | Ledger (v2) |
| `sow.settings.weaponPickups` | `"0"` or `"1"` | `"1"` (on) | Ledger (v2) |
| `sow.settings.effects` | `"low"`, `"standard"` or `"high"` | `"standard"` | Ledger (v2) |
| `sow.settings.music` | integer 0 to 100, 0 is silence | 50 | Ledger (v2) |

The glow path and v2 rows are read and written by their own load and save pairs in `src/core/settings.ts` (`loadGlowPath`, `loadSpacePhysics`, `loadWeaponPickups`, `loadEffects`, `loadMusic` and the matching `save` functions). They are not fields of `Settings` or `DEFAULT_SETTINGS`, so the v1 settings shape and the `loadSettings` snippet below are unchanged. Parse rules, all pure and all falling back to the default:

- `glowPath`, `spacePhysics`, `effects`: exact lower case strings only. Anything else, including a wrong case or `null`, gives the default.
- `weaponPickups`: only the exact strings `"0"` and `"1"` count.
- `music`: whole decimal text only (an optional minus sign, then digits). A whole number outside 0 to 100 is clamped. Empty text, decimals, units and any other text give 50.
- `sow.schema` stays 1. No v2 key needs a migration, and Reset progress does not touch any of these keys (docs/11 "Settings keys and bus additions").

```ts
// src/core/settings.ts
const DEFAULTS: Settings = { neon: 70, volume: 70, showFps: false };
function readInt(key: string, def: number, lo: number, hi: number): number {
  try { const v = localStorage.getItem(key); if (v === null) return def;
        const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; }
  catch { return def; }
}
export function loadSettings(): Settings {
  return { neon: readInt('sow.settings.neon', 70, 0, 100), volume: readInt('sow.settings.volume', 70, 0, 100),
           showFps: readInt('sow.settings.showFps', 0, 0, 1) === 1 };
}
export function saveSetting<K extends keyof Settings>(k: K, v: Settings[K]): void {
  const raw = typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
  try { localStorage.setItem(`sow.settings.${k}`, raw); } catch { /* quota or private mode: ignore */ }
}
```

## 9. Event bus

UI (DOM) and game (sim plus renderer) never import each other. They share `core/events.ts`.

```ts
// src/core/events.ts
import type { NeonParams } from '../render/neon';
export interface Events {
  'neon:changed': NeonParams;
  'game:start': { mode: 'adventure' | 'endless'; levelIndex: number };
  'game:pause': void; 'game:resume': void; 'game:quit': void;
  'game:over': { score: number; stars: 0 | 1 | 2 | 3; levelIndex: number; mode: 'adventure' | 'endless' };
  'hud:score': { score: number; multiplier: number; lives: number; bombs: number; superCharge: number };
  'viewport:changed': { cssW: number; cssH: number; dpr: number };
  'sfx': 'shot' | 'explode' | 'geom' | 'bomb' | 'death' | 'spawn';
}
type Handler<T> = (payload: T) => void;
class Bus {
  private map = new Map<keyof Events, Set<Handler<any>>>();
  on<K extends keyof Events>(k: K, h: Handler<Events[K]>): () => void {
    let s = this.map.get(k); if (!s) this.map.set(k, (s = new Set()));
    s.add(h); return () => s!.delete(h);
  }
  emit<K extends keyof Events>(k: K, ...p: Events[K] extends void ? [] : [Events[K]]): void {
    this.map.get(k)?.forEach((h) => h(p[0]));
  }
}
export const bus = new Bus();
```
`hud:score` is emitted at most every 100 ms, not per step. Why: DOM writes at 120 Hz cost more than the sim.

## 10. vite.config.ts

```ts
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/shape-of-war/',                // GitHub Pages project path; Capacitor build overrides with --base=./
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 0 },
  server: { host: true, port: 5173 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,                // we ship public/manifest.webmanifest ourselves (doc 04)
      includeAssets: ['manifest.webmanifest', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [],            // no runtime caching: everything is precached
      },
      devOptions: { enabled: false },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```
verify against node_modules/pixi.js types at W0 (here: verify against `node_modules/vite-plugin-pwa/dist/index.d.ts` for option names, and confirm `test` is accepted; if TypeScript rejects `test`, add `/// <reference types="vitest/config" />` at the top or move it to `vitest.config.ts`).

index.html manifest link uses the base placeholder so it survives a base change:
```html
<link rel="manifest" href="%BASE_URL%manifest.webmanifest" />
```
verify against node_modules/pixi.js types at W0 (here: confirm Vite 6 replaces `%BASE_URL%` in index.html; if not, hardcode `/shape-of-war/manifest.webmanifest`).

## 11. package.json scripts

```json
{
  "name": "shape-of-war",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "build:cap": "tsc --noEmit && vite build --base=./",
    "preview": "vite preview --host --port 4173",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "dispatcher": "node scripts/dispatcher.mjs"
  },
  "dependencies": { "pixi.js": "^8.22.0", "pixi-filters": "^6.1.5" },
  "devDependencies": { "typescript": "^5", "vite": "<newest major accepted by both peers, see SPEC 2>", "vite-plugin-pwa": "^2.0.0", "vitest": "<major matching the Vite pin>" }
}
```
Versions observed on npm on 2026-10-26: pixi.js 8.22.0, pixi-filters 6.1.5, vite-plugin-pwa 2.0.0, latest vite 8.x (SPEC pins ^6, latest 6.x is 6.4.5). Shipwright re-runs `npm view <pkg> version` at W0. vitest major must match the Vite major's supported range; Shipwright confirms at W0.

## 12. PixiJS v8 pitfalls for agents trained on v7

Read this before writing any Pixi code. Shipwright also writes `docs/pixi8-cheatsheet.md` from the installed types at W0 (SPEC 10); that file overrides this section where they differ.

### 12.1 Application init is async
```ts
// v7 (WRONG in v8)
const app = new Application({ width: 800, height: 600 });
document.body.appendChild(app.view);

// v8
import { Application } from 'pixi.js';
const app = new Application();
await app.init({ width: 800, height: 600, background: 0x000000, preference: 'webgl' });
document.body.appendChild(app.canvas);   // app.view still exists but is deprecated; use app.canvas
```
Do not touch `app.renderer` or `app.stage` before `init()` resolves.

### 12.2 Graphics: shape first, then fill or stroke
```ts
// v7 (WRONG in v8)
g.beginFill(0xff0000); g.lineStyle(2, 0xffffff); g.drawRect(0, 0, 10, 10); g.endFill();

// v8
g.rect(0, 0, 10, 10).fill(0xff0000).stroke({ width: 2, color: 0xffffff });
g.circle(0, 0, 8).stroke({ width: 2, color: 0x00ffff, alpha: 0.9 });
g.poly([0, -12, 10, 10, -10, 10]).stroke({ width: 2.5, color: 0xffffff }); // ship triangle
g.regularPoly(0, 0, 20, 6).stroke({ width: 2, color: 0xffffff });            // hexagon
g.roundRect(-50, -30, 100, 60, 12).stroke({ width: 2, color: 0xffffff });
g.moveTo(0, 0).lineTo(100, 0).stroke({ width: 1, color: 0x3344aa });
```
`drawRect`, `drawCircle`, `beginFill`, `endFill`, `lineStyle` are v7. In v8 the shape call comes first, then `.fill()` and or `.stroke()` applies to the path just built. Shared geometry: `new Graphics(context)` where `context` is a `GraphicsContext`.

### 12.3 Assets instead of Loader
```ts
// v7 (WRONG in v8)
PIXI.Loader.shared.add('x', 'x.png').load(cb);

// v8
import { Assets } from 'pixi.js';
const tex = await Assets.load('icons/x.png');
```
Shape of War loads no image assets at runtime (all shapes are vector, glow textures are generated). If you find yourself writing `Assets.load`, check whether you should be using `renderer.generateTexture` instead.

### 12.4 Container and addChild semantics
1. Only `Container` subclasses can have children in v8 the intended way. `Sprite`, `Graphics`, `Text`, `Mesh` are leaf views; adding children to them is deprecated. Group under a `Container`.
2. `container.addChild(child)` still returns the child and still reparents if it already has a parent.
3. `DisplayObject` no longer exists; the base type is `Container`.
4. `container.name` is replaced by `container.label`.
5. `cacheAsBitmap = true` is replaced by `container.cacheAsTexture(true)`.
6. `ParticleContainer` holds `Particle` objects via `addParticle()`, not Sprites via `addChild()`.

### 12.5 Text and TextStyle
```ts
// v7 (WRONG in v8)
new Text('Score', { fontFamily: 'monospace', fill: 0xffffff });

// v8
import { Text } from 'pixi.js';
const t = new Text({ text: 'Score', style: { fontFamily: 'monospace', fontSize: 24, fill: 0xffffff } });
```
For a score that changes often, prefer `BitmapText` (also object constructor: `new BitmapText({ text, style })`) or a DOM element. Per frame `Text.text` changes re-rasterise a canvas texture.

### 12.6 Filters and import paths
```ts
// v7 (WRONG in v8)
import { AdvancedBloomFilter } from '@pixi/filter-advanced-bloom';
import { BlurFilter } from '@pixi/filter-blur';

// v8
import { BlurFilter, ColorMatrixFilter } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
```
`@pixi/*` scoped packages are v7. Do not install them. pixi-filters v6 targets pixi.js v8 (peer `pixi.js >=8.0.0-0`).

### 12.7 Blend modes are strings
```ts
// v7
sprite.blendMode = PIXI.BLEND_MODES.ADD;
// v8
sprite.blendMode = 'add';
```

### 12.8 Ticker callback receives the Ticker
```ts
// v7
app.ticker.add((delta) => {});
// v8
app.ticker.add((ticker) => { const dtMs = ticker.deltaMS; });
```
Shape of War does not use the ticker for simulation (section 2); this matters only if an agent adds a ticker callback.

### 12.9 Renderer resize and resolution
```ts
app.renderer.resize(cssW, cssH, Math.min(devicePixelRatio, 2)); // third arg is resolution in v8
```

### 12.10 Events
Pixi's federated events are not used for the sticks. Input uses raw Pointer Events on the canvas (SPEC 5). Set `app.stage.eventMode = 'none'` or leave the default; do not add `eventMode = 'static'` to game objects. Why: hit testing 400 entities per pointer move is wasted work.
