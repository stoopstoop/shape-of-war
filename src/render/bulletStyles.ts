// Player bullet looks by BulletPool.style (docs/10 wave B render contract: 0 spread, 1 rapid,
// 2 pierce, 3 orbit). Pure, no pixi.js import. The renderer draws every frame into one atlas
// texture, so all bullet heads stay in one ParticleContainer (one draw call) and the attached
// trails in a second one: two draw calls for bullets in total, inside the budget of four.
import { weaponPaletteKey, type PaletteKey } from './neon';

export type BulletFrame = 'dot' | 'rapid' | 'pierce' | 'orbit';

export const BULLET_FRAMES: readonly BulletFrame[] = ['dot', 'rapid', 'pierce', 'orbit'];

/** How a head is turned: along its velocity, or away from the ship (orbit blades). */
export type BulletOrient = 'velocity' | 'radial';

export interface BulletStyleVisual {
  readonly frame: BulletFrame;
  readonly tint: PaletteKey;
  /** Uniform head scale on the atlas frame. */
  readonly scale: number;
  /** Head anchor along x (0 tail, 1 nose); y is always 0.5. */
  readonly anchorX: number;
  readonly orient: BulletOrient;
  /** Attached trail length in arena units, 0 for none. */
  readonly trailLenU: number;
  /** Attached trail thickness multiplier. */
  readonly trailThick: number;
  /** Emits particle trails into the pool (tier and shedding permitting). */
  readonly emitsTrail: boolean;
}

/** v1 spread values: the dot at 0.75 and a 44 u trail. Low tier shows exactly this for style 0. */
export const SPREAD_TRAIL_LEN_U = 44;
export const HOMING_TRAIL_LEN_U = 96;
export const SPREAD_TRAIL_THICK = 1.35;

const SPREAD: BulletStyleVisual = {
  frame: 'dot',
  tint: weaponPaletteKey('spread'),
  scale: 0.75,
  anchorX: 0.5,
  orient: 'velocity',
  trailLenU: SPREAD_TRAIL_LEN_U,
  trailThick: SPREAD_TRAIL_THICK,
  emitsTrail: false,
};

/** Rapid: a thin short streak, no attached trail (its particle trail fades behind it). */
const RAPID: BulletStyleVisual = {
  frame: 'rapid',
  tint: weaponPaletteKey('rapid'),
  scale: 1,
  anchorX: 0.8,
  orient: 'velocity',
  trailLenU: 0,
  trailThick: 0,
  emitsTrail: true,
};

/** Pierce: a long bright lance with a baked halo and a long thin attached trail. */
const PIERCE: BulletStyleVisual = {
  frame: 'pierce',
  tint: weaponPaletteKey('pierce'),
  scale: 1,
  anchorX: 0.72,
  orient: 'velocity',
  trailLenU: 72,
  trailThick: 1.1,
  emitsTrail: true,
};

/** Orbit: a crescent blade whose bulge faces away from the ship. No trail. */
const ORBIT: BulletStyleVisual = {
  frame: 'orbit',
  tint: weaponPaletteKey('orbit'),
  scale: 1,
  anchorX: 0.5,
  orient: 'radial',
  trailLenU: 0,
  trailThick: 0,
  emitsTrail: false,
};

const BY_STYLE: readonly BulletStyleVisual[] = [SPREAD, RAPID, PIERCE, ORBIT];

/** Homing (super) shots keep their frame but take the homing colour and the long trail. */
const HOMING_BY_STYLE: readonly BulletStyleVisual[] = BY_STYLE.map((v) => ({
  ...v,
  tint: 'homing',
  trailLenU: v.trailLenU > 0 || v.frame === 'dot' ? HOMING_TRAIL_LEN_U : 0,
}));

/** Pure: style values outside 0..3 draw as spread. */
export function normStyle(style: number): number {
  return Number.isInteger(style) && style >= 0 && style < BY_STYLE.length ? style : 0;
}

/** Pure: the look for one bullet. Returns a shared constant, never allocates. */
export function bulletStyleVisual(style: number, homing: boolean): BulletStyleVisual {
  const s = normStyle(style);
  return (homing ? HOMING_BY_STYLE[s] : BY_STYLE[s]) ?? SPREAD;
}

/** Pure: one small integer per (style, homing) pair, so the renderer restyles a slot once. */
export function styleCode(style: number, homing: boolean): number {
  return normStyle(style) + (homing ? BY_STYLE.length : 0);
}

/** Pure: inverse of styleCode. Negative or unknown codes give spread. */
export function visualForCode(code: number): BulletStyleVisual {
  if (!(code >= 0)) return SPREAD;
  const n = BY_STYLE.length;
  return code >= n ? bulletStyleVisual(code - n, true) : bulletStyleVisual(code, false);
}

/** Weapon names as in src/core/events.ts WeaponKind, matched structurally. */
export type WeaponName = 'spread' | 'rapid' | 'pierce' | 'orbit';

/** Pure: palette key for a weapon (pickup collect burst, same colour as its bullets). */
export function weaponTint(w: WeaponName): PaletteKey {
  return weaponPaletteKey(w);
}

/** Particles in the collect burst when a weapon pickup is taken (fx:pickup). */
export const PICKUP_BURST_COUNT = 28;

// Atlas layout, in texture units (CSS px before the generate resolution). Cells sit on one row
// with 2 px gutters so linear filtering never bleeds a neighbour into a frame.
export interface AtlasCell {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const GUTTER = 2;
const CELL_SIZE: Readonly<Record<BulletFrame, { w: number; h: number }>> = {
  dot: { w: 16, h: 16 },
  rapid: { w: 24, h: 6 },
  pierce: { w: 44, h: 14 },
  orbit: { w: 26, h: 26 },
};

function layoutAtlas(): { cells: Readonly<Record<BulletFrame, AtlasCell>>; w: number; h: number } {
  let x = GUTTER;
  let h = 0;
  const cells = {} as Record<BulletFrame, AtlasCell>;
  for (const f of BULLET_FRAMES) {
    const c = CELL_SIZE[f];
    cells[f] = { x, y: GUTTER, w: c.w, h: c.h };
    x += c.w + GUTTER;
    h = Math.max(h, c.h);
  }
  return { cells, w: x, h: h + 2 * GUTTER };
}

const ATLAS = layoutAtlas();

/** Frame rectangle of each bullet look inside the atlas. Non overlapping, inside ATLAS_W x ATLAS_H. */
export const ATLAS_CELLS: Readonly<Record<BulletFrame, AtlasCell>> = ATLAS.cells;
export const ATLAS_W: number = ATLAS.w;
export const ATLAS_H: number = ATLAS.h;

/**
 * Pure: closed polygon of a crescent blade centred on (0, 0), bulge toward +x. The outer arc has
 * radius r around the origin, the inner arc the same radius around (-thick, 0), so the blade is
 * thick at the middle and sharp at both tips. Flat [x0, y0, x1, y1, ...].
 */
export function crescentPoints(r: number, thick: number, segments: number): number[] {
  const seg = Math.max(2, Math.floor(segments));
  // The two circles meet where x = -thick / 2.
  const half = Math.acos(Math.max(-1, Math.min(1, -thick / 2 / r)));
  const pts: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = -half + (2 * half * i) / seg;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  const innerHalf = Math.acos(Math.max(-1, Math.min(1, thick / 2 / r)));
  for (let i = seg - 1; i >= 1; i--) {
    const a = -innerHalf + (2 * innerHalf * i) / seg;
    pts.push(Math.cos(a) * r - thick, Math.sin(a) * r);
  }
  return pts;
}
