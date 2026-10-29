// Pure shape registry: one ShapeSpec per Kind. No pixi.js import, so tests run in node.
// shapes.ts turns each spec into a GraphicsContext. Sizes are arena units and match the
// hitbox radii in docs/01-game-design.md section 6.2. Facing is +x at rot 0.
import { Kind } from '../game/world';
import { hash01 } from './color';
import { SLIME_RADIUS, SLIME_VARIANTS, slimeVariant } from './enemyFx';
import { weaponPaletteKey, type PaletteKey } from './neon';

export type ShapePrim =
  | { readonly t: 'poly'; readonly pts: readonly number[] }
  | { readonly t: 'circle'; readonly r: number }
  | { readonly t: 'rect'; readonly w: number; readonly h: number }
  | { readonly t: 'regularPoly'; readonly r: number; readonly sides: number; readonly rot: number }
  | { readonly t: 'line'; readonly pts: readonly number[] };

export interface ShapeLayer {
  readonly prims: readonly ShapePrim[];
  /** Core stroke width in arena units. 0 means no stroke. */
  readonly width: number;
  /** Fill alpha, 0 for outline only. */
  readonly fill: number;
  /** Baked colour (multi colour kinds). Null means white, coloured by the view tint. */
  readonly colour: PaletteKey | null;
  /** Whether this layer gets the outer glow stroke. */
  readonly glow: boolean;
  /** Stroke alpha multiplier for the core line and its halos, 1 for solid (Slime rim is lower). */
  readonly alpha: number;
}

export interface ShapeSpec {
  /** Tint applied to the view. Null means 0xffffff (colours are baked in the layers). */
  readonly tint: PaletteKey | null;
  /** Nominal radius in arena units, used for glow texture padding and size scaling. */
  readonly radius: number;
  readonly layers: readonly ShapeLayer[];
}

export type DrawnKind = Exclude<Kind, Kind.None>;

/** Every Kind except None, in enum order. */
export const ALL_KINDS: readonly DrawnKind[] = [
  Kind.Ship,
  Kind.Grunt,
  Kind.Wanderer,
  Kind.Weaver,
  Kind.Pinwheel,
  Kind.Dart,
  Kind.SnakeHead,
  Kind.SnakeBody,
  Kind.GravityWell,
  Kind.Spawner,
  Kind.Geom,
  Kind.Drone,
  // V2 contract stubs (docs/10-v2-plan.md), enum order.
  Kind.WeaponPickup,
  Kind.Charger,
  Kind.Bulwark,
  Kind.Blink,
  Kind.Swirl,
  Kind.Sower,
  Kind.Mine,
  Kind.Splime,
  Kind.Slime,
];

interface LayerExtra {
  fill?: number;
  colour?: PaletteKey | null;
  glow?: boolean;
  alpha?: number;
}

function layer(prims: readonly ShapePrim[], width: number, extra: LayerExtra = {}): ShapeLayer {
  return {
    prims,
    width,
    fill: extra.fill ?? 0,
    colour: extra.colour ?? null,
    glow: extra.glow ?? true,
    alpha: extra.alpha ?? 1,
  };
}

/** Round to 0.01 u so baked geometry is stable across platforms and readable in snapshots. */
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Open polyline along a circle arc of radius r from a0 to a1 (radians), n segments. */
export function arcLine(r: number, a0: number, a1: number, n: number): ShapePrim {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(r2(Math.cos(a) * r), r2(Math.sin(a) * r));
  }
  return { t: 'line', pts };
}

/** Closed outline of n points at radius rad(theta) around (cx, cy). */
function radialPoly(n: number, rad: (theta: number) => number, cx = 0, cy = 0): ShapePrim {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = rad(a);
    pts.push(r2(cx + Math.cos(a) * r), r2(cy + Math.sin(a) * r));
  }
  return { t: 'poly', pts };
}

/** Archimedean spiral from radius r0 to r1 over the given turns, as an open polyline. */
function spiralLine(r0: number, r1: number, turns: number, n: number): ShapePrim {
  const pts: number[] = [];
  const total = turns * Math.PI * 2;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = u * total;
    const r = r0 + (r1 - r0) * u;
    pts.push(r2(Math.cos(a) * r), r2(Math.sin(a) * r));
  }
  return { t: 'line', pts };
}

