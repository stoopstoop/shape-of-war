// Registry test: keeps pixi.js out of node by testing the pure spec map, not GraphicsContext.
import { describe, expect, it } from 'vitest';
import { Kind } from '../../src/game/world';
import { BASE_PALETTE } from '../../src/render/neon';
import { ALL_KINDS, SHAPE_SPECS, specFor, UNKNOWN_SPEC, type DrawnKind } from '../../src/render/shapeSpecs';

// Every Kind value after None, by numeric range so a gap in ALL_KINDS is caught.
const LAST_KIND = Kind.Drone;

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
