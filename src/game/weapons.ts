// Weapon styles and the pickup drop schedule (docs/11 SPEC 3.5, docs/10 "Design: weapons").
// Spread is the v1 weapon and the default; rapid, pierce and orbit come from pickups dropped by
// scoring kills and last 20 s. Weapon state lives in a WeakMap keyed by the World, so this module
// imports World as a type only (world.ts imports ship.ts, which imports this file).
// Determinism: the drop choice is hash01(level.seed, dropIndex). No PRNG, no LevelDef field.
// Nothing here allocates per step.
import { bus, type WeaponKind } from '../core/events';
import { hash01 } from '../core/rng';
import {
  armPierce,
  BULLET_LIFE,
  BULLET_SPEED,
  BULLET_SPEED_MAX,
  fireSpread,
  killBullet,
  MUZZLE_OFFSET,
  spawnBullet,
  STYLE_ORBIT,
  STYLE_RAPID,
} from './bullets';
import type { World } from './world';

export interface WeaponSpec {
  kind: WeaponKind;
  /** BulletPool.style written for this weapon's bullets (orbit: the blades). */
  style: number;
  /** Volleys per second before Turbo. */
  rate: number;
  /** Bullet speed before the ship velocity term, u/s. */
  speed: number;
  /** Collision radius, u (orbit: the blade). */
  radius: number;
  /** Bullet life, s (orbit: the forward bullet; blades live for the weapon duration). */
  life: number;
}

/** Starting values from the docs/10 weapons table. */
export const WEAPONS: Readonly<Record<WeaponKind, WeaponSpec>> = {
  spread: { kind: 'spread', style: 0, rate: 12, speed: BULLET_SPEED, radius: 4, life: BULLET_LIFE },
  rapid: { kind: 'rapid', style: 1, rate: 26, speed: 1500, radius: 3, life: 1.0 },
  pierce: { kind: 'pierce', style: 2, rate: 8, speed: 1600, radius: 6, life: 1.0 },
  orbit: { kind: 'orbit', style: 3, rate: 6, speed: BULLET_SPEED, radius: 7, life: BULLET_LIFE },
};

/** Index order matches BulletPool.style and the pickup's w.a value (1 rapid, 2 pierce, 3 orbit). */
export const WEAPON_KINDS: readonly WeaponKind[] = ['spread', 'rapid', 'pierce', 'orbit'];

export const WEAPON_DURATION = 20;
export const FIRST_DROP_KILL = 15;
export const DROP_EVERY = 25;
export const RAPID_OFFSET = 5;
export const ORBIT_BLADES = 4;
export const ORBIT_RADIUS = 80;
export const ORBIT_REV_PER_SEC = 2.4;
export const BLADE_COOLDOWN = 0.12;
export const HUD_WEAPON_INTERVAL = 0.1;

const POOL_BAND1: readonly WeaponKind[] = ['rapid'];
const POOL_BAND2: readonly WeaponKind[] = ['rapid', 'pierce'];
const POOL_FULL: readonly WeaponKind[] = ['rapid', 'pierce', 'orbit'];

/** Pure: drop pool for a band. Bands 3, 4 and Endless share the full pool. */
export function weaponPool(band: number, endless: boolean): readonly WeaponKind[] {
  if (endless || band >= 3) return POOL_FULL;
  return band === 2 ? POOL_BAND2 : POOL_BAND1;
}

/**
 * Pure: the weapon for drop dropIndex. pool[floor(hash01(seed, dropIndex) x len)], stepping one
 * place on when it equals the previous drop (impossible to avoid in a pool of one).
 */
export function chooseDrop(seed: number, dropIndex: number, pool: readonly WeaponKind[], previous: WeaponKind | null): WeaponKind {
  const n = pool.length;
  if (n === 0) return 'spread';
  let i = Math.min(n - 1, Math.floor(hash01(seed, dropIndex) * n));
  if (n > 1 && pool[i] === previous) i = (i + 1) % n;
  return pool[i] ?? 'spread';
}

/** Index of a weapon kind (BulletPool.style, pickup w.a). */
export function weaponIndex(kind: WeaponKind): number {
  return WEAPONS[kind].style;
}

/** Weapon kind for an index, spread when out of range. */
export function weaponAt(index: number): WeaponKind {
  return WEAPON_KINDS[index] ?? 'spread';
}

export interface DropCounter {
  /** Scoring kills counted while pickups are on. */
  kills: number;
  /** Kill count at which the next drop falls due. */
  nextDropAt: number;
  /** A drop fell due while a pickup was live; it spawns at the next kill with none live. */
  pending: boolean;
}

/** Pure: count one scoring kill. Drops fall due at kill 15, 40, 65 and so on; at most one waits. */
export function countKill(c: DropCounter): void {
  c.kills++;
  if (c.kills >= c.nextDropAt) {
    c.pending = true;
    c.nextDropAt += DROP_EVERY;
  }
}

