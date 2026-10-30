// Boss core (docs/12 wave V3-A "Design: the boss rules", docs/13 SPEC 3.4 boss rules 1 to 13).
// Owns the schedule (spawn at boss.atSec on the wave clock), the 2.0 s entrance, damage routing and
// the counter window, phases, enrage, the bomb stagger, Detonate, ship death, death and reward, the
// hazard, part and add helpers every boss composes, the fairness rules, and the boss bus events.
// Every entry point returns at once in a world with no boss state, so a boss free run is bit
// identical to v2.1 (the Off invariant). Nothing here allocates per step. Vectors between two
// entities come from steer.ts (boss rule 15); kit.ts takes plain numbers.
import { bus } from '../../core/events';
import { isInside } from '../arena';
import { STYLE_ORBIT, STYLE_PIERCE, STYLE_RAPID } from '../bullets';
import { emitHit, emitKill } from '../combat';
import type { EnemyDef } from '../enemies/types';
import { pullRetain } from '../enemies/gravitywell';
import { spawnGeoms } from '../geoms';
import { killShip } from '../player';
import { removeEntity } from '../remove';
import { bossBonus } from '../scoring';
import { SHIP_RADIUS } from '../ship';
import { countWaveEnemies, TELEGRAPH_SEC } from '../spawner';
import { gs, spawnFromDef } from '../state';
import { angleBetween, distBetween, moveTo } from '../steer';
import { Kind, spawn, type World } from '../world';
import type { BossSpec } from '../../levelgen/leveldef';
import {
  circlesOverlap,
  clampLaneHalfWidth,
  clampRingGapHalf,
  clampSweepArms,
  hazardHits,
  hazardTelegraph,
  pullSpeed,
  wrapPi,
} from './kit';
import { cancelVolley, stepVolleyLaunch } from './shots';
import { armState, bossOf, type BossState } from './state';
import {
  BOSS_DAMAGE,
  BOSS_HUD_INTERVAL,
  BOSS_REWARD_GEOMS,
  DETONATE_BOSS_FRACTION,
  DETONATE_BOSS_RADIUS,
  ENRAGE_AFTER_SEC,
  ENRAGE_RATE,
  ENTRANCE_SEC,
  HAZARD,
  MAX_ADDS,
  MAX_HAZARDS,
  MAX_PARTS,
  maxHpFor,
  PHASE_CHANGE_SEC,
  STAGGER_SEC,
  WAVE_BUDGET_WITH_BOSS,
} from './table';
import { BossMode, HazardType, type BossDef } from './types';

/** spawnHazard result when the hazard would be created on the ship: wait 0.3 s and recheck. */
export const HAZARD_OVERLAP = -2;

// ---------------------------------------------------------------------------------------------
// Schedule and status

/** Arm a boss: its entrance starts once the wave clock reaches atSec. */
export function armBoss(w: World, spec: BossSpec, def: BossDef, atSec: number): BossState {
  return armState(w, spec, def, atSec);
}

/** True while a boss is on the field (entrance included). */
export function bossAlive(w: World): boolean {
  const bs = bossOf(w);
  return bs !== null && bs.status === 'alive';
}

/** True while this level's boss is scheduled or alive: the objective cannot complete yet. */
export function bossPending(w: World): boolean {
  const bs = bossOf(w);
  return bs !== null && bs.status !== 'defeated';
}

/** True once this level's boss died through the boss rules (a removal outside them does not count). */
export function bossSlain(w: World): boolean {
  const bs = bossOf(w);
  return bs !== null && bs.status === 'defeated' && bs.slain;
}

/** True while the objective holds for the boss (HUD: "Defeat the boss"). */
export function bossHolding(w: World): boolean {
  const bs = bossOf(w);
  return bs !== null && bs.hold && bs.status !== 'defeated';
}

/** Enter the hold state (boss rule 9): waves stop, the boss enrages, an unspawned boss enters now. */
export function setBossHold(w: World): void {
  const bs = bossOf(w);
  if (bs !== null && bs.status !== 'defeated') bs.hold = true;
}

/** Score bonus the boss kill awarded, 0 before the kill or with no boss (results screen line). */
export function bossBonusAwarded(w: World): number {
  const bs = bossOf(w);
  return bs === null || bs.status !== 'defeated' ? 0 : bs.bonus;
}

/** True while the boss attacks 30 percent faster (alive 90 s, or the hold). */
export function bossEnraged(w: World): boolean {
  const bs = bossOf(w);
  return bs !== null && bs.status === 'alive' && (bs.hold || bs.age >= ENRAGE_AFTER_SEC);
}

