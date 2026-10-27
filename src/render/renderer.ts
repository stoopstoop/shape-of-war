// Game renderer (docs/03-architecture.md section 6). Scene graph:
//   stage > world > grid, glowLayer > walls, glowSprites, entities, bullets, particles
//   stage > sticks (outside bloom)
// The app is created with autoStart false; draw() updates the scene and calls app.render().
import {
  Application,
  BlurFilter,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Rectangle,
  Sprite,
  type Texture,
} from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { registerParticleStress } from '../core/debug';
import { bus } from '../core/events';
import type { World } from '../game/world';
import type { ArenaDef, LevelDef } from '../levelgen/leveldef';
import { hash01 } from './color';
import { drawGrid, drawWalls } from './grid';
import {
  bulletRenderPos,
  fitArena,
  gruntPulse,
  interp,
  parseBloomKnobs,
  screenRectInWorld,
  type Fit,
  type PlayRect,
} from './layout';
import { planFx, type FxEvent } from './fx';
import { currentRender, palette, type NeonRender } from './neon';
import { bindNeon } from './neonApply';
import {
  burstFx,
  clearParticles,
  initParticles,
  liveParticleCount,
  setParticleBounds,
  setParticleStress,
  stepParticles,
  STREAK_TEX_LEN,
} from './particles';
import { addRipple, rippledGridPaths, stepRipples, type Ripple } from './ripple';
import { addShake, createShake, stepShake } from './shake';
import { buildGlowSourceContext, contextForValue, rebuildShapeContexts } from './shapes';
import type { GraphicsContext } from 'pixi.js';
import { MAX_KIND, specFor } from './shapeSpecs';

/** Structural view of Forge's BulletPool (03 section 5). Only the fields the renderer reads. */
export interface BulletPoolLike {
  readonly cap: number;
  readonly alive: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
}

/** Structural view of one circle from Thumbs' stickVisuals output, in CSS px. */
export interface StickCircleLike {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** 0..1, default 1. Rings use 0.25 and knobs 0.6 per docs/01 section 3. */
  readonly alpha?: number;
  /** Filled knob instead of a ring outline. */
  readonly filled?: boolean;
}

export type GlowPath = 'bloom' | 'fallback';

export interface RenderStats {
  entities: number;
  bullets: number;
  particles: number;
  glowPath: GlowPath;
}

export interface GameRenderer {
  readonly app: Application;
  resize(cssW: number, cssH: number, dpr: number): void;
  setArena(def: LevelDef): void;
  draw(w: World, alpha: number): void;
  setBloomEnabled(on: boolean): void; // false selects fallback glow sprites
  // Additive members (Glow W1).
  readonly bloomEnabled: boolean;
  readonly stats: Readonly<RenderStats>;
  /** Safe play rect in CSS px (viewport minus insets and HUD band). Null means full viewport. */
  setPlayRect(rect: PlayRect | null): void;
  /** Explicit bullet source. If unset, draw() reads w.bullets when Forge adds it. */
  setBullets(pool: BulletPoolLike | null): void;
  /** Stick rings and knobs in CSS px, drawn outside bloom. Call each frame or on change. */
  setSticks(circles: readonly StickCircleLike[]): void;
  destroy(): void;
}

const DPR_CAP = 2;
const SIM_DT = 1 / 120;
const PARK = -99999;
const BULLET_SCALE = 0.7;
const TRAIL_TEX_LEN = 32;
const TRAIL_LEN_U = 30;
const GLOW_PAD = 34;
/** Extra filter area around the screen so shake never shows an unbloomed edge strip. */
const SHAKE_PAD_PX = 20;
const RING_SPEED = 1700; // arena units per second
const RING_LIFE = 0.6; // seconds
const MAX_RINGS = 4;

// Kind values used for per kind visual scale; numeric literals avoid importing the const enum.
const KIND_GRUNT = 2;
const KIND_GRAVITY_WELL = 9;
const WELL_BASE_RADIUS = 24;

const DEFAULT_ARENA: ArenaDef = {
  shape: 'rect',
  width: 1400,
  height: 900,
  cornerRadius: 0,
  obstacles: [],
  spawnPoint: { x: 0, y: 0 },
};

