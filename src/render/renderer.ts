// Game renderer (docs/03-architecture.md section 6). Scene graph:
//   stage > world > gridLayer (alpha = gridAlpha): dust, grid (v1, low tier), lattice
//                 > bloomLayer (bloom filter, reduced resolution): wallGlow, wallPulse,
//                   wallFlash, glowSprites, particles, bulletTrails, enemyFxGlow, ringGlow
//                 > lines (no filter, full resolution, MSAA): walls, floor, enemyFx, entities,
//                   bullets, rings
//   stage > sticks (outside bloom)
// v2 wave C: the new enemies draw from shapeSpecs.ts; per kind alpha, scale and tells come
// from the pure render contract helpers in enemyFx.ts. Slime puddles sit on the floor layer
// under every entity. enemyFx holds the Charger lane and dash streak, the Blink destination
// ring and the arrival and splat flashes. wallPulse (threat) and wallFlash (kills near a wall)
// are multipliers on their own layers (mapFx.ts); applyNeon still owns every SPEC 4 value.
// Crisp line work never passes through the filter, so it renders at the full backing store
// resolution with antialiasing. The bloom layer only holds soft content: one bloom source
// sprite per entity (pre-rendered at resolution 2), a thick wall copy, particles and trails.
// On the fallback path the filter is removed and the sprites switch to blurred glow textures.
// v2 wave B: bullet heads draw from one atlas by BulletPool.style (bullets container) and the
// attached trails from the trail texture (bulletTrails): two draw calls for every bullet look.
// Weapon pickups use per weapon visual slots (shapeSpecs.ts). Ship and bullet particle trails
// go into the shared particle pool (particles.ts) and follow the effects tier.
// v2 wave D: on the standard and high tiers the v1 grid and ripple are replaced by the spring
// lattice (latticeView.ts, sim in lattice/): one position buffer, line-list meshes, impulses from
// fx events, well pull and ship wake read from the World, and a governor that coarsens the
// spacing under sustained load. The low tier keeps the v1 grid and ripple path as it was.
// Run 0198 hit feedback (hitFx.ts): 'fx:hit' draws a tiny additive flash on a multi HP target
// (80 ms) or, when a Bulwark shield blocked it, a short arc on the shield plus 3 to 5 sparks. The
// flashes live in a second small pool whose Particles sit in the same pulses container (no extra
// draw call, no new buffer), throttled to one per entity per 50 ms, and are off on the low tier.
// The app is created with autoStart false; draw() updates the scene and calls app.render().
import {
  Application,
  BlurFilter,
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
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
import { geomAlpha, invulnAlpha } from './blink';
import { hash01 } from './color';
import { arenaGridSegments, drawGrid, drawWalls, gridLineWidth, WALL_GLOW_PX, WALL_LINE_PX, wallPasses } from './grid';
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
import { planFx, RIPPLE_KILL_BIG, type FxEvent } from './fx';
import { current, currentRender, palette, type NeonRender, type PaletteKey } from './neon';
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
import { exposedBossSlot, MAX_SLOT, PICKUP_KIND, PICKUP_SPIN, pickupAlpha, specForSlot, visualSlot } from './shapeSpecs';
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
import {
  attachedTrailFor,
  bulletTrailRate,
  dartTrailRate,
  ENEMY_TRAIL_CHARGER,
  ENEMY_TRAIL_DART,
  ENEMY_TRAIL_SWIRL,
  geomTwinkle,
  TAPER_TEX_H,
  TAPER_TEX_LEN,
  taperProfile,
  V1_TRAIL_TEX_LEN,
  type AttachedTrail,
  type Emitter,
} from './trails';
import {
  COMET_VERTS,
  cometAlpha,
  cometIndices,
  cometUvs,
  createComet,
  pushComet,
  resetComet,
  writeCometStrip,
} from './comet';
import {
  addPulse,
  clearPulses,
  createPulsePool,
  PULSE_ARC,
  PULSE_BAR,
  PULSE_FLASH,
  PULSE_RING,
  PULSE_STREAK,
  pulseAlpha,
  pulseLive,
  SHOCK_BIG_MUL,
  SHOCK_LIFE,
  SHOCK_R0,
  SHOCK_R1,
  shockRadius,
  stepPulses,
  STREAK_LIFE,
  WALL_GLOW_LEN,
  WALL_GLOW_LIFE,
  WALL_GLOW_THICK,
  WALL_HIT_RANGE,
} from './pulses';
import { heatBombFor, HEAT_SUPER } from './lattice/heat';
import { AMBIENT_AMP } from './lattice/ambient';
import {
  createHitThrottle,
  DEFLECT_ARC_HALF,
  DEFLECT_ARC_LIFE,
  DEFLECT_ARC_PAD,
  DEFLECT_ARC_R,
  DEFLECT_WHITE,
  arcFrame,
  deflectArcScale,
  deflectDir,
  HIT_DOT_FRAME,
  HIT_DOT_R,
  HIT_FLASH_LIFE,
  HIT_FLASH_WHITE,
  HIT_FX_CAP,
  hitFlashScale,
  hitHueKey,
  hitThrottleAllow,
  resetHitThrottle,
  type Dir,
} from './hitFx';
import {
  dustOn,
  trailsOn,
  getEffectsTier,
  hitFxOn,
  latticeCapFor,
  latticeOn,
  latticeSpacingFor,
  mapEffectsOn,
  onEffectsTierChanged,
  type EffectsTier,
} from './effects';
import { createLatticeView } from './latticeView';
import { chooseSpacing } from './lattice/layout';
import { addForce, addImpulse, addRing, clearForces } from './lattice/sim';
import {
  bombKickFor,
  heatPulseFor,
  KICK_SUPER_PULSE,
  latticeKickFor,
  MAX_WELLS,
  SUPER_FORCE_RADIUS,
  superForceAccel,
  superPulseDue,
  WAKE_RADIUS,
  wakeAccel,
  WELL_PULL_ACCEL,
  wellPullRadius,
} from './lattice/kicks';
import { GAP_MS, initialGovernor, nextGovernor, smoothFrameMs, type GovernorState } from './lattice/governor';
import {
  blinkArrived,
  blinkGhostAlpha,
  blinkRing,
  CHARGER_CHEVRON_GAP,
  CHARGER_CHEVRON_SIZE,
  CHARGER_DASH_TRAIL_RATE,
  CHARGER_LANE_FILL,
  CHARGER_LANE_HALF,
  CHARGER_LANE_LEN,
  chargerChevrons,
  splimeDropRing,
  type SplimeRing,
  chargerDashing,
  chargerLaneAlpha,
  chargerStreak,
  chargerStreakLen,
  mineAlpha,
  SLIME_RADIUS,
  slimeAlpha,
  slimeFresh,
  slimeScale,
  splimeSwell,
  SWIRL_TRAIL_RATE,
  type BlinkRing,
} from './enemyFx';
import {
  clampThreat,
  createWallHit,
  easeThreat,
  FLASH_LIFE,
  flashFade,
  flashStrength,
  MAX_FLASHES,
  mapFxNeonGain,
  mixRgb,
  nearestWall,
  PULSE_WARM_MAX,
  rayWallDistance,
  threatPulse,
  wallFeatures,
  wallPulseAlpha,
  wallTangent,
  type ThreatPulse,
  type WallFeature,
} from './mapFx';
import { burstBoss, burstSmall, emitBlinkStreak, emitDeflectSparks, emitEnemyTrail, emitGeomSparkle, trailsActive } from './particles';
import { bossSlot, isFloorSlot, KIND_NUM, partSlot, specFor } from './shapeSpecs';
// V3 wave A: boss, parts, hazards and enemy bullets (bossLook.ts, bossShapes.ts, hazardFx.ts,
// enemyBulletFx.ts). The boss is read through readBoss only; enemy bullets through enemyBulletsOf.
import { createBossView, readBoss, type BossView } from '../game/bosses/view';
import { bossOpen as simBossOpen } from '../game/bosses/core';
import { bossOf } from '../game/bosses/state';
import { enemyBulletsOf } from '../game/enemyBullets';
import { BOSS_IDS } from '../levelgen/leveldef';
import {
  approach,
  BOSS_BURST_WHITE,
  BOSS_DEATH_SHAKE_PX,
  BOSS_DEATH_SHAKE_SEC,
  BOSS_OPEN_STEPS,
  BOSS_PHASE_BURST,
  bossBodyAlpha,
  bossColourOf,
  bossDeathBurst,
  bossEdgePulse,
  bossGlowMul,
  bossHitAllow,
  bossIndex,
  bossPhaseFlash,
  bossTierOf,
  createBossHitThrottle,
  entranceRing,
  OPEN_RATE,
  opennessStep,
  PHASE_FLASH_SEC,
  podPulse,
  TIER_BULLET_KEY,
  type EntranceRing,
} from './bossLook';
import { bossBodyR, bossCoreFrac, PART_POD, partR, partType } from './bossShapes';
import {
  ADD_HUE_MIX,
  addGlow,
  addPulse as addAngryPulse,
  addScale,
  advancePhase,
  exposeShake,
  exposeShakePx,
  EXPOSE_HOT_WHITE,
  EXPOSE_SPRITE_CAP,
  EXPOSE_UNKNOWN,
  exposedOpenTarget,
  exposePulse,
  exposePulseHz,
  exposeAlarm,
  flickerRedWhite,
  shellHot,
  FRAG_ORBIT_HZ,
  fragmentCount,
  exposeState,
  onBossExposed,
  planBossExpose,
  resolveExposed,
  stepSpread,
  type ExposeInput,
  type Offset,
} from './bossExpose';
import {
  TURBO_BURST,
  TURBO_RING_LIFE,
  TURBO_RING_R0,
  TURBO_RING_R1,
  TURBO_WHITE,
  turboActivated,
  turboCometAlpha,
  turboGlow,
  turboIntensity,
  turboRate,
  turboWidth,
} from './turboFx';
import { createSpriteBuf, fxHalo, resetSpriteBuf, type FxHalo } from './fxSprites';
import { createFxSpriteLayer, makeBossFxAtlas } from './fxSpriteLayer';
import { createEnemyBulletLayer } from './enemyBullets';
import type { EnemyBulletFrame, EnemyBulletsLike } from './enemyBulletFx';
import { HAZARD_PULL, HAZARD_SPRITE_CAP, planEntranceRing, planHazard, type HazardInput } from './hazardFx';
import { BOSS_PULL_ACCEL, KICK_BOSS_DOWN, KICK_BOSS_PHASE } from './lattice/kicks';
import { HEAT_BOSS } from './lattice/heat';
import { RIPPLE_BOSS } from './fx';

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
  /** Lattice nodes and spacing in arena units; 0 on the low tier (v1 grid). */
  latticeNodes: number;
  latticeSpacing: number;
  /** V3: live enemy bullets drawn, and sprite instances in the hazard and enemy bullet layers. */
  enemyBullets: number;
  hazardSprites: number;
  bulletSprites: number;
}

/** Reads the boss into out (readBoss from src/game/bosses/view.ts, or a test or stress stand in). */
export type BossReader = (w: World, out: BossView) => BossView;

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
  /** V3: explicit enemy bullet source. If unset, draw() reads enemyBulletsOf(w). */
  setEnemyBullets(pool: EnemyBulletsLike | null): void;
  /** V3: explicit boss reader (stress proxy). If unset, draw() uses readBoss. */
  setBossReader(reader: BossReader | null): void;
  destroy(): void;
}

