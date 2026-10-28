// Game renderer (docs/03-architecture.md section 6). Scene graph:
//   stage > world > grid
//                 > bloomLayer (bloom filter, reduced resolution): wallGlow, glowSprites,
//                   particles, bulletTrails, ringGlow
//                 > lines (no filter, full resolution, MSAA): walls, entities, bullets, rings
//   stage > sticks (outside bloom)
// Crisp line work never passes through the filter, so it renders at the full backing store
// resolution with antialiasing. The bloom layer only holds soft content: one bloom source
// sprite per entity (pre-rendered at resolution 2), a thick wall copy, particles and trails.
// On the fallback path the filter is removed and the sprites switch to blurred glow textures.
// v2 wave B: bullet heads draw from one atlas by BulletPool.style (bullets container) and the
// attached trails from the trail texture (bulletTrails): two draw calls for every bullet look.
// Weapon pickups use per weapon visual slots (shapeSpecs.ts). Ship and bullet particle trails
// go into the shared particle pool (particles.ts) and follow the effects tier.
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
  Texture,
  type Renderer,
} from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { registerParticleStress } from '../core/debug';
import { bus } from '../core/events';
import { gameState, isTelegraphing, telegraphLeft } from '../game/game';
import type { World } from '../game/world';
import type { ArenaDef, LevelDef } from '../levelgen/leveldef';
import { hash01 } from './color';
import { arenaGridSegments, drawGrid, drawWalls, gridLineWidth, wallPasses } from './grid';
import {
  backingSize,
  bloomResolution,
  bulletRenderPos,
  fitArena,
  gruntPulse,
  interp,
  parseBloomKnobs,
  renderResolution,
  screenRectInWorld,
  superFired,
  telegraphAlpha,
  type Fit,
  type PlayRect,
  type SuperWatch,
} from './layout';
import { planFx, type FxEvent } from './fx';
import { currentRender, palette, type NeonRender, type PaletteKey } from './neon';
import { bindNeon } from './neonApply';
import {
  burst,
  burstFx,
  clearParticles,
  disposeParticles,
  emitBulletTrail,
  emitShipTrail,
  initParticles,
  liveParticleCount,
  resetShipTrail,
  setParticleBounds,
  setParticleStress,
  stepParticles,
  STREAK_TEX_LEN,
} from './particles';
import { addRipple, stepRipples, traceRippledGrid, type Ripple } from './ripple';
import { addShake, createShake, stepShake } from './shake';
import { buildBloomSourceContext, buildGlowSourceContext, contextForSlot, rebuildShapeContexts } from './shapes';
import type { GraphicsContext } from 'pixi.js';
import { MAX_SLOT, PICKUP_KIND, PICKUP_SPIN, pickupAlpha, specForSlot, visualSlot } from './shapeSpecs';
import {
  ATLAS_CELLS,
  ATLAS_H,
  ATLAS_W,
  BULLET_FRAMES,
  bulletStyleVisual,
  crescentPoints,
  PICKUP_BURST_COUNT,
  styleCode,
  visualForCode,
  weaponTint,
  type BulletFrame,
  type BulletStyleVisual,
} from './bulletStyles';
import { bulletTrailRate, type Emitter } from './trails';

/** Structural view of Forge's BulletPool (03 section 5). Only the fields the renderer reads. */
export interface BulletPoolLike {
  readonly cap: number;
  readonly alive: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** 1 for homing bullets (super). Optional so older pools still match. */
  readonly homing?: Uint8Array;
  /** Weapon style per bullet: 0 spread, 1 rapid, 2 pierce, 3 orbit (docs/10 render contract). */
  readonly style?: Uint8Array;
  /** Previous step positions, used to interpolate orbit blades that Swarm places each step. */
  readonly prevX?: Float32Array;
  readonly prevY?: Float32Array;
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
  /** Ring burst, particles and ripple at a point (super activation). Also fired automatically. */
  superFx(x: number, y: number): void;
  destroy(): void;
}

const SIM_DT = 1 / 120;
const PARK = -99999;
const TRAIL_TEX_LEN = 32;
const GLOW_PAD = 34;
/** Render clock step used for trail emission is clamped like the particle step. */
const MAX_FX_DT = 0.05;
/** Resolution of every generated texture (dot, streak, trail, glow and bloom sources). */
const GEN_TEX_RES = 2;
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