function isTypedPool(v: object): v is BulletPoolLike {
  const r = v as Partial<Record<keyof BulletPoolLike, unknown>>;
  return (
    typeof r.cap === 'number' &&
    r.alive instanceof Uint8Array &&
    r.x instanceof Float32Array &&
    r.y instanceof Float32Array &&
    r.vx instanceof Float32Array &&
    r.vy instanceof Float32Array
  );
}

/** Reads w.bullets if Forge's World carries the pool, else null. */
function bulletsFromWorld(w: World): BulletPoolLike | null {
  if (!('bullets' in w)) return null;
  const b: unknown = w.bullets;
  return typeof b === 'object' && b !== null && isTypedPool(b) ? b : null;
}

function viewportSize(host: HTMLElement): { w: number; h: number } {
  const vv = window.visualViewport;
  const w = host.clientWidth || (vv ? vv.width : window.innerWidth);
  const h = host.clientHeight || (vv ? vv.height : window.innerHeight);
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

/** Soft round dot used by bullets and particles. Generated, no image files. */
function makeDotTexture(app: Application): Texture {
  const g = new Graphics()
    .circle(0, 0, 8)
    .fill({ color: 0xffffff, alpha: 0.18 })
    .circle(0, 0, 5.5)
    .fill({ color: 0xffffff, alpha: 0.45 })
    .circle(0, 0, 3)
    .fill({ color: 0xffffff, alpha: 1 });
  const tex = app.renderer.generateTexture({ target: g, frame: new Rectangle(-8, -8, 16, 16), resolution: 2 });
  g.destroy({ context: true });
  return tex;
}

/** Soft horizontal streak for particles, STREAK_TEX_LEN px long, centred. */
function makeStreakTexture(app: Application): Texture {
  const L = STREAK_TEX_LEN;
  const g = new Graphics()
    .roundRect(-L / 2, -4, L, 8, 4)
    .fill({ color: 0xffffff, alpha: 0.22 })
    .roundRect(-L / 2 + 3, -2, L - 6, 4, 2)
    .fill({ color: 0xffffff, alpha: 0.55 })
    .roundRect(-L / 2 + 6, -1, L - 12, 2, 1)
    .fill({ color: 0xffffff, alpha: 1 });
  const tex = app.renderer.generateTexture({ target: g, frame: new Rectangle(-L / 2, -4, L, 8), resolution: 2 });
  g.destroy({ context: true });
  return tex;
}

/** Bullet trail: fades in from the left, brightest at the right end (anchored on the bullet). */
function makeTrailTexture(app: Application): Texture {
  const L = TRAIL_TEX_LEN;
  const steps = 16;
  const g = new Graphics();
  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    const x = (i * L) / steps;
    g.rect(x, -3, L / steps, 6).fill({ color: 0xffffff, alpha: 0.18 * t * t });
    g.rect(x, -1.2, L / steps, 2.4).fill({ color: 0xffffff, alpha: 0.85 * t * t });
  }
  const tex = app.renderer.generateTexture({ target: g, frame: new Rectangle(0, -3, L, 6), resolution: 2 });
  g.destroy({ context: true });
  return tex;
}