const SIM_DT = 1 / 120;
const PARK = -99999;
const GLOW_PAD = 34;
/** Run 0180: lattice heat glow layer alpha at full neon (scaled by mapFxNeonGain). */
const HEAT_GLOW_ALPHA = 0.9;
/** Comet halo alpha relative to the core (both scaled by trailAlpha and cometAlpha). */
const COMET_HALO_ALPHA = 0.85;
/** Share of yellow mixed into the orange comet halo. */
const COMET_HALO_YELLOW = 0.35;
/** Geom sparkle colour: geom green mixed toward white. */
const GEOM_SPARKLE_WHITE = 0.5;
/** Ring frame radius in the fx atlas, texture units: a pulse ring of radius r scales by r / this. */
const FX_RING_R = 56;
/** Render clock step used for trail emission is clamped like the particle step. */
const MAX_FX_DT = 0.05;
/** Resolution of every generated texture (dot, streak, trail, glow and bloom sources). */
const GEN_TEX_RES = 2;
/** Extra filter area around the screen so shake never shows an unbloomed edge strip. */
const SHAKE_PAD_PX = 20;
const RING_SPEED = 1700; // arena units per second
const RING_LIFE = 0.6; // seconds
const MAX_RINGS = 4;
/** Blink arrival and Slime splat flashes live at once. */
const MAX_POPS = 16;
/** A Blink that moved further than this in one sim step jumped: draw it at the landing spot. */
const BLINK_SNAP_U = 60;
/** Slime glow sprite alpha factor: the puddle glows far less than an enemy. */
const SLIME_GLOW_MUL = 0.35;
/** Slime edge squash amplitude and rate, render clock only (a living puddle). */
const SLIME_WOBBLE_AMP = 0.035;
const SLIME_WOBBLE_HZ = 0.6;
/** Slime slow spin, radians per second, direction from hash01(id). */
const SLIME_SPIN = 0.08;
const TAU = Math.PI * 2;

// Kind values used for per kind visual scale; numeric literals avoid importing the const enum.
const KIND_SHIP = 1;
const KIND_GRUNT = 2;
const KIND_DART = 6;
const KIND_GRAVITY_WELL = 9;
const KIND_GEOM = 10;
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

interface TrailAtlas {
  /** The whole atlas; the bulletTrails ParticleContainer binds its source. */
  readonly texture: Texture;
  /** v1 trail (low tier): constant thickness, fading in from the left. */
  readonly v1: Texture;
  /** Run 0180 trail (standard, high): a wedge, thin and faint at the tail, wide and hot at the head. */
  readonly taper: Texture;
}

/** Draw a tapered streak (head at the right) of length L and height H with its top left at (x0, y0). */
function drawTaper(g: Graphics, x0: number, y0: number, L: number, H: number, steps: number): void {
  const prof = { haloH: 0, haloA: 0, coreH: 0, coreA: 0 };
  const cy = y0 + H / 2;
  for (let i = 0; i < steps; i++) {
    taperProfile((i + 1) / steps, prof);
    const x = x0 + (i * L) / steps;
    const hh = (H / 2) * prof.haloH;
    const ch = (H / 2) * prof.coreH;
    if (hh > 0.05) g.rect(x, cy - hh, L / steps, 2 * hh).fill({ color: 0xffffff, alpha: prof.haloA });
    g.rect(x, cy - ch, L / steps, 2 * ch).fill({ color: 0xffffff, alpha: prof.coreA });
  }
}

/**
 * Bullet trails, both looks in one texture so every attached trail stays in one ParticleContainer.
 * The v1 frame is the wave B texture unchanged (low keeps its look); the taper frame sits below.
 */
function makeTrailAtlas(app: Application): TrailAtlas {
  const L = V1_TRAIL_TEX_LEN;
  const steps = 16;
  const g = new Graphics();
  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    const x = (i * L) / steps;
    g.rect(x, 0, L / steps, 6).fill({ color: 0xffffff, alpha: 0.24 * t });
    g.rect(x, 1.6, L / steps, 2.8).fill({ color: 0xffffff, alpha: 0.95 * t * t });
  }
  const ty = 8;
  drawTaper(g, 0, ty, TAPER_TEX_LEN, TAPER_TEX_H, 32);
  const w = Math.max(L, TAPER_TEX_LEN);
  const h = ty + TAPER_TEX_H;
  const texture = app.renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, w, h), resolution: GEN_TEX_RES, antialias: true });
  g.destroy({ context: true });
  return {
    texture,
    v1: new Texture({ source: texture.source, frame: new Rectangle(0, 0, L, 6) }),
    taper: new Texture({ source: texture.source, frame: new Rectangle(0, ty, TAPER_TEX_LEN, TAPER_TEX_H) }),
  };
}

interface FxAtlas {
  readonly texture: Texture;
  /**
   * Pulse frames by shape: ring (kill shockwave), bar (wall glow), streak (Blink jump), arc
   * (Bulwark deflect, anchored at its midpoint) and dot (tiny hit flash).
   */
  readonly frames: readonly [Texture, Texture, Texture, Texture, Texture];
  /** Anchor of the arc midpoint inside the arc frame (0 to 1). */
  readonly arcAnchorX: number;
}

/** The sprite pulse looks in one texture: one ParticleContainer, one draw call for all pulses. */
function makeFxAtlas(app: Application): FxAtlas {
  const g = new Graphics();
  const R = FX_RING_R;
  const c = R + 8;
  g.circle(c, c, R).stroke({ width: 12, color: 0xffffff, alpha: 0.18 });
  g.circle(c, c, R).stroke({ width: 6, color: 0xffffff, alpha: 0.4 });
  g.circle(c, c, R).stroke({ width: 2.5, color: 0xffffff, alpha: 1 });
  const ringW = 2 * c;
  const bx = ringW + 2;
  g.roundRect(bx, 0, 64, 16, 8).fill({ color: 0xffffff, alpha: 0.3 });
  g.roundRect(bx + 5, 3.5, 54, 9, 4.5).fill({ color: 0xffffff, alpha: 0.6 });
  g.roundRect(bx + 12, 6, 40, 4, 2).fill({ color: 0xffffff, alpha: 1 });
  const sy = 20;
  drawTaper(g, bx, sy, TAPER_TEX_LEN, TAPER_TEX_H, 32);
  // Run 0198 hit feedback: the deflect arc (a slice of the shield circle, same three stroke glow
  // as the ring) and the soft hit dot sit to the right of the bar column.
  const af = arcFrame(DEFLECT_ARC_R, DEFLECT_ARC_HALF, DEFLECT_ARC_PAD);
  const ax = bx + 64 + 2;
  const arcCx = ax + af.cx;
  // After a stroke pixi restarts the path at the last point, so each arc starts with a moveTo at
  // its own start point, or a stray line would join the previous shape to the arc.
  const arcX0 = arcCx + DEFLECT_ARC_R * Math.cos(-DEFLECT_ARC_HALF);
  const arcY0 = af.cy + DEFLECT_ARC_R * Math.sin(-DEFLECT_ARC_HALF);
  const arcPath = (): Graphics => g.moveTo(arcX0, arcY0).arc(arcCx, af.cy, DEFLECT_ARC_R, -DEFLECT_ARC_HALF, DEFLECT_ARC_HALF);
  arcPath().stroke({ width: 12, color: 0xffffff, alpha: 0.2, cap: 'round' });
  arcPath().stroke({ width: 6, color: 0xffffff, alpha: 0.5, cap: 'round' });
  arcPath().stroke({ width: 2.5, color: 0xffffff, alpha: 1, cap: 'round' });
  const dx = ax + af.w + 2;
  const dc = HIT_DOT_FRAME / 2;
  g.circle(dx + dc, dc, HIT_DOT_R).fill({ color: 0xffffff, alpha: 0.22 });
  g.circle(dx + dc, dc, HIT_DOT_R * 0.62).fill({ color: 0xffffff, alpha: 0.5 });
  g.circle(dx + dc, dc, HIT_DOT_R * 0.3).fill({ color: 0xffffff, alpha: 1 });
  const w = dx + HIT_DOT_FRAME;
  const texture = app.renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, w, ringW), resolution: GEN_TEX_RES, antialias: true });
  g.destroy({ context: true });
  const sub = (x: number, y: number, fw: number, fh: number): Texture => new Texture({ source: texture.source, frame: new Rectangle(x, y, fw, fh) });
  return {
    texture,
    frames: [
      sub(0, 0, ringW, ringW),
      sub(bx, 0, 64, 16),
      sub(bx, sy, TAPER_TEX_LEN, TAPER_TEX_H),
      sub(ax, 0, af.w, af.h),
      sub(dx, 0, HIT_DOT_FRAME, HIT_DOT_FRAME),
    ],
    arcAnchorX: af.anchorX,
  };
}

interface CometAtlas {
  readonly texture: Texture;
  /** u along the ribbon (0 head at the left), v across it. A wide soft halo and a hot core. */
  readonly halo: Texture;
  readonly core: Texture;
}

const COMET_TEX_LEN = 64;
const COMET_TEX_H = 16;

/** The comet ribbon looks: alpha falls from the head (left) to the tail (right). */
function makeCometAtlas(app: Application): CometAtlas {
  const g = new Graphics();
  const L = COMET_TEX_LEN;
  const H = COMET_TEX_H;
  const steps = 32;
  for (let i = 0; i < steps; i++) {
    const u = (i + 0.5) / steps;
    const along = Math.pow(1 - u, 1.6);
    const x = (i * L) / steps;
    const w = L / steps;
    g.rect(x, 0, w, H).fill({ color: 0xffffff, alpha: 0.28 * along });
    g.rect(x, H * 0.22, w, H * 0.56).fill({ color: 0xffffff, alpha: 0.45 * along });
    const cy = H + 2;
    g.rect(x, cy + H * 0.3, w, H * 0.4).fill({ color: 0xffffff, alpha: 0.6 * along });
    g.rect(x, cy + H * 0.42, w, H * 0.16).fill({ color: 0xffffff, alpha: Math.pow(along, 0.8) });
  }
  const texture = app.renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, L, 2 * H + 2), resolution: GEN_TEX_RES, antialias: true });
  g.destroy({ context: true });
  return {
    texture,
    halo: new Texture({ source: texture.source, frame: new Rectangle(0, 0, L, H) }),
    core: new Texture({ source: texture.source, frame: new Rectangle(0, H + 2, L, H) }),
  };
}

