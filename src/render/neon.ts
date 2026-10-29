// Neon brightness mapping (SPEC 4, docs/03-architecture.md section 7).
// applyNeon(n) is the single entry point for bloom strength, threshold, saturation,
// glow alpha and grid alpha. Everything else reads `current` and `palette`, or listens.
import { bus, type WeaponKind } from '../core/events';
import { clampNum, hslToRgbInt, lerpNum } from './color';

export interface NeonParams {
  bloomScale: number;
  threshold: number;
  saturation: number;
  glowAlpha: number;
  gridAlpha: number;
}

// HSL triples. Base S is 0.75 so the 1.3 saturation multiplier clips only slightly.
export const BASE_PALETTE = {
  blue: [215, 0.75, 0.55],
  purple: [275, 0.75, 0.6],
  green: [125, 0.75, 0.5],
  magenta: [310, 0.75, 0.6],
  orange: [28, 0.75, 0.55],
  cyan: [185, 0.75, 0.55],
  white: [0, 0, 0.95],
  red: [355, 0.75, 0.55],
  yellow: [55, 0.75, 0.55],
  ship: [0, 0, 1],
  geom: [95, 0.75, 0.6],
  grid: [230, 0.6, 0.45],
  bomb: [200, 0.75, 0.8],
  /** Homing bullets (super). Hot pink, apart from the yellow standard shot. */
  homing: [335, 0.8, 0.65],
  // V2 enemies (wave C). Each sits in a hue gap of docs/01 section 11, at least 15 degrees from
  // every other enemy family (tests/render/enemyPalette.test.ts). Lightness stays at or under
  // 0.62 so every weapon colour is at least 0.1 lighter (tests/render/weaponPalette.test.ts).
  // Enemy hue ring: red 355, charger 12, orange 28, yellow 55, sower 75, geom 95, green 125,
  // swirl 162, cyan 185, blue 215, bulwark 242, purple 275, splime 292, magenta 310, blink 332.
  /** Charger: vermilion, between the well ring red (355) and Dart orange (28). */
  charger: [12, 0.8, 0.56],
  /** Bulwark: indigo, between Grunt blue (215) and Wanderer purple (275), 16 from pierce. */
  bulwark: [242, 0.75, 0.6],
  /** Blink: rose, between Pinwheel magenta (310) and the well red (355). */
  blink: [332, 0.78, 0.58],
  /** Swirl: jade, between Weaver green (125) and Snake cyan (185), 19 from orbit. */
  swirl: [162, 0.75, 0.52],
  /** Sower: chartreuse, between Spawner yellow (55) and the geom green (95). */
  sower: [75, 0.75, 0.5],
  /** Splime: orchid, the widest remaining gap, between purple (275) and magenta (310). */
  splime: [292, 0.75, 0.6],
  /**
   * Slime: the Splime hue, darker and less saturated. The puddle also draws at low fill alpha
   * with no halo, so it reads as the Splime's floor hazard and never as an enemy.
   */
  slime: [292, 0.6, 0.45],
  // Weapon styles (wave B). Each sits in a hue gap between the enemy families of docs/01
  // section 11 and the wave C stubs, at least 85 degrees from the yellow player bullet and 75
  // from the pink homing shot, and is lighter than every enemy (L 0.72 to 0.8 against 0.5 to 0.6), so a
  // weapon shot reads as a pale hot colour and never as an enemy. See tests/render/neon.test.ts.
  /** Rapid: pale ice blue, in the gap between Snake cyan (185) and Grunt blue (215). */
  rapid: [200, 1.0, 0.8],
  /** Pierce: pale violet lance, in the gap between Bulwark (240) and Wanderer purple (275). */
  pierce: [258, 1.0, 0.78],
  /** Orbit: mint blades, in the gap between Weaver green (125) and Swirl (160). */
  orbit: [143, 1.0, 0.72],
  // V3 boss colours (docs/13 section 11). Tier 1 tuned in wave A (Glow): Ryan named blue, green and
  // yellow, which are also Grunt, Weaver and Spawner, so the hue alone cannot separate them. Each
  // boss key sits 9 to 15 degrees off its enemy family toward the emptiest side of the wheel, at full
  // saturation and a little lighter (0.56 to 0.64, still under every weapon colour at 0.72 or more),
  // so it reads as a hotter cousin. The rest of the separation is shape: a body radius of 44 to 90 u
  // against 24 u for the largest enemy, a second concentric rim at 0.6 alpha, a white core and the
  // x1.6 tier 1 line weight (bossShapes.ts). tests/render/bossPalette.test.ts holds the rules.
  /** Warden: electric blue, 9 off Grunt blue (215) away from Rapid (200), toward Bulwark (242). */
  bossBlue: [224, 0.95, 0.64],
  /** Brood: leaf green, 15 off Weaver green (125) away from Orbit (143), toward the geom (95). */
  bossGreen: [110, 0.9, 0.56],
  /** Spindle: gold, 10 off Spawner yellow and the spread shot (55), toward Dart orange (28). */
  bossYellow: [45, 1.0, 0.6],
  // Tier 2 tuned in wave B (Glow) by the tier 1 rule: 9 to 15 degrees off the enemy family of the
  // same name, toward the side with no enemy close by, full saturation, lightness 0.6 to 0.62 (under
  // every weapon colour). Waves keep running at 0.6 of their budget during a fight, so Chargers,
  // Blinks and Splimes can share the screen; each key keeps at least 8 degrees from those too and
  // 25 from the nearest weapon hue. The rest of the separation is the x2.0 tier 2 line weight, the
  // 44 to 60 u body, the second rim and the white core. Tier 3 and 4 keys are tuned in wave C.
  /** Ember: amber orange, 10 off Dart orange (28) away from Charger (12), toward gold. */
  bossOrange: [38, 1.0, 0.6],
  /** Mirage: hot magenta, 10 off Pinwheel magenta (310), 12 short of Blink rose (332). */
  bossMagenta: [320, 0.95, 0.62],
  /** Gravitas: deep violet, 9 off Wanderer purple (275), 8 short of Splime (292), 26 from pierce. */
  bossViolet: [284, 0.95, 0.62],
  /** Tier 3 bosses: bright red with a thick glow (the glow width is Glow's, through applyNeon). */
  bossRed: [358, 0.9, 0.58],
  /** Tier 4 boss (Prism): a shimmering multicolour, so a base hue is only the fallback tint. */
  bossPrism: [190, 0.8, 0.7],
  /** Drone pickup (Kind.DronePickup). Placeholder, apart from the weapon pickup white. */
  dronePickup: [170, 0.8, 0.65],
} as const satisfies Record<string, readonly [number, number, number]>;

