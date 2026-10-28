import { afterEach, describe, expect, it } from 'vitest';
import { bus, type WeaponKind } from '../../src/core/events';
import { hash01 } from '../../src/core/rng';
import { BULLET_CAP, type BulletPool, STYLE_ORBIT, STYLE_PIERCE, STYLE_RAPID, stepBulletPool } from '../../src/game/bullets';
import { bulletHits, killEnemy, orbitHits } from '../../src/game/combat';
import * as grunt from '../../src/game/enemies/grunt';
import * as pinwheel from '../../src/game/enemies/pinwheel';
import * as snake from '../../src/game/enemies/snake';
import { createGame, gameState, setInvulnerable, stepGame } from '../../src/game/game';
import { collectPickup, livePickup, onScoringKill, PICKUP_LIFE, PICKUP_RADIUS } from '../../src/game/pickup';
import { killShip, triggerBomb } from '../../src/game/player';
import { gs } from '../../src/game/state';
import { stepShip } from '../../src/game/ship';
import {
  BLADE_COOLDOWN,
  chooseDrop,
  currentWeapon,
  equipWeapon,
  fireWeapon,
  ORBIT_RADIUS,
  setWeaponPickups,
  WEAPON_DURATION,
  weaponPool,
  weaponState,
  weaponTimeLeft,
} from '../../src/game/weapons';
import { Kind, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { generateLevel } from '../../src/levelgen/generator';
import type { LevelDef } from '../../src/levelgen/leveldef';
import { DT, idle, makeGame, put, quietLevel } from './helpers';

afterEach(() => bus.clear());

// Golden hashes recorded on main 4f61c3b (v1 weapon code) before this branch changed anything.
const V1_QUIET_10S = 3830442707;
const V1_BAND2_30S = 2054283614;

function fnv(h0: number, bytes: Uint8Array): number {
  let h = h0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function view(a: Uint8Array | Float32Array | Int16Array): Uint8Array {
  return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
}
function hashPool(h0: number, p: BulletPool): number {
  let h = h0;
  const arrs = [p.alive, p.x, p.y, p.vx, p.vy, p.life, p.prevX, p.prevY];
  for (const a of arrs) h = fnv(h, view(a));
  return fnv(h, view(new Uint8Array(new Int32Array([p.freeTop, p.liveCount, p.dropped]).buffer)));
}
function hashWorld(h0: number, w: World): number {
  let h = h0;
  const arrs = [w.alive, w.kind, w.x, w.y, w.hp];
  for (const a of arrs) h = fnv(h, view(a));
  return h;
}
/** Moving, intermittently aiming input with a super press at 5 s (the golden script). */
function script(i: number): InputState {
  const t = i * DT;
  return {
    move: { active: true, x: Math.cos(t * 1.3), y: Math.sin(t * 0.7) },
    aim: { active: Math.floor(t * 2) % 3 !== 0, x: Math.cos(t * 2.1), y: Math.sin(t * 2.1) },
    bomb: false,
    superPressed: i === 600,
    pause: false,
  };
}
function aimAt(ax: number, ay: number, mx = 0, my = 0): InputState {
  return {
    move: { active: mx !== 0 || my !== 0, x: mx, y: my },
    aim: { active: true, x: ax, y: ay },
    bomb: false,
    superPressed: false,
    pause: false,
  };
}
function liveStyle(p: BulletPool, style: number): number {
  let n = 0;
  for (let i = 0; i < p.cap; i++) if (p.alive[i] === 1 && p.style[i] === style) n++;
  return n;
}

describe('spread golden (v1 identical)', () => {
  it('bullet pool state over 10 s equals v1 with pickups on (default)', () => {
    const w = createGame(quietLevel());
    let h = 2166136261;
    for (let i = 0; i < 1200; i++) {
      stepGame(w, DT, script(i));
      h = hashPool(h, w.bullets);
    }
    expect(currentWeapon(w)).toBe('spread');
    expect(h).toBe(V1_QUIET_10S);
  });

  it('a generated band 2 level with kills equals v1 for 30 s with pickups off', () => {
    const w = createGame(generateLevel(0x1234, 9), { vibrate: () => undefined, weaponPickups: false });
    let h = 2166136261;
    for (let i = 0; i < 3600; i++) {
      stepGame(w, DT, script(i));
      h = hashPool(hashWorld(h, w), w.bullets);
    }
    expect(gameState(w).kills).toBeGreaterThan(15);
    expect(h).toBe(V1_BAND2_30S);
  });
});

describe('rapid', () => {
  it('fires 26 volleys of 2 per second, 5 u either side of the aim line', () => {
    const { w } = makeGame();
    equipWeapon(w, 'rapid');
    for (let i = 0; i < 120; i++) stepShip(w, DT, aimAt(1, 0));
    const p = w.bullets;
    expect(p.liveCount).toBe(52);
    expect(liveStyle(p, STYLE_RAPID)).toBe(52);
    expect(p.x[0]).toBeCloseTo(16);
    expect(p.x[1]).toBeCloseTo(16);
    expect([p.y[0], p.y[1]].map((v) => Math.round(v ?? 0)).sort((a, b) => a - b)).toEqual([-5, 5]);
    expect(p.vx[0]).toBeCloseTo(1500);
    expect(p.vy[0]).toBeCloseTo(0);
  });

  it('offsets are perpendicular for any aim', () => {
    const { w } = makeGame();
    equipWeapon(w, 'rapid');
    fireWeapon(w, 0, 0, Math.PI / 2);
    const p = w.bullets;
    expect(p.y[0]).toBeCloseTo(16);
    expect(Math.abs((p.x[0] ?? 0) - (p.x[1] ?? 0))).toBeCloseTo(10);
  });
});

describe('pierce', () => {
  function runBullet(w: World, steps: number): void {
    for (let i = 0; i < steps; i++) {
      stepBulletPool(w.bullets, w.level.arena, DT);
      bulletHits(w);
    }
  }

  it('hits exactly 4 enemies in a line, each once', () => {
    const { w } = makeGame();
    const ids: number[] = [];
    for (let k = 0; k < 6; k++) ids.push(put(w, pinwheel.def, 100 + k * 70, 0));
    equipWeapon(w, 'pierce');
    fireWeapon(w, 0, 0, 0);
    expect(liveStyle(w.bullets, STYLE_PIERCE)).toBe(1);
    runBullet(w, 60);
    // Pinwheels have 2 HP, so a second hit on the same one would kill it.
    expect(ids.map((id) => w.hp[id])).toEqual([1, 1, 1, 1, 2, 2]);
    expect(w.bullets.liveCount).toBe(0);
  });

  it('never hits the same enemy twice while overlapping two at once', () => {
    const { w } = makeGame();
    const a = put(w, pinwheel.def, 150, 0);
    const b = put(w, pinwheel.def, 155, 0);
    equipWeapon(w, 'pierce');
    fireWeapon(w, 0, 0, 0);
    runBullet(w, 60);
    expect([w.hp[a], w.hp[b]]).toEqual([1, 1]);
  });

  it('is stopped by a snake segment', () => {
    const { w } = makeGame();
    const before = put(w, pinwheel.def, 100, 0);
    const seg = put(w, snake.segmentDef, 200, 0);
    const behind = put(w, pinwheel.def, 300, 0);
    equipWeapon(w, 'pierce');
    fireWeapon(w, 0, 0, 0);
    runBullet(w, 60);
    expect(w.hp[before]).toBe(1);
    expect(w.kind[seg]).toBe(Kind.SnakeBody);
    expect(w.hp[behind]).toBe(2);
    expect(w.bullets.liveCount).toBe(0);
  });
});

describe('orbit', () => {
  it('four blades follow a moving ship at 80 u', () => {
    const { w } = makeGame();
    equipWeapon(w, 'orbit');
    const input = aimAt(0, 0, 1, 0.5);
    input.aim.active = false;
    for (let i = 0; i < 240; i++) {
      stepGame(w, DT, input);
      const p = w.bullets;
      let n = 0;
      for (let b = 0; b < p.cap; b++) {
        if (p.alive[b] !== 1 || p.style[b] !== STYLE_ORBIT) continue;
        n++;
        const d = Math.hypot((p.x[b] ?? 0) - (w.x[0] ?? 0), (p.y[b] ?? 0) - (w.y[0] ?? 0));
        expect(d).toBeCloseTo(ORBIT_RADIUS, 2);
      }
      expect(n).toBe(4);
    }
    expect(w.x[0]).toBeGreaterThan(300);
  });

  it('a blade damages at most once per 0.12 s', () => {
    const { w } = makeGame();
    equipWeapon(w, 'orbit'); // blade 0 sits at (80, 0)
    const id = put(w, pinwheel.def, ORBIT_RADIUS, 0);
    w.hp[id] = 100;
    const hitSteps: number[] = [];
    for (let i = 0; i < 120; i++) {
      const hp = w.hp[id] ?? 0;
      orbitHits(w, DT);
      if ((w.hp[id] ?? 0) < hp) hitSteps.push(i);
    }
    expect(hitSteps[0]).toBe(0);
    expect(hitSteps.length).toBeGreaterThanOrEqual(7);
    expect(hitSteps.length).toBeLessThanOrEqual(9);
    for (let k = 1; k < hitSteps.length; k++) {
      expect(((hitSteps[k] ?? 0) - (hitSteps[k - 1] ?? 0)) * DT).toBeGreaterThanOrEqual(BLADE_COOLDOWN - 1e-6);
    }
  });

  it('fires one forward bullet at 6 per second, blades are not consumed by hits', () => {
    const { w } = makeGame();
    equipWeapon(w, 'orbit');
    for (let i = 0; i < 120; i++) stepShip(w, DT, aimAt(1, 0));
    expect(liveStyle(w.bullets, 0)).toBe(6);
    expect(liveStyle(w.bullets, STYLE_ORBIT)).toBe(4);
  });
});

describe('weapon timer and death', () => {
  it('a weapon lasts 20 s, the same pickup refreshes, a different one replaces', () => {
    const { w } = makeGame();
    equipWeapon(w, 'rapid');
    for (let i = 0; i < 600; i++) stepGame(w, DT, idle());
    expect(weaponTimeLeft(w)).toBeCloseTo(15, 3);
    equipWeapon(w, 'rapid');
    expect(weaponTimeLeft(w)).toBe(WEAPON_DURATION);
    equipWeapon(w, 'orbit');
    expect(currentWeapon(w)).toBe('orbit');
    expect(liveStyle(w.bullets, STYLE_ORBIT)).toBe(4);
    equipWeapon(w, 'pierce');
    expect(liveStyle(w.bullets, STYLE_ORBIT)).toBe(0);
    for (let i = 0; i < 20 * 120 + 2; i++) stepGame(w, DT, idle());
    expect(currentWeapon(w)).toBe('spread');
  });

  it('death resets to spread, removes blades and tells the HUD', () => {
    const { w } = makeGame();
    const seen: WeaponKind[] = [];
    bus.on('hud:weapon', (p) => seen.push(p.kind));
    equipWeapon(w, 'orbit');
    killShip(w);
    expect(currentWeapon(w)).toBe('spread');
    expect(liveStyle(w.bullets, STYLE_ORBIT)).toBe(0);
    expect(seen).toEqual(['orbit', 'spread']);
  });

  it('hud:weapon is throttled to at most every 100 ms', () => {
    const { w } = makeGame();
    let n = 0;
    bus.on('hud:weapon', () => n++);
    equipWeapon(w, 'rapid');
    for (let i = 0; i < 120; i++) stepGame(w, DT, idle());
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(11);
  });
});

describe('turbo', () => {
  function bulletsPerSecond(kind: WeaponKind, scale: number): number {
    const { w } = makeGame();
    equipWeapon(w, kind);
    w.ship.fireRateScale = scale;
    const start = w.bullets.liveCount;
    for (let i = 0; i < 120; i++) stepShip(w, DT, aimAt(1, 0));
    return w.bullets.liveCount - start;
  }

  it('doubles the volley rate of every weapon', () => {
    for (const k of ['spread', 'rapid', 'pierce', 'orbit'] as const) {
      expect(bulletsPerSecond(k, 2)).toBe(2 * bulletsPerSecond(k, 1));
    }
    expect(bulletsPerSecond('rapid', 2)).toBe(104);
  });

  it('rapid under Turbo stays inside the 512 bullet pool', () => {
    const { w } = makeGame();
    setInvulnerable(w, true);
    gs(w).superCharge = 60;
    equipWeapon(w, 'rapid');
    const press = aimAt(1, 0);
    press.superPressed = true;
    stepGame(w, DT, press);
    expect(w.ship.fireRateScale).toBe(2);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      stepGame(w, DT, aimAt(Math.cos(i * 0.01), Math.sin(i * 0.01)));
      peak = Math.max(peak, w.bullets.liveCount);
    }
    expect(peak).toBeLessThan(BULLET_CAP);
    expect(peak).toBeGreaterThan(40);
    expect(w.bullets.dropped).toBe(0);
  });
});

describe('drop schedule', () => {
  function killLog(n: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) out.push({ x: (hash01(i, 1) - 0.5) * 1200, y: (hash01(i, 2) - 0.5) * 800 });
    return out;
  }

  function replay(level: Partial<LevelDef>): string[] {
    const { w } = makeGame(level);
    const out: string[] = [];
    killLog(200).forEach((k, i) => {
      const before = weaponState(w).dropIndex;
      onScoringKill(w, k.x, k.y);
      const id = livePickup(w);
      if (weaponState(w).dropIndex > before) out.push(`${i + 1}:${w.a[id] ?? -1}:${w.x[id]}:${w.y[id]}`);
      if (id > 0 && i % 7 === 0) collectPickup(w, id);
    });
    return out;
  }

  it('is identical across two runs of the same LevelDef and kill log', () => {
    const a = replay({ band: 3 });
    const b = replay({ band: 3 });
    expect(a.length).toBeGreaterThan(3);
    expect(a).toEqual(b);
  });

  it('first drop at kill 15, next at 40', () => {
    const { w } = makeGame();
    const at: number[] = [];
    for (let i = 1; i <= 70; i++) {
      const before = weaponState(w).dropIndex;
      onScoringKill(w, 0, 0);
      if (weaponState(w).dropIndex > before) {
        at.push(i);
        collectPickup(w, livePickup(w));
      }
    }
    expect(at).toEqual([15, 40, 65]);
  });

  it('a due drop waits while a pickup is live', () => {
    const { w } = makeGame();
    for (let i = 0; i < 15; i++) onScoringKill(w, 0, 0);
    const first = livePickup(w);
    expect(first).toBeGreaterThan(0);
    w.t[first] = 1e6; // keep it alive past kill 40
    for (let i = 15; i < 45; i++) onScoringKill(w, 0, 0);
    expect(weaponState(w).dropIndex).toBe(1);
    collectPickup(w, first);
    onScoringKill(w, 50, 60);
    const second = livePickup(w);
    expect(weaponState(w).dropIndex).toBe(2);
    expect([w.x[second], w.y[second]]).toEqual([50, 60]);
  });

  it('real scoring kills drive the counter and drop at the kill position', () => {
    const { w } = makeGame();
    const ids: number[] = [];
    for (let i = 0; i < 15; i++) ids.push(put(w, grunt.def, -300 + i * 40, 200));
    for (const id of ids) killEnemy(w, id, true);
    const p = livePickup(w);
    expect(p).toBeGreaterThan(0);
    expect(w.x[p]).toBeCloseTo(-300 + 14 * 40);
    expect(w.y[p]).toBeCloseTo(200);
    expect(w.radius[p]).toBe(PICKUP_RADIUS);
    expect(w.t[p]).toBe(PICKUP_LIFE);
    expect(w.a[p]).toBe(1); // band 1 pool: rapid
  });

  it('unscored removals do not count', () => {
    const { w } = makeGame();
    for (let i = 0; i < 20; i++) killEnemy(w, put(w, grunt.def, 0, 300), false);
    expect(weaponState(w).kills).toBe(0);
  });
});

