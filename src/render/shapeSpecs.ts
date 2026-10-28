// Pure shape registry: one ShapeSpec per Kind. No pixi.js import, so tests run in node.
// shapes.ts turns each spec into a GraphicsContext. Sizes are arena units and match the
// hitbox radii in docs/01-game-design.md section 6.2. Facing is +x at rot 0.
import { Kind } from '../game/world';
import type { PaletteKey } from './neon';

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
}

function layer(prims: readonly ShapePrim[], width: number, extra: LayerExtra = {}): ShapeLayer {
  return {
    prims,
    width,
    fill: extra.fill ?? 0,
    colour: extra.colour ?? null,
    glow: extra.glow ?? true,
  };
}

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

/**
 * V2 stub: the magenta circle of UNKNOWN_SPEC, as a fresh object per Kind so the registry test can
 * tell a registered entry from the fallback. Glow replaces each with a real glyph in waves B and C.
 */
function placeholderSpec(): ShapeSpec {
  return { tint: 'magenta', radius: 12, layers: [layer([{ t: 'circle', r: 12 }], 2.5)] };
}

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
  pickupSpec('rapid', [
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
  pickupSpec('pierce', [
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
  pickupSpec('orbit', [
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
  // V2 contract stubs: magenta circle placeholders until Glow draws the real glyphs (wave C).
  [Kind.Charger]: placeholderSpec(),
  [Kind.Bulwark]: placeholderSpec(),
  [Kind.Blink]: placeholderSpec(),
  [Kind.Swirl]: placeholderSpec(),
  [Kind.Sower]: placeholderSpec(),
  [Kind.Mine]: placeholderSpec(),
  [Kind.Splime]: placeholderSpec(),
  [Kind.Slime]: placeholderSpec(),
};

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
// variant. The renderer caches contexts and glow textures per slot, not per Kind, so a pickup
// can change its inner mark without a Kind of its own.

/** Highest visual slot, for the context and texture cache sizes. */
export const MAX_SLOT: number = MAX_KIND + PICKUP_VARIANTS;

/** Pure: visual slot for a pickup weapon index. Unknown indices give the plain pickup slot. */
export function pickupSlot(weapon: number): number {
  return Number.isInteger(weapon) && weapon >= 1 && weapon <= PICKUP_VARIANTS ? MAX_KIND + weapon : Kind.WeaponPickup;
}

/** Pure: visual slot for an entity. a is w.a[id], read only for weapon pickups. */
export function visualSlot(kind: number, a: number): number {
  if (kind === Kind.WeaponPickup) return pickupSlot(a);
  return kind >= 1 && kind <= MAX_KIND ? kind : 0;
}

/** Pure: spec for a visual slot, with the magenta fallback. */
export function specForSlot(slot: number): ShapeSpec {
  if (slot > MAX_KIND && slot <= MAX_SLOT) return PICKUP_SPECS[slot - MAX_KIND] ?? UNKNOWN_SPEC;
  return specFor(slot);
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