/** Soft round dot, 8 px across, for the dust motes. */
function makeDotTexture(app: Application): Texture {
  const g = new Graphics()
    .circle(0, 0, 4)
    .fill({ color: 0xffffff, alpha: 0.25 })
    .circle(0, 0, 2.6)
    .fill({ color: 0xffffff, alpha: 0.6 })
    .circle(0, 0, 1.4)
    .fill({ color: 0xffffff, alpha: 1 });
  const tex = app.renderer.generateTexture({ target: g, frame: new Rectangle(-4, -4, 8, 8), resolution: GEN_TEX_RES, antialias: true });
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
  // Grid layer: its alpha is applyNeon's gridAlpha (bindNeon below). Holds the v1 grid (low
  // tier) or the wave D lattice and dust (standard and high); neither sets its own base alpha.
  const gridLayer = new Container({ label: 'gridLayer' });
  const grid = new Graphics({ label: 'grid' });
  const dotTexture = makeDotTexture(app);
  const lattice = createLatticeView(dotTexture);
  const bloomLayer = new Container({ label: 'bloomLayer' });
  const lines = new Container({ label: 'lines' });
  const walls = new Graphics({ label: 'walls' });
  const wallGlow = new Graphics({ label: 'wallGlow' });
  const glowSprites = new Container({ label: 'glowSprites' });
  const entities = new Container({ label: 'entities' });
  const atlas = makeBulletAtlas(app);
  const streak = makeStreakTexture(app);
  const trailAtlas = makeTrailAtlas(app);
  const trails = new ParticleContainer({
    label: 'bulletTrails',
    texture: trailAtlas.texture,
    blendMode: 'add',
    dynamicProperties: { position: true, rotation: true, uvs: false, vertex: false, color: false },
  });
  // Run 0180 trails and map effects. Pulses: kill shock rings, bullet wall glows and Blink jump
  // streaks, at most PULSE_CAP sprites from one atlas in one container.
  const fxAtlas = makeFxAtlas(app);
  const pulseLayer = new ParticleContainer({
    label: 'pulses',
    texture: fxAtlas.texture,
    blendMode: 'add',
    dynamicProperties: { position: true, rotation: true, uvs: true, vertex: true, color: true },
  });
  const pulsePool = createPulsePool();
  const pulseItems: Particle[] = [];
  for (let i = 0; i < pulsePool.cap; i++) {
    const p = new Particle({ texture: fxAtlas.frames[0], x: PARK, y: PARK, alpha: 0, anchorX: 0.5, anchorY: 0.5 });
    pulseItems.push(p);
    pulseLayer.addParticle(p);
  }
  // Run 0198 hit feedback: a second, small pool in the same container (same atlas, same draw
  // call), so a burst of hit flashes can never overwrite a kill shockwave ring.
  const hitPool = createPulsePool(HIT_FX_CAP);
  const hitItems: Particle[] = [];
  for (let i = 0; i < hitPool.cap; i++) {
    const p = new Particle({ texture: fxAtlas.frames[4], x: PARK, y: PARK, alpha: 0, anchorX: 0.5, anchorY: 0.5 });
    hitItems.push(p);
    pulseLayer.addParticle(p);
  }
  const hitThrottle = createHitThrottle();
  // Comet: one ribbon geometry, drawn twice (warm halo, white core) from one atlas. Under 100
  // vertices, so pixi batches both into the bloom layer's batch: no extra draw call.
  const cometAtlas = makeCometAtlas(app);
  const comet = createComet();
  const cometGeom = new MeshGeometry({
    positions: new Float32Array(COMET_VERTS * 2),
    uvs: cometUvs(),
    indices: cometIndices(),
  });
  const cometPositions = cometGeom.positions;
  const cometHalo = new Mesh({ geometry: cometGeom, texture: cometAtlas.halo, label: 'cometHalo' });
  const cometCore = new Mesh({ geometry: cometGeom, texture: cometAtlas.core, label: 'cometCore' });
  cometHalo.blendMode = 'add';
  cometCore.blendMode = 'add';
  cometHalo.visible = false;
  cometCore.visible = false;
  const comets = new Container({ label: 'comet' });
  comets.addChild(cometHalo, cometCore);
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
  // v2 wave C layers. The wall pulse geometry is drawn once in white per arena or neon change and
  // driven per frame by alpha and tint only; the others redraw only while they hold content.
  const floor = new Container({ label: 'floor' });
  const enemyFx = new Graphics({ label: 'enemyFx' });
  const enemyFxGlow = new Graphics({ label: 'enemyFxGlow' });
  const wallPulse = new Graphics({ label: 'wallPulse' });
  const wallFlash = new Graphics({ label: 'wallFlash' });
  wallPulse.visible = false;
  wallFlash.visible = false;

  // V3 wave A: boss hazards (lanes, rings, sweeps, tethers, pulls and the entrance ring) and enemy
  // bullets, each one pooled ParticleContainer from one atlas: one draw call each, no Graphics.clear.
  // Hazards sit under the entities, enemy bullets above the player bullets so they always read.
  const bossAtlas = makeBossFxAtlas(app.renderer);
  const hazardLayer = createFxSpriteLayer('bossHazards', bossAtlas.texture, bossAtlas.frames, HAZARD_SPRITE_CAP);
  const hazardBuf = createSpriteBuf(HAZARD_SPRITE_CAP);
  const enemyBulletLayer = createEnemyBulletLayer(bossAtlas.texture, bossAtlas.frames);
  // G3A, ED1: the boss weak point cue (the broken hot core fragments) sits over the entities, so
  // it reads on top of the boss body. Same atlas, one small pooled layer, hidden when empty.
  const cueLayer = createFxSpriteLayer('bossCue', bossAtlas.texture, bossAtlas.frames, EXPOSE_SPRITE_CAP);
  const cueBuf = createSpriteBuf(EXPOSE_SPRITE_CAP);

  bloomLayer.addChild(lattice.glow, wallGlow, wallPulse, wallFlash, comets, glowSprites, particles, trails, pulseLayer, enemyFxGlow, ringGlow);
  lines.addChild(walls, floor, hazardLayer.container, enemyFx, entities, cueLayer.container, bullets, enemyBulletLayer.layer.container, rings);
  gridLayer.addChild(lattice.dust, grid, lattice.lines);
  world.addChild(gridLayer, bloomLayer, lines);
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

  const stats: RenderStats = {
    entities: 0,
    bullets: 0,
    particles: 0,
    glowPath: 'bloom',
    latticeNodes: 0,
    latticeSpacing: 0,
    enemyBullets: 0,
    hazardSprites: 0,
    bulletSprites: 0,
  };

  // V3 boss render state. The view is filled once per frame by the boss reader (no allocation).
  const bossView: BossView = createBossView();
  let bossReader: BossReader = readBoss;
  let explicitEnemyBullets: EnemyBulletsLike | null = null;
  /** Displayed shell or core openness (eased), boss index and tier of the live or last boss. */
  let bossOpen = 0;
  let bossIdx = 0;
  let bossTier = 1;
  /** Drawn boss position (event payloads without a position use it). */
  let bossDrawX = 0;
  let bossDrawY = 0;
  /** Seconds since the last boss hit flash, phase event and entrance (edge pulse). */
  let bossHitAge = Number.POSITIVE_INFINITY;
  let bossPhaseAge = Number.POSITIVE_INFINITY;
  let bossEdgeAge = Number.POSITIVE_INFINITY;
  let bossEdgeKey: PaletteKey = 'bossBlue';
  const bossHitThrottle = createBossHitThrottle();
  /** G3A weak point cue: 'sim:bossExposed' state (EXPOSE_UNKNOWN until the event arrives). */
  let exposeEvent = EXPOSE_UNKNOWN;
  /** Resolved exposure this frame, seconds since it began, and the pulse phase in cycles. */
  let exposed = false;
  let exposeAge = 0;
  let exposePhase = 0;
  const exposeIn: ExposeInput = { x: 0, y: 0, coreR: 0, pulse: 0, spread: 0, orbit: 0, count: 3, alpha: 0, hot: 0xffffff };
  /**
   * ED1 cue: fragment spread (0 assembled, 1 out) and orbit phase in cycles; the boss shake offset in
   * arena units (render only, never the sim position); the boss whose exposed shells are prewarmed.
   */
  let exposeSpread = 0;
  let exposeOrbit = 0;
  const bossShake: Offset = { x: 0, y: 0 };
  let prewarmedBoss = -1;
  /** Boss add ids this frame (spawnAdd), copied from the boss state so the entity pass can mark them. */
  const addIds = new Int32Array(16).fill(-1);
  let addCount = 0;
  /** G3A Turbo: intensity this frame (0 off) and the last super seen, for the activation burst. */
  let turboK = 0;
  let turboPrevActive: string | null = null;
  let turboPrevTimer = 0;
  const entrance: EntranceRing = { r: 0, alpha: 0 };
  const halo: FxHalo = { alpha: 0, width: 0 };
  const hazardIn: HazardInput = { type: 0, x: 0, y: 0, rot: 0, radius: 0, vx: 0, vy: 0, age: 0, tier: 1, tint: 0xffffff, timeSec: 0 };
  const bulletTints: number[] = [0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff];
  const bulletFrame: EnemyBulletFrame = { alpha: 0, timeSec: 0, effects: 'standard', halo, tints: bulletTints, white: 0xffffff };

  // Lattice (wave D): on when the tier says so; the governor only coarsens inside a level.
  let latticeActive = false;
  let gov: GovernorState = initialGovernor();
  let govNotchBuilt = 0;
  let avgFrameMs = 0;
  let wellsSeen = 0;

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
  /** Scratch for attachedTrailFor (no allocation per restyle). */
  const trailShape: AttachedTrail = { len: 0, thick: 0, taper: false };

  // Run 0180: last drawn position per entity slot (Blink jump streak), NaN until seen.
  let lastDrawX = new Float32Array(0);
  let lastDrawY = new Float32Array(0);
  /** Timed super running (sustained lattice distortion), and the render time of the last frame. */
  let superOn = false;
  let lastFxSec = Number.NaN;
  /** Shared wall hit scratch for bullet wall glows. */
  const bulletHit = createWallHit();
  /** True while any pulse sprite may still be on screen. */
  let pulsesShown = false;
  /** True while any hit flash or deflect arc sprite may still be on screen. */
  let hitShown = false;
  /** Draw clock (ms) for the per entity hit throttle, and the world the last frame drew. */
  let hitClockMs = 0;
  let hitWorld: World | null = null;
  const hitDir: Dir = { x: 1, y: 0 };
  let hitSeq = 0;
  /** Geom sparkle colour for this frame (palette follows neon). */
  let sparkleColour = 0xffffff;

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

  // v2 wave C enemy fx state, per entity slot: last drawn w.t (NaN until seen; the Blink arrival
  // and Slime splat edges read it) and a trail emitter (Swirl, Charger dash).
  let enemyPhase = new Float32Array(0);
  const enemyEmitters: Emitter[] = [];
  let enemyFxDirty = false;
  const ringScratch: BlinkRing = { r: 0, alpha: 0 };
  const splimeRingScratch: SplimeRing = { r: 0, alpha: 0 };
  // Arrival and splat flashes: a fixed ring of expanding circles, no allocation per event.
  const pops: { x: number; y: number; age: number; life: number; r0: number; r1: number; colour: PaletteKey }[] = [];
  for (let i = 0; i < MAX_POPS; i++) pops.push({ x: 0, y: 0, age: 1, life: 0, r0: 0, r1: 0, colour: 'white' });
  let popCursor = 0;

  // Map effects: wall features per arena, eased threat, pulse phase, wall flashes.
  let features: WallFeature[] = [];
  let threatTarget = 0;
  let threatShown = 0;
  let pulsePhase = 0;
  const pulse: ThreatPulse = { amp: 0, hz: 0 };
  const hit = createWallHit();
  const flashes: { feature: number; s0: number; s1: number; age: number; strength: number }[] = [];
  for (let i = 0; i < MAX_FLASHES; i++) flashes.push({ feature: -1, s0: 0, s1: 0, age: FLASH_LIFE, strength: 0 });
  let flashCursor = 0;
  let flashDirty = false;

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
    const np = new Float32Array(cap).fill(Number.NaN);
    np.set(enemyPhase);
    enemyPhase = np;
    const lx = new Float32Array(cap).fill(Number.NaN);
    lx.set(lastDrawX);
    lastDrawX = lx;
    const ly = new Float32Array(cap).fill(Number.NaN);
    ly.set(lastDrawY);
    lastDrawY = ly;
    while (enemyEmitters.length < cap) enemyEmitters.push({ acc: 0 });
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
    // Run 0180: standard and high draw the longer tapered trail; low keeps the v1 frame and size.
    const at = attachedTrailFor(v, getEffectsTier(), trailShape);
    tail.texture = at.taper ? trailAtlas.taper : trailAtlas.v1;
    tail.scaleX = at.len / (at.taper ? TAPER_TEX_LEN : V1_TRAIL_TEX_LEN);
    tail.scaleY = at.thick;
  }

  /** Restyle every bullet slot (palette, neon or tier change) and flag both containers. */
  function restyleBullets(): void {
    for (let i = 0; i < bulletItems.length; i++) {
      styleSlot(i, visualForCode(bulletCodeShown[i] ?? -1));
    }
    bullets.update();
    trails.update();
  }

  function ensureBulletItems(cap: number): void {
    const spread = bulletStyleVisual(0, false);
    while (bulletItems.length < cap) {
      const p = new Particle({ texture: atlas.frames.dot, x: PARK, y: PARK, anchorX: 0.5, anchorY: 0.5 });
      bulletItems.push(p);
      bullets.addParticle(p);
      const t = new Particle({ texture: trailAtlas.v1, x: PARK, y: PARK, anchorX: 1, anchorY: 0.5 });
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
    prewarmedBoss = -1; // the live boss rewarms its exposed shells on the next frame
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
    // Standard and high draw the lattice instead; the v1 grid stays empty and hidden.
    if (latticeActive) return;
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
    // Pulse layer: white geometry, coloured per frame by tint and driven by alpha. A wide soft
    // pass plus a core pass, so it reads as glow on the fallback path too (no filter there).
    const s = Math.max(fit.scale, 0.01);
    drawWalls(wallPulse, arena, 0xffffff, [
      { width: (WALL_GLOW_PX * r.wallWidthMul * 1.6) / s, alpha: 0.35 },
      { width: (WALL_LINE_PX * r.wallWidthMul * 1.8) / s, alpha: 1 },
    ]);
  }

  function redrawArena(): void {
    redrawGrid();
    gridLayer.alpha = currentRender.gridAlpha;
    redrawWalls(currentRender);
  }

  /**
   * Switch between the v1 grid (low) and the lattice (standard, high) for the current arena,
   * tier and governor notch. Allocates: called on arena, tier and governor changes only.
   */
  function applyLatticeTier(t: EffectsTier): void {
    const on = latticeOn(t);
    if (on) {
      const s = chooseSpacing(arena, latticeSpacingFor(t), latticeCapFor(t), gov.notch);
      if (!latticeActive || lattice.spacing !== s || govNotchBuilt !== gov.notch || lattice.sim === null) {
        lattice.build(arena, s);
      }
      govNotchBuilt = gov.notch;
      lattice.setColour(palette.grid);
      ripples.length = 0;
      if (!latticeActive) {
        grid.clear();
        gridRippling = false;
      }
      latticeActive = true;
      grid.visible = false;
      lattice.lines.visible = true;
      lattice.glow.visible = mapEffectsOn(t);
      lattice.setAmbient(mapEffectsOn(t) ? AMBIENT_AMP : 0);
    } else {
      lattice.clear();
      latticeActive = false;
      grid.visible = true;
      lattice.lines.visible = false;
      lattice.glow.visible = false;
      lattice.setAmbient(0);
      redrawGrid();
    }
    lattice.dust.visible = dustOn(t);
    stats.latticeNodes = lattice.nodes;
    stats.latticeSpacing = lattice.spacing;
  }

  /** Feed the frame interval to the governor; rebuild one notch coarser when it says so. */
  function governLattice(dtSec: number, nowSec: number): void {
    if (!latticeActive) return;
    const ms = dtSec * 1000;
    if (!(ms > 0) || ms > GAP_MS) {
      // A pause, hidden tab or fold is not load: restart the streak.
      if (gov.overSince >= 0) gov = { notch: gov.notch, overSince: -1 };
      return;
    }
    avgFrameMs = smoothFrameMs(avgFrameMs, ms);
    const next = nextGovernor(gov, { frameMs: avgFrameMs, nowSec });
    if (next === gov) return;
    gov = next;
    if (gov.notch !== govNotchBuilt) applyLatticeTier(getEffectsTier());
  }

  function applyFit(): void {
    const rect = playRect ?? { x: 0, y: 0, w: cssW, h: cssH };
    fit = fitArena(arena.width, arena.height, rect);
    world.position.set(fit.x + shakeOff.x, fit.y + shakeOff.y);
    world.scale.set(fit.scale);
    const r = screenRectInWorld(cssW, cssH, fit);
    const pad = SHAKE_PAD_PX / Math.max(fit.scale, 0.01);
    bloomLayer.filterArea = new Rectangle(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad);
    lattice.setPixel(1 / Math.max(0.01, fit.scale * app.renderer.resolution));
    redrawArena();
  }

  // Neon: bindNeon writes bloom strength and threshold onto this live filter instance and the
  // grid alpha onto the live grid layer (v1 grid, lattice and dust), then calls these hooks for
  // the shape, tint and sprite paths.
  const offNeon = bindNeon({
    bloom,
    grid: gridLayer,
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
      restyleBullets();
      redrawGrid();
      lattice.setColour(palette.grid);
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
    if (latticeActive) kickLattice(x, y, e, plan.ripple);
    else if (plan.ripple > 0) addRipple(ripples, x, y, plan.ripple);
    if (plan.ring !== null) {
      if (ringList.length >= MAX_RINGS) ringList.shift();
      ringList.push({ x, y, age: 0, colour: plan.ring });
    }
    if (mapEffectsOn(getEffectsTier())) mapPulse(x, y, e, plan.ripple);
  }

  /**
   * Run 0180 map effects for an fx event: the shockwave ring sprite in the enemy hue (kills and
   * deaths) and the colour pulse through the lattice. Standard and high only.
   */
  function mapPulse(x: number, y: number, e: FxEvent, ripple: number): void {
    const hue = e.type === 'kill' ? palette[e.colour ?? 'white'] : e.type === 'death' ? palette.ship : e.type === 'bomb' ? palette.bomb : palette.geom;
    if (e.type === 'kill' || e.type === 'death') {
      const big = e.type === 'death' || ripple >= RIPPLE_KILL_BIG;
      addPulse(pulsePool, PULSE_RING, x, y, 0, SHOCK_R0, SHOCK_R1 * (big ? SHOCK_BIG_MUL : 1), SHOCK_LIFE * (big ? 1.3 : 1), hue, 1);
    }
    if (!lattice.sim) return;
    const hp = e.type === 'bomb' ? heatBombFor(arena.width, arena.height) : heatPulseFor(e.type, ripple);
    if (hp) lattice.pulse(x, y, hue, hp);
  }

  /** Lattice impulse for an fx event: a point kick, or an expanding ring for bombs and supers. */
  function kickLattice(x: number, y: number, e: FxEvent, ripple: number): void {
    const sim = lattice.sim;
    if (!sim) return;
    // Run 0180: the bomb ring lives until it has crossed the whole arena.
    const k = e.type === 'bomb' ? bombKickFor(arena.width, arena.height) : latticeKickFor(e.type, ripple);
    if (k === null) return;
    if (k.t === 'point') addImpulse(sim, x, y, k.strength, k.radius);
    else addRing(sim, x, y, k.strength, k.speed, k.life, k.width);
  }

  /**
   * Sustained super distortion: while a timed super runs, a throbbing field around the ship and a
   * small ring with a colour pulse every SUPER_PULSE_SEC. Lattice tiers only.
   */
  function superDistort(shipX: number, shipY: number, nowSec: number): void {
    const sim = lattice.sim;
    if (!superOn || !sim || !mapEffectsOn(getEffectsTier())) return;
    addForce(sim, shipX, shipY, SUPER_FORCE_RADIUS, superForceAccel(nowSec));
    if (superPulseDue(lastFxSec, nowSec)) {
      const k = KICK_SUPER_PULSE;
      addRing(sim, shipX, shipY, k.strength, k.speed, k.life, k.width);
      lattice.pulse(shipX, shipY, palette.geom, HEAT_SUPER);
    }
  }

  /** A bullet that died within WALL_HIT_RANGE of a wall lights the wall there in its colour. */
  function bulletWallGlow(x: number, y: number, colour: number): void {
    nearestWall(features, x, y, bulletHit);
    if (bulletHit.feature < 0 || !(bulletHit.dist <= WALL_HIT_RANGE)) return;
    const rot = wallTangent(features[bulletHit.feature], bulletHit.x, bulletHit.y);
    addPulse(pulsePool, PULSE_BAR, bulletHit.x, bulletHit.y, rot, WALL_GLOW_LEN, WALL_GLOW_THICK, WALL_GLOW_LIFE, colour, 1);
  }

  /** Mirror the pulse pool onto its Particles. Alpha is scaled by the neon glow, like map fx. */
  function drawPulses(dt: number): void {
    if (pulsePool.live === 0 && !pulsesShown) return;
    stepPulses(pulsePool, dt);
    const gain = mapFxNeonGain(current.glowAlpha);
    let any = false;
    for (let i = 0; i < pulsePool.cap; i++) {
      const p = pulseItems[i];
      if (!p) continue;
      if (!pulseLive(pulsePool, i)) {
        if (p.x !== PARK) {
          p.x = PARK;
          p.y = PARK;
          p.alpha = 0;
        }
        continue;
      }
      any = true;
      const shape = pulsePool.shape[i] ?? PULSE_RING;
      const u = (pulsePool.age[i] ?? 0) / Math.max(1e-6, pulsePool.life[i] ?? 1);
      if (pulsePool.fresh[i] === 1) {
        pulsePool.fresh[i] = 0;
        p.texture = fxAtlas.frames[shape === PULSE_BAR ? 1 : shape === PULSE_STREAK ? 2 : 0];
        p.anchorX = shape === PULSE_STREAK ? 1 : 0.5;
        p.anchorY = 0.5;
        p.tint = pulsePool.colour[i] ?? 0xffffff;
        p.rotation = pulsePool.rot[i] ?? 0;
      }
      p.x = pulsePool.x[i] ?? 0;
      p.y = pulsePool.y[i] ?? 0;
      const r0 = pulsePool.r0[i] ?? 0;
      const r1 = pulsePool.r1[i] ?? 0;
      if (shape === PULSE_RING) {
        const s = shockRadius(r0, r1, u) / FX_RING_R;
        p.scaleX = s;
        p.scaleY = s;
      } else if (shape === PULSE_BAR) {
        // A wall glow swells a little along the wall as it fades.
        p.scaleX = (r0 / 64) * (0.8 + 0.4 * u);
        p.scaleY = r1 * (1.2 - 0.4 * u);
      } else {
        p.scaleX = r0 / TAPER_TEX_LEN;
        p.scaleY = r1 * (1 - 0.5 * u);
      }
      p.alpha = pulseAlpha(shape, u) * (pulsePool.strength[i] ?? 1) * gain;
    }
    pulsesShown = any;
  }

  /** Drop every pulse and park its sprite (tier off, level change). */
  function clearPulseFx(): void {
    clearPulses(pulsePool);
    for (const p of pulseItems) {
      p.x = PARK;
      p.y = PARK;
      p.alpha = 0;
    }
    pulsesShown = false;
  }

  /**
   * 'fx:hit' (core/events.ts): one event per hit, no rate limit, so the throttle lives here. At
   * most one flash per entity per 50 ms on the draw clock. blocked: a Bulwark shield absorbed it,
   * so draw the deflect arc on the shield plus 3 to 5 sparks. Otherwise a multi HP target took
   * damage: one tiny additive flash in its hue. Off on the low tier. No allocation.
   */
  function onHit(x: number, y: number, kind: number, id: number, blocked: boolean): void {
    if (kind === KIND_NUM.boss) {
      onBossHit(x, y, blocked);
      return;
    }
    if (!hitFxOn(getEffectsTier()) || !hitThrottleAllow(hitThrottle, id, hitClockMs)) return;
    hitSeq = (hitSeq + 1) | 0;
    if (blocked) deflectAt(x, y, kind, id);
    else {
      const colour = mixRgb(palette[hitHueKey(specFor(kind))], 0xffffff, HIT_FLASH_WHITE);
      addPulse(hitPool, PULSE_FLASH, x, y, 0, 0, 0, HIT_FLASH_LIFE, colour, 1);
    }
  }

  /**
   * Deflect arc and sparks for a blocked hit on entity id. With the Bulwark known (the world the
   * last frame drew) the arc snaps onto its shield plate along the hit direction, so it sits where
   * the plate is drawn whichever step the bullet died on; otherwise it sits at the hit point.
   */
  function deflectAt(x: number, y: number, kind: number, id: number): void {
    const w = hitWorld;
    let px = x;
    let py = y;
    if (w !== null && id > 0 && id < w.cap && w.alive[id] === 1 && w.kind[id] === kind) {
      const cx = w.x[id] ?? x;
      const cy = w.y[id] ?? y;
      deflectDir(x, y, cx, cy, hitSeq, hitDir);
      px = cx + hitDir.x * DEFLECT_ARC_R;
      py = cy + hitDir.y * DEFLECT_ARC_R;
    } else {
      deflectDir(x, y, Number.NaN, Number.NaN, hitSeq, hitDir);
    }
    const colour = mixRgb(palette.bulwark, 0xffffff, DEFLECT_WHITE);
    addPulse(hitPool, PULSE_ARC, px, py, Math.atan2(hitDir.y, hitDir.x), 0, 0, DEFLECT_ARC_LIFE, colour, 1);
    emitDeflectSparks(px, py, hitDir.x, hitDir.y, colour);
  }

  /**
   * 'fx:hit' with Kind.Boss, throttled to one flash per BOSS_HIT_MS on the draw clock. A damaging hit
   * boosts the boss glow sprite briefly (every tier: a multiplier on the existing sprite) and, off
   * Low, adds a flash at the hit point. A blocked hit (shell, membrane) throws deflect sparks off
   * the body instead, so the player sees the shot did nothing. No allocation.
   */
  function onBossHit(x: number, y: number, blocked: boolean): void {
    if (!bossHitAllow(bossHitThrottle, hitClockMs)) return;
    if (!blocked) bossHitAge = 0;
    if (!hitFxOn(getEffectsTier())) return;
    const hue = palette[bossColourOf(bossIdx)];
    if (blocked) {
      const dx = x - bossDrawX;
      const dy = y - bossDrawY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const colour = mixRgb(hue, 0xffffff, DEFLECT_WHITE);
      emitDeflectSparks(x, y, d > 1e-3 ? dx / d : 1, d > 1e-3 ? dy / d : 0, colour);
      return;
    }
    addPulse(hitPool, PULSE_FLASH, x, y, 0, 0, 0, HIT_FLASH_LIFE * 1.5, mixRgb(hue, 0xffffff, HIT_FLASH_WHITE), 1);
  }

  /** Boss index of a bus payload id (a BossId string). No allocation. */
  function payloadBoss(id: string): number {
    return bossIndex((BOSS_IDS as readonly string[]).indexOf(id));
  }

  /** 'sim:bossEnter': the screen edge pulse in the boss colour (map effect, off on Low). */
  function onBossEnter(id: string): void {
    const b = payloadBoss(id);
    bossIdx = b;
    bossTier = bossTierOf(b);
    bossEdgeKey = bossColourOf(b);
    if (mapEffectsOn(getEffectsTier())) bossEdgeAge = 0;
    exposeEvent = EXPOSE_UNKNOWN;
  }

  /**
   * 'sim:bossPhase': a body flash (every tier), a ring of sparks and, on the lattice tiers, a shock
   * ring and a short lattice kick at the drawn boss position.
   */
  function onBossPhase(id: string): void {
    const b = payloadBoss(id);
    bossPhaseAge = 0;
    const hue = palette[bossColourOf(b)];
    const hot = mixRgb(hue, 0xffffff, 0.45);
    burstBoss(bossDrawX, bossDrawY, hot, BOSS_PHASE_BURST, 200, 600, 0.4, 0.8);
    if (!mapEffectsOn(getEffectsTier())) return;
    addPulse(pulsePool, PULSE_RING, bossDrawX, bossDrawY, 0, SHOCK_R0, SHOCK_R1 * 2.2, SHOCK_LIFE * 1.6, hot, 1);
    const sim = lattice.sim;
    if (latticeActive && sim) {
      const k = KICK_BOSS_PHASE;
      addRing(sim, bossDrawX, bossDrawY, k.strength, k.speed, k.life, k.width);
    }
  }

  /**
   * 'sim:bossDown': the large death burst (capped by effects tier), a 14 px shake for 0.6 s, the bomb
   * style ring in the boss colour, and the lattice shock (or the v1 ripple on Low).
   */
  function onBossDown(id: string, x: number, y: number): void {
    exposeEvent = EXPOSE_UNKNOWN;
    const b = payloadBoss(id);
    const t = getEffectsTier();
    const key = bossColourOf(b);
    const hue = palette[key];
    const total = bossDeathBurst(t, bossTierOf(b));
    const white = Math.round(total * BOSS_BURST_WHITE);
    burstBoss(x, y, hue, total - white, 250, 1100, 0.7, 1.6);
    burstBoss(x, y, 0xffffff, white, 350, 1300, 0.5, 1.1);
    addShake(shake, BOSS_DEATH_SHAKE_PX, BOSS_DEATH_SHAKE_SEC);
    if (ringList.length >= MAX_RINGS) ringList.shift();
    ringList.push({ x, y, age: 0, colour: key });
    const sim = lattice.sim;
    if (latticeActive && sim) {
      const k = KICK_BOSS_DOWN;
      addRing(sim, x, y, k.strength, k.speed, k.life, k.width);
      if (mapEffectsOn(t)) lattice.pulse(x, y, hue, HEAT_BOSS);
    } else {
      addRipple(ripples, x, y, RIPPLE_BOSS);
    }
    if (mapEffectsOn(t)) {
      addPulse(pulsePool, PULSE_RING, x, y, 0, SHOCK_R0, SHOCK_R1 * 3, SHOCK_LIFE * 2, mixRgb(hue, 0xffffff, 0.3), 1);
      wallFlashAt(x, y);
    }
  }

  /** Read the boss once per frame and ease its displayed openness. */
  function updateBoss(w: World, dt: number): void {
    bossReader(w, bossView);
    bossHitAge += dt;
    bossPhaseAge += dt;
    bossEdgeAge += dt;
    addCount = 0;
    if (!bossView.active) {
      bossOpen = 0;
      exposed = false;
      exposeAge = 0;
      exposeSpread = 0;
      bossShake.x = 0;
      bossShake.y = 0;
      return;
    }
    bossIdx = bossIndex(bossView.id);
    bossTier = bossTierOf(bossIdx);
    if (prewarmedBoss !== bossIdx) prewarmExposed(bossIdx);
    // Exposure: the bus event, else the sim open flag (real boss only, never a stress proxy).
    const bs = bossReader === readBoss ? bossOf(w) : null;
    const simState = bs !== null && bs.status === 'alive' ? exposeState(simBossOpen(bs)) : EXPOSE_UNKNOWN;
    const now = resolveExposed(exposeEvent, simState, bossIdx, bossView.mode);
    if (now !== exposed) {
      exposed = now;
      exposeAge = 0;
      exposePhase = 0;
    } else exposeAge += dt;
    if (exposed) exposePhase = advancePhase(exposePhase, exposePulseHz(bossIdx, bossView.mode, bossView.modeT), dt);
    const known = exposeEvent !== EXPOSE_UNKNOWN || simState !== EXPOSE_UNKNOWN;
    bossOpen = approach(bossOpen, exposedOpenTarget(known, exposed, bossIdx, bossView.mode, bossView.modeT), dt, OPEN_RATE);
    // ED1 cue: the core fragments drift out while exposed and reassemble after; the boss shakes
    // only while exposed. The shake is in screen pixels, so it is divided by the fit scale.
    exposeSpread = stepSpread(exposeSpread, exposed, dt);
    if (exposeSpread > 0) exposeOrbit = advancePhase(exposeOrbit, FRAG_ORBIT_HZ, dt);
    if (exposed) exposeShake(exposeAge, (exposeShakePx(bossTier) * exposeAlarm(exposeAge)) / Math.max(fit.scale, 0.01), bossShake);
    else {
      bossShake.x = 0;
      bossShake.y = 0;
    }
    // Boss adds for the hostile look (the boss state owns the list; read only).
    if (bs !== null) {
      for (let k = 0; k < bs.addIds.length && addCount < addIds.length; k++) {
        const id = bs.addIds[k] ?? -1;
        if (id > 0 && w.alive[id] === 1 && w.kind[id] === bs.addKind[k]) addIds[addCount++] = id;
      }
    }
  }

  /** True when entity i is a live boss add this frame. At most 16 compares, no allocation. */
  function isBossAdd(i: number): boolean {
    for (let k = 0; k < addCount; k++) if (addIds[k] === i) return true;
    return false;
  }

  /**
   * Build the exposed shell contexts and glow textures of a boss once, so the first exposure never
   * builds them mid fight. Runs when a boss first shows (its 2 s entrance) and after a texture rebuild.
   */
  function prewarmExposed(b: number): void {
    for (let s = 0; s < BOSS_OPEN_STEPS; s++) {
      const slot = exposedBossSlot(b, s);
      contextForSlot(slot);
      glowTextureFor(slot);
    }
    prewarmedBoss = b;
  }

  /** True while the boss draws its coreless exposed shell: exposed, or its core still reassembling. */
  function bossCoreless(): boolean {
    return bossView.active && (exposed || exposeSpread > 0);
  }

  /** The broken core cue while exposed and while it reassembles, then sync the cue layer. */
  function drawBossCue(): void {
    resetSpriteBuf(cueBuf);
    if (bossCoreless()) {
      const r = bossView.radius > 0 ? bossView.radius : bossBodyR(bossIdx);
      const e = exposeIn;
      e.x = bossDrawX + bossShake.x;
      e.y = bossDrawY + bossShake.y;
      e.coreR = bossCoreFrac(bossIdx, 1) * r;
      e.pulse = exposePulse(exposePhase);
      e.spread = exposeSpread;
      e.orbit = exposeOrbit;
      e.count = fragmentCount(bossTier);
      e.alpha = bossBodyAlpha(bossView.mode, bossView.modeT);
      // Hot yellow while exposed; whitens as it reassembles, into the baked white core.
      const hot = mixRgb(palette.yellow, 0xffffff, EXPOSE_HOT_WHITE);
      e.hot = exposed ? hot : mixRgb(hot, 0xffffff, 1 - exposeSpread);
      planBossExpose(e, cueBuf, halo);
    }
    if (cueBuf.count > 0 || cueLayer.shown > 0) cueLayer.sync(cueBuf);
  }

  /** One Kind.BossHazard into the hazard sprite buffer, in the boss tier colour. */
  function planHazardAt(w: World, i: number, alpha: number, timeSec: number): void {
    const h = hazardIn;
    h.type = w.a[i] ?? 0;
    h.x = interp(w.prevX[i] ?? 0, w.x[i] ?? 0, alpha);
    h.y = interp(w.prevY[i] ?? 0, w.y[i] ?? 0, alpha);
    h.rot = w.rot[i] ?? 0;
    h.radius = w.radius[i] ?? 0;
    h.vx = w.vx[i] ?? 0;
    h.vy = w.vy[i] ?? 0;
    h.age = w.t[i] ?? 0;
    h.tier = bossTier;
    h.tint = palette[bossColourOf(bossIdx)];
    h.timeSec = timeSec;
    planHazard(h, hazardBuf, halo);
    // A pull dimples the lattice like a well (Gravitas, wave B uses it).
    const sim = lattice.sim;
    if (h.type === HAZARD_PULL && sim && wellsSeen < MAX_WELLS) {
      addForce(sim, h.x, h.y, h.radius, BOSS_PULL_ACCEL);
      wellsSeen++;
    }
  }

  /** Entrance telegraph ring while the boss enters, then sync the hazard layer. */
  function drawHazards(): void {
    if (bossView.active) {
      entranceRing(bossView.mode, bossView.modeT, bossView.radius, entrance);
      if (entrance.alpha > 0) planEntranceRing(hazardBuf, bossDrawX, bossDrawY, entrance.r, entrance.alpha, palette[bossColourOf(bossIdx)], bossTier, halo);
    }
    if (hazardBuf.count > 0 || hazardLayer.shown > 0) hazardLayer.sync(hazardBuf);
    stats.hazardSprites = hazardBuf.count;
  }

  /** Enemy bullets: one layer, one draw call. Tints and halo follow the palette and neon each frame. */
  function drawEnemyBullets(w: World, alpha: number, timeSec: number, dt: number): void {
    const pool = explicitEnemyBullets ?? enemyBulletsOf(w);
    bulletTints[1] = palette[TIER_BULLET_KEY[1]];
    bulletTints[2] = palette[TIER_BULLET_KEY[2]];
    bulletTints[3] = palette[TIER_BULLET_KEY[3]];
    bulletTints[4] = palette[TIER_BULLET_KEY[4]];
    bulletFrame.alpha = alpha;
    bulletFrame.timeSec = timeSec;
    bulletFrame.effects = getEffectsTier();
    enemyBulletLayer.draw(pool, bulletFrame, dt);
    stats.enemyBullets = enemyBulletLayer.live;
    stats.bulletSprites = enemyBulletLayer.layer.shown;
  }

  /**
   * Mirror the hit pool onto its Particles. Skipped outright when none is live and none is still
   * showing. Mirror first, then age, so a new flash draws at full strength on its first frame.
   * Alpha follows the neon glow like the other map effects (a multiplier, not a SPEC 4 write).
   */
  function drawHitFx(dt: number): void {
    if (hitPool.live === 0 && !hitShown) return;
    const gain = mapFxNeonGain(current.glowAlpha);
    let any = false;
    for (let i = 0; i < hitPool.cap; i++) {
      const p = hitItems[i];
      if (!p) continue;
      if (!pulseLive(hitPool, i)) {
        if (p.x !== PARK) {
          p.x = PARK;
          p.y = PARK;
          p.alpha = 0;
        }
        continue;
      }
      any = true;
      const shape = hitPool.shape[i] ?? PULSE_FLASH;
      const u = (hitPool.age[i] ?? 0) / Math.max(1e-6, hitPool.life[i] ?? 1);
      if (hitPool.fresh[i] === 1) {
        hitPool.fresh[i] = 0;
        const arc = shape === PULSE_ARC;
        p.texture = fxAtlas.frames[arc ? 3 : 4];
        p.anchorX = arc ? fxAtlas.arcAnchorX : 0.5;
        p.anchorY = 0.5;
        p.tint = hitPool.colour[i] ?? 0xffffff;
        p.rotation = hitPool.rot[i] ?? 0;
      }
      p.x = hitPool.x[i] ?? 0;
      p.y = hitPool.y[i] ?? 0;
      const s = shape === PULSE_ARC ? deflectArcScale(u) : hitFlashScale(u);
      p.scaleX = s;
      p.scaleY = s;
      p.alpha = pulseAlpha(shape, u) * (hitPool.strength[i] ?? 1) * gain;
    }
    stepPulses(hitPool, dt);
    hitShown = any;
  }

  /** Drop every hit flash and arc and park its sprite (tier off, level change). */
  function clearHitFx(): void {
    clearPulses(hitPool);
    resetHitThrottle(hitThrottle);
    for (const p of hitItems) {
      p.x = PARK;
      p.y = PARK;
      p.alpha = 0;
    }
    hitShown = false;
  }

  /** Ship comet: push the drawn position, rebuild the ribbon, fade by speed and neon. */
  function drawComet(x: number, y: number, vx: number, vy: number, dt: number): void {
    if (!trailsActive()) {
      hideComet();
      return;
    }
    pushComet(comet, x, y, dt);
    const speed = Math.hypot(vx, vy);
    const a = turboCometAlpha(cometAlpha(speed), speed, turboK) * currentRender.trailAlpha;
    const show = a > 0.01;
    // Keep the ribbon geometry current even while hidden, so it reappears without a jump.
    writeCometStrip(comet, x, y, cometPositions, turboWidth(turboK));
    if (show) cometGeom.getBuffer('aPosition').update();
    cometHalo.visible = show;
    cometCore.visible = show;
    if (!show) return;
    cometCore.alpha = a;
    cometHalo.alpha = a * COMET_HALO_ALPHA;
    // Turbo runs the ribbon hot: the core toward white yellow, the halo toward yellow.
    const hot = mixRgb(palette.yellow, 0xffffff, TURBO_WHITE);
    cometCore.tint = turboK > 0 ? mixRgb(palette.ship, hot, 0.65 * turboK) : palette.ship;
    const halo0 = mixRgb(palette.orange, palette.yellow, COMET_HALO_YELLOW);
    cometHalo.tint = turboK > 0 ? mixRgb(halo0, hot, 0.5 * turboK) : halo0;
  }

  function hideComet(): void {
    resetComet(comet);
    cometHalo.visible = false;
    cometCore.visible = false;
  }

  function superFx(x: number, y: number): void {
    playFx(x, y, { type: 'super' });
  }

  /** Fire superFx at the ship when the game state shows a super activation. */
  function watchSuper(w: World, nowSec: number): void {
    const g = gameState(w);
    superOn = g.superActive !== null && g.superTimer > 0;
    superCur.active = g.superActive;
    superCur.timer = g.superTimer;
    superCur.droneAbsent = g.droneAbsent;
    const sameWorld = w === superWorld;
    if (sameWorld && superFired(superPrev, superCur)) superFx(w.x[0] ?? 0, w.y[0] ?? 0);
    superWorld = w;
    superPrev.active = superCur.active;
    superPrev.timer = superCur.timer;
    superPrev.droneAbsent = superCur.droneAbsent;
    watchTurbo(w, sameWorld, g.superActive, g.superTimer, nowSec);
  }

  /**
   * G3A Turbo: intensity for the comet, sparks and ship glow, and a short burst (hot sparks and a
   * shock ring) on activation, on top of the generic super fx.
   */
  function watchTurbo(w: World, sameWorld: boolean, active: string | null, timer: number, nowSec: number): void {
    turboK = turboIntensity(active, timer, nowSec);
    if (sameWorld && turboActivated(turboPrevActive, turboPrevTimer, active, timer)) {
      const x = w.x[0] ?? 0;
      const y = w.y[0] ?? 0;
      const hot = mixRgb(palette.yellow, 0xffffff, TURBO_WHITE);
      burst(x, y, hot, TURBO_BURST);
      if (mapEffectsOn(getEffectsTier())) addPulse(pulsePool, PULSE_RING, x, y, 0, TURBO_RING_R0, TURBO_RING_R1, TURBO_RING_LIFE, hot, 1);
    }
    turboPrevActive = active;
    turboPrevTimer = timer;
  }
  /** Wall flash for a kill within FLASH_RANGE of a wall (map effect, off on the low tier). */
  function wallFlashAt(x: number, y: number): void {
    if (!mapEffectsOn(getEffectsTier())) return;
    nearestWall(features, x, y, hit);
    const strength = flashStrength(hit.dist);
    if (strength <= 0 || hit.feature < 0) return;
    const f = flashes[flashCursor];
    flashCursor = (flashCursor + 1) % MAX_FLASHES;
    if (!f) return;
    f.feature = hit.feature;
    f.s0 = hit.s0;
    f.s1 = hit.s1;
    f.age = 0;
    f.strength = strength;
    flashDirty = true;
  }

  /** Start an expanding flash circle (Blink arrival, Slime splat). Tells: on every tier. */
  function addPop(x: number, y: number, r0: number, r1: number, life: number, colour: PaletteKey): void {
    const p = pops[popCursor];
    popCursor = (popCursor + 1) % MAX_POPS;
    if (!p) return;
    p.x = x;
    p.y = y;
    p.r0 = r0;
    p.r1 = r1;
    p.life = life;
    p.age = 0;
    p.colour = colour;
    enemyFxDirty = true;
  }

  const offFx = [
    bus.on('fx:kill', (p) => {
      playFx(p.x, p.y, { type: 'kill', colour: p.colour });
      wallFlashAt(p.x, p.y);
    }),
    // Threat level from the sim (Swarm, wave C), at most every 100 ms; eased per frame.
    bus.on('sim:threat', (p) => {
      threatTarget = clampThreat(p.level);
    }),
    bus.on('fx:death', (p) => playFx(p.x, p.y, { type: 'death' })),
    bus.on('fx:bomb', (p) => playFx(p.x, p.y, { type: 'bomb' })),
    bus.on('fx:geom', (p) => playFx(p.x, p.y, { type: 'geom' })),
    // Weapon pickup collected (Swarm, wave B): a burst in the weapon's bullet colour.
    bus.on('fx:pickup', (p) => burst(p.x, p.y, palette[weaponTint(p.weapon)], PICKUP_BURST_COUNT)),
    // Damage that did not kill, or a Bulwark shield block (run 0198). The payload is reused.
    bus.on('fx:hit', (p) => onHit(p.x, p.y, p.kind, p.id, p.blocked)),
    // V3 boss events (Swarm, wave A). Payloads are reused: read the fields now.
    bus.on('sim:bossEnter', (p) => onBossEnter(p.id)),
    bus.on('sim:bossPhase', (p) => onBossPhase(p.id)),
    bus.on('sim:bossDown', (p) => onBossDown(p.id, p.x, p.y)),
    // G3A: weak point exposure (Swarm, parallel run). Coded against the event name.
    onBossExposed(bus, (on) => {
      exposeEvent = exposeState(on);
    }),
  ];
  offFx.push(
    onEffectsTierChanged((t) => {
      applyLatticeTier(t);
      // Attached trail frame and length follow the tier; the comet and pulses hide on low.
      restyleBullets();
      if (!trailsOn(t)) hideComet();
      if (!mapEffectsOn(t)) {
        clearPulseFx();
        bossEdgeAge = Number.POSITIVE_INFINITY;
      }
      if (!hitFxOn(t)) clearHitFx();
    }),
  );
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
    stepMapFx(dt);
  }

  /**
   * Threat pulse and wall flashes. Both are alpha multipliers on their own layers, scaled by the
   * neon gain; neither writes a SPEC 4 value. Off (hidden, flashes dropped) on the low tier.
   */
  function stepMapFx(dt: number): void {
    threatShown = easeThreat(threatShown, threatTarget, dt);
    if (!mapEffectsOn(getEffectsTier())) {
      if (wallPulse.visible) wallPulse.visible = false;
      if (wallFlash.visible || flashDirty) {
        for (const f of flashes) f.age = FLASH_LIFE;
        wallFlash.clear();
        wallFlash.visible = false;
        flashDirty = false;
      }
      return;
    }
    const gain = mapFxNeonGain(current.glowAlpha);
    threatPulse(threatShown, pulse);
    pulsePhase = (pulsePhase + pulse.hz * dt) % 1;
    const a = wallPulseAlpha(pulse.amp, pulsePhase) * gain;
    // V3: the boss entrance edge pulse takes over the wall pulse layer while it is the stronger.
    const edge = bossEdgePulse(bossEdgeAge) * gain;
    wallPulse.visible = a > 0.004 || edge > 0.004;
    if (wallPulse.visible) {
      wallPulse.alpha = edge > a ? edge : a;
      wallPulse.tint = edge > a ? palette[bossEdgeKey] : mixRgb(palette.grid, palette.red, threatShown * PULSE_WARM_MAX);
    }
    if (!flashDirty) return;
    wallFlash.clear();
    let any = false;
    const s = Math.max(fit.scale, 0.01);
    const colour = mixRgb(palette.grid, 0xffffff, 0.55);
    for (const f of flashes) {
      if (f.age >= FLASH_LIFE) continue;
      f.age += dt;
      const fa = f.strength * flashFade(f.age) * gain;
      const feat = features[f.feature];
      if (fa <= 0 || !feat) continue;
      any = true;
      for (let pass = 0; pass < 2; pass++) {
        if (feat.t === 'seg') {
          const dx = feat.x2 - feat.x1;
          const dy = feat.y2 - feat.y1;
          wallFlash.moveTo(feat.x1 + dx * f.s0, feat.y1 + dy * f.s0).lineTo(feat.x1 + dx * f.s1, feat.y1 + dy * f.s1);
        } else {
          wallFlash.moveTo(feat.cx + Math.cos(f.s0) * feat.r, feat.cy + Math.sin(f.s0) * feat.r);
          wallFlash.arc(feat.cx, feat.cy, feat.r, f.s0, f.s1);
        }
        if (pass === 0) wallFlash.stroke({ width: (WALL_GLOW_PX * 2) / s, color: colour, alpha: fa * 0.4, cap: 'round' });
        else wallFlash.stroke({ width: (WALL_LINE_PX * 2) / s, color: colour, alpha: fa, cap: 'round' });
      }
    }
    wallFlash.visible = any;
    flashDirty = any;
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
    enemyPhase[i] = Number.NaN;
    lastDrawX[i] = Number.NaN;
    const em = enemyEmitters[i];
    if (em) em.acc = 0;
  }

  // Per entity draw values for the v2 kinds, written by applyEnemyContract (no allocation).
  const ev = { x: 0, y: 0, alpha: 1, scaleX: 1, scaleY: 1, rot: 0, glowMul: 1 };

  /** One fx line: halo and core on the crisp layer, plus a copy in the bloom layer. */
  function fxLine(x1: number, y1: number, x2: number, y2: number, width: number, colour: number, a: number): void {
    const halo = currentRender.haloAlpha * a;
    if (halo > 0) enemyFx.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: width * currentRender.haloWidthMul, color: colour, alpha: halo, cap: 'round' });
    enemyFx.moveTo(x1, y1).lineTo(x2, y2).stroke({ width, color: colour, alpha: a, cap: 'round' });
    if (bloomOn) enemyFxGlow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: width * 2, color: colour, alpha: a, cap: 'round' });
    enemyFxDirty = true;
  }

  /** One fx circle outline, same three passes as fxLine. */
  function fxCircle(x: number, y: number, r: number, width: number, colour: number, a: number): void {
    const halo = currentRender.haloAlpha * a;
    if (halo > 0) enemyFx.circle(x, y, r).stroke({ width: width * currentRender.haloWidthMul, color: colour, alpha: halo });
    enemyFx.circle(x, y, r).stroke({ width, color: colour, alpha: a });
    if (bloomOn) enemyFxGlow.circle(x, y, r).stroke({ width: width * 2, color: colour, alpha: a });
    enemyFxDirty = true;
  }

  /**
   * Charger wind up lane (GC: make it unmistakable). A translucent band exactly as wide as the
   * dash sweeps, two rails, a bright centre line, an end bar where the dash stops at a wall or
   * at full length, and chevrons that crawl toward the dash direction. (x, y) is the Charger,
   * (dx, dy) the unit heading, len the lane length, la the lane alpha, phase the w.t phase.
   */
  function drawChargerLane(x: number, y: number, dx: number, dy: number, len: number, la: number, phase: number): void {
    const colour = palette.charger;
    const nx = -dy * CHARGER_LANE_HALF;
    const ny = dx * CHARGER_LANE_HALF;
    const x0 = x + dx * 16;
    const y0 = y + dy * 16;
    const x1 = x + dx * len;
    const y1 = y + dy * len;
    if (len > 16) {
      enemyFx
        .moveTo(x0 + nx, y0 + ny)
        .lineTo(x1 + nx, y1 + ny)
        .lineTo(x1 - nx, y1 - ny)
        .lineTo(x0 - nx, y0 - ny)
        .closePath()
        .fill({ color: colour, alpha: CHARGER_LANE_FILL * la });
      fxLine(x0 + nx, y0 + ny, x1 + nx, y1 + ny, 1.4, colour, la * 0.75);
      fxLine(x0 - nx, y0 - ny, x1 - nx, y1 - ny, 1.4, colour, la * 0.75);
    }
    fxLine(x0, y0, x1, y1, 2, colour, la);
    fxLine(x1 + nx, y1 + ny, x1 - nx, y1 - ny, 2.4, colour, la);
    const n = chargerChevrons(len);
    const cs = CHARGER_CHEVRON_SIZE;
    const crawl = (phase * 120) % CHARGER_CHEVRON_GAP;
    for (let k = 0; k < n; k++) {
      const d = 30 + crawl + k * CHARGER_CHEVRON_GAP;
      if (d > len - 8) break;
      const px = x + dx * d;
      const py = y + dy * d;
      const bx = px - dx * cs;
      const by = py - dy * cs;
      enemyFx
        .moveTo(bx - dy * cs, by + dx * cs)
        .lineTo(px, py)
        .lineTo(bx + dy * cs, by - dx * cs)
        .stroke({ width: 2, color: colour, alpha: la, cap: 'round', join: 'round' });
    }
    enemyFxDirty = true;
  }

  /**
   * Render contract for the v2 kinds (docs/10 wave C table): per kind alpha, scale and turn, plus
   * the tells (Charger lane, Blink ring and arrival, Slime splat) and the trails (Swirl, Charger
   * dash). Telegraphing entities draw no tells or trails. Reads the World, writes only render.
   */
  function applyEnemyContract(w: World, i: number, kind: number, tele: boolean, timeSec: number, dt: number): void {
    const t = w.t[i] ?? 0;
    const prevT = enemyPhase[i] ?? Number.NaN;
    enemyPhase[i] = t;
    const em = enemyEmitters[i];
    const trails = trailsActive() && !tele;
    // Drawn velocity from the last sim step (Blink keeps its destination in vx and vy).
    const vx = ((w.x[i] ?? 0) - (w.prevX[i] ?? 0)) / SIM_DT;
    const vy = ((w.y[i] ?? 0) - (w.prevY[i] ?? 0)) / SIM_DT;
    if (kind === KIND_NUM.charger) {
      if (tele) return;
      const la = chargerLaneAlpha(t);
      const dx = Math.cos(ev.rot);
      const dy = Math.sin(ev.rot);
      if (la > 0) {
        const len = rayWallDistance(features, ev.x, ev.y, dx, dy, CHARGER_LANE_LEN);
        drawChargerLane(ev.x, ev.y, dx, dy, len, la, t);
      } else if (chargerDashing(t) && trailsActive()) {
        const len = chargerStreakLen(t);
        if (len > 4) fxLine(ev.x - dx * 8, ev.y - dy * 8, ev.x - dx * len, ev.y - dy * len, 4, palette.charger, 0.7 * chargerStreak(t));
        if (trails && em) emitEnemyTrail(em, CHARGER_DASH_TRAIL_RATE, ev.x, ev.y, vx, vy, ENEMY_TRAIL_CHARGER, palette.charger, dt);
      } else if (em) em.acc = 0;
    } else if (kind === KIND_NUM.blink) {
      ev.alpha *= blinkGhostAlpha(t);
      // Jump streak (run 0180): the drawn position jumped since the last frame.
      const lx = lastDrawX[i] ?? Number.NaN;
      const ly = lastDrawY[i] ?? Number.NaN;
      lastDrawX[i] = ev.x;
      lastDrawY[i] = ev.y;
      if (tele) return;
      if (trails && Number.isFinite(lx) && Number.isFinite(ly)) {
        const jx = ev.x - lx;
        const jy = ev.y - ly;
        if (jx * jx + jy * jy > BLINK_SNAP_U * BLINK_SNAP_U) {
          addPulse(pulsePool, PULSE_STREAK, ev.x, ev.y, Math.atan2(jy, jx), Math.hypot(jx, jy), 0.9, STREAK_LIFE, palette.blink, 1);
          emitBlinkStreak(lx, ly, ev.x, ev.y, palette.blink);
        }
      }
      blinkRing(t, ringScratch);
      if (ringScratch.alpha > 0) fxCircle(w.vx[i] ?? 0, w.vy[i] ?? 0, ringScratch.r, 2, palette.blink, ringScratch.alpha);
      if (blinkArrived(prevT, t)) {
        addPop(ev.x, ev.y, 10, 36, 0.25, 'blink');
        burstSmall(ev.x, ev.y, palette.blink, 12, 150, 380, 0.3);
      }
    } else if (kind === KIND_NUM.swirl) {
      if (trails && em) emitEnemyTrail(em, SWIRL_TRAIL_RATE, ev.x, ev.y, vx, vy, ENEMY_TRAIL_SWIRL, palette.swirl, dt);
    } else if (kind === KIND_NUM.splime) {
      const sw = splimeSwell(t);
      ev.scaleX *= sw;
      ev.scaleY *= sw;
      // Drop telegraph: a footprint ring growing to the puddle size where the Slime will land.
      if (!tele) {
        splimeDropRing(t, splimeRingScratch);
        if (splimeRingScratch.alpha > 0) fxCircle(ev.x, ev.y, splimeRingScratch.r, 2, palette.splime, splimeRingScratch.alpha);
      }
    } else if (kind === KIND_NUM.mine) {
      ev.alpha *= mineAlpha(t);
    } else if (kind === KIND_NUM.slime) {
      const h = hash01(i);
      const r = w.radius[i] ?? 0;
      const base = (r > 0 ? r / SLIME_RADIUS : 1) * slimeScale(t);
      const wob = SLIME_WOBBLE_AMP * Math.sin((timeSec * SLIME_WOBBLE_HZ + h) * TAU);
      ev.scaleX = base * (1 + wob);
      ev.scaleY = base * (1 - wob);
      ev.rot = h * TAU + timeSec * SLIME_SPIN * (h < 0.5 ? -1 : 1);
      ev.alpha *= slimeAlpha(t);
      ev.glowMul = SLIME_GLOW_MUL;
      // Splat when a puddle lands: first sight of a fresh one, or its age restarted (id reuse).
      if ((Number.isNaN(prevT) || t < prevT) && slimeFresh(t)) {
        addPop(ev.x, ev.y, 18 * base, 50, 0.3, 'splime');
        burstSmall(ev.x, ev.y, palette.splime, 10, 60, 200, 0.35);
      }
    }
  }

  /**
   * Run 0180 trails and sparkle on two v1 kinds: the Dart leaves a trail in its orange while it
   * moves fast, and a geom twinkles (glow alpha through ev.glowMul) and sheds tiny sparkles.
   * Trails and sparkles are off on low; the twinkle is a multiplier on the glow sprite only.
   */
  function applyV1Sparkle(w: World, i: number, kind: number, tele: boolean, timeSec: number, dt: number): void {
    const em = enemyEmitters[i];
    if (!em) return;
    if (tele || !trailsActive()) {
      em.acc = 0;
      return;
    }
    if (kind === KIND_DART) {
      const vx = ((w.x[i] ?? 0) - (w.prevX[i] ?? 0)) / SIM_DT;
      const vy = ((w.y[i] ?? 0) - (w.prevY[i] ?? 0)) / SIM_DT;
      emitEnemyTrail(em, dartTrailRate(Math.hypot(vx, vy)), ev.x, ev.y, vx, vy, ENEMY_TRAIL_DART, palette.orange, dt);
      return;
    }
    ev.glowMul = geomTwinkle(timeSec, hash01(i * 7 + 3));
    emitGeomSparkle(em, ev.x, ev.y, sparkleColour, dt);
  }

  /** Expanding flash circles (arrival, splat). Drawn after the entity pass. */
  function drawPops(dt: number): void {
    for (const p of pops) {
      if (p.age >= p.life) continue;
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) continue;
      const ease = 1 - (1 - u) * (1 - u);
      fxCircle(p.x, p.y, p.r0 + (p.r1 - p.r0) * ease, 2.5 * (1 - u) + 0.5, palette[p.colour], 1 - u);
    }
  }

  function drawEntities(w: World, alpha: number, timeSec: number, dt: number): void {
    growPools(w.cap);
    if (enemyFxDirty) {
      enemyFx.clear();
      enemyFxGlow.clear();
      enemyFxDirty = false;
    }
    // One sprite per entity on both paths: bloom source (sharp, scale 1) or blurred glow.
    const glowAlpha = bloomOn ? currentRender.bloomSourceAlpha : currentRender.spriteAlpha;
    const glowScale = bloomOn ? 1 : currentRender.spriteScale;
    // ED1 cue: while exposed (or reassembling) the boss draws its coreless white shell, tinted the
    // tier colour or, in the flicker's on share while exposed, hot red.
    const coreless = bossCoreless();
    const bossTint = coreless
      ? exposed && shellHot(exposeAge)
        ? mixRgb(palette.red, 0xffffff, flickerRedWhite(bossTier))
        : palette[bossColourOf(bossIdx)]
      : 0xffffff;
    let live = 0;
    for (let i = 0; i < w.cap; i++) {
      if (w.alive[i] !== 1) {
        hideSlot(i);
        continue;
      }
      live++;
      const kind = w.kind[i] ?? 0;
      // V3: boss hazards draw through the hazard sprite layer, never as a Graphics view.
      if (kind === KIND_NUM.bossHazard) {
        hideSlot(i);
        planHazardAt(w, i, alpha, timeSec);
        continue;
      }
      const isPickup = kind === PICKUP_KIND;
      const isV2 = kind >= KIND_NUM.charger && kind <= KIND_NUM.slime;
      const isBoss = kind === KIND_NUM.boss;
      const isPart = kind === KIND_NUM.bossPart;
      // Visual slot: the kind, the pickup variant for its weapon index (w.a), the Slime outline
      // variant from hash01(id), the boss per id and openness step, or the part per type and tier.
      const slot = isBoss
        ? coreless
          ? exposedBossSlot(bossIdx, opennessStep(bossOpen))
          : bossSlot(bossIdx, opennessStep(bossOpen))
        : isPart
          ? partSlot(w.a[i] ?? 0, bossTier)
          : visualSlot(kind, w.a[i] ?? -1, kind === KIND_NUM.slime ? hash01(i) : 0);
      let v = views[i];
      if (!v) {
        v = new Graphics(contextForSlot(slot));
        views[i] = v;
        viewKind[i] = slot;
      } else if (viewKind[i] !== slot) {
        v.context = contextForSlot(slot);
        viewKind[i] = slot;
        viewTint[i] = -1;
        enemyPhase[i] = Number.NaN;
      }
      // Slime puddles sit on the floor layer, under every entity.
      const parent = isFloorSlot(slot) ? floor : entities;
      if (v.parent !== parent) parent.addChild(v);
      if (!v.visible) v.visible = true;
      const spec = specForSlot(slot);
      // Parts are drawn white and take the boss colour; bosses bake theirs (tint stays white).
      // G3A: boss adds take a hostile hue (their own colour mixed toward red) and an angry pulse.
      const isAdd = addCount > 0 && !isBoss && !isPart && isBossAdd(i);
      const baseTint = isPart
        ? palette[bossColourOf(bossIdx)]
        : isBoss
          ? bossTint
          : spec.tint === null
            ? 0xffffff
            : palette[spec.tint];
      const tint = isAdd ? mixRgb(baseTint, palette.red, ADD_HUE_MIX) : baseTint;
      if (viewTint[i] !== tint) {
        v.tint = tint;
        viewTint[i] = tint;
      }
      let x = interp(w.prevX[i] ?? 0, w.x[i] ?? 0, alpha);
      let y = interp(w.prevY[i] ?? 0, w.y[i] ?? 0, alpha);
      if (kind === KIND_NUM.blink) {
        // A Blink jump is one sim step: never draw it sliding across the arena.
        const jx = (w.x[i] ?? 0) - (w.prevX[i] ?? 0);
        const jy = (w.y[i] ?? 0) - (w.prevY[i] ?? 0);
        if (jx * jx + jy * jy > BLINK_SNAP_U * BLINK_SNAP_U) {
          x = w.x[i] ?? 0;
          y = w.y[i] ?? 0;
        }
      }
      let scale = 1;
      if (kind === KIND_GRUNT) scale = gruntPulse(timeSec, hash01(i));
      else if (kind === KIND_GRAVITY_WELL) {
        const r = w.radius[i] ?? 0;
        if (r > 0) scale = r / WELL_BASE_RADIUS;
      } else if (isBoss) {
        const r = bossView.active && bossView.radius > 0 ? bossView.radius : (w.radius[i] ?? 0);
        if (r > 0) scale = r / bossBodyR(bossIdx);
      } else if (isPart) {
        const a = w.a[i] ?? 0;
        const r = w.radius[i] ?? 0;
        if (r > 0) scale = r / partR(a);
        if (partType(a) === PART_POD) scale *= podPulse(timeSec, hash01(i));
      }
      // Pickups spin on the render clock (phase per slot) and blink in their last 2 s (w.t).
      const rot = isPickup ? timeSec * PICKUP_SPIN + hash01(i) * Math.PI * 2 : (w.rot[i] ?? 0);
      // Telegraphing enemies flash at 50 percent alpha (Swarm W3 request).
      // The boss has its own 2 s entrance telegraph (the ring and the body fade in), not the 0.6 s one.
      const teleNow = !isPickup && !isBoss && isTelegraphing(w, i);
      const tele = isPickup
        ? pickupAlpha(w.t[i] ?? 0)
        : isBoss
          ? bossView.active
            ? bossBodyAlpha(bossView.mode, bossView.modeT)
            : 1
          : teleNow
            ? telegraphAlpha(telegraphLeft(w, i))
            : 1;
      ev.x = x;
      ev.y = y;
      ev.alpha = tele;
      ev.scaleX = scale;
      ev.scaleY = scale;
      ev.rot = rot;
      ev.glowMul = 1;
      // Ship blinks while invulnerable (B10) and geoms blink in their last second (B11). Both are
      // alpha multipliers, so the glow sprite below follows on the bloom and fallback paths.
      if (i === 0 && kind === KIND_SHIP) ev.alpha *= invulnAlpha(w.ship.invuln);
      else if (kind === KIND_GEOM) ev.alpha *= geomAlpha(w.t[i] ?? 0);
      if (isV2) applyEnemyContract(w, i, kind, teleNow, timeSec, dt);
      else if (kind === KIND_DART || kind === KIND_GEOM) applyV1Sparkle(w, i, kind, teleNow, timeSec, dt);
      else if (isBoss) {
        bossDrawX = ev.x;
        bossDrawY = ev.y;
        // Exposed shake: the drawn body and its glow move, bossDrawX and the sim stay put.
        ev.x += bossShake.x;
        ev.y += bossShake.y;
        const phaseEvent = bossPhaseAge < PHASE_FLASH_SEC ? 1 - bossPhaseAge / PHASE_FLASH_SEC : 0;
        const phaseMode = bossView.active ? bossPhaseFlash(bossView.mode, bossView.modeT) : 0;
        ev.glowMul = bossGlowMul(bossHitAge, phaseEvent > phaseMode ? phaseEvent : phaseMode);
      } else if (isPart) {
        // Parts (pods, anchors, turrets) shake with the body, so the whole boss moves as one.
        ev.x += bossShake.x;
        ev.y += bossShake.y;
      }
      if (isAdd) {
        const p = addAngryPulse(timeSec, hash01(i));
        ev.scaleX *= addScale(p);
        ev.scaleY *= addScale(p);
        ev.glowMul *= addGlow(p);
      } else if (i === 0 && kind === KIND_SHIP && turboK > 0) {
        ev.glowMul *= turboGlow(turboK, timeSec);
      }
      // Wells pull the lattice into a dimple (at most MAX_WELLS, read every frame).
      if (kind === KIND_GRAVITY_WELL && !teleNow && wellsSeen < MAX_WELLS && lattice.sim) {
        addForce(lattice.sim, ev.x, ev.y, wellPullRadius(w.radius[i] ?? 0), WELL_PULL_ACCEL);
        wellsSeen++;
      }
      v.position.set(ev.x, ev.y);
      v.rotation = ev.rot;
      v.scale.set(ev.scaleX, ev.scaleY);
      if (v.alpha !== ev.alpha) v.alpha = ev.alpha;

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
      const ga = glowAlpha * ev.alpha * ev.glowMul;
      s.alpha = ga > 1 ? 1 : ga;
      s.position.set(ev.x, ev.y);
      s.rotation = ev.rot;
      s.scale.set(ev.scaleX * glowScale, ev.scaleY * glowScale);
    }
    drawPops(dt);
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
    const wallGlowOn = mapEffectsOn(getEffectsTier());
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
        // Just died: a bullet that ended at a wall lights it there (orbit blades never do).
        if (wallGlowOn) {
          const vis = visualForCode(bulletCodeShown[i] ?? -1);
          if (vis.orient === 'velocity') bulletWallGlow(item.x, item.y, palette[vis.tint]);
        }
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
    watchSuper(w, now / 1000);
    hitClockMs = now;
    hitWorld = w;
    const nowSec = now / 1000;
    const sim = lattice.sim;
    if (sim) clearForces(sim);
    wellsSeen = 0;
    sparkleColour = mixRgb(palette.geom, 0xffffff, GEOM_SPARKLE_WHITE);
    // V3: boss state and the hazard buffer for this frame; the halo follows applyNeon's settings.
    updateBoss(w, fxDt);
    fxHalo(currentRender, bloomOn, halo);
    resetSpriteBuf(hazardBuf);
    drawEntities(w, a, nowSec, fxDt);
    drawHazards();
    drawBossCue();
    const shipX = interp(w.prevX[0] ?? 0, w.x[0] ?? 0, a);
    const shipY = interp(w.prevY[0] ?? 0, w.y[0] ?? 0, a);
    // Ship trail: reads the sim velocity, writes only render particles and the comet ribbon.
    if (w.alive[0] === 1 && shipActive(w)) {
      const svx = w.vx[0] ?? 0;
      const svy = w.vy[0] ?? 0;
      emitShipTrail(shipX, shipY, svx, svy, fxDt, turboRate(turboK), turboK > 0 ? mixRgb(palette.ship, palette.yellow, 0.5 * turboK) : -1);
      drawComet(shipX, shipY, svx, svy, fxDt);
      // Ship wake through the lattice above 120 u/s.
      const wake = sim ? wakeAccel(Math.hypot(svx, svy)) : 0;
      if (sim && wake > 0) addForce(sim, shipX, shipY, WAKE_RADIUS, wake);
      superDistort(shipX, shipY, nowSec);
    } else {
      resetShipTrail();
      hideComet();
    }
    lastFxSec = nowSec;
    drawBullets(explicitBullets ?? bulletsFromWorld(w), a, shipX, shipY, fxDt);
    drawEnemyBullets(w, a, nowSec, fxDt);
    stepEffects(dt);
    drawPulses(fxDt);
    drawHitFx(fxDt);
    if (latticeActive) {
      lattice.glow.alpha = HEAT_GLOW_ALPHA * mapFxNeonGain(current.glowAlpha);
      lattice.frame(dt, nowSec);
    }
    if (lattice.dust.visible) lattice.dustFrame(fxDt, nowSec);
    governLattice(dt, now / 1000);
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
    resetEnemyAndMapFx();
    hideComet();
    clearPulseFx();
    clearHitFx();
    clearBossFx();
    // New level: the governor starts again from the tier spacing.
    gov = initialGovernor();
    avgFrameMs = 0;
    lattice.clear();
    applyLatticeTier(getEffectsTier());
    lattice.seedDust(arena);
    applyFit();
  }

  /** New level: no hazards, enemy bullets, boss flashes or edge pulse on screen. */
  function clearBossFx(): void {
    resetSpriteBuf(hazardBuf);
    hazardLayer.clear();
    enemyBulletLayer.clear();
    bossOpen = 0;
    bossHitAge = Number.POSITIVE_INFINITY;
    bossPhaseAge = Number.POSITIVE_INFINITY;
    bossEdgeAge = Number.POSITIVE_INFINITY;
    bossHitThrottle.lastMs = Number.NEGATIVE_INFINITY;
    resetSpriteBuf(cueBuf);
    cueLayer.clear();
    exposeEvent = EXPOSE_UNKNOWN;
    exposed = false;
    exposeAge = 0;
    exposePhase = 0;
    exposeSpread = 0;
    exposeOrbit = 0;
    bossShake.x = 0;
    bossShake.y = 0;
    addCount = 0;
    turboK = 0;
    turboPrevActive = null;
    turboPrevTimer = 0;
  }

  /** New arena: wall features, calm threat, no flashes, pops or per slot fx state. */
  function resetEnemyAndMapFx(): void {
    features = wallFeatures(arena);
    threatTarget = 0;
    threatShown = 0;
    pulsePhase = 0;
    for (const f of flashes) f.age = FLASH_LIFE;
    for (const p of pops) p.age = p.life;
    flashDirty = true; // one pass clears and hides the flash layer
    enemyFxDirty = true; // the next entity pass clears the fx layers
    enemyPhase.fill(Number.NaN);
    for (const e of enemyEmitters) e.acc = 0;
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
    lattice.destroy();
    hazardLayer.destroy();
    cueLayer.destroy();
    enemyBulletLayer.destroy();
    for (const t of bossAtlas.frames) t.destroy(false);
    bossAtlas.texture.destroy(true);
    for (const t of fxAtlas.frames) t.destroy(false);
    fxAtlas.texture.destroy(true);
    cometAtlas.halo.destroy(false);
    cometAtlas.core.destroy(false);
    cometAtlas.texture.destroy(true);
    trailAtlas.v1.destroy(false);
    trailAtlas.taper.destroy(false);
    trailAtlas.texture.destroy(true);
    dotTexture.destroy(true);
    for (const t of glowTextures) t?.destroy(true);
    for (const t of bloomTextures) t?.destroy(true);
    app.destroy(true, { children: true });
    // Mesh.destroy leaves its geometry; free the comet ribbon once both meshes are gone.
    cometGeom.destroy();
  }

  gridSegs = arenaGridSegments(arena);
  features = wallFeatures(arena);
  setParticleBounds(arena.width, arena.height);
  applyLatticeTier(getEffectsTier());
  lattice.seedDust(arena);
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
    setEnemyBullets(pool: EnemyBulletsLike | null): void {
      explicitEnemyBullets = pool;
    },
    setBossReader(reader: BossReader | null): void {
      bossReader = reader ?? readBoss;
    },
    destroy,
  };
}