/** False while the ship is dead (respawn delay). */
function shipActive(w: World): boolean {
  return w.ship.active;
}

function viewportSize(host: HTMLElement): { w: number; h: number } {
  const vv = window.visualViewport;
  const w = host.clientWidth || (vv ? vv.width : window.innerWidth);
  const h = host.clientHeight || (vv ? vv.height : window.innerHeight);
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

interface BulletAtlas {
  /** The whole atlas; the bullet ParticleContainer binds its source. */
  readonly texture: Texture;
  readonly frames: Readonly<Record<BulletFrame, Texture>>;
}

/**
 * Every bullet look in one generated texture (layout in bulletStyles.ts), so all heads share one
 * texture source and one draw call. Drawn white; particles are tinted per style. The dot cell is
 * the v1 bullet dot unchanged.
 */
function makeBulletAtlas(app: Application): BulletAtlas {
  const g = new Graphics();
  const d = ATLAS_CELLS.dot;
  const dx = d.x + d.w / 2;
  const dy = d.y + d.h / 2;
  g.circle(dx, dy, 8).fill({ color: 0xffffff, alpha: 0.18 });
  g.circle(dx, dy, 5.5).fill({ color: 0xffffff, alpha: 0.45 });
  g.circle(dx, dy, 3).fill({ color: 0xffffff, alpha: 1 });
  // Rapid: thin short streak, brightest core toward the nose (+x).
  const r = ATLAS_CELLS.rapid;
  g.roundRect(r.x, r.y, r.w, r.h, r.h / 2).fill({ color: 0xffffff, alpha: 0.2 });
  g.roundRect(r.x + 3, r.y + r.h / 2 - 1.4, r.w - 4, 2.8, 1.4).fill({ color: 0xffffff, alpha: 0.5 });
  g.roundRect(r.x + 8, r.y + r.h / 2 - 0.8, r.w - 9, 1.6, 0.8).fill({ color: 0xffffff, alpha: 1 });
  // Pierce: long bright lance inside a wide soft halo, hot nose.
  const p = ATLAS_CELLS.pierce;
  const pcx = p.x + p.w / 2;
  const pcy = p.y + p.h / 2;
  g.ellipse(pcx, pcy, p.w / 2, p.h / 2).fill({ color: 0xffffff, alpha: 0.13 });
  g.ellipse(pcx, pcy, p.w / 2 - 2, p.h / 2 - 2.5).fill({ color: 0xffffff, alpha: 0.28 });
  g.roundRect(p.x + 3, pcy - 1.6, p.w - 6, 3.2, 1.6).fill({ color: 0xffffff, alpha: 1 });
  g.circle(p.x + p.w * 0.74, pcy, 2.8).fill({ color: 0xffffff, alpha: 1 });
  // Orbit: crescent blade, bulge toward +x, with a soft rim.
  const o = ATLAS_CELLS.orbit;
  const ocx = o.x + o.w / 2;
  const ocy = o.y + o.h / 2;
  const pts = crescentPoints(9, 4, 14);
  for (let i = 0; i < pts.length; i += 2) {
    pts[i] = (pts[i] ?? 0) + ocx + 1;
    pts[i + 1] = (pts[i + 1] ?? 0) + ocy;
  }
  g.poly(pts, true).stroke({ width: 4, color: 0xffffff, alpha: 0.28, join: 'round' });
  g.poly(pts, true).fill({ color: 0xffffff, alpha: 1 });
  const texture = app.renderer.generateTexture({
    target: g,
    frame: new Rectangle(0, 0, ATLAS_W, ATLAS_H),
    resolution: GEN_TEX_RES,
    antialias: true,
  });
  g.destroy({ context: true });
  const frames = {} as Record<BulletFrame, Texture>;
  for (const f of BULLET_FRAMES) {
    const c = ATLAS_CELLS[f];
    frames[f] = new Texture({ source: texture.source, frame: new Rectangle(c.x, c.y, c.w, c.h) });
  }
  return { texture, frames };
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
  const tex = app.renderer.generateTexture({ target: g, frame: new Rectangle(-L / 2, -4, L, 8), resolution: GEN_TEX_RES, antialias: true });
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
    g.rect(x, -3, L / steps, 6).fill({ color: 0xffffff, alpha: 0.24 * t });
    g.rect(x, -1.4, L / steps, 2.8).fill({ color: 0xffffff, alpha: 0.95 * t * t });
  }
  const tex = app.renderer.generateTexture({ target: g, frame: new Rectangle(0, -3, L, 6), resolution: GEN_TEX_RES, antialias: true });
  g.destroy({ context: true });
  return tex;
}

