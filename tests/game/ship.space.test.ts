import { describe, expect, it } from 'vitest';
import { SPACE_TABLE } from '../../src/core/physics';
import { mulberry32 } from '../../src/core/rng';
import { confine, createConfineResult } from '../../src/game/arena';
import { createShipState, respawnShip, setShipSpace, SHIP_RADIUS, stepShip } from '../../src/game/ship';
import { createWorld, inlineRectLevel, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import type { LevelDef } from '../../src/levelgen/leveldef';

const DT = 1 / 120;

function input(mx: number, my: number, aimActive = false, ax = 1, ay = 0): InputState {
  return {
    move: { active: mx !== 0 || my !== 0, x: mx, y: my },
    aim: { active: aimActive, x: ax, y: ay },
    bomb: false,
    superPressed: false,
    pause: false,
  };
}

/** Inline rect level widened so long holds do not reach a wall. */
function wideLevel(): LevelDef {
  const base = inlineRectLevel();
  return { ...base, arena: { ...base.arena, width: 6000, height: 900 } };
}

/** Recorded 600 step input stream: holds, releases, over-unit diagonals and wall runs. */
function recordStream(seed: number): InputState[] {
  const r = mulberry32(seed);
  const out: InputState[] = [];
  let mx = 0;
  let my = 0;
  for (let i = 0; i < 600; i++) {
    if (i % 30 === 0) {
      const mode = r();
      if (mode < 0.2) {
        mx = 0;
        my = 0;
      } else {
        const a = r() * Math.PI * 2;
        const mag = mode < 0.6 ? r() : 1 + r() * 0.5;
        mx = Math.cos(a) * mag;
        my = Math.sin(a) * mag;
      }
    }
    // A long run toward the top right so the stream always meets a wall and a corner.
    if (i >= 150 && i < 450) out.push(input(0.6, -1));
    else out.push(input(mx, my));
  }
  return out;
}

/** Frozen copy of the v1 move formula (stepShip before v2), on Float32 state like the world store. */
function v1Replay(level: LevelDef, stream: InputState[]): { x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array } {
  const n = stream.length;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const vxs = new Float32Array(n);
  const vys = new Float32Array(n);
  const st = new Float32Array(4);
  const wall = createConfineResult();
  for (let i = 0; i < n; i++) {
    const inp = stream[i] ?? input(0, 0);
    let mx = inp.move.active ? inp.move.x : 0;
    let my = inp.move.active ? inp.move.y : 0;
    const m2 = mx * mx + my * my;
    if (m2 > 1) {
      const k = 1 / Math.sqrt(m2);
      mx *= k;
      my *= k;
    }
    let vx = mx * 420;
    let vy = my * 420;
    const res = confine(level.arena, (st[0] ?? 0) + vx * DT, (st[1] ?? 0) + vy * DT, SHIP_RADIUS, wall);
    if (res.hit) {
      const into = vx * res.nx + vy * res.ny;
      if (into < 0) {
        vx -= into * res.nx;
        vy -= into * res.ny;
      }
    }
    st[0] = res.x;
    st[1] = res.y;
    st[2] = vx;
    st[3] = vy;
    xs[i] = st[0] ?? 0;
    ys[i] = st[1] ?? 0;
    vxs[i] = st[2] ?? 0;
    vys[i] = st[3] ?? 0;
  }
  return { x: xs, y: ys, vx: vxs, vy: vys };
}

function runStream(w: World, stream: InputState[]): { x: number[]; y: number[]; vx: number[]; vy: number[] } {
  const o = { x: [] as number[], y: [] as number[], vx: [] as number[], vy: [] as number[] };
  for (const inp of stream) {
    stepShip(w, DT, inp);
    o.x.push(w.x[0] ?? 0);
    o.y.push(w.y[0] ?? 0);
    o.vx.push(w.vx[0] ?? 0);
    o.vy.push(w.vy[0] ?? 0);
  }
  return o;
}

function speed(w: World): number {
  return Math.hypot(w.vx[0] ?? 0, w.vy[0] ?? 0);
}

describe('ship space physics', () => {
  it('defaults: off, no hold, no slow', () => {
    const s = createShipState();
    expect(s.space).toBe('off');
    expect(s.holdT).toBe(0);
    expect(s.slowUntil).toBe(0);
    expect(s.slowFactor).toBe(1);
  });

  it('off matches the frozen v1 formula over a recorded 600 step stream', () => {
    const level = inlineRectLevel();
    const stream = recordStream(99);
    const ref = v1Replay(level, stream);
    const w = createWorld(level);
    const got = runStream(w, stream);
    let wallHits = 0;
    for (let i = 0; i < stream.length; i++) {
      expect(got.x[i]).toBe(ref.x[i]);
      expect(got.y[i]).toBe(ref.y[i]);
      expect(got.vx[i]).toBe(ref.vx[i]);
      expect(got.vy[i]).toBe(ref.vy[i]);
      if (Math.abs(ref.y[i] ?? 0) >= 440 - 1e-3 || Math.abs(ref.x[i] ?? 0) >= 690 - 1e-3) wallHits++;
    }
    expect(wallHits).toBeGreaterThan(0);
  });

  it('off with an expired slow is still bit identical to v1', () => {
    const level = inlineRectLevel();
    const stream = recordStream(5);
    const ref = v1Replay(level, stream);
    const w = createWorld(level);
    w.time = 10;
    w.ship.slowUntil = 9;
    w.ship.slowFactor = 0.8;
    const got = runStream(w, stream);
    for (let i = 0; i < stream.length; i++) {
      expect(got.x[i]).toBe(ref.x[i]);
      expect(got.vx[i]).toBe(ref.vx[i]);
      expect(got.vy[i]).toBe(ref.vy[i]);
    }
  });

  it('medium coasts about 184 u after release at full speed', () => {
    const w = createWorld(wideLevel());
    setShipSpace(w, 'medium');
    w.x[0] = -2500;
    for (let i = 0; i < 120; i++) stepShip(w, DT, input(1, 0));
    expect(w.vx[0]).toBeCloseTo(460, 3);
    const x0 = w.x[0] ?? 0;
    let steps = 0;
    while ((w.vx[0] ?? 0) !== 0 && steps < 2000) {
      stepShip(w, DT, input(0, 0));
      steps++;
    }
    expect(w.vx[0]).toBe(0);
    expect(w.ship.holdT).toBe(0);
    const coast = (w.x[0] ?? 0) - x0;
    expect(Math.abs(coast - 184) / 184).toBeLessThan(0.05);
  });

  it('medium reversal after a 2 s hold at full speed stops in about 0.12 s', () => {
    const w = createWorld(wideLevel());
    setShipSpace(w, 'medium');
    w.x[0] = -2500;
    for (let i = 0; i < 240; i++) stepShip(w, DT, input(1, 0));
    expect(w.vx[0]).toBeCloseTo(460, 3);
    expect(w.ship.holdT).toBeCloseTo(2, 6);
    let steps = 0;
    while ((w.vx[0] ?? 0) > 0 && steps < 1000) {
      stepShip(w, DT, input(-1, 0));
      steps++;
    }
    const t = steps * DT;
    expect(Math.abs(t - 0.12) / 0.12).toBeLessThan(0.15);
  });

  it('wall slide keeps the tangent, drops the normal and keeps the hold time', () => {
    const w = createWorld(inlineRectLevel());
    setShipSpace(w, 'medium');
    w.y[0] = -440;
    w.vx[0] = 200;
    w.vy[0] = -300;
    stepShip(w, DT, input(0, 0));
    const k = Math.exp(-SPACE_TABLE.medium.drag * DT);
    expect(w.y[0]).toBeCloseTo(-440, 4);
    expect(w.vy[0]).toBe(0);
    expect(w.vx[0]).toBeCloseTo(200 * k, 3);

    // Holding into the wall diagonally: slides along it at the tangent component.
    for (let i = 0; i < 60; i++) stepShip(w, DT, input(0.7071, -0.7071));
    expect(w.y[0]).toBeCloseTo(-440, 4);
    expect(w.vy[0]).toBeCloseTo(0, 6);
    expect(w.vx[0] ?? 0).toBeGreaterThan(100);
    expect(w.x[0] ?? 0).toBeLessThan(690);
    expect(w.ship.holdT).toBeCloseTo(0.5, 6);
  });

  it('respawn zeroes velocity, hold time and the slow fields', () => {
    const w = createWorld(inlineRectLevel());
    setShipSpace(w, 'high');
    for (let i = 0; i < 60; i++) stepShip(w, DT, input(1, 0));
    w.ship.slowUntil = 50;
    w.ship.slowFactor = 0.8;
    expect(w.ship.holdT).toBeGreaterThan(0);
    respawnShip(w);
    expect(w.vx[0]).toBe(0);
    expect(w.vy[0]).toBe(0);
    expect(w.ship.holdT).toBe(0);
    expect(w.ship.slowUntil).toBe(0);
    expect(w.ship.slowFactor).toBe(1);
    expect(w.ship.space).toBe('high');
  });

  it.each(['low', 'medium', 'high'] as const)('%s: the same stream twice gives identical values', (level) => {
    const stream = recordStream(7);
    const a = createWorld(inlineRectLevel());
    const b = createWorld(inlineRectLevel());
    setShipSpace(a, level);
    setShipSpace(b, level);
    expect(runStream(a, stream)).toEqual(runStream(b, stream));
    expect(a.ship.holdT).toBe(b.ship.holdT);
  });

  it('fireSpread still receives the ship velocity', () => {
    const w = createWorld(inlineRectLevel());
    setShipSpace(w, 'medium');
    for (let i = 0; i < 10; i++) stepShip(w, DT, input(1, 0));
    stepShip(w, DT, input(1, 0, true, 1, 0));
    const v = w.vx[0] ?? 0;
    expect(v).toBeGreaterThan(20);
    expect(v).toBeLessThan(200);
    const p = w.bullets;
    expect(p.liveCount).toBe(3);
    expect(Math.hypot(p.vx[1] ?? 0, p.vy[1] ?? 0)).toBeCloseTo(1400 + v, 2);
  });

  it('slow channel scales the off stick velocity and recovers after slowUntil', () => {
    const w = createWorld(inlineRectLevel());
    w.time = 1;
    w.ship.slowUntil = 3;
    w.ship.slowFactor = 0.8;
    stepShip(w, DT, input(1, 0));
    expect(w.vx[0]).toBeCloseTo(0.8 * 420, 3);
    w.time = 3;
    stepShip(w, DT, input(1, 0));
    expect(w.vx[0]).toBeCloseTo(420, 6);
  });

  it('slow channel caps medium at 0.8 x 460 and recovers after slowUntil', () => {
    const w = createWorld(wideLevel());
    setShipSpace(w, 'medium');
    w.x[0] = -2500;
    w.ship.slowUntil = 5;
    w.ship.slowFactor = 0.8;
    for (let i = 0; i < 120; i++) {
      stepShip(w, DT, input(1, 0));
      expect(speed(w)).toBeLessThanOrEqual(0.8 * 460 + 1e-3);
    }
    expect(speed(w)).toBeCloseTo(0.8 * 460, 3);
    w.time = 5;
    for (let i = 0; i < 30; i++) stepShip(w, DT, input(1, 0));
    expect(speed(w)).toBeCloseTo(460, 3);
  });
});
