import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { damage } from '../../src/game/combat';
import * as grunt from '../../src/game/enemies/grunt';
import * as snake from '../../src/game/enemies/snake';
import { gs } from '../../src/game/state';
import { ARENA_MIN_FACTOR, arenaSpeedFactor } from '../../src/game/tuning';
import { Kind } from '../../src/game/world';
import { DT, dist, makeGame, put } from './helpers';

afterEach(() => bus.clear());

const rect = (width: number, height: number) => ({
  shape: 'rect' as const,
  width,
  height,
  cornerRadius: 0,
  obstacles: [],
  spawnPoint: { x: 0, y: 0 },
});

describe('arenaSpeedFactor', () => {
  it('is 1 at and above a 900 u shorter span', () => {
    expect(arenaSpeedFactor({ width: 1400, height: 900 })).toBe(1);
    expect(arenaSpeedFactor({ width: 1600, height: 1000 })).toBe(1);
    expect(arenaSpeedFactor({ width: 1800, height: 1100 })).toBe(1);
  });

  it('slows enemies on small arenas, never below the floor', () => {
    expect(arenaSpeedFactor({ width: 1000, height: 700 })).toBeCloseTo(Math.max(ARENA_MIN_FACTOR, Math.sqrt(700 / 900)), 6);
    expect(arenaSpeedFactor({ width: 1100, height: 800 })).toBeCloseTo(Math.sqrt(800 / 900), 6);
    expect(arenaSpeedFactor({ width: 400, height: 400 })).toBe(ARENA_MIN_FACTOR);
  });

  it('uses the shorter span, so circles and wide rects match by height', () => {
    expect(arenaSpeedFactor({ width: 800, height: 800 })).toBe(arenaSpeedFactor({ width: 1300, height: 800 }));
  });

  it('is non decreasing in arena size', () => {
    let prev = 0;
    for (let h = 600; h <= 1200; h += 20) {
      const f = arenaSpeedFactor({ width: h * 1.4, height: h });
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('handles degenerate input', () => {
    expect(arenaSpeedFactor({ width: 0, height: 0 })).toBe(1);
  });
});

describe('enemy speed on a small arena', () => {
  it('a grunt in a 700 u high arena moves at 150 x speedScale x factor', () => {
    const { w } = makeGame({ arena: rect(1000, 700), speedScale: 1.1 });
    const id = put(w, grunt.def, 300, 0);
    const d0 = dist(w, 0, id);
    for (let i = 0; i < 60; i++) grunt.step(w, id, DT);
    const f = arenaSpeedFactor({ width: 1000, height: 700 });
    expect(d0 - dist(w, 0, id)).toBeCloseTo(150 * 1.1 * f * 0.5, 1);
    expect(gs(w).arenaFactor).toBe(f);
  });
});

describe('snake', () => {
  it('draws the head along its travel direction (weave included)', () => {
    const { w } = makeGame();
    const head = snake.spawnSnake(w, 400, 300, 0);
    for (let i = 0; i < 90; i++) {
      const x0 = w.x[head] ?? 0;
      const y0 = w.y[head] ?? 0;
      snake.step(w, head, DT);
      const moved = Math.atan2((w.y[head] ?? 0) - y0, (w.x[head] ?? 0) - x0);
      expect(Math.cos((w.rot[head] ?? 0) - moved)).toBeGreaterThan(0.9999);
    }
    expect(Math.hypot(w.vx[head] ?? 0, w.vy[head] ?? 0)).toBeCloseTo(snake.def.speed, 3);
  });

  it('still converges on the ship with the weave', () => {
    const { w } = makeGame();
    const head = snake.spawnSnake(w, 500, 300, 0);
    const d0 = dist(w, 0, head);
    for (let i = 0; i < 240; i++) snake.step(w, head, DT);
    expect(dist(w, 0, head)).toBeLessThan(d0 - 200);
  });

  it('baseHeading undoes the weave', () => {
    for (const t of [0.1, 0.3, 0.77]) {
      expect(snake.baseHeading(0.5 + snake.weave(t), t)).toBeCloseTo(0.5, 6);
    }
  });

  it('killing the head bursts every segment with no extra score', () => {
    const { w } = makeGame();
    const head = snake.spawnSnake(w, 400, 300, 0);
    for (let i = 0; i < 120; i++) snake.step(w, head, DT);
    const kills: { x: number; y: number }[] = [];
    bus.on('fx:kill', (p) => kills.push({ x: p.x, y: p.y }));
    w.hp[head] = 1;
    w.radius[head] = snake.def.radius;
    damage(w, head, 1);
    expect(kills.length).toBe(13);
    expect(gs(w).score).toBe(200);
    let segs = 0;
    for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.SnakeBody) segs++;
    expect(segs).toBe(0);
  });
});