export type PaletteKey = keyof typeof BASE_PALETTE;

/**
 * The one weapon colour table. Bullets, bullet trails, the pickup glyphs, the collect burst and
 * the HUD weapon label all read a weapon's colour from here (spread is the yellow player shot).
 */
export const WEAPON_PALETTE: Readonly<Record<WeaponKind, PaletteKey>> = {
  spread: 'yellow',
  rapid: 'rapid',
  pierce: 'pierce',
  orbit: 'orbit',
  // V3 contract stubs: each pair borrows the key of its later ingredient (order spread, rapid,
  // pierce, orbit). Placeholders only: Glow gives the six combined looks their own colours in wave D.
  'spread+rapid': 'rapid',
  'spread+pierce': 'pierce',
  'spread+orbit': 'orbit',
  'rapid+pierce': 'pierce',
  'rapid+orbit': 'orbit',
  'pierce+orbit': 'orbit',
};

/** Pure: palette key for a weapon. */
export function weaponPaletteKey(kind: WeaponKind): PaletteKey {
  return WEAPON_PALETTE[kind];
}

/** Pure: HSL hue in degrees for a weapon, from the palette table (for the HUD label and bar). */
export function weaponHue(kind: WeaponKind): number {
  return BASE_PALETTE[WEAPON_PALETTE[kind]][0];
}

export const PALETTE_KEYS: readonly PaletteKey[] = Object.keys(BASE_PALETTE) as PaletteKey[];

export const NEON_DEFAULT = 70;

/** Pure: the five outputs for a slider value. n is rounded and clamped to 0..100. */
export function neonParams(n: number): NeonParams {
  const safe = Number.isFinite(n) ? n : NEON_DEFAULT;
  const t = clampNum(Math.round(safe), 0, 100) / 100;
  return {
    bloomScale: lerpNum(0.0, 2.0, t),
    threshold: lerpNum(0.8, 0.2, t),
    saturation: lerpNum(0.4, 1.3, t),
    glowAlpha: lerpNum(0.0, 0.9, t),
    gridAlpha: lerpNum(0.1, 0.6, t),
  };
}

/**
 * Derived render settings. SPEC 4 fixes the five NeonParams; these turn them into the
 * numbers the renderer writes, so the slider has a strong visible range on both glow paths.
 * Computed here so applyNeon stays the only source of bloom strength, threshold and glow width.
 */
