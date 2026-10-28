// Registry test: keeps pixi.js out of node by testing the pure spec map, not GraphicsContext.
import { describe, expect, it } from 'vitest';
import { Kind } from '../../src/game/world';
import { SLIME_VARIANTS } from '../../src/render/enemyFx';
import { BASE_PALETTE } from '../../src/render/neon';
import {
  ALL_KINDS,
  MAX_KIND,
  MAX_SLOT,
  PICKUP_BLINK_LOW,
  PICKUP_KIND,
  PICKUP_RADIUS,
  PICKUP_SPECS,
  pickupAlpha,
  pickupSlot,
  SHAPE_SPECS,
  specFor,
  specForSlot,
  UNKNOWN_SPEC,
  visualSlot,
  type DrawnKind,
} from '../../src/render/shapeSpecs';

// Every Kind value after None, by numeric range so a gap in ALL_KINDS is caught.
const LAST_KIND = Kind.Slime;

describe('shape registry', () => {
  it('has an entry for every Kind except None', () => {
    for (let k = Kind.Ship; k <= LAST_KIND; k++) {
      expect(ALL_KINDS).toContain(k);
      const spec = specFor(k);
      expect(spec).not.toBe(UNKNOWN_SPEC);
      expect(spec.layers.length).toBeGreaterThan(0);
      expect(spec.radius).toBeGreaterThan(0);
    }
    expect(ALL_KINDS).toHaveLength(LAST_KIND);
    expect(Object.keys(SHAPE_SPECS)).toHaveLength(LAST_KIND);
  });

  it('includes the kinds Swarm needs in W2', () => {
    const needed: DrawnKind[] = [Kind.SnakeBody, Kind.GravityWell, Kind.Spawner, Kind.Geom, Kind.Drone, Kind.Ship];
    for (const k of needed) {
      expect(SHAPE_SPECS[k]).toBeDefined();
    }
  });

  it('gravity well bakes a white core and a red ring', () => {
    const well = SHAPE_SPECS[Kind.GravityWell];
    expect(well.tint).toBeNull();
    const colours = well.layers.map((l) => l.colour);
    expect(colours).toContain('red');
    expect(colours).toContain('white');
    const core = well.layers.find((l) => l.colour === 'white');
    expect(core?.fill).toBeGreaterThan(0);
  });

  it('covers Kind.WeaponPickup with a real glyph, not the placeholder circle', () => {
    expect(ALL_KINDS).toContain(Kind.WeaponPickup);
    expect(PICKUP_KIND).toBe(Kind.WeaponPickup);
    const spec = SHAPE_SPECS[Kind.WeaponPickup];
    expect(spec).not.toBe(UNKNOWN_SPEC);
    expect(spec.radius).toBe(PICKUP_RADIUS);
    expect(PICKUP_RADIUS).toBe(14);
    const outline = spec.layers[0]?.prims[0];
    expect(outline?.t).toBe('regularPoly');
    if (outline?.t === 'regularPoly') expect(outline.sides).toBe(5);
  });

  it('has a pickup variant per weapon with its weapon colour and its own inner mark', () => {
    const tints = [1, 2, 3].map((wi) => specForSlot(pickupSlot(wi)).tint);
    expect(tints).toEqual(['rapid', 'pierce', 'orbit']);
    const marks = [1, 2, 3].map((wi) => JSON.stringify(specForSlot(pickupSlot(wi)).layers.slice(1)));
    expect(new Set(marks).size).toBe(3);
    for (const wi of [1, 2, 3]) {
      const s = specForSlot(pickupSlot(wi));
      expect(s.layers.length).toBeGreaterThan(1);
      expect(s.layers[0]).toEqual(SHAPE_SPECS[Kind.WeaponPickup].layers[0]);
      expect(s.radius).toBe(PICKUP_RADIUS);
    }
  });

  it('visual slots: pickups by w.a, other kinds unchanged, slots past the registry', () => {
    // Three pickup variants, then the Slime outline variants (enemyShapes.test.ts).
    expect(MAX_SLOT).toBe(MAX_KIND + 3 + SLIME_VARIANTS);
    expect(visualSlot(Kind.WeaponPickup, 1)).toBe(MAX_KIND + 1);
    expect(visualSlot(Kind.WeaponPickup, 3)).toBe(MAX_KIND + 3);
    expect(visualSlot(Kind.WeaponPickup, -1)).toBe(Kind.WeaponPickup);
    expect(visualSlot(Kind.WeaponPickup, 0)).toBe(Kind.WeaponPickup);
    expect(visualSlot(Kind.WeaponPickup, 9)).toBe(Kind.WeaponPickup);
    expect(visualSlot(Kind.Grunt, 2)).toBe(Kind.Grunt);
    expect(visualSlot(200, 1)).toBe(0);
    for (let s = 0; s <= MAX_KIND; s++) expect(specForSlot(s)).toBe(specFor(s));
    expect(visualSlot(Kind.Slime, 0, 0.5)).toBeGreaterThan(MAX_KIND + 3);
    expect(visualSlot(Kind.Charger, 0, 0.5)).toBe(Kind.Charger);
    expect(specForSlot(MAX_SLOT + 1)).toBe(UNKNOWN_SPEC);
    expect(PICKUP_SPECS).toHaveLength(4);
  });

  it('pickup is solid above 2 s of life and blinks under 2 s, never fully invisible', () => {
    for (const t of [8, 5, 2.01, 2]) expect(pickupAlpha(t)).toBe(1);
    const seen = new Set<number>();
    for (let t = 1.99; t > 0; t -= 0.01) {
      const a = pickupAlpha(t);
      seen.add(a);
      expect(a).toBeGreaterThanOrEqual(PICKUP_BLINK_LOW);
    }
    expect(seen).toEqual(new Set([1, PICKUP_BLINK_LOW]));
    expect(pickupAlpha(0)).toBe(PICKUP_BLINK_LOW);
    expect(pickupAlpha(Number.NaN)).toBe(1);
  });

  it('unknown kinds and None fall back to the magenta circle', () => {
    expect(specFor(Kind.None)).toBe(UNKNOWN_SPEC);
    expect(specFor(200)).toBe(UNKNOWN_SPEC);
    expect(specFor(-1)).toBe(UNKNOWN_SPEC);
    expect(UNKNOWN_SPEC.tint).toBe('magenta');
    expect(UNKNOWN_SPEC.layers[0]?.prims[0]?.t).toBe('circle');
  });

  it('colours follow SPEC 3.4 and every tint is a palette key', () => {
    expect(SHAPE_SPECS[Kind.Grunt].tint).toBe('blue');
    expect(SHAPE_SPECS[Kind.Wanderer].tint).toBe('purple');
    expect(SHAPE_SPECS[Kind.Weaver].tint).toBe('green');
    expect(SHAPE_SPECS[Kind.Pinwheel].tint).toBe('magenta');
    expect(SHAPE_SPECS[Kind.Dart].tint).toBe('orange');
    expect(SHAPE_SPECS[Kind.SnakeHead].tint).toBe('cyan');
    expect(SHAPE_SPECS[Kind.SnakeBody].tint).toBe('cyan');
    expect(SHAPE_SPECS[Kind.Spawner].tint).toBe('yellow');
    for (const k of ALL_KINDS) {
      const spec = SHAPE_SPECS[k];
      if (spec.tint !== null) expect(Object.keys(BASE_PALETTE)).toContain(spec.tint);
      for (const l of spec.layers) {
        if (l.colour !== null) expect(Object.keys(BASE_PALETTE)).toContain(l.colour);
        for (const p of l.prims) {
          if (p.t === 'poly' || p.t === 'line') {
            expect(p.pts.length % 2).toBe(0);
            for (const v of p.pts) expect(Number.isFinite(v)).toBe(true);
          }
        }
      }
    }
  });
});