export async function createRenderer(host: HTMLElement): Promise<GameRenderer> {
  const size = viewportSize(host);
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  const app = new Application();
  await app.init({
    width: size.w,
    height: size.h,
    resolution: dpr,
    autoDensity: true,
    antialias: false,
    background: 0x000000,
    preference: 'webgl',
    powerPreference: 'high-performance',
    autoStart: false,
  });
  host.appendChild(app.canvas);
  app.stage.eventMode = 'none';

  const world = new Container({ label: 'world' });
  world.interactiveChildren = false;
  const grid = new Graphics({ label: 'grid' });
  const glowLayer = new Container({ label: 'glowLayer' });
  const walls = new Graphics({ label: 'walls' });
  const glowSprites = new Container({ label: 'glowSprites' });
  const entities = new Container({ label: 'entities' });
  const dot = makeDotTexture(app);
  const streak = makeStreakTexture(app);
  const trail = makeTrailTexture(app);
  const trails = new ParticleContainer({
    label: 'bulletTrails',
    texture: trail,
    blendMode: 'add',
    dynamicProperties: { position: true, rotation: true, uvs: false, vertex: false, color: false },
  });
  const bullets = new ParticleContainer({
    label: 'bullets',
    texture: dot,
    blendMode: 'add',
    dynamicProperties: { position: true, rotation: false, uvs: false, vertex: false, color: false },
  });
  const particles = new ParticleContainer({
    label: 'particles',
    texture: streak,
    blendMode: 'add',
    dynamicProperties: { position: true, rotation: true, uvs: false, vertex: true, color: true },
  });
  const rings = new Graphics({ label: 'bombRings' });
  const sticks = new Graphics({ label: 'sticks' });

  glowLayer.addChild(walls, glowSprites, particles, trails, entities, bullets, rings);
  world.addChild(grid, glowLayer);
  app.stage.addChild(world, sticks);
  initParticles(particles, streak);

  const knobs = parseBloomKnobs(window.location.search);
  const bloom = new AdvancedBloomFilter({
    threshold: currentRender.bloomThreshold,
    bloomScale: currentRender.bloomStrength,
    brightness: 1,
    blur: knobs.blur,
    quality: knobs.quality,
  });
  bloom.resolution = knobs.resolution;

  let cssW = size.w;
  let cssH = size.h;
  let playRect: PlayRect | null = null;
  let arena: ArenaDef = DEFAULT_ARENA;
  let fit: Fit = fitArena(arena.width, arena.height, { x: 0, y: 0, w: cssW, h: cssH });
  let bloomOn = true;
  let explicitBullets: BulletPoolLike | null = null;
  let lastDraw = 0;

  const stats: RenderStats = { entities: 0, bullets: 0, particles: 0, glowPath: 'bloom' };

  // Entity view pool indexed by entity id. Kind and tint caches avoid redundant setter calls.
  let views: (Graphics | null)[] = [];
  let glowViews: (Sprite | null)[] = [];
  let viewKind = new Int16Array(0);
  let viewTint = new Int32Array(0);
  let glowKind = new Int16Array(0);

  // Fallback glow textures per kind slot (0 is the unknown magenta circle).
  let glowTextures: (Texture | null)[] = new Array<Texture | null>(MAX_KIND + 1).fill(null);
  let glowTexturesDirty = true;

  // Bullet particles, one head and one trail per bullet slot, parked when dead.
  const bulletItems: Particle[] = [];
  const trailItems: Particle[] = [];
  let bulletTint = palette.yellow;

  // Effects state: shake offset in CSS px, grid ripples and bomb rings in arena units.
  const shake = createShake();
  const shakeOff = { x: 0, y: 0 };
  const ripples: Ripple[] = [];
  let gridRippling = false;
  const ringList: { x: number; y: number; age: number }[] = [];
  // Old shape contexts are freed after the next render, once no view batches from them.
  let retiredContexts: GraphicsContext[] = [];

  function growPools(cap: number): void {
    if (views.length >= cap) return;
    const oldLen = views.length;
    views = views.concat(new Array<Graphics | null>(cap - oldLen).fill(null));
    glowViews = glowViews.concat(new Array<Sprite | null>(cap - oldLen).fill(null));
    const nk = new Int16Array(cap).fill(-1);
    nk.set(viewKind);
    viewKind = nk;
    const nt = new Int32Array(cap).fill(-1);
    nt.set(viewTint);
    viewTint = nt;
    const ng = new Int16Array(cap).fill(-1);
    ng.set(glowKind);
    glowKind = ng;
  }

  function ensureBulletItems(cap: number): void {
    while (bulletItems.length < cap) {
      const p = new Particle({ texture: dot, x: PARK, y: PARK, anchorX: 0.5, anchorY: 0.5, tint: bulletTint });
      p.scaleX = p.scaleY = BULLET_SCALE;
      bulletItems.push(p);
      bullets.addParticle(p);
      const t = new Particle({
        texture: trail,
        x: PARK,
        y: PARK,
        anchorX: 1,
        anchorY: 0.5,
        tint: bulletTint,
        alpha: currentRender.trailAlpha,
      });
      t.scaleX = TRAIL_LEN_U / TRAIL_TEX_LEN;
      t.scaleY = 1;
      trailItems.push(t);
      trails.addParticle(t);
    }
  }

  function glowTextureFor(kind: number): Texture {
    const slot = kind >= 1 && kind <= MAX_KIND ? kind : 0;
    const existing = glowTextures[slot];
    if (existing) return existing;
    const spec = specFor(slot);
    const ctx = buildGlowSourceContext(spec, palette);
    const g = new Graphics(ctx);
    g.filters = [new BlurFilter({ strength: 6, quality: 2 })];
    const r = spec.radius + GLOW_PAD;
    const tex = app.renderer.generateTexture({ target: g, frame: new Rectangle(-r, -r, 2 * r, 2 * r), resolution: 1, antialias: true });
    g.destroy({ context: true });
    glowTextures[slot] = tex;
    return tex;
  }

  function rebuildGlowTextures(): void {
    const old = glowTextures;
    glowTextures = new Array<Texture | null>(MAX_KIND + 1).fill(null);
    glowKind.fill(-1); // forces a texture reassign on the next draw
    for (let i = 0; i < glowViews.length; i++) {
      const s = glowViews[i];
      if (s && s.visible) {
        const k = viewKind[i] ?? -1;
        if (k >= 0) {
          s.texture = glowTextureFor(k);
          glowKind[i] = k;
        }
      }
    }
    for (const t of old) t?.destroy(true);
    glowTexturesDirty = false;
  }

  function redrawGrid(): void {
    if (ripples.length === 0) {
      drawGrid(grid, arena, palette.grid, fit.scale);
      gridRippling = false;
      return;
    }
    grid.clear();
    for (const path of rippledGridPaths(arena, ripples)) {
      grid.moveTo(path[0] ?? 0, path[1] ?? 0);
      for (let i = 2; i + 1 < path.length; i += 2) grid.lineTo(path[i] ?? 0, path[i + 1] ?? 0);
    }
    grid.stroke({ width: 1.6 / Math.max(fit.scale, 0.01), color: palette.grid, alpha: 1 });
    gridRippling = true;
  }

  function redrawArena(): void {
    redrawGrid();
    grid.alpha = currentRender.gridAlpha;
    drawWalls(walls, arena, palette.grid, currentRender.innerAlpha, fit.scale);
  }

  function applyFit(): void {
    const rect = playRect ?? { x: 0, y: 0, w: cssW, h: cssH };
    fit = fitArena(arena.width, arena.height, rect);
    world.position.set(fit.x + shakeOff.x, fit.y + shakeOff.y);
    world.scale.set(fit.scale);
    const r = screenRectInWorld(cssW, cssH, fit);
    const pad = SHAKE_PAD_PX / Math.max(fit.scale, 0.01);
    glowLayer.filterArea = new Rectangle(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad);
    redrawArena();
  }

  // Neon: bindNeon writes bloom strength and threshold onto this live filter instance and the
  // grid alpha onto the live grid, then calls these hooks for the shape, tint and sprite paths.
  const offNeon = bindNeon({
    bloom,
    grid,
    shapes(r: Readonly<NeonRender>): void {
      const old = rebuildShapeContexts(r);
      for (let i = 0; i < views.length; i++) {
        const v = views[i];
        const k = viewKind[i] ?? -1;
        if (v && k >= 0) v.context = contextForValue(k);
      }
      retiredContexts = retiredContexts.concat(old);
      drawWalls(walls, arena, palette.grid, r.innerAlpha, fit.scale);
    },
    tint(): void {
      viewTint.fill(-1); // every live view retints from the new palette on the next draw
      bulletTint = palette.yellow;
      for (const b of bulletItems) b.tint = bulletTint;
      for (const t of trailItems) {
        t.tint = bulletTint;
        t.alpha = currentRender.trailAlpha;
      }
      bullets.update();
      trails.update();
      redrawGrid();
    },
    sprites(): void {
      glowTexturesDirty = true;
      if (!bloomOn) rebuildGlowTextures();
    },
  });

  // Effects from the sim (docs/01 section 12). Payloads are reused scratch objects, so read
  // the fields now.
  function playFx(x: number, y: number, e: FxEvent): void {
    burstFx(x, y, e);
    const plan = planFx(e);
    if (plan.shake) addShake(shake, plan.shake.amp, plan.shake.dur);
    if (plan.ripple > 0) addRipple(ripples, x, y, plan.ripple);
    if (plan.ring) {
      if (ringList.length >= MAX_RINGS) ringList.shift();
      ringList.push({ x, y, age: 0 });
    }
  }
  const offFx = [
    bus.on('fx:kill', (p) => playFx(p.x, p.y, { type: 'kill', colour: p.colour })),
    bus.on('fx:death', (p) => playFx(p.x, p.y, { type: 'death' })),
    bus.on('fx:bomb', (p) => playFx(p.x, p.y, { type: 'bomb' })),
    bus.on('fx:geom', (p) => playFx(p.x, p.y, { type: 'geom' })),
  ];
  registerParticleStress(setParticleStress);

  function stepEffects(dt: number): void {
    stepShake(shake, dt, shakeOff);
    world.position.set(fit.x + shakeOff.x, fit.y + shakeOff.y);
    if (ripples.length > 0 || gridRippling) {
      stepRipples(ripples, dt);
      redrawGrid();
    }
    if (ringList.length > 0 || rings.visible) {
      rings.clear();
      for (let i = ringList.length - 1; i >= 0; i--) {
        const r = ringList[i];
        if (!r) continue;
        r.age += dt;
        if (r.age >= RING_LIFE) {
          ringList.splice(i, 1);
          continue;
        }
        const f = 1 - r.age / RING_LIFE;
        const rad = 20 + r.age * RING_SPEED;
        rings.circle(r.x, r.y, rad).stroke({ width: 26 * f, color: palette.bomb, alpha: 0.25 * f });
        rings.circle(r.x, r.y, rad).stroke({ width: 7, color: palette.bomb, alpha: f });
      }
      rings.visible = ringList.length > 0;
    }
  }

  function setBloomEnabled(on: boolean): void {
    bloomOn = on;
    glowLayer.filters = on ? [bloom] : [];
    glowSprites.visible = !on;
    stats.glowPath = on ? 'bloom' : 'fallback';
    if (!on && glowTexturesDirty) rebuildGlowTextures();
  }

  function hideSlot(i: number): void {
    const v = views[i];
    if (v && v.visible) v.visible = false;
    const s = glowViews[i];
    if (s && s.visible) s.visible = false;
  }

  function drawEntities(w: World, alpha: number, timeSec: number): void {
    growPools(w.cap);
    const glowAlpha = currentRender.spriteAlpha;
    const glowScale = currentRender.spriteScale;
    let live = 0;
    for (let i = 0; i < w.cap; i++) {
      if (w.alive[i] !== 1) {
        hideSlot(i);
        continue;
      }
      live++;
      const kind = w.kind[i] ?? 0;
      let v = views[i];
      if (!v) {
        v = new Graphics(contextForValue(kind));
        entities.addChild(v);
        views[i] = v;
        viewKind[i] = kind;
      } else if (viewKind[i] !== kind) {
        v.context = contextForValue(kind);
        viewKind[i] = kind;
        viewTint[i] = -1;
      }
      if (!v.visible) v.visible = true;
      const spec = specFor(kind);
      const tint = spec.tint === null ? 0xffffff : palette[spec.tint];
      if (viewTint[i] !== tint) {
        v.tint = tint;
        viewTint[i] = tint;
      }
      const x = interp(w.prevX[i] ?? 0, w.x[i] ?? 0, alpha);
      const y = interp(w.prevY[i] ?? 0, w.y[i] ?? 0, alpha);
      let scale = 1;
      if (kind === KIND_GRUNT) scale = gruntPulse(timeSec, hash01(i));
      else if (kind === KIND_GRAVITY_WELL) {
        const r = w.radius[i] ?? 0;
        if (r > 0) scale = r / WELL_BASE_RADIUS;
      }
      v.position.set(x, y);
      v.rotation = w.rot[i] ?? 0;
      v.scale.set(scale);

      if (!bloomOn) {
        let s = glowViews[i];
        if (!s) {
          s = new Sprite({ texture: glowTextureFor(kind), anchor: 0.5, blendMode: 'add' });
          glowSprites.addChild(s);
          glowViews[i] = s;
          glowKind[i] = kind;
        } else if (glowKind[i] !== kind) {
          s.texture = glowTextureFor(kind);
          glowKind[i] = kind;
        }
        if (!s.visible) s.visible = true;
        s.tint = tint;
        s.alpha = glowAlpha;
        s.position.set(x, y);
        s.rotation = v.rotation;
        s.scale.set(scale * glowScale);
      }
    }
    stats.entities = live;
  }

  function drawBullets(pool: BulletPoolLike | null, alpha: number): void {
    if (!pool) {
      stats.bullets = 0;
      return;
    }
    ensureBulletItems(pool.cap);
    let live = 0;
    for (let i = 0; i < bulletItems.length; i++) {
      const item = bulletItems[i];
      const tail = trailItems[i];
      if (!item || !tail) continue;
      if (i < pool.cap && pool.alive[i] === 1) {
        live++;
        const vx = pool.vx[i] ?? 0;
        const vy = pool.vy[i] ?? 0;
        const x = bulletRenderPos(pool.x[i] ?? 0, vx, alpha, SIM_DT);
        const y = bulletRenderPos(pool.y[i] ?? 0, vy, alpha, SIM_DT);
        item.x = x;
        item.y = y;
        tail.x = x;
        tail.y = y;
        tail.rotation = Math.atan2(vy, vx);
      } else if (item.x !== PARK) {
        item.x = PARK;
        item.y = PARK;
        tail.x = PARK;
        tail.y = PARK;
      }
    }
    stats.bullets = live;
  }

  function draw(w: World, alpha: number): void {
    const now = performance.now();
    const dt = lastDraw === 0 ? 0 : (now - lastDraw) / 1000;
    lastDraw = now;
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    drawEntities(w, a, now / 1000);
    drawBullets(explicitBullets ?? bulletsFromWorld(w), a);
    stepEffects(dt);
    stepParticles(dt);
    stats.particles = liveParticleCount();
    app.render();
    if (retiredContexts.length > 0) {
      for (const c of retiredContexts) c.destroy();
      retiredContexts = [];
    }
  }

  function resize(w: number, h: number, d: number): void {
    cssW = Math.max(1, Math.round(w));
    cssH = Math.max(1, Math.round(h));
    app.renderer.resize(cssW, cssH, Math.min(d || 1, DPR_CAP));
    applyFit();
  }

  function setArena(def: LevelDef): void {
    arena = def.arena;
    setParticleBounds(arena.width, arena.height);
    clearParticles();
    ripples.length = 0;
    ringList.length = 0;
    shake.list.length = 0;
    applyFit();
  }

  function setSticks(circles: readonly StickCircleLike[]): void {
    sticks.clear();
    for (const c of circles) {
      const a = c.alpha ?? 1;
      if (a <= 0 || c.r <= 0) continue;
      sticks.circle(c.x, c.y, c.r);
      if (c.filled) sticks.fill({ color: 0xffffff, alpha: a });
      else sticks.stroke({ width: 3, color: 0xffffff, alpha: a });
    }
  }

  function destroy(): void {
    offNeon();
    for (const off of offFx) off();
    registerParticleStress(null);
    for (const t of glowTextures) t?.destroy(true);
    app.destroy(true, { children: true });
  }

  setParticleBounds(arena.width, arena.height);
  applyFit();
  setBloomEnabled(true);

  return {
    app,
    resize,
    setArena,
    draw,
    setBloomEnabled,
    get bloomEnabled(): boolean {
      return bloomOn;
    },
    stats,
    setPlayRect(rect: PlayRect | null): void {
      playRect = rect;
      applyFit();
    },
    setBullets(pool: BulletPoolLike | null): void {
      explicitBullets = pool;
    },
    setSticks,
    destroy,
  };
}