// v2 enemies (wave C). Facing is +x at rot 0, so a glyph's front and rear follow the heading.
// Every silhouette is chosen to read apart at a 12 u radius: an arrow, a square behind a shield
// arc, a broken ring, a spiral, a notched hexagon, a dripping blob, a spiked diamond and a soft
// puddle. Sizes follow the hitbox radii in docs/11 6.2.

/** Charger: a heavy arrow (head plus shaft), apart from the Dart's thin dart. Hitbox 15. */
const CHARGER_SPEC: ShapeSpec = {
  tint: 'charger',
  radius: 15,
  layers: [layer([{ t: 'poly', pts: [15, 0, 1, -12, 1, -5, -14, -5, -14, 5, 1, 5, 1, 12] }], 2.5)],
};

/** Bulwark shield arc from the render contract: radius 26 u, plus and minus 60 degrees. */
export const BULWARK_SHIELD_R = 26;
export const BULWARK_SHIELD_HALF = Math.PI / 3;

/** Shield plate inner and outer radius around the arc line. */
const SHIELD_IN = BULWARK_SHIELD_R - 5;
const SHIELD_OUT = BULWARK_SHIELD_R + 3;

/** Closed crescent between two radii over plus and minus half (radians), n steps per edge. */
function crescentPlate(rIn: number, rOut: number, half: number, n: number): ShapePrim {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -half + (2 * half * i) / n;
    pts.push(r2(Math.cos(a) * rOut), r2(Math.sin(a) * rOut));
  }
  for (let i = n; i >= 0; i--) {
    const a = -half + (2 * half * i) / n;
    pts.push(r2(Math.cos(a) * rIn), r2(Math.sin(a) * rIn));
  }
  return { t: 'poly', pts };
}

/** Radial tick at angle a from r0 to r1: marks where the shield ends and the flank begins. */
function radialTick(a: number, r0: number, r1: number): ShapePrim {
  return { t: 'line', pts: [r2(Math.cos(a) * r0), r2(Math.sin(a) * r0), r2(Math.cos(a) * r1), r2(Math.sin(a) * r1)] };
}

/**
 * Bulwark: an indigo square body behind a white hot shield (GC: make the arc unmistakable). The
 * shield is a filled crescent plate over the exact blocking arc (plus and minus 60 degrees around
 * the heading), a thick bright arc line through it, and end ticks that mark where the flank opens.
 * The shield is baked white, apart from the body colour, so the blocking side reads at a glance
 * and the sides and rear (the counter) are visibly bare. Hitbox 18.
 */
const BULWARK_SPEC: ShapeSpec = {
  tint: null,
  radius: SHIELD_OUT,
  layers: [
    layer([{ t: 'rect', w: 24, h: 24 }], 2.5, { colour: 'bulwark' }),
    layer([arcLine(BULWARK_SHIELD_R, -BULWARK_SHIELD_HALF, BULWARK_SHIELD_HALF, 20)], 4, { colour: 'white' }),
    layer([crescentPlate(SHIELD_IN, SHIELD_OUT, BULWARK_SHIELD_HALF, 16)], 1.2, { colour: 'white', fill: 0.38, glow: false }),
    layer(
      [radialTick(-BULWARK_SHIELD_HALF, SHIELD_IN - 2, SHIELD_OUT + 3), radialTick(BULWARK_SHIELD_HALF, SHIELD_IN - 2, SHIELD_OUT + 3)],
      2.5,
      { colour: 'white' },
    ),
  ],
};

/** Blink ring gap, centred on the heading. */
export const BLINK_GAP = (100 * Math.PI) / 180;

function blinkTick(a: number): ShapePrim {
  return { t: 'line', pts: [r2(Math.cos(a) * 13), r2(Math.sin(a) * 13), r2(Math.cos(a) * 17), r2(Math.sin(a) * 17)] };
}

/**
 * Blink: a broken ring, its gap toward the heading and both gap ends flared outward, with a
 * bright centre dot. Reads apart from the Snake body circle. Hitbox 13.
 */