describe('pool by band', () => {
  it('band 1 rapid; band 2 rapid and pierce; bands 3, 4 and Endless all three', () => {
    expect(weaponPool(1, false)).toEqual(['rapid']);
    expect(weaponPool(2, false)).toEqual(['rapid', 'pierce']);
    expect(weaponPool(3, false)).toEqual(['rapid', 'pierce', 'orbit']);
    expect(weaponPool(4, false)).toEqual(['rapid', 'pierce', 'orbit']);
    expect(weaponPool(1, true)).toEqual(['rapid', 'pierce', 'orbit']);
  });

  it('no immediate repeat when the pool has more than one weapon', () => {
    const pool = weaponPool(4, false);
    let prev: WeaponKind | null = null;
    const seen = new Set<WeaponKind>();
    for (let i = 0; i < 60; i++) {
      const k = chooseDrop(0xabc, i, pool, prev);
      expect(k).not.toBe(prev);
      seen.add(k);
      prev = k;
    }
    expect(seen.size).toBe(3);
    expect(chooseDrop(5, 0, weaponPool(1, false), 'rapid')).toBe('rapid');
  });

  it('drops in a band 2 level are only rapid or pierce', () => {
    const { w } = makeGame({ band: 2 });
    const got = new Set<number>();
    for (let i = 0; i < 300; i++) {
      onScoringKill(w, 0, 0);
      const id = livePickup(w);
      if (id > 0) {
        got.add(w.a[id] ?? -1);
        collectPickup(w, id);
      }
    }
    expect([...got].sort()).toEqual([1, 2]);
  });
});

