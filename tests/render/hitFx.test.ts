import { describe, expect, it } from 'vitest';
import { ENTITY_CAP, Kind } from '../../src/game/world';
import {
  arcFrame,
  createHitThrottle,
  DEFLECT_ARC_GROW,
  DEFLECT_ARC_HALF,
  DEFLECT_ARC_LIFE,
  DEFLECT_ARC_PAD,
  DEFLECT_ARC_R,
  DEFLECT_SPARK_MAX,
  DEFLECT_SPARK_MIN,
  deflectArcScale,
  deflectDir,
  deflectSparkCount,
  deflectSparkParticle,
  HIT_DOT_R,
  HIT_FLASH_LIFE,
  HIT_FLASH_R0,
  HIT_FLASH_R1,
  HIT_FX_CAP,
  HIT_TABLE,
  HIT_THROTTLE_MS,
  hitFlashRadius,
  hitFlashScale,
  hitHueKey,
  hitThrottleAllow,
  resetHitThrottle,
  type Dir,
} from '../../src/render/hitFx';
import type { TrailSpec } from '../../src/render/particlePool';
import { addPulse, createPulsePool, PULSE_ARC, PULSE_FLASH, pulseAlpha, pulseLive, stepPulses } from '../../src/render/pulses';
import { BULWARK_SHIELD_R, specFor, type ShapeSpec } from '../../src/render/shapeSpecs';