const BLINK_SPEC: ShapeSpec = {
  tint: 'blink',
  radius: 17,
  layers: [
    layer([arcLine(13, BLINK_GAP / 2, Math.PI * 2 - BLINK_GAP / 2, 26)], 2.5),
    layer([blinkTick(BLINK_GAP / 2), blinkTick(-BLINK_GAP / 2)], 2),
    layer([{ t: 'circle', r: 2.5 }], 0, { fill: 1, glow: false }),
  ],
};

/** Swirl: an open spiral glyph with a centre dot. Hitbox 12. */
const SWIRL_SPEC: ShapeSpec = {
  tint: 'swirl',
  radius: 12,
  layers: [layer([spiralLine(1.5, 12, 1.6, 36)], 2.2), layer([{ t: 'circle', r: 1.8 }], 0, { fill: 1, glow: false })],
};

/**
 * Sower: a hexagon (radius 16) pointing fore and aft, unlike the Snake head's pointy top, with a
 * deep V drop notch cut into the rear vertex (a swallowtail) where its Mines fall, and a small
 * seed inside. Hitbox 16.
 */
const SOWER_SPEC: ShapeSpec = {
  tint: 'sower',
  radius: 16,
  layers: [
    layer([{ t: 'poly', pts: [16, 0, 8, 13.86, -8, 13.86, -13.1, 5, -5, 0, -13.1, -5, -8, -13.86, 8, -13.86] }], 2.5),
    layer([{ t: 'poly', pts: [1, 0, 4.5, -3.5, 8, 0, 4.5, 3.5] }], 1.4, { fill: 0.6, glow: false }),
  ],
};

/** Splime body radius (hitbox 16). The rear dips into a drip notch and a droplet hangs off it. */
const SPLIME_R = 16;

function splimeBody(theta: number): number {
  const back = Math.max(0, -Math.cos(theta)); // 1 at the rear (theta = pi)
  return SPLIME_R * (1 + 0.05 * Math.cos(3 * theta + 0.6)) - 4.5 * back ** 12;
}

/** Splime: a rounded blob, a soft filled nucleus, a drip notch at the rear and its droplet. */
const SPLIME_SPEC: ShapeSpec = {
  tint: 'splime',
  radius: 22,
  layers: [
    layer([radialPoly(40, splimeBody)], 2.5, { fill: 0.12 }),
    layer([radialPoly(10, () => 2.6, -19.5, 0)], 1.6, { fill: 0.7 }),
    layer([{ t: 'circle', r: 5.5 }], 1, { fill: 0.45, glow: false, alpha: 0.6 }),
  ],
};

/** Mine: a small diamond crossed by an X of spikes that stick out past its edges. Hitbox 9. */
const MINE_SPEC: ShapeSpec = {
  tint: 'sower',
  radius: 12,
  layers: [
    layer([{ t: 'poly', pts: [0, -9, 9, 0, 0, 9, -9, 0] }], 2),
    layer(
      [
        { t: 'line', pts: [2.5, 2.5, 8, 8] },
        { t: 'line', pts: [-2.5, 2.5, -8, 8] },
        { t: 'line', pts: [2.5, -2.5, 8, -8] },
        { t: 'line', pts: [-2.5, -2.5, -8, -8] },
      ],
      1.5,
      { glow: false },
    ),
    layer([{ t: 'circle', r: 2.2 }], 0, { fill: 1, glow: false }),
  ],
};

/** Slime outline points: smooth enough that no corner reads (no hard polygon). */
const SLIME_POINTS = 56;

/** Largest edge wobble as a fraction of the radius (sum of the three harmonics below). */
export const SLIME_WOBBLE = 0.145;

/**
 * Pure: Slime outline radius at theta for a variant seed (an integer). Three low harmonics with
 * phases from hash01(seed), so the edge is soft and irregular, within 40 u +- 14.5 percent.
 */
export function slimeEdge(theta: number, seed: number): number {
  const tau = Math.PI * 2;
  const p1 = hash01(seed * 3 + 1) * tau;
  const p2 = hash01(seed * 3 + 2) * tau;
  const p3 = hash01(seed * 3 + 3) * tau;
  const w = 0.07 * Math.cos(2 * theta + p1) + 0.05 * Math.cos(3 * theta + p2) + 0.025 * Math.cos(5 * theta + p3);
  return SLIME_RADIUS * (1 + w);
}