/**
 * Wave clock stop: the hold state, or an Endless boss alive (docs/13 Endless cadence). The spawner
 * neither advances the clock nor spawns while this is true.
 */
export function waveClockHeld(w: World): boolean {
  const bs = bossOf(w);
  if (bs === null || bs.status === 'defeated') return false;
  if (bs.hold) return true;
  return bs.status === 'alive' && gs(w).mode === 'endless';
}

/**
 * Wave thinning (boss rule 4): while an Adventure boss lives the schedule keeps WAVE_BUDGET_WITH_BOSS
 * of its entries, chosen by an even accumulator (3 of every 5 at 0.6). No PRNG.
 */
export function keepScheduledEntry(w: World): boolean {
  const bs = bossOf(w);
  if (bs === null || bs.status !== 'alive') return true;
  bs.budgetAcc += WAVE_BUDGET_WITH_BOSS;
  if (bs.budgetAcc >= 1 - 1e-9) {
    bs.budgetAcc -= 1;
    return true;
  }
  return false;
}

/** Pure: 1 based phase for hp of maxHp. Phase k starts below (phases - k + 1) / phases of maxHp. */
export function phaseFor(hp: number, maxHp: number, phases: number): number {
  if (phases <= 1 || !(maxHp > 0)) return 1;
  let p = 1;
  for (let j = 1; j < phases; j++) if (hp < (maxHp * (phases - j)) / phases) p = j + 1;
  return p;
}

/** Pure: angle of the entrance ray from the arena centre, away from the ship at (sx, sy). */
export function entryAngle(sx: number, sy: number): number {
  if (sx * sx + sy * sy < 1) return -Math.PI / 2;
  return Math.atan2(-sy, -sx);
}