export interface WeaponState extends DropCounter {
  kind: WeaponKind;
  /** Seconds left on a non spread weapon. */
  timer: number;
  /** Settings "Weapon pickups". Off: no pickups spawn and the counter does not run. */
  pickupsOn: boolean;
  /** Drops spawned so far (the hash01 index). */
  dropIndex: number;
  /** Weapon of the previous drop, null before the first. */
  lastDrop: WeaponKind | null;
  /** Live pickup entity id, -1 for none (validate against w.kind before use). */
  pickupId: number;
  /** Pool bullet id per orbit blade, -1 for none. */
  blades: Int32Array;
  /** Seconds until each blade may damage again. */
  bladeCool: Float32Array;
  orbitPhase: number;
  hudTimer: number;
  hud: { kind: WeaponKind; remaining: number; total: number };
  pickupFx: { x: number; y: number; weapon: WeaponKind };
}

function createWeaponState(): WeaponState {
  return {
    kind: 'spread',
    timer: 0,
    pickupsOn: true,
    kills: 0,
    nextDropAt: FIRST_DROP_KILL,
    pending: false,
    dropIndex: 0,
    lastDrop: null,
    pickupId: -1,
    blades: new Int32Array(ORBIT_BLADES).fill(-1),
    bladeCool: new Float32Array(ORBIT_BLADES),
    orbitPhase: 0,
    hudTimer: 0,
    hud: { kind: 'spread', remaining: 0, total: WEAPON_DURATION },
    pickupFx: { x: 0, y: 0, weapon: 'spread' },
  };
}

const states = new WeakMap<World, WeaponState>();

/** Weapon state for a world, created on first use. */
export function weaponState(w: World): WeaponState {
  let s = states.get(w);
  if (s === undefined) {
    s = createWeaponState();
    states.set(w, s);
  }
  return s;
}

/** Settings port (default on). Off also cancels a waiting drop; a live pickup runs out normally. */
export function setWeaponPickups(w: World, on: boolean): void {
  const s = weaponState(w);
  s.pickupsOn = on;
  if (!on) s.pending = false;
}

export function currentWeapon(w: World): WeaponKind {
  return weaponState(w).kind;
}

/** Seconds left on the current weapon, 0 for spread. */
export function weaponTimeLeft(w: World): number {
  const s = weaponState(w);
  return s.kind === 'spread' ? 0 : s.timer;
}

/** Volleys per second of the current weapon before Turbo. Spread returns the v1 12. */
export function weaponRate(w: World): number {
  return WEAPONS[weaponState(w).kind].rate;
}

/** Emit 'hud:weapon' now and restart the 100 ms throttle. The payload object is reused. */
export function emitWeaponHud(w: World): void {
  const s = weaponState(w);
  s.hud.kind = s.kind;
  s.hud.remaining = s.kind === 'spread' ? 0 : Math.max(0, s.timer);
  s.hud.total = WEAPON_DURATION;
  s.hudTimer = HUD_WEAPON_INTERVAL;
  bus.emit('hud:weapon', s.hud);
}

function removeBlades(w: World): void {
  const s = weaponState(w);
  const p = w.bullets;
  for (let i = 0; i < ORBIT_BLADES; i++) {
    const b = s.blades[i] ?? -1;
    if (b >= 0 && p.alive[b] === 1 && p.style[b] === STYLE_ORBIT) killBullet(p, b);
    s.blades[i] = -1;
    s.bladeCool[i] = 0;
  }
}

/** Collect a weapon: the same weapon refreshes the timer, a different one replaces it. */
export function equipWeapon(w: World, kind: WeaponKind): void {
  const s = weaponState(w);
  if (kind === 'spread') {
    resetWeapon(w);
    return;
  }
  s.timer = WEAPON_DURATION;
  if (s.kind !== kind) {
    if (s.kind === 'orbit') removeBlades(w);
    s.kind = kind;
    if (kind === 'orbit') {
      s.orbitPhase = 0;
      placeBlades(w);
    }
  }
  emitWeaponHud(w);
}

/** Back to spread (timer out, ship death). Emits 'hud:weapon' only on change. */
export function resetWeapon(w: World): void {
  const s = weaponState(w);
  if (s.kind === 'orbit') removeBlades(w);
  const changed = s.kind !== 'spread';
  s.kind = 'spread';
  s.timer = 0;
  if (changed) emitWeaponHud(w);
}

/** Ship speed along the aim added to base, clamped to [0, max(BULLET_SPEED_MAX, base)]. */
function muzzleSpeed(w: World, ax: number, ay: number, base: number): number {
  const along = (w.vx[0] ?? 0) * ax + (w.vy[0] ?? 0) * ay;
  const cap = base > BULLET_SPEED_MAX ? base : BULLET_SPEED_MAX;
  let speed = base + along;
  if (speed > cap) speed = cap;
  if (speed < 0) speed = 0;
  return speed;
}