/**
 * Slime: a translucent puddle (low fill), a brighter but soft rim with a faint halo, and a
 * faint inner ring. No hard polygon and no bright core, so it reads as the floor and not as an
 * enemy. Drawn on the floor layer, under every entity.
 */
function slimeSpec(seed: number): ShapeSpec {
  const edge = (a: number): number => slimeEdge(a, seed);
  return {
    tint: 'slime',
    radius: SLIME_RADIUS * (1 + SLIME_WOBBLE),
    layers: [
      layer([radialPoly(SLIME_POINTS, edge)], 0, { fill: 0.2, glow: false }),
      layer([radialPoly(SLIME_POINTS, edge)], 2.2, { alpha: 0.7 }),
      layer([radialPoly(SLIME_POINTS, (a) => edge(a) * 0.62)], 1.2, { glow: false, alpha: 0.3 }),
    ],
  };
}

/** Slime outline variants, picked per entity from hash01(id) (enemyFx.ts slimeVariant). */
export const SLIME_SPECS: readonly ShapeSpec[] = Array.from({ length: SLIME_VARIANTS }, (_, v) => slimeSpec(v + 1));

/** Pinwheel blades: four triangles around the centre. */
function pinwheelBlades(r: number): ShapePrim[] {
  const out: ShapePrim[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const b = a + Math.PI / 2;
    out.push({
      t: 'poly',
      pts: [0, 0, Math.cos(a) * r, Math.sin(a) * r, Math.cos(b) * r * 0.7, Math.sin(b) * r * 0.7],
    });
  }
  return out;
}

const DIAMOND_14: ShapePrim = { t: 'poly', pts: [0, -14, 14, 0, 0, 14, -14, 0] };

/** Kind.WeaponPickup as a plain number, for the renderer's per kind checks. */
export const PICKUP_KIND: number = Kind.WeaponPickup;

/** Pickup radius from the render contract (w.radius 14). */
export const PICKUP_RADIUS = 14;

/**
 * Weapon pickup: a pentagon outline (no other glyph uses five sides) with a glowing core line,
 * plus a per weapon inner mark. The whole glyph spins in the renderer.
 */
function pickupSpec(tint: PaletteKey, mark: readonly ShapeLayer[]): ShapeSpec {
  return {
    tint,
    radius: PICKUP_RADIUS,
    layers: [layer([{ t: 'regularPoly', r: PICKUP_RADIUS, sides: 5, rot: 0 }], 2), ...mark],
  };
}

/** Pickup glyphs by w.a weapon index (1 rapid, 2 pierce, 3 orbit), index 0 unused. */
export const PICKUP_SPECS: readonly ShapeSpec[] = [
  pickupSpec('white', []),
  // Rapid: two parallel bars, the twin stream.
  pickupSpec(weaponPaletteKey('rapid'), [
    layer(
      [
        { t: 'line', pts: [-6, -3, 6, -3] },
        { t: 'line', pts: [-6, 3, 6, 3] },
      ],
      1.8,
      { glow: false },
    ),
  ]),
  // Pierce: an arrow through the centre, the lance.
  pickupSpec(weaponPaletteKey('pierce'), [
    layer(
      [
        { t: 'line', pts: [-7, 0, 7, 0] },
        { t: 'line', pts: [2, -4, 7, 0, 2, 4] },
      ],
      1.8,
      { glow: false },
    ),
  ]),
  // Orbit: a ring around a dot, the blades around the ship.
  pickupSpec(weaponPaletteKey('orbit'), [
    layer([{ t: 'circle', r: 5.5 }], 1.6, { glow: false }),
    layer([{ t: 'circle', r: 2 }], 0, { fill: 1, glow: false }),
  ]),
];

/** Number of pickup variants after the registry kinds (weapon indices 1 to 3). */
export const PICKUP_VARIANTS = PICKUP_SPECS.length - 1;