describe('hit throttle', () => {
  it('is 50 ms per entity and the table covers every entity id', () => {
    expect(HIT_THROTTLE_MS).toBe(50);
    expect(HIT_TABLE).toBe(ENTITY_CAP);
  });

  it('accepts the first hit, refuses inside 50 ms, accepts at exactly 50 ms', () => {
    const t = createHitThrottle();
    expect(hitThrottleAllow(t, 7, 1000)).toBe(true);
    expect(hitThrottleAllow(t, 7, 1000)).toBe(false);
    expect(hitThrottleAllow(t, 7, 1049.9)).toBe(false);
    expect(hitThrottleAllow(t, 7, 1050)).toBe(true);
    expect(hitThrottleAllow(t, 7, 1099.9)).toBe(false);
    expect(hitThrottleAllow(t, 7, 1100)).toBe(true);
  });

  it('a refused hit does not move the window: a hit every 10 ms flashes every 50 ms, never starves', () => {
    const t = createHitThrottle();
    let accepted = 0;
    let lastAccepted = Number.NEGATIVE_INFINITY;
    for (let ms = 0; ms <= 1000; ms += 10) {
      if (hitThrottleAllow(t, 3, ms)) {
        if (accepted > 0) expect(ms - lastAccepted).toBeGreaterThanOrEqual(HIT_THROTTLE_MS);
        lastAccepted = ms;
        accepted++;
      }
    }
    expect(accepted).toBe(21); // 0, 50, ... 1000
  });

  it('at most 20 flashes a second per entity even at one hit per sim step', () => {
    const t = createHitThrottle();
    let accepted = 0;
    for (let step = 0; step < 120; step++) if (hitThrottleAllow(t, 9, (step * 1000) / 120)) accepted++;
    expect(accepted).toBeLessThanOrEqual(20);
    expect(accepted).toBeGreaterThanOrEqual(19);
  });

  it('entities are throttled independently', () => {
    const t = createHitThrottle();
    expect(hitThrottleAllow(t, 1, 500)).toBe(true);
    expect(hitThrottleAllow(t, 2, 500)).toBe(true);
    expect(hitThrottleAllow(t, 1, 510)).toBe(false);
    expect(hitThrottleAllow(t, 2, 510)).toBe(false);
    expect(hitThrottleAllow(t, 3, 510)).toBe(true);
  });

  it('id 0 is a real slot, a bad id or a bad clock is refused and leaves no mark', () => {
    const t = createHitThrottle();
    expect(hitThrottleAllow(t, 0, 10)).toBe(true);
    for (const id of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(hitThrottleAllow(t, id, 10)).toBe(false);
    expect(hitThrottleAllow(t, 4, Number.NaN)).toBe(false);
    expect(hitThrottleAllow(t, 4, Number.POSITIVE_INFINITY)).toBe(false);
    expect(hitThrottleAllow(t, 4, 10)).toBe(true);
  });

  it('ids past the table wrap instead of throwing', () => {
    const t = createHitThrottle(8);
    expect(hitThrottleAllow(t, 3, 100)).toBe(true);
    expect(hitThrottleAllow(t, 11, 110)).toBe(false); // 11 % 8 === 3
    expect(hitThrottleAllow(t, 12, 110)).toBe(true);
  });

  it('a clock that went backwards is accepted, and reset forgets everyone', () => {
    const t = createHitThrottle();
    expect(hitThrottleAllow(t, 5, 5000)).toBe(true);
    expect(hitThrottleAllow(t, 5, 100)).toBe(true);
    expect(hitThrottleAllow(t, 5, 120)).toBe(false);
    resetHitThrottle(t);
    expect(hitThrottleAllow(t, 5, 120)).toBe(true);
  });

  it('time zero is a real time, not the unset marker', () => {
    const t = createHitThrottle();
    expect(hitThrottleAllow(t, 6, 0)).toBe(true);
    expect(hitThrottleAllow(t, 6, 20)).toBe(false);
  });
});

describe('flash lifetime', () => {
  /** Frames a pulse shows when the renderer mirrors first and ages after (drawHitFx order). */
  function visibleFrames(shape: typeof PULSE_FLASH | typeof PULSE_ARC, life: number, dt: number): number {
    const p = createPulsePool(2);
    addPulse(p, shape, 0, 0, 0, 0, 0, life, 0xffffff, 1);
    let frames = 0;
    for (let guard = 0; guard < 1000 && pulseLive(p, 0); guard++) {
      frames++;
      stepPulses(p, dt);
    }
    return frames;
  }

  it('the hit flash lasts 80 ms and the arc a little longer', () => {
    expect(HIT_FLASH_LIFE).toBe(0.08);
    expect(DEFLECT_ARC_LIFE).toBeGreaterThan(HIT_FLASH_LIFE);
    expect(DEFLECT_ARC_LIFE).toBeLessThanOrEqual(0.2);
  });

  it('a flash shows 5 frames at 60 fps and 10 at 120 fps, then is dead', () => {
    expect(visibleFrames(PULSE_FLASH, HIT_FLASH_LIFE, 1 / 60)).toBe(5);
    expect(visibleFrames(PULSE_FLASH, HIT_FLASH_LIFE, 1 / 120)).toBe(10);
  });

  it('is live just before 80 ms and dead from 80 ms on', () => {
    const p = createPulsePool(1);
    addPulse(p, PULSE_FLASH, 0, 0, 0, 0, 0, HIT_FLASH_LIFE, 0xffffff, 1);
    stepPulses(p, 0.0799);
    expect(pulseLive(p, 0)).toBe(true);
    expect(p.live).toBe(1);
    stepPulses(p, 0.0002);
    expect(pulseLive(p, 0)).toBe(false);
    expect(p.live).toBe(0);
  });

  it('a long frame cannot overshoot: the flash dies in one step, alpha stays 0 after', () => {
    const p = createPulsePool(1);
    addPulse(p, PULSE_FLASH, 0, 0, 0, 0, 0, HIT_FLASH_LIFE, 0xffffff, 1);
    stepPulses(p, 5);
    expect(pulseLive(p, 0)).toBe(false);
    expect(pulseAlpha(PULSE_FLASH, 1)).toBe(0);
    expect(pulseAlpha(PULSE_FLASH, 7)).toBe(0);
  });

  it('flash and arc alpha start at 1 on the first frame and fall monotonically to 0', () => {
    for (const s of [PULSE_FLASH, PULSE_ARC]) {
      expect(pulseAlpha(s, 0)).toBe(1);
      expect(pulseAlpha(s, 1)).toBe(0);
      expect(pulseAlpha(s, -0.2)).toBe(0);
      expect(pulseAlpha(s, Number.NaN)).toBe(0);
      let prev = 2;
      for (let k = 0; k < 20; k++) {
        const a = pulseAlpha(s, k / 20);
        expect(a).toBeLessThan(prev);
        prev = a;
      }
    }
  });

  it('the flash fades faster than the arc at the same life fraction', () => {
    expect(pulseAlpha(PULSE_FLASH, 0.5)).toBeLessThan(pulseAlpha(PULSE_ARC, 0.5));
  });

  it('flash radius runs R0 to R1 monotonically and stays tiny', () => {
    expect(hitFlashRadius(0)).toBe(HIT_FLASH_R0);
    expect(hitFlashRadius(1)).toBe(HIT_FLASH_R1);
    expect(hitFlashRadius(-1)).toBe(HIT_FLASH_R0);
    expect(hitFlashRadius(2)).toBe(HIT_FLASH_R1);
    let prev = -1;
    for (let k = 0; k <= 10; k++) {
      const r = hitFlashRadius(k / 10);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
    expect(HIT_FLASH_R1).toBeLessThanOrEqual(12);
    expect(hitFlashScale(0.5)).toBeCloseTo(hitFlashRadius(0.5) / HIT_DOT_R, 12);
  });

  it('the arc swells from 1 to 1 + GROW', () => {
    expect(deflectArcScale(0)).toBe(1);
    expect(deflectArcScale(1)).toBeCloseTo(1 + DEFLECT_ARC_GROW, 12);
    expect(deflectArcScale(0.5)).toBeGreaterThan(1);
    expect(deflectArcScale(0.5)).toBeLessThan(1 + DEFLECT_ARC_GROW);
  });

  it('the hit pool is a ring: more flashes than slots overwrite the oldest and never exceed the cap', () => {
    const p = createPulsePool(HIT_FX_CAP);
    for (let i = 0; i < HIT_FX_CAP + 5; i++) addPulse(p, PULSE_FLASH, i, 0, 0, 0, 0, HIT_FLASH_LIFE, 0xffffff, 1);
    expect(p.live).toBe(HIT_FX_CAP);
    expect(p.x[0]).toBe(HIT_FX_CAP); // slot 0 was reused by flash number HIT_FX_CAP
    stepPulses(p, 0.1);
    expect(p.live).toBe(0);
  });
});

describe('deflect arc geometry', () => {
  it('uses the exact Bulwark shield radius', () => {
    expect(DEFLECT_ARC_R).toBe(BULWARK_SHIELD_R);
  });

  it('the frame is whole texture units with the arc and its widest stroke inside', () => {
    const f = arcFrame(DEFLECT_ARC_R, DEFLECT_ARC_HALF, DEFLECT_ARC_PAD);
    expect(Number.isInteger(f.w)).toBe(true);
    expect(Number.isInteger(f.h)).toBe(true);
    const widest = 12; // renderer atlas: the outer glow stroke
    expect(DEFLECT_ARC_PAD - widest / 2).toBeGreaterThanOrEqual(1);
    // The arc end points are its left-most and its top and bottom-most points.
    const endX = f.cx + DEFLECT_ARC_R * Math.cos(DEFLECT_ARC_HALF);
    const endY = DEFLECT_ARC_R * Math.sin(DEFLECT_ARC_HALF);
    expect(endX).toBeCloseTo(DEFLECT_ARC_PAD, 9);
    expect(f.cy - endY).toBeGreaterThanOrEqual(DEFLECT_ARC_PAD);
    expect(f.cy + endY).toBeLessThanOrEqual(f.h - DEFLECT_ARC_PAD);
    expect(f.cx + DEFLECT_ARC_R + DEFLECT_ARC_PAD).toBeLessThanOrEqual(f.w + 1e-9);
  });

  it('the anchor is the arc midpoint, centred vertically', () => {
    const f = arcFrame(DEFLECT_ARC_R, DEFLECT_ARC_HALF, DEFLECT_ARC_PAD);
    expect(f.anchorY).toBe(0.5);
    expect(f.anchorX * f.w).toBeCloseTo(f.cx + DEFLECT_ARC_R, 9);
    expect(f.anchorX).toBeGreaterThan(0);
    expect(f.anchorX).toBeLessThan(1);
  });

  it('is a short arc: under half the 120 degree shield', () => {
    expect(DEFLECT_ARC_HALF * 2).toBeLessThan(Math.PI / 3);
  });
});

describe('deflect direction', () => {
  const d: Dir = { x: 0, y: 0 };

  it('points from the shield owner to the hit, unit length', () => {
    deflectDir(130, 40, 100, 40, 1, d);
    expect(d.x).toBeCloseTo(1, 12);
    expect(d.y).toBeCloseTo(0, 12);
    deflectDir(100, 10, 100, 40, 1, d);
    expect(d.x).toBeCloseTo(0, 12);
    expect(d.y).toBeCloseTo(-1, 12);
    deflectDir(103, 44, 100, 40, 1, d);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 12);
  });

  it('falls back to a deterministic unit vector on a coincident or unknown centre', () => {
    const cases: number[][] = [
      [5, 5, 5, 5],
      [5, 5, Number.NaN, Number.NaN],
    ];
    for (const c of cases) {
      deflectDir(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0, 42, d);
      const ax = d.x;
      const ay = d.y;
      expect(Math.hypot(ax, ay)).toBeCloseTo(1, 12);
      deflectDir(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0, 42, d);
      expect(d.x).toBe(ax);
      expect(d.y).toBe(ay);
    }
    deflectDir(5, 5, 5, 5, 43, d);
    const bx = d.x;
    deflectDir(5, 5, 5, 5, 44, d);
    expect(d.x).not.toBe(bx);
  });
});

describe('deflect sparks', () => {
  function spec(): TrailSpec {
    return { x: Number.NaN, y: Number.NaN, vx: Number.NaN, vy: Number.NaN, life: Number.NaN, drag: Number.NaN, colour: 0 };
  }

  it('a deflect throws 3 to 5 sparks, and every count shows up', () => {
    const seen = new Set<number>();
    for (let s = 0; s < 400; s++) {
      const n = deflectSparkCount(s);
      expect(n).toBeGreaterThanOrEqual(DEFLECT_SPARK_MIN);
      expect(n).toBeLessThanOrEqual(DEFLECT_SPARK_MAX);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
    expect(DEFLECT_SPARK_MIN).toBe(3);
    expect(DEFLECT_SPARK_MAX).toBe(5);
  });

  it('every spark leaves the shield: outward half plane, finite, short lived, colour kept', () => {
    const nx = Math.cos(0.7);
    const ny = Math.sin(0.7);
    for (let n = DEFLECT_SPARK_MIN; n <= DEFLECT_SPARK_MAX; n++) {
      for (let k = 0; k < n; k++) {
        for (let seq = 1; seq <= 40; seq++) {
          const o = spec();
          deflectSparkParticle(o, 12, -8, nx, ny, k, n, seq, 0x8888ff);
          expect(o.x).toBe(12);
          expect(o.y).toBe(-8);
          expect(Number.isFinite(o.vx) && Number.isFinite(o.vy)).toBe(true);
          expect(o.vx * nx + o.vy * ny).toBeGreaterThan(0);
          const speed = Math.hypot(o.vx, o.vy);
          expect(speed).toBeGreaterThanOrEqual(170 - 1e-6);
          expect(speed).toBeLessThanOrEqual(400 + 1e-6);
          expect(o.life).toBeGreaterThanOrEqual(0.16);
          expect(o.life).toBeLessThanOrEqual(0.28);
          expect(o.drag).toBeGreaterThan(0);
          expect(o.colour).toBe(0x8888ff);
          expect(o.size).toBe(1);
        }
      }
    }
  });

  it('sparks fan out: the first and last of a spray point to opposite sides of the normal', () => {
    const a = spec();
    const b = spec();
    deflectSparkParticle(a, 0, 0, 1, 0, 0, 4, 9, 0xffffff);
    deflectSparkParticle(b, 0, 0, 1, 0, 3, 4, 9, 0xffffff);
    expect(a.vy * b.vy).toBeLessThan(0);
  });

  it('is deterministic: same inputs, same spark', () => {
    const a = spec();
    const b = spec();
    deflectSparkParticle(a, 1, 2, 0, 1, 2, 5, 77, 0x123456);
    deflectSparkParticle(b, 1, 2, 0, 1, 2, 5, 77, 0x123456);
    expect(a).toEqual(b);
  });
});

describe('flash hue', () => {
  it('uses the view tint when the spec has one', () => {
    expect(hitHueKey(specFor(Kind.Grunt))).toBe(specFor(Kind.Grunt).tint);
    expect(hitHueKey(specFor(Kind.Spawner))).toBe('yellow');
  });

  it('baked colour kinds use their first coloured layer: Bulwark indigo, Gravity well red', () => {
    expect(hitHueKey(specFor(Kind.Bulwark))).toBe('bulwark');
    expect(hitHueKey(specFor(Kind.GravityWell))).toBe('red');
  });

  it('falls back to white for a spec with nothing coloured', () => {
    const bare: ShapeSpec = {
      tint: null,
      radius: 5,
      layers: [{ prims: [], width: 2, fill: 0, colour: 'white', glow: true, alpha: 1 }],
    };
    expect(hitHueKey(bare)).toBe('white');
    expect(hitHueKey({ tint: null, radius: 5, layers: [] })).toBe('white');
  });
});