describe('pickup entity', () => {
  it('collects within 28 u, equips, emits fx:pickup and hud:weapon', () => {
    const { w } = makeGame();
    const fx: WeaponKind[] = [];
    const hud: WeaponKind[] = [];
    bus.on('fx:pickup', (p) => fx.push(p.weapon));
    bus.on('hud:weapon', (p) => hud.push(p.kind));
    for (let i = 0; i < 15; i++) onScoringKill(w, 27, 0);
    stepGame(w, DT, idle());
    expect(livePickup(w)).toBe(-1);
    expect(currentWeapon(w)).toBe('rapid');
    expect(fx).toEqual(['rapid']);
    expect(hud[0]).toBe('rapid');
  });

  it('stays out of reach beyond 28 u and expires after 8 s', () => {
    const { w } = makeGame();
    for (let i = 0; i < 15; i++) onScoringKill(w, 300, 0);
    for (let i = 0; i < 7.9 * 120; i++) stepGame(w, DT, idle());
    expect(livePickup(w)).toBeGreaterThan(0);
    for (let i = 0; i < 0.2 * 120; i++) stepGame(w, DT, idle());
    expect(livePickup(w)).toBe(-1);
    expect(currentWeapon(w)).toBe('spread');
  });

  it('bombs and ship death leave it alone', () => {
    const { w } = makeGame();
    for (let i = 0; i < 15; i++) onScoringKill(w, 300, 0);
    const id = livePickup(w);
    expect(triggerBomb(w)).toBe(true);
    expect(livePickup(w)).toBe(id);
    killShip(w);
    expect(livePickup(w)).toBe(id);
  });

  it('setWeaponPickups(false) spawns nothing and stops the counter', () => {
    const { w } = makeGame();
    setWeaponPickups(w, false);
    for (let i = 0; i < 200; i++) onScoringKill(w, 0, 0);
    expect(livePickup(w)).toBe(-1);
    expect(weaponState(w).kills).toBe(0);
    for (let i = 1; i < w.cap; i++) expect(w.kind[i]).not.toBe(Kind.WeaponPickup);
  });

  it('level end clears it', () => {
    const { w } = makeGame({ objective: { kind: 'survive', durationSec: 1 } });
    setInvulnerable(w, true);
    for (let i = 0; i < 15; i++) onScoringKill(w, 300, 0);
    expect(livePickup(w)).toBeGreaterThan(0);
    for (let i = 0; i < 130; i++) stepGame(w, DT, idle());
    expect(gameState(w).outcome).toBe('won');
    expect(livePickup(w)).toBe(-1);
  });
});