export const SHAPE_SPECS: Readonly<Record<DrawnKind, ShapeSpec>> = {
  [Kind.Ship]: {
    tint: 'ship',
    radius: 18,
    layers: [layer([{ t: 'poly', pts: [18, 0, -9, 10, -4, 0, -9, -10] }], 2.5)],
  },
  [Kind.Grunt]: {
    tint: 'blue',
    radius: 14,
    layers: [layer([{ t: 'rect', w: 28, h: 28 }], 2.5), layer([DIAMOND_14], 1.5, { glow: false })],
  },
  [Kind.Wanderer]: {
    tint: 'purple',
    radius: 13,
    layers: [layer([{ t: 'poly', pts: [-13, -13, 13, 13, 13, -13, -13, 13] }], 2.5)],
  },
  [Kind.Weaver]: {
    tint: 'green',
    radius: 14,
    layers: [layer([DIAMOND_14], 2.5), layer([{ t: 'rect', w: 10, h: 10 }], 1.5, { glow: false })],
  },
  [Kind.Pinwheel]: {
    tint: 'magenta',
    radius: 20,
    layers: [layer(pinwheelBlades(20), 2.5)],
  },
  [Kind.Dart]: {
    tint: 'orange',
    radius: 9,
    layers: [layer([{ t: 'poly', pts: [10, 0, -8, 7, -4, 0, -8, -7] }], 2)],
  },
  [Kind.SnakeHead]: {
    tint: 'cyan',
    radius: 13,
    layers: [
      layer([{ t: 'regularPoly', r: 13, sides: 6, rot: 0 }], 2.5),
      layer([{ t: 'circle', r: 3 }], 0, { fill: 1, glow: false }),
    ],
  },
  [Kind.SnakeBody]: {
    tint: 'cyan',
    radius: 9,
    layers: [layer([{ t: 'circle', r: 8 }], 2)],
  },
  [Kind.GravityWell]: {
    tint: null,
    radius: 24,
    layers: [
      layer([{ t: 'circle', r: 24 }], 3, { colour: 'red' }),
      layer([{ t: 'circle', r: 17 }], 1.5, { colour: 'red', glow: false }),
      layer([{ t: 'circle', r: 9 }], 2, { colour: 'white', fill: 0.85 }),
    ],
  },
  [Kind.Spawner]: {
    tint: 'yellow',
    radius: 24,
    layers: [
      layer([{ t: 'regularPoly', r: 24, sides: 8, rot: Math.PI / 8 }], 2.5),
      layer([{ t: 'rect', w: 18, h: 18 }], 1.5, { glow: false }),
    ],
  },
  [Kind.Geom]: {
    tint: 'geom',
    radius: 6,
    layers: [layer([{ t: 'poly', pts: [0, -6, 6, 0, 0, 6, -6, 0] }], 1.5, { fill: 0.35 })],
  },
  [Kind.Drone]: {
    tint: 'white',
    radius: 8,
    layers: [
      layer([{ t: 'circle', r: 8 }], 2),
      layer(
        [
          { t: 'line', pts: [-5, 0, 5, 0] },
          { t: 'line', pts: [0, -5, 0, 5] },
        ],
        1.5,
        { glow: false },
      ),
    ],
  },
  // Weapon pickup with no known weapon index: the outline and a centre dot. The renderer draws
  // the per weapon variants (PICKUP_SPECS) through pickupSlot.
  [Kind.WeaponPickup]: pickupSpec('white', [layer([{ t: 'circle', r: 2.5 }], 0, { fill: 1, glow: false })]),
  // V2 enemies and hazards (wave C).
  [Kind.Charger]: CHARGER_SPEC,
  [Kind.Bulwark]: BULWARK_SPEC,
  [Kind.Blink]: BLINK_SPEC,
  [Kind.Swirl]: SWIRL_SPEC,
  [Kind.Sower]: SOWER_SPEC,
  [Kind.Mine]: MINE_SPEC,
  [Kind.Splime]: SPLIME_SPEC,
  // Plain Kind.Slime slot: the first outline. Live puddles use the per id variant slots.
  [Kind.Slime]: SLIME_SPECS[0] ?? slimeSpec(1),
};

/** Kind values the renderer checks per entity, as plain numbers (the enum is const). */
export const KIND_NUM = {
  charger: Kind.Charger as number,
  bulwark: Kind.Bulwark as number,
  blink: Kind.Blink as number,
  swirl: Kind.Swirl as number,
  sower: Kind.Sower as number,
  mine: Kind.Mine as number,
  splime: Kind.Splime as number,
  slime: Kind.Slime as number,
} as const;