/** Farthest distance along the ray at angle a from the arena centre where a body of radius r fits. */
export function wallDistance(w: World, a: number, r: number): number {
  const arena = w.level.arena;
  const c = Math.cos(a);
  const s = Math.sin(a);
  let lo = 0;
  let hi = Math.max(arena.width, arena.height);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (isInside(arena, c * mid, s * mid, r)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function zeroExtras(w: World, id: number): void {
  const g = gs(w);
  g.tele[id] = 0;
  g.aux[id] = 0;
  g.pvx[id] = 0;
  g.pvy[id] = 0;
}

/** Spawn the boss at the wall point farthest from the ship. False when the world is full (retried). */
function spawnBoss(w: World, bs: BossState): boolean {
  const r = bs.row.radius;
  const a = entryAngle(w.x[0] ?? 0, w.y[0] ?? 0);
  const d = wallDistance(w, a, r);
  let home = bs.def.entryHome(d);
  if (!(home >= 0)) home = 0;
  if (home > d) home = d;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const id = spawn(w, Kind.Boss, c * d, s * d);
  if (id < 0) return false;
  zeroExtras(w, id);
  w.radius[id] = r;
  w.rot[id] = wrapPi(a + Math.PI);
  bs.maxHp = maxHpFor(bs.row, bs.spec.hpMul);
  w.hp[id] = bs.maxHp;
  bs.id = id;
  bs.status = 'alive';
  bs.mode = BossMode.Entering;
  bs.viewMode = BossMode.Entering;
  bs.modeT = 0;
  bs.enterT = 0;
  bs.age = 0;
  bs.phase = 1;
  bs.open = false;
  bs.stagger = 0;
  bs.phaseT = 0;
  bs.retry = 0;
  bs.entryX = c * d;
  bs.entryY = s * d;
  bs.homeX = c * home;
  bs.homeY = s * home;
  bus.emit('sim:bossEnter', bs.enterEv);
  return true;
}

function viewModeOf(bs: BossState): BossMode {
  if (bs.mode === BossMode.Entering) return BossMode.Entering;
  if (bs.stagger > 0) return BossMode.Stunned;
  if (bs.phaseT > 0) return BossMode.PhaseChange;
  return bs.mode;
}

function emitBossHud(w: World, bs: BossState, dt: number, force: boolean): void {
  bs.hudTimer -= dt;
  const hp = bs.id > 0 ? (w.hp[bs.id] ?? 0) : 0;
  const changed = hp !== bs.hudHp || bs.phase !== bs.hudPhase || bs.viewMode !== bs.hudMode;
  if (!changed || (!force && bs.hudTimer > 0)) return;
  bs.hudTimer = BOSS_HUD_INTERVAL;
  bs.hudHp = hp;
  bs.hudPhase = bs.phase;
  bs.hudMode = bs.viewMode;
  const e = bs.hudEv;
  e.hp = hp;
  e.maxHp = bs.maxHp;
  e.phase = bs.phase;
  e.phases = bs.row.phases;
  e.mode = bs.viewMode;
  bus.emit('hud:boss', e);
}

/**
 * Schedule, view mode and hud:boss. Call once per step after stepSpawner. Spawns the boss when the
 * wave clock reaches atSec (or at once in the hold), retrying while the world is full.
 */
export function stepBossSchedule(w: World, dt: number): void {
  const bs = bossOf(w);
  if (bs === null) return;
  const g = gs(w);
  if (bs.status === 'waiting') {
    const due = g.outcome === 'running' && w.ship.active && (g.waveClock >= bs.atSec || bs.hold);
    if (!due || !spawnBoss(w, bs)) return;
  } else if (bs.status !== 'alive') {
    return;
  }
  const id = bs.id;
  if (id <= 0 || w.alive[id] !== 1 || w.kind[id] !== Kind.Boss) {
    // Removed outside the boss rules (a test clearing the world): no reward, no event.
    bs.status = 'defeated';
    bs.id = -1;
    return;
  }
  const m = viewModeOf(bs);
  if (m !== bs.viewMode) {
    bs.viewMode = m;
    bs.modeT = 0;
  } else {
    bs.modeT += dt;
  }
  stepExposed(bs, dt);
  stepVolleyLaunch(w, bs); // fx:bossShot at launch (shooters only; no op with no volley charging)
  emitBossHud(w, bs, dt, false);
}

// ---------------------------------------------------------------------------------------------
// Entity steps (registered in index.ts)

function smooth(u: number): number {
  const v = u < 0 ? 0 : u > 1 ? 1 : u;
  return v * v * (3 - 2 * v);
}

/** Kind.Boss step: the entrance slide, then the def's cycle unless paused, staggered or changing phase. */
export function stepBossEntity(w: World, id: number, dt: number): void {
  const bs = bossOf(w);
  if (bs === null || bs.id !== id || bs.status !== 'alive') {
    removeEntity(w, id);
    return;
  }
  if (bs.mode === BossMode.Entering) {
    bs.enterT += dt;
    const u = smooth(bs.enterT / ENTRANCE_SEC);
    moveTo(w, id, bs.entryX + (bs.homeX - bs.entryX) * u, bs.entryY + (bs.homeY - bs.entryY) * u);
    if (bs.enterT >= ENTRANCE_SEC) {
      bs.mode = BossMode.Attacking;
      bs.open = false;
      bs.def.reset(w, id, bs, true);
    }
    return;
  }
  // Boss rule 6: attacks pause during the respawn delay.
  if (!w.ship.active) return;
  bs.age += dt;
  if (bs.stagger > 0) {
    bs.stagger = bs.stagger - dt > 0 ? bs.stagger - dt : 0;
    return;
  }
  if (bs.phaseT > 0) {
    bs.phaseT = bs.phaseT - dt > 0 ? bs.phaseT - dt : 0;
    return;
  }
  const enraged = bs.hold || bs.age >= ENRAGE_AFTER_SEC;
  bs.def.step(w, id, bs, dt, enraged ? dt * ENRAGE_RATE : dt);
}

/** Kind.BossPart step: a pulse clock only. The boss positions its parts. Orphans are removed. */
export function stepPart(w: World, id: number, dt: number): void {
  const bs = bossOf(w);
  if (bs === null || bs.status !== 'alive') {
    removeEntity(w, id);
    return;
  }
  w.t[id] = (w.t[id] ?? 0) + dt;
}

/** Kind.BossHazard step: age, follow the body, grow a ring or turn a sweep once lethal, expire. */
export function stepHazard(w: World, id: number, dt: number): void {
  const bs = bossOf(w);
  if (bs === null || bs.status !== 'alive') {
    removeEntity(w, id);
    return;
  }
  const t = (w.t[id] ?? 0) + dt;
  w.t[id] = t;
  const boss = bs.id;
  if (bs.hzFollow[id] === 1 && boss > 0 && w.alive[boss] === 1) {
    w.x[id] = w.x[boss] ?? 0;
    w.y[id] = w.y[boss] ?? 0;
  }
  if (t >= (bs.hzTele[id] ?? 0)) {
    const type = w.a[id] ?? -1;
    const rate = bs.hzRate[id] ?? 0;
    if (type === HazardType.Ring) {
      const r = (w.radius[id] ?? 0) + rate * dt;
      if (r <= 0) {
        removeEntity(w, id);
        return;
      }
      w.radius[id] = r;
    } else if (type === HazardType.Sweep) {
      w.rot[id] = wrapPi((w.rot[id] ?? 0) + rate * dt);
    }
  }
  const life = bs.hzLife[id] ?? -1;
  if (life >= 0) {
    const left = life - dt;
    if (left <= 0) {
      removeEntity(w, id);
      return;
    }
    bs.hzLife[id] = left;
  }
}

// ---------------------------------------------------------------------------------------------
// Contacts and the pull

/** True when the hazard at id is past its telegraph and its geometry covers the point (px, py). */
export function hazardLethalAt(w: World, bs: BossState, id: number, px: number, py: number): boolean {
  if (bs.hzMarker[id] === 1 || (w.t[id] ?? 0) < (bs.hzTele[id] ?? 0)) return false;
  return hazardHits(w.a[id] ?? -1, px, py, SHIP_RADIUS, w.x[id] ?? 0, w.y[id] ?? 0, w.rot[id] ?? 0, w.radius[id] ?? 0, w.vx[id] ?? 0, w.vy[id] ?? 0);
}

/**
 * Ship against the boss body, lethal hazards and pulls. Call after shipHits. Honours respawn
 * invulnerability and the stress scene flag (fairness rule 5). Returns true if the ship died.
 */
export function bossContacts(w: World, dt: number): boolean {
  const bs = bossOf(w);
  if (bs === null || bs.status !== 'alive' || !w.ship.active) return false;
  const g = gs(w);
  const sx = w.x[0] ?? 0;
  const sy = w.y[0] ?? 0;
  const blend = 1 - pullRetain(dt);
  for (let h = 1; h < w.cap; h++) {
    if (w.alive[h] !== 1 || w.kind[h] !== Kind.BossHazard || w.a[h] !== HazardType.Pull) continue;
    // A pull stores its strength (u/s at the centre) in hzRate (Gravitas weakens it per anchor).
    const v = pullSpeed(distBetween(w, h, 0), w.radius[h] ?? 0, bs.hzRate[h] ?? HAZARD.pullMax);
    if (v <= 0) continue;
    const a = angleBetween(w, 0, h);
    g.shipPullX += Math.cos(a) * v * blend;
    g.shipPullY += Math.sin(a) * v * blend;
  }
  if (w.ship.invuln > 0 || g.invulnerable) return false;
  const id = bossHittable(w);
  if (id > 0 && circlesOverlap(sx, sy, SHIP_RADIUS, w.x[id] ?? 0, w.y[id] ?? 0, w.radius[id] ?? 0)) {
    killShip(w);
    return true;
  }
  for (let h = 1; h < w.cap; h++) {
    if (w.alive[h] !== 1 || w.kind[h] !== Kind.BossHazard) continue;
    if (hazardLethalAt(w, bs, h, sx, sy)) {
      killShip(w);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Damage routing

/** Live boss id that bullets, blades, the drone and the ship can touch: alive and past the entrance. */
export function bossHittable(w: World): number {
  const bs = bossOf(w);
  if (bs === null || bs.status !== 'alive' || bs.mode === BossMode.Entering) return -1;
  const id = bs.id;
  return id > 0 && w.alive[id] === 1 && w.kind[id] === Kind.Boss ? id : -1;
}

/** Drone, homing and Ram targets beyond isTargetable: the hittable boss and every live part. */
export function isBossTarget(w: World, id: number): boolean {
  const k = w.kind[id] ?? 0;
  if (k === Kind.BossPart) return w.alive[id] === 1;
  if (k === Kind.Boss) return bossHittable(w) === id;
  return false;
}

/** True when a circle at (x, y) of radius r touches the boss body (direct test, the body is too big for the grid). */
export function bossBodyContact(w: World, boss: number, x: number, y: number, r: number): boolean {
  return circlesOverlap(x, y, r, w.x[boss] ?? 0, w.y[boss] ?? 0, w.radius[boss] ?? 0);
}

/** BOSS_DAMAGE for a player bullet style. Drone shots are spread style and deal the same 10. */
export function bossDamageForStyle(style: number): number {
  if (style === STYLE_RAPID) return BOSS_DAMAGE.rapid;
  if (style === STYLE_PIERCE) return BOSS_DAMAGE.pierce;
  if (style === STYLE_ORBIT) return BOSS_DAMAGE.orbit;
  return BOSS_DAMAGE.spread;
}

/**
 * True when the core takes damage now: the def's counter window only. A bomb stagger never opens
 * a closed core (G3A ruling on docs/13 boss rule 7, "stays vulnerable" read as "keeps the
 * vulnerability it had"): the def does not step while staggered, so an open window stays open and
 * a closed one stays closed, and the bomb itself deals no damage.
 */
export function bossOpen(bs: BossState): boolean {
  return bs.open;
}

/** Pure: the exposed flag of the render and audio contract. */
export function exposedOf(status: string, mode: BossMode, open: boolean): boolean {
  return status === 'alive' && mode !== BossMode.Entering && open;
}

/** True while the boss core takes damage (render, audio and tests). False with no boss. */
export function bossExposed(w: World): boolean {
  const bs = bossOf(w);
  return bs !== null && bs.exposed;
}

/** Track the exposed flag and emit 'sim:bossExposed' on change. */
function stepExposed(bs: BossState, dt: number): void {
  const ex = exposedOf(bs.status, bs.mode, bossOpen(bs));
  if (ex === bs.exposed) {
    bs.exposedT += dt;
    return;
  }
  bs.exposed = ex;
  bs.exposedT = 0;
  bs.exposedEv.exposed = ex;
  bus.emit('sim:bossExposed', bs.exposedEv);
}

/**
 * Damage the boss by amount tenths of a hit from (hx, hy). A closed core blocks it ('fx:hit'
 * blocked true). ignoreShield is Detonate. Returns true if the boss died.
 */
export function damageBoss(w: World, amount: number, hx: number, hy: number, ignoreShield = false): boolean {
  const bs = bossOf(w);
  const id = bossHittable(w);
  if (bs === null || id < 0) return false;
  const g = gs(w);
  const gate = bs.def.gate;
  const through = ignoreShield || (bossOpen(bs) && (gate === undefined || gate(w, id, bs, hx, hy)));
  if (!(amount > 0) || !through) {
    emitHit(g, hx, hy, Kind.Boss, id, true);
    return false;
  }
  const clamp = bs.def.clampDamage;
  const amt = clamp === undefined ? Math.round(amount) : Math.round(clamp(w, id, bs, Math.round(amount)));
  const left = (w.hp[id] ?? 0) - (amt > 0 ? amt : 0);
  const hp = left > 0 ? left : 0;
  w.hp[id] = hp;
  if (hp <= 0) {
    defeatBoss(w, bs, id);
    return true;
  }
  emitHit(g, hx, hy, Kind.Boss, id, false);
  if (bs.def.afterDamage !== undefined) bs.def.afterDamage(w, id, bs);
  syncBossPhase(w, bs, bs.id);
  return false;
}

/**
 * Enter the phase the boss belongs in (the def's phaseOf, else from hit points) when it is past the
 * current one: the pause, 'sim:bossPhase' and the def's onPhase. Never lowers the phase.
 */
export function syncBossPhase(w: World, bs: BossState, id: number): void {
  if (bs.status !== 'alive' || id <= 0 || w.alive[id] !== 1) return;
  const hp = w.hp[id] ?? 0;
  const of = bs.def.phaseOf;
  let ph = of === undefined ? phaseFor(hp, bs.maxHp, bs.row.phases) : of(w, id, bs, hp);
  if (ph > bs.row.phases) ph = bs.row.phases;
  if (ph <= bs.phase) return;
  bs.phase = ph;
  bs.phaseT = PHASE_CHANGE_SEC;
  bs.phaseEv.phase = ph;
  bus.emit('sim:bossPhase', bs.phaseEv);
  bs.def.onPhase(w, id, bs, ph);
}

/** A boss body bursts at (x, y): the kill fx in the boss colour and the explosion sound. */
export function bossBurst(w: World, bs: BossState, x: number, y: number, id: number): void {
  emitKill(gs(w), x, y, bs.row.colour, Kind.BossPart, id);
  bus.emit('sfx', 'explode');
}

function partDamaged(w: World, bs: BossState | null, id: number, applied: number, broke: boolean): void {
  if (bs === null || bs.status !== 'alive') return;
  if (bs.def.onPartDamage !== undefined) bs.def.onPartDamage(w, bs, id, applied, broke);
  const boss = bossHittable(w);
  if (boss > 0) syncBossPhase(w, bs, boss);
}

/** Damage a boss part. Parts score 0, drop nothing and count 0 kills. Returns true if it broke. */
export function damageBossPart(w: World, id: number, amount: number, hx: number, hy: number): boolean {
  if (w.alive[id] !== 1 || w.kind[id] !== Kind.BossPart) return false;
  const g = gs(w);
  const prev = w.hp[id] ?? 0;
  const amt = Math.round(amount);
  const hp = prev - amt;
  w.hp[id] = hp;
  const bs = bossOf(w);
  const applied = amt <= 0 ? 0 : amt < prev ? amt : prev > 0 ? prev : 0;
  if (hp > 0) {
    emitHit(g, hx, hy, Kind.BossPart, id, false);
    partDamaged(w, bs, id, applied, false);
    return false;
  }
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  if (bs !== null) {
    for (let i = 0; i < bs.parts.length; i++) if (bs.parts[i] === id) bs.parts[i] = -1;
  }
  removeEntity(w, id);
  emitKill(g, x, y, bs === null ? 'white' : bs.row.colour, Kind.BossPart, id);
  bus.emit('sfx', 'explode');
  partDamaged(w, bs, id, applied, true);
  return true;
}

/** Detonate at (x, y): 10 percent of maximum hit points when the body is within 260 u. */
export function bossDetonate(w: World, x: number, y: number): boolean {
  const bs = bossOf(w);
  const id = bossHittable(w);
  if (bs === null || id < 0) return false;
  if (!bossBodyContact(w, id, x, y, DETONATE_BOSS_RADIUS)) return false;
  damageBoss(w, Math.round(bs.maxHp * DETONATE_BOSS_FRACTION), w.x[id] ?? 0, w.y[id] ?? 0, true);
  return true;
}

/** Bomb (boss rule 7): clear every boss hazard, stagger a hittable boss 1.5 s. No damage. */
export function bossOnBomb(w: World): void {
  const bs = bossOf(w);
  if (bs === null) return;
  clearHazards(w);
  cancelVolley(bs); // the bomb clears the bullets too (player.ts)
  if (bossHittable(w) > 0) bs.stagger = STAGGER_SEC;
}

/**
 * Ship death (boss rule 6): hazards are already cleared by killShip, the boss keeps its hit points
 * and its cycle restarts at its first state.
 */
export function bossOnShipDeath(w: World): void {
  const bs = bossOf(w);
  if (bs === null || bs.status !== 'alive') return;
  clearHazards(w);
  cancelVolley(bs); // killShip clears the bullets too
  bs.stagger = 0;
  bs.phaseT = 0;
  bs.retry = 0;
  if (bs.mode !== BossMode.Entering) bs.def.reset(w, bs.id, bs, false);
}

function defeatBoss(w: World, bs: BossState, id: number): void {
  const g = gs(w);
  const x = w.x[id] ?? 0;
  const y = w.y[id] ?? 0;
  clearHazards(w);
  clearParts(w, bs);
  cancelVolley(bs);
  bs.viewMode = BossMode.Dying;
  emitBossHud(w, bs, 0, true);
  removeEntity(w, id);
  bs.status = 'defeated';
  bs.id = -1;
  bs.open = false;
  bs.openLeft = -1;
  stepExposed(bs, 0); // a dead core is not exposed: 'sim:bossExposed' false if it was open
  bs.bonus = bossBonus(w.level.par, g.mode, bs.row.tier);
  bs.slain = true; // boss rule 9 (option 1): stepObjective reads this and ends an Adventure level won
  // The kill and its bonus go through the scoring port, so the port the HUD reads (Ledger) counts
  // the boss kill and the bonus too. The port returns the kill points only (base 0 for the boss);
  // the bonus is unmultiplied and the sim adds it itself, whatever the port does with it.
  g.score += g.scoring.awardKill(w, Kind.Boss, bs.bonus) + bs.bonus;
  g.kills++; // SPEC 3.6 rule 4: the boss counts 1 kill for a destroy objective
  spawnGeoms(w, x, y, BOSS_REWARD_GEOMS);
  bs.downEv.x = x;
  bs.downEv.y = y;
  bus.emit('sim:bossDown', bs.downEv);
  bus.emit('sfx', 'explode');
}

// ---------------------------------------------------------------------------------------------
// Hazards

/** Live boss hazards. */
export function countHazards(w: World): number {
  let n = 0;
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.BossHazard) n++;
  return n;
}

/** Remove every boss hazard. */
export function clearHazards(w: World): void {
  for (let i = 1; i < w.cap; i++) if (w.alive[i] === 1 && w.kind[i] === Kind.BossHazard) removeEntity(w, i);
}

/**
 * Create a hazard. Returns its id, HAZARD_OVERLAP when a lethal hazard would cover the ship now
 * (fairness rule 5: the caller waits 0.3 s and rechecks), or -1 at the hazard cap or a full world.
 */
export function spawnHazard(
  w: World,
  bs: BossState,
  type: HazardType,
  x: number,
  y: number,
  rot: number,
  radius: number,
  vx: number,
  vy: number,
  rate: number,
  life: number,
  follow: boolean,
): number {
  if (type !== HazardType.Pull && w.ship.active && hazardHits(type, w.x[0] ?? 0, w.y[0] ?? 0, SHIP_RADIUS, x, y, rot, radius, vx, vy)) {
    return HAZARD_OVERLAP;
  }
  if (countHazards(w) >= MAX_HAZARDS) return -1;
  const id = spawn(w, Kind.BossHazard, x, y);
  if (id < 0) return -1;
  zeroExtras(w, id);
  w.a[id] = type;
  w.rot[id] = rot;
  w.radius[id] = radius;
  w.vx[id] = vx;
  w.vy[id] = vy;
  w.hp[id] = 0;
  bs.hzTele[id] = type === HazardType.Pull ? 0 : hazardTelegraph(bs.row.tier);
  bs.hzRate[id] = rate;
  bs.hzLife[id] = life;
  bs.hzFollow[id] = follow ? 1 : 0;
  bs.hzMarker[id] = 0;
  return id;
}

/**
 * A lane marker: the thin dim telegraph of a lane from (x, y) along rot, removed just before its
 * telegraph ends, so it is never lethal and may cross the ship. It shows where a body charge will
 * go (Brood). Glow draws it as any lane telegraph. Returns the id, or -1 at the cap or a full world.
 */
export function spawnLaneMarker(w: World, bs: BossState, x: number, y: number, rot: number, length: number, halfWidth: number): number {
  if (countHazards(w) >= MAX_HAZARDS) return -1;
  const id = spawn(w, Kind.BossHazard, x, y);
  if (id < 0) return -1;
  zeroExtras(w, id);
  const tele = hazardTelegraph(bs.row.tier);
  w.a[id] = HazardType.Lane;
  w.rot[id] = rot;
  w.radius[id] = clampLaneHalfWidth(halfWidth);
  w.vx[id] = length;
  w.vy[id] = 0;
  w.hp[id] = 0;
  bs.hzTele[id] = tele;
  bs.hzRate[id] = 0;
  bs.hzLife[id] = markerLife(tele);
  bs.hzFollow[id] = 0;
  bs.hzMarker[id] = 1;
  return id;
}

/** Pure: a marker's life, a little short of its telegraph so it never reaches the lethal age. */
export function markerLife(tele: number): number {
  return tele > 0.02 ? tele - 0.01 : tele * 0.5;
}

/** Ring from radius r0 growing at growth u/s (negative collapses), gaps of half angle gapHalf from gapRot. */
export function spawnRing(w: World, bs: BossState, x: number, y: number, r0: number, gapRot: number, gapHalf: number, gaps: number, growth: number): number {
  const tele = hazardTelegraph(bs.row.tier);
  const maxR = Math.hypot(w.level.arena.width, w.level.arena.height);
  const travel = growth > 0 ? (maxR - r0) / growth : growth < 0 ? r0 / -growth : 0;
  return spawnHazard(w, bs, HazardType.Ring, x, y, gapRot, r0, clampRingGapHalf(bs.row.tier, gapHalf), gaps >= 2 ? 2 : 1, growth, tele + travel, false);
}

/** Lane from (x, y) along rot: telegraph, then lethal for HAZARD.laneLethalSec. */
export function spawnLane(w: World, bs: BossState, x: number, y: number, rot: number, length: number, halfWidth: number): number {
  const life = hazardTelegraph(bs.row.tier) + HAZARD.laneLethalSec;
  return spawnHazard(w, bs, HazardType.Lane, x, y, rot, clampLaneHalfWidth(halfWidth), length, 0, 0, life, false);
}

/** Sweep of arms (1 to 3) arms from (x, y), turning at rate rad/s once lethal, no time limit. */
export function spawnSweep(w: World, bs: BossState, x: number, y: number, rot: number, arms: number, length: number, rate: number, follow: boolean): number {
  return spawnHazard(w, bs, HazardType.Sweep, x, y, rot, HAZARD.sweepHalfWidth, length, clampSweepArms(arms), rate, -1, follow);
}

/** Tether from (x, y) to (x2, y2) for life seconds (negative: until removed). */
export function spawnTether(w: World, bs: BossState, x: number, y: number, x2: number, y2: number, life: number): number {
  return spawnHazard(w, bs, HazardType.Tether, x, y, 0, HAZARD.tetherHalfWidth, x2, y2, 0, life, false);
}

/**
 * Pull of radius around (x, y) for life seconds (negative: until removed). Never lethal. strength
 * is the pull speed at the centre in u/s (at most HAZARD.pullMax), kept in hzRate and mirrored in
 * w.vx for render.
 */
export function spawnPull(w: World, bs: BossState, x: number, y: number, radius: number, life: number, follow: boolean, strength: number = HAZARD.pullMax): number {
  const s = pullStrength(strength);
  return spawnHazard(w, bs, HazardType.Pull, x, y, 0, radius, s, 0, s, life, follow);
}

/** Pure: a pull strength clamped to [0, HAZARD.pullMax]. */
export function pullStrength(v: number): number {
  if (!(v > 0)) return 0;
  return v > HAZARD.pullMax ? HAZARD.pullMax : v;
}

/** Set the strength of a live pull (u/s at the centre, clamped). */
export function setPullStrength(w: World, bs: BossState, id: number, strength: number): void {
  const s = pullStrength(strength);
  bs.hzRate[id] = s;
  w.vx[id] = s;
}

/**
 * A ring marker at (x, y): the thin dim telegraph of a ring of radius r that never grows, removed
 * after life seconds (kept short of the telegraph, so it is never lethal and may cover the ship).
 * Mirage marks its landing point with one. Returns the id, or -1 at the cap or a full world.
 */
export function spawnRingMarker(w: World, bs: BossState, x: number, y: number, r: number, life: number): number {
  if (countHazards(w) >= MAX_HAZARDS) return -1;
  const id = spawn(w, Kind.BossHazard, x, y);
  if (id < 0) return -1;
  zeroExtras(w, id);
  const tele = hazardTelegraph(bs.row.tier);
  const cap = markerLife(tele);
  w.a[id] = HazardType.Ring;
  w.rot[id] = 0;
  w.radius[id] = r;
  w.vx[id] = clampRingGapHalf(bs.row.tier, 0);
  w.vy[id] = 1;
  w.hp[id] = 0;
  bs.hzTele[id] = tele;
  bs.hzRate[id] = 0;
  bs.hzLife[id] = life > 0 && life < cap ? life : cap;
  bs.hzFollow[id] = 0;
  bs.hzMarker[id] = 1;
  return id;
}

// ---------------------------------------------------------------------------------------------
// Parts

/** Part id in slot, or -1 (an empty or stale slot is cleared). */
export function livePart(w: World, bs: BossState, slot: number): number {
  const id = bs.parts[slot] ?? -1;
  if (id > 0 && w.alive[id] === 1 && w.kind[id] === Kind.BossPart) return id;
  if (slot >= 0 && slot < bs.parts.length) bs.parts[slot] = -1;
  return -1;
}

/** Live parts. */
export function countParts(w: World, bs: BossState): number {
  let n = 0;
  for (let i = 0; i < MAX_PARTS; i++) if (livePart(w, bs, i) > 0) n++;
  return n;
}

/** Spawn a part in slot (0 to MAX_PARTS - 1). Returns the id, or -1 for a bad or taken slot or a full world. */
export function spawnPart(w: World, bs: BossState, slot: number, type: number, x: number, y: number, hp: number, radius: number): number {
  if (slot < 0 || slot >= MAX_PARTS || livePart(w, bs, slot) > 0) return -1;
  const id = spawn(w, Kind.BossPart, x, y);
  if (id < 0) return -1;
  zeroExtras(w, id);
  w.a[id] = type;
  w.hp[id] = hp;
  w.radius[id] = radius;
  bs.parts[slot] = id;
  moveTo(w, id, x, y);
  return id;
}

function clearParts(w: World, bs: BossState): void {
  for (let i = 0; i < MAX_PARTS; i++) {
    const id = livePart(w, bs, i);
    if (id > 0) removeEntity(w, id);
    bs.parts[i] = -1;
  }
}

// ---------------------------------------------------------------------------------------------
// Adds

/** Live adds this boss summoned. */
export function countAdds(w: World, bs: BossState): number {
  let n = 0;
  for (let i = 0; i < MAX_ADDS; i++) {
    const id = bs.addIds[i] ?? -1;
    if (id > 0 && w.alive[id] === 1 && w.kind[id] === bs.addKind[i]) n++;
  }
  return n;
}

/**
 * Summon an add through the normal spawn path (0.6 s telegraph, normal speeds and score). Returns
 * the id, or -1 at the add cap, at maxLiveEnemies or in a full world (skipped, never thrown).
 */
export function spawnAdd(w: World, bs: BossState, def: EnemyDef, x: number, y: number): number {
  let slot = -1;
  for (let i = 0; i < MAX_ADDS; i++) {
    const id = bs.addIds[i] ?? -1;
    if (!(id > 0 && w.alive[id] === 1 && w.kind[id] === bs.addKind[i])) {
      slot = i;
      break;
    }
  }
  if (slot < 0) return -1;
  if (countWaveEnemies(w) >= w.level.waves.maxLiveEnemies) return -1;
  const id = spawnFromDef(w, def, x, y, TELEGRAPH_SEC);
  if (id < 0) return -1;
  moveTo(w, id, x, y);
  bs.addIds[slot] = id;
  bs.addKind[slot] = def.kind;
  return id;
}