/** WebGL context antialias attribute as the browser granted it, for the boot log. */
function contextAntialias(r: Renderer): string {
  if ('gl' in r) {
    const attrs = r.gl.getContextAttributes();
    return attrs ? String(attrs.antialias) : 'unknown';
  }
  return 'n/a';
}

export async function createRenderer(host: HTMLElement): Promise<GameRenderer> {
  const size = viewportSize(host);
  const dpr = renderResolution(window.devicePixelRatio);
  const app = new Application();
  await app.init({
    width: size.w,
    height: size.h,
    resolution: dpr,
    autoDensity: true,
    // MSAA on the canvas: v8 Graphics strokes have no analytic AA, so without it the arena
    // outline stair steps. Line work sits outside the filter so it keeps this MSAA.
    antialias: true,
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
  const bloomLayer = new Container({ label: 'bloomLayer' });
  const lines = new Container({ label: 'lines' });
  const walls = new Graphics({ label: 'walls' });
  const wallGlow = new Graphics({ label: 'wallGlow' });
  const glowSprites = new Container({ label: 'glowSprites' });
  const entities = new Container({ label: 'entities' });
  const atlas = makeBulletAtlas(app);
  const streak = makeStreakTexture(app);
  const trail = makeTrailTexture(app);
  const trails = new ParticleContainer({
    label: 'bulletTrails',
    texture: trail,
    blendMode: 'add',
    dynamicProperties: { position: true, rotation: true, uvs: false, vertex: false, color: false },
  });
  // Bullet heads: one container, one atlas, one draw call. Rotation is dynamic because streaks
  // follow their velocity and orbit blades turn with the ship; frame, anchor, scale and tint are
  // static and re-uploaded only when a slot changes style (update() below).
  const bullets = new ParticleContainer({
    label: 'bullets',
    texture: atlas.texture,
    blendMode: 'add',
    dynamicProperties: { position: true, rotation: true, uvs: false, vertex: false, color: false },
  });
  const particles = new ParticleContainer({
    label: 'particles',
    texture: streak,
    blendMode: 'add',
    dynamicProperties: { position: true, rotation: true, uvs: false, vertex: true, color: true },
  });
  const rings = new Graphics({ label: 'rings' });
  const ringGlow = new Graphics({ label: 'ringGlow' });
  const sticks = new Graphics({ label: 'sticks' });

  bloomLayer.addChild(wallGlow, glowSprites, particles, trails, ringGlow);
  lines.addChild(walls, entities, bullets, rings);
  world.addChild(grid, bloomLayer, lines);
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
  bloom.resolution = bloomResolution(dpr, knobs.resolution);
  bloom.antialias = 'off'; // soft content only; MSAA here would cost fill rate for nothing

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

  // Per kind sprite textures (slot 0 is the unknown magenta circle): blurred glow for the
  // fallback path, sharp thick core lines as the bloom source on the bloom path.
  // Indexed by visual slot (shapeSpecs.ts), so each weapon pickup variant has its own texture.
  const emptyTextures = (): (Texture | null)[] => new Array<Texture | null>(MAX_SLOT + 1).fill(null);
  let glowTextures = emptyTextures();
  let bloomTextures = emptyTextures();
  let glowTexturesDirty = false;

  // Bullet particles, one head and one attached trail per bullet slot, parked when dead.
  const bulletItems: Particle[] = [];
  const trailItems: Particle[] = [];
  /** Particle trail emitter per bullet slot (styles 1 and 2). */
  const bulletEmitters: Emitter[] = [];
  /** styleCode shown per bullet slot, -1 unknown, so frame, tint and trail change once. */
  let bulletCodeShown = new Int8Array(0);

  // Grid segments cached per arena; the ripple redraw traces them without allocating.
  let gridSegs: number[] = [];

  // Super activation watch (no fx:super event exists yet, see hand-off).
  const superPrev: SuperWatch = { active: null, timer: 0, droneAbsent: 0 };
  const superCur: SuperWatch = { active: null, timer: 0, droneAbsent: 0 };
  let superWorld: World | null = null;

  // Effects state: shake offset in CSS px, grid ripples and bomb rings in arena units.
  const shake = createShake();
  const shakeOff = { x: 0, y: 0 };
  const ripples: Ripple[] = [];
  let gridRippling = false;
  const ringList: { x: number; y: number; age: number; colour: PaletteKey }[] = [];
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

  /** Write one style onto a slot's head and attached trail (static properties). */
  function styleSlot(i: number, v: BulletStyleVisual): void {
    const item = bulletItems[i];
    const tail = trailItems[i];
    if (!item || !tail) return;
    const tint = palette[v.tint];
    item.texture = atlas.frames[v.frame];
    item.anchorX = v.anchorX;
    item.scaleX = item.scaleY = v.scale;
    item.tint = tint;
    tail.tint = tint;
    tail.alpha = currentRender.trailAlpha;
    tail.scaleX = v.trailLenU / TRAIL_TEX_LEN;
    tail.scaleY = v.trailThick;
  }

  function ensureBulletItems(cap: number): void {
    const spread = bulletStyleVisual(0, false);
    while (bulletItems.length < cap) {
      const p = new Particle({ texture: atlas.frames.dot, x: PARK, y: PARK, anchorX: 0.5, anchorY: 0.5 });
      bulletItems.push(p);
      bullets.addParticle(p);
      const t = new Particle({ texture: trail, x: PARK, y: PARK, anchorX: 1, anchorY: 0.5 });
      trailItems.push(t);
      trails.addParticle(t);
      bulletEmitters.push({ acc: 0 });
      styleSlot(bulletItems.length - 1, spread);
    }
    if (bulletCodeShown.length < cap) {
      const next = new Int8Array(cap).fill(-1);
      next.set(bulletCodeShown);
      bulletCodeShown = next;
    }
  }

  /** Capture one visual slot's sprite texture: blurred glow (fallback) or sharp core (bloom source). */
  function makeKindTexture(slot: number, blurred: boolean): Texture {
    const spec = specForSlot(slot);
    const g = new Graphics(blurred ? buildGlowSourceContext(spec, palette) : buildBloomSourceContext(spec, palette));
    if (blurred) g.filters = [new BlurFilter({ strength: 6, quality: 2 })];
    const r = spec.radius + (blurred ? GLOW_PAD : GLOW_PAD / 2);
    const tex = app.renderer.generateTexture({
      target: g,
      frame: new Rectangle(-r, -r, 2 * r, 2 * r),
      resolution: GEN_TEX_RES,
      antialias: true,
    });
    g.destroy({ context: true });
    return tex;
  }

  /** Sprite texture for a visual slot on the current glow path, built lazily. */
  function glowTextureFor(visual: number): Texture {
    const slot = visual >= 1 && visual <= MAX_SLOT ? visual : 0;
    const set = bloomOn ? bloomTextures : glowTextures;
    const existing = set[slot];
    if (existing) return existing;
    const tex = makeKindTexture(slot, !bloomOn);
    set[slot] = tex;
    return tex;
  }

  /** Drop both texture sets (palette or path changed) and reassign every visible sprite. */
  function rebuildGlowTextures(): void {
    const old = glowTextures.concat(bloomTextures);
    glowTextures = emptyTextures();
    bloomTextures = emptyTextures();
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
      drawGrid(grid, gridSegs, palette.grid, fit.scale);
      gridRippling = false;
      return;
    }
    grid.clear();
    traceRippledGrid(gridSegs, ripples, grid);
    grid.stroke({ width: gridLineWidth(fit.scale), color: palette.grid, alpha: 1 });
    gridRippling = true;
  }

  function redrawWalls(r: Readonly<NeonRender>): void {
    drawWalls(walls, arena, palette.grid, wallPasses(r.innerAlpha, r.wallWidthMul, fit.scale, 'crisp'));
    drawWalls(wallGlow, arena, palette.grid, wallPasses(r.innerAlpha, r.wallWidthMul, fit.scale, 'bloom'));
  }

  function redrawArena(): void {
    redrawGrid();
    grid.alpha = currentRender.gridAlpha;
    redrawWalls(currentRender);
  }

  function applyFit(): void {
    const rect = playRect ?? { x: 0, y: 0, w: cssW, h: cssH };
    fit = fitArena(arena.width, arena.height, rect);
    world.position.set(fit.x + shakeOff.x, fit.y + shakeOff.y);
    world.scale.set(fit.scale);
    const r = screenRectInWorld(cssW, cssH, fit);
    const pad = SHAKE_PAD_PX / Math.max(fit.scale, 0.01);
    bloomLayer.filterArea = new Rectangle(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad);
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
        if (v && k >= 0) v.context = contextForSlot(k);
      }
      retiredContexts = retiredContexts.concat(old);
      redrawWalls(r);
    },
    tint(): void {
      viewTint.fill(-1); // every live view retints from the new palette on the next draw
      // Bullets: every slot restyles from the new palette, with the new trail alpha.
      for (let i = 0; i < bulletItems.length; i++) {
        styleSlot(i, visualForCode(bulletCodeShown[i] ?? -1));
      }
      bullets.update();
      trails.update();
      redrawGrid();
    },
    sprites(): void {
      // Both sprite sets bake palette colours; rebuild lazily for the live path.
      glowTexturesDirty = true;
      rebuildGlowTextures();
    },
  });

  // Effects from the sim (docs/01 section 12). Payloads are reused scratch objects, so read
  // the fields now.
  function playFx(x: number, y: number, e: FxEvent): void {
    burstFx(x, y, e);
    const plan = planFx(e);
    if (plan.shake) addShake(shake, plan.shake.amp, plan.shake.dur);
    if (plan.ripple > 0) addRipple(ripples, x, y, plan.ripple);
    if (plan.ring !== null) {
      if (ringList.length >= MAX_RINGS) ringList.shift();
      ringList.push({ x, y, age: 0, colour: plan.ring });
    }
  }

  function superFx(x: number, y: number): void {
    playFx(x, y, { type: 'super' });
  }

  /** Fire superFx at the ship when the game state shows a super activation. */
  function watchSuper(w: World): void {
    const g = gameState(w);
    superCur.active = g.superActive;
    superCur.timer = g.superTimer;
    superCur.droneAbsent = g.droneAbsent;
    if (w === superWorld && superFired(superPrev, superCur)) superFx(w.x[0] ?? 0, w.y[0] ?? 0);
    superWorld = w;
    superPrev.active = superCur.active;
    superPrev.timer = superCur.timer;
    superPrev.droneAbsent = superCur.droneAbsent;
  }
  const offFx = [
    bus.on('fx:kill', (p) => playFx(p.x, p.y, { type: 'kill', colour: p.colour })),
    bus.on('fx:death', (p) => playFx(p.x, p.y, { type: 'death' })),
    bus.on('fx:bomb', (p) => playFx(p.x, p.y, { type: 'bomb' })),
    bus.on('fx:geom', (p) => playFx(p.x, p.y, { type: 'geom' })),
    // Weapon pickup collected (Swarm, wave B): a burst in the weapon's bullet colour.
    bus.on('fx:pickup', (p) => burst(p.x, p.y, palette[weaponTint(p.weapon)], PICKUP_BURST_COUNT)),
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
      ringGlow.clear();
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
        const color = palette[r.colour];
        rings.circle(r.x, r.y, rad).stroke({ width: 26 * f, color, alpha: 0.25 * f });
        rings.circle(r.x, r.y, rad).stroke({ width: 6, color, alpha: f });
        if (bloomOn) ringGlow.circle(r.x, r.y, rad).stroke({ width: 12, color, alpha: f });
      }
      rings.visible = ringList.length > 0;
      ringGlow.visible = rings.visible && bloomOn;
    }
  }

  function setBloomEnabled(on: boolean): void {
    const changed = on !== bloomOn;
    bloomOn = on;
    bloomLayer.filters = on ? [bloom] : [];
    wallGlow.visible = on; // fallback: the crisp walls carry their own halo strokes
    ringGlow.visible = on && rings.visible;
    stats.glowPath = on ? 'bloom' : 'fallback';
    if (changed || glowTexturesDirty) rebuildGlowTextures();
  }

  function hideSlot(i: number): void {
    const v = views[i];
    if (v && v.visible) v.visible = false;
    const s = glowViews[i];
    if (s && s.visible) s.visible = false;
  }

  function drawEntities(w: World, alpha: number, timeSec: number): void {
    growPools(w.cap);
    // One sprite per entity on both paths: bloom source (sharp, scale 1) or blurred glow.
    const glowAlpha = bloomOn ? currentRender.bloomSourceAlpha : currentRender.spriteAlpha;
    const glowScale = bloomOn ? 1 : currentRender.spriteScale;
    let live = 0;
    for (let i = 0; i < w.cap; i++) {
      if (w.alive[i] !== 1) {
        hideSlot(i);
        continue;
      }
      live++;
      const kind = w.kind[i] ?? 0;
      const isPickup = kind === PICKUP_KIND;
      // Visual slot: the kind, or the pickup variant for its weapon index (w.a).
      const slot = visualSlot(kind, w.a[i] ?? -1);
      let v = views[i];
      if (!v) {
        v = new Graphics(contextForSlot(slot));
        entities.addChild(v);
        views[i] = v;
        viewKind[i] = slot;
      } else if (viewKind[i] !== slot) {
        v.context = contextForSlot(slot);
        viewKind[i] = slot;
        viewTint[i] = -1;
      }
      if (!v.visible) v.visible = true;
      const spec = specForSlot(slot);
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
      // Pickups spin on the render clock (phase per slot) and blink in their last 2 s (w.t).
      v.rotation = isPickup ? timeSec * PICKUP_SPIN + hash01(i) * Math.PI * 2 : (w.rot[i] ?? 0);
      v.scale.set(scale);
      // Telegraphing enemies flash at 50 percent alpha (Swarm W3 request).
      const tele = isPickup ? pickupAlpha(w.t[i] ?? 0) : isTelegraphing(w, i) ? telegraphAlpha(telegraphLeft(w, i)) : 1;
      if (v.alpha !== tele) v.alpha = tele;

      let s = glowViews[i];
      if (!s) {
        s = new Sprite({ texture: glowTextureFor(slot), anchor: 0.5, blendMode: 'add' });
        glowSprites.addChild(s);
        glowViews[i] = s;
        glowKind[i] = slot;
      } else if (glowKind[i] !== slot) {
        s.texture = glowTextureFor(slot);
        glowKind[i] = slot;
      }
      if (!s.visible) s.visible = true;
      s.tint = tint;
      s.alpha = glowAlpha * tele;
      s.position.set(x, y);
      s.rotation = v.rotation;
      s.scale.set(scale * glowScale);
    }
    stats.entities = live;
  }

  /**
   * Bullet heads and attached trails by style, plus particle trails for styles 1 and 2.
   * (shipX, shipY) is the drawn ship position, the centre orbit blades turn around.
   */
  function drawBullets(pool: BulletPoolLike | null, alpha: number, shipX: number, shipY: number, dt: number): void {
    if (!pool) {
      stats.bullets = 0;
      return;
    }
    ensureBulletItems(pool.cap);
    const homing = pool.homing;
    const style = pool.style;
    const prevX = pool.prevX;
    const prevY = pool.prevY;
    let live = 0;
    let restyled = false;
    for (let i = 0; i < bulletItems.length; i++) {
      const item = bulletItems[i];
      const tail = trailItems[i];
      const em = bulletEmitters[i];
      if (!item || !tail || !em) continue;
      if (i < pool.cap && pool.alive[i] === 1) {
        live++;
        // Style and homing are static properties: restyle once per change and flag the
        // containers for re-upload below.
        const st = style !== undefined ? (style[i] ?? 0) : 0;
        const h = homing !== undefined && homing[i] === 1;
        const code = styleCode(st, h);
        const vis = bulletStyleVisual(st, h);
        if (bulletCodeShown[i] !== code) {
          bulletCodeShown[i] = code;
          styleSlot(i, vis);
          restyled = true;
        }
        const vx = pool.vx[i] ?? 0;
        const vy = pool.vy[i] ?? 0;
        let x: number;
        let y: number;
        if (vis.orient === 'radial' && prevX !== undefined && prevY !== undefined) {
          // Orbit blades are placed by the sim each step: interpolate, do not extrapolate.
          x = interp(prevX[i] ?? 0, pool.x[i] ?? 0, alpha);
          y = interp(prevY[i] ?? 0, pool.y[i] ?? 0, alpha);
        } else {
          x = bulletRenderPos(pool.x[i] ?? 0, vx, alpha, SIM_DT);
          y = bulletRenderPos(pool.y[i] ?? 0, vy, alpha, SIM_DT);
        }
        const heading = Math.atan2(vy, vx);
        item.x = x;
        item.y = y;
        item.rotation = vis.orient === 'radial' ? Math.atan2(y - shipY, x - shipX) : heading;
        if (vis.trailLenU > 0) {
          tail.x = x;
          tail.y = y;
          tail.rotation = heading;
        } else if (tail.x !== PARK) {
          tail.x = PARK;
          tail.y = PARK;
        }
        if (vis.emitsTrail) emitBulletTrail(em, bulletTrailRate(st), x, y, vx, vy, st, palette[vis.tint], dt);
        else em.acc = 0;
      } else if (item.x !== PARK) {
        item.x = PARK;
        item.y = PARK;
        tail.x = PARK;
        tail.y = PARK;
        em.acc = 0;
      }
    }
    if (restyled) {
      bullets.update();
      trails.update();
    }
    stats.bullets = live;
  }

  function draw(w: World, alpha: number): void {
    const now = performance.now();
    const dt = lastDraw === 0 ? 0 : (now - lastDraw) / 1000;
    lastDraw = now;
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    const fxDt = dt > MAX_FX_DT ? MAX_FX_DT : dt;
    watchSuper(w);
    drawEntities(w, a, now / 1000);
    const shipX = interp(w.prevX[0] ?? 0, w.x[0] ?? 0, a);
    const shipY = interp(w.prevY[0] ?? 0, w.y[0] ?? 0, a);
    // Ship trail: reads the sim velocity, writes only render particles.
    if (w.alive[0] === 1 && shipActive(w)) emitShipTrail(shipX, shipY, w.vx[0] ?? 0, w.vy[0] ?? 0, fxDt);
    else resetShipTrail();
    drawBullets(explicitBullets ?? bulletsFromWorld(w), a, shipX, shipY, fxDt);
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
    const res = renderResolution(d);
    app.renderer.resize(cssW, cssH, res); // third argument is the resolution
    bloom.resolution = bloomResolution(res, knobs.resolution);
    applyFit();
  }

  /** One line: CSS size, backing store, resolution, MSAA and bloom density. */
  function logRender(): void {
    const c = app.canvas;
    const res = app.renderer.resolution;
    const want = backingSize(cssW, cssH, res);
    const css = `${c.style.width || `${cssW}px`} x ${c.style.height || `${cssH}px`}`;
    const ok = c.width === want.w && c.height === want.h ? 'ok' : `expected ${want.w}x${want.h}`;
    console.log(
      `[sow] render css ${css} | backing ${c.width}x${c.height} (${ok}) | resolution ${res} | ` +
        `antialias ${contextAntialias(app.renderer)} | bloom res ${String(bloom.resolution)}`,
    );
  }

  function setArena(def: LevelDef): void {
    arena = def.arena;
    gridSegs = arenaGridSegments(arena);
    superWorld = null;
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
    disposeParticles();
    for (const t of glowTextures) t?.destroy(true);
    for (const t of bloomTextures) t?.destroy(true);
    app.destroy(true, { children: true });
  }

  gridSegs = arenaGridSegments(arena);
  setParticleBounds(arena.width, arena.height);
  applyFit();
  setBloomEnabled(true);
  logRender();

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
    superFx,
    destroy,
  };
}