export interface NeonRender {
  /** Written to AdvancedBloomFilter.bloomScale. */
  bloomStrength: number;
  /** Written to AdvancedBloomFilter.threshold. */
  bloomThreshold: number;
  /** Outer halo stroke: width multiplier on the core width, and alpha. */
  haloWidthMul: number;
  haloAlpha: number;
  /** Inner halo stroke: width multiplier and alpha. */
  innerWidthMul: number;
  innerAlpha: number;
  /** Core line width multiplier (thicker lines on the glow layer). */
  coreWidthMul: number;
  /** Fallback path: glow sprite alpha and scale. */
  spriteAlpha: number;
  spriteScale: number;
  /** Grid Graphics alpha. */
  gridAlpha: number;
  /** Particle and bullet trail brightness multipliers. */
  particleAlpha: number;
  trailAlpha: number;
  /** Bloom path: alpha of the per entity bloom source sprite (the filter only sees sprites). */
  bloomSourceAlpha: number;
  /** Arena wall core width multiplier on WALL_LINE_PX. */
  wallWidthMul: number;
}

/** Bloom gain over the SPEC bloom strength: thin lines carry little energy into the blur. */
export const BLOOM_GAIN = 1.8;

/** Pure: render settings for a set of SPEC params. */
export function neonRender(p: NeonParams): NeonRender {
  const t = clampNum(p.glowAlpha / 0.9, 0, 1);
  return {
    bloomStrength: p.bloomScale * BLOOM_GAIN,
    bloomThreshold: p.threshold,
    haloWidthMul: lerpNum(3.5, 6.0, t),
    haloAlpha: p.glowAlpha * 0.3,
    innerWidthMul: 2.4,
    innerAlpha: p.glowAlpha * 0.7,
    coreWidthMul: lerpNum(1.4, 1.8, t),
    spriteAlpha: clampNum(0.15 + p.glowAlpha, 0, 1),
    spriteScale: 1 + p.bloomScale * 0.35,
    gridAlpha: p.gridAlpha,
    particleAlpha: lerpNum(0.6, 1, t),
    trailAlpha: lerpNum(0.5, 1, t),
    bloomSourceAlpha: clampNum(0.25 + p.glowAlpha * 0.9, 0, 1),
    wallWidthMul: lerpNum(1.0, 1.35, t),
  };
}

/** Pure: palette colour for one key at a saturation multiplier. */
export function paletteColour(key: PaletteKey, saturation: number): number {
  const [h, s, l] = BASE_PALETTE[key];
  return hslToRgbInt(h, clampNum(s * saturation, 0, 1), l);
}

/** Pure: the full palette at a saturation multiplier. */
export function computePalette(saturation: number): Record<PaletteKey, number> {
  const out = {} as Record<PaletteKey, number>;
  for (const k of PALETTE_KEYS) out[k] = paletteColour(k, saturation);
  return out;
}

/** Live palette, mutated in place by applyNeon so importers keep one reference. */
export const palette: Record<PaletteKey, number> = computePalette(neonParams(NEON_DEFAULT).saturation);

export let current: NeonParams = neonParams(NEON_DEFAULT);

/** Live derived render settings, replaced by applyNeon. */
export let currentRender: NeonRender = neonRender(current);

/** Last applied slider value (rounded and clamped). */
export let currentNeon: number = NEON_DEFAULT;

type NeonListener = (p: NeonParams) => void;
const listeners = new Set<NeonListener>();

/**
 * Subscribe to neon changes. Returns an unsubscribe function. applyNeon also emits
 * 'neon:changed' on the core bus after these listeners run.
 */
export function onNeonChanged(h: NeonListener): () => void {
  listeners.add(h);
  return () => {
    listeners.delete(h);
  };
}

export function applyNeon(n: number): void {
  const safe = Number.isFinite(n) ? n : NEON_DEFAULT;
  currentNeon = clampNum(Math.round(safe), 0, 100);
  const p = neonParams(currentNeon);
  current = p;
  currentRender = neonRender(p);
  for (const k of PALETTE_KEYS) palette[k] = paletteColour(k, p.saturation);
  for (const h of [...listeners]) h(p);
  bus.emit('neon:changed', p);
}

export interface NeonState {
  /** Slider value, 0 to 100. */
  neon: number;
  params: Readonly<NeonParams>;
  render: Readonly<NeonRender>;
}

/** Live neon value and its derived settings, for the settings screen label. */
export function getNeonState(): NeonState {
  return { neon: currentNeon, params: current, render: currentRender };
}