function fireRapid(w: World, x: number, y: number, aim: number): void {
  const spec = WEAPONS.rapid;
  const ax = Math.cos(aim);
  const ay = Math.sin(aim);
  const speed = muzzleSpeed(w, ax, ay, spec.speed);
  const mx = x + ax * MUZZLE_OFFSET;
  const my = y + ay * MUZZLE_OFFSET;
  // Perpendicular to the aim is (-ay, ax).
  for (let k = -1; k <= 1; k += 2) {
    const ox = -ay * RAPID_OFFSET * k;
    const oy = ax * RAPID_OFFSET * k;
    const id = spawnBullet(w.bullets, mx + ox, my + oy, ax * speed, ay * speed, spec.life);
    if (id >= 0) w.bullets.style[id] = STYLE_RAPID;
  }
}

function firePierce(w: World, x: number, y: number, aim: number): void {
  const spec = WEAPONS.pierce;
  const ax = Math.cos(aim);
  const ay = Math.sin(aim);
  const speed = muzzleSpeed(w, ax, ay, spec.speed);
  const id = spawnBullet(w.bullets, x + ax * MUZZLE_OFFSET, y + ay * MUZZLE_OFFSET, ax * speed, ay * speed, spec.life);
  if (id >= 0) armPierce(w.bullets, id);
}

/** Orbit's forward shot: one bullet straight along the aim, style 0 so render draws a normal bullet. */
function fireOrbitForward(w: World, x: number, y: number, aim: number): void {
  const spec = WEAPONS.orbit;
  const ax = Math.cos(aim);
  const ay = Math.sin(aim);
  const speed = muzzleSpeed(w, ax, ay, spec.speed);
  spawnBullet(w.bullets, x + ax * MUZZLE_OFFSET, y + ay * MUZZLE_OFFSET, ax * speed, ay * speed, spec.life);
}

/** One volley of the current weapon from the ship at (x, y). Spread is exactly fireSpread. */
export function fireWeapon(w: World, x: number, y: number, aim: number): void {
  switch (weaponState(w).kind) {
    case 'spread':
      fireSpread(w, x, y, aim);
      return;
    case 'rapid':
      fireRapid(w, x, y, aim);
      return;
    case 'pierce':
      firePierce(w, x, y, aim);
      return;
    case 'orbit':
      fireOrbitForward(w, x, y, aim);
      return;
  }
}

/**
 * Place the four blades around the ship at orbitPhase, 90 degrees apart, spawning any that are
 * missing (pool full earlier). prevX and prevY keep the last spot for render interpolation.
 */
export function placeBlades(w: World): void {
  const s = weaponState(w);
  const p = w.bullets;
  const sx = w.x[0] ?? 0;
  const sy = w.y[0] ?? 0;
  const omega = ORBIT_REV_PER_SEC * 2 * Math.PI;
  for (let i = 0; i < ORBIT_BLADES; i++) {
    const a = s.orbitPhase + (i * Math.PI) / 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const x = sx + c * ORBIT_RADIUS;
    const y = sy + sn * ORBIT_RADIUS;
    let b = s.blades[i] ?? -1;
    if (b < 0 || p.alive[b] !== 1 || p.style[b] !== STYLE_ORBIT) {
      b = spawnBullet(p, x, y, 0, 0, s.timer);
      s.blades[i] = b;
      if (b < 0) continue;
      p.style[b] = STYLE_ORBIT;
      s.bladeCool[i] = 0;
    } else {
      p.prevX[b] = p.x[b] ?? x;
      p.prevY[b] = p.y[b] ?? y;
      p.x[b] = x;
      p.y[b] = y;
    }
    p.phase[b] = a;
    p.vx[b] = -sn * omega * ORBIT_RADIUS;
    p.vy[b] = c * omega * ORBIT_RADIUS;
    p.life[b] = s.timer;
  }
}

/** Weapon timer, orbit blades and the throttled 'hud:weapon'. Call after stepWorld. */
export function stepWeapons(w: World, dt: number): void {
  const s = weaponState(w);
  if (s.kind === 'spread') return;
  s.timer -= dt;
  if (s.timer <= 1e-9) {
    resetWeapon(w);
    return;
  }
  if (s.kind === 'orbit' && w.ship.active) {
    s.orbitPhase = (s.orbitPhase + ORBIT_REV_PER_SEC * 2 * Math.PI * dt) % (2 * Math.PI);
    placeBlades(w);
  }
  s.hudTimer -= dt;
  if (s.hudTimer <= 0) emitWeaponHud(w);
}