/** Drawn for any kind value outside the registry: a magenta circle. */
export const UNKNOWN_SPEC: ShapeSpec = {
  tint: 'magenta',
  radius: 12,
  layers: [layer([{ t: 'circle', r: 12 }], 2.5)],
};

const SPEC_BY_NUMBER: ReadonlyMap<number, ShapeSpec> = new Map(ALL_KINDS.map((k) => [k as number, SHAPE_SPECS[k]]));

/** Pure lookup with the magenta fallback. */
export function specFor(kind: number): ShapeSpec {
  return SPEC_BY_NUMBER.get(kind) ?? UNKNOWN_SPEC;
}

/** Highest Kind value with a registry entry, for the context cache size. */
export const MAX_KIND: number = Math.max(...ALL_KINDS);

// Visual slots: 0 is the unknown glyph, 1..MAX_KIND the registry kinds, then one slot per pickup
// variant, then one per Slime outline variant. The renderer caches contexts and glow textures
// per slot, not per Kind, so a pickup can change its inner mark and puddles can differ in shape
// without a Kind of their own.

/** First Slime variant slot. */
export const SLIME_SLOT_BASE: number = MAX_KIND + PICKUP_VARIANTS + 1;

/** Highest visual slot, for the context and texture cache sizes. */
export const MAX_SLOT: number = MAX_KIND + PICKUP_VARIANTS + SLIME_VARIANTS;

/** Pure: visual slot for a pickup weapon index. Unknown indices give the plain pickup slot. */
export function pickupSlot(weapon: number): number {
  return Number.isInteger(weapon) && weapon >= 1 && weapon <= PICKUP_VARIANTS ? MAX_KIND + weapon : Kind.WeaponPickup;
}

/** Pure: visual slot for a Slime outline variant from hash01(id) in [0, 1). */
export function slimeSlot(h: number): number {
  return SLIME_SLOT_BASE + slimeVariant(h);
}

/**
 * Pure: visual slot for an entity. a is w.a[id], read only for weapon pickups. h is hash01(id),
 * read only for Slime (its outline variant).
 */
export function visualSlot(kind: number, a: number, h = 0): number {
  if (kind === Kind.WeaponPickup) return pickupSlot(a);
  if (kind === Kind.Slime) return slimeSlot(h);
  return kind >= 1 && kind <= MAX_KIND ? kind : 0;
}

/** Pure: spec for a visual slot, with the magenta fallback. */
export function specForSlot(slot: number): ShapeSpec {
  if (slot >= SLIME_SLOT_BASE && slot <= MAX_SLOT) return SLIME_SPECS[slot - SLIME_SLOT_BASE] ?? UNKNOWN_SPEC;
  if (slot > MAX_KIND && slot < SLIME_SLOT_BASE) return PICKUP_SPECS[slot - MAX_KIND] ?? UNKNOWN_SPEC;
  return specFor(slot);
}

/** Pure: whether a visual slot draws on the floor layer (under every entity): the Slime puddles. */
export function isFloorSlot(slot: number): boolean {
  return slot === Kind.Slime || (slot >= SLIME_SLOT_BASE && slot <= MAX_SLOT);
}

/** Pickup spin, radians per second (render only). */
export const PICKUP_SPIN = 1.6;
/** The pickup blinks while it has less than this many seconds left (docs/10 render contract). */
export const PICKUP_BLINK_SEC = 2;
/** Blink toggles per second while blinking. */
const PICKUP_BLINK_HZ = 10;
/** Alpha of the blink off phase: dim, never invisible, so the pickup is still findable. */
export const PICKUP_BLINK_LOW = 0.2;

/** Pure: pickup alpha from its seconds of life left (w.t). Solid until the last 2 s, then blinks. */
export function pickupAlpha(tLeft: number): number {
  if (!(tLeft < PICKUP_BLINK_SEC)) return 1;
  if (tLeft <= 0) return PICKUP_BLINK_LOW;
  return Math.floor(tLeft * PICKUP_BLINK_HZ) % 2 === 0 ? PICKUP_BLINK_LOW : 1;
}
