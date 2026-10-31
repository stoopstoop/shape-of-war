// V3 harden: fairness sweep over all ten bosses (docs/12 "Design: the boss rules" rules 5 and 6,
// docs/13 boss rule 5 and the Fable ruling that the live hazard cap is 8).
// Each boss plays 60 s (scope trim agreed in the brief, not 120 s) on its real generated level,
// under six fuzzed player sessions: the strafing shooter, three random walks (different hash01
// seeds), a chaser that bombs and supers, and a ship that never moves. Every tick asserts:
//   rule 5  a hazard born this tick (not a Pull, not a Brood marker) has the tier telegraph (1.0,
//           0.8, 0.6, 0.6 s), a ring gap of at least 60 deg (tiers 1 and 2) or 45 deg (3 and 4), a
//           lane at most 60 u wide, sweep gaps of at least 90 deg, and does not overlap the ship;
//           a marker's life ends before its telegraph does; a ship death never lands while the
//           respawn invulnerability still has time on it;
//           live caps: 8 hazards, 8 boss adds, 4 parts, 32 enemy bullets, ENTITY_CAP entities,
//           maxLiveEnemies wave enemies;
//   rule 6  on a ship death the hazards, the boss adds and the enemy bullets are gone and stay gone
//           for the whole respawn delay, the boss keeps its hit points and does not move.
// "Does not overlap the ship" is judged at both the pre step and the post step ship position and
// fails only when both overlap, since a hazard is created between the two and the ship moves at
// most about 3 u per tick. No Math.random.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { countAdds, countHazards } from '../../src/game/bosses/core';
import { hazardHits } from '../../src/game/bosses/kit';
import { bossOf } from '../../src/game/bosses/state';
import { MAX_ADDS, MAX_HAZARDS, MAX_PARTS } from '../../src/game/bosses/table';
import { HazardType } from '../../src/game/bosses/types';
import { ENEMY_BULLET_CAP, enemyBulletsOf } from '../../src/game/enemyBullets';
import { createGame, stepGame } from '../../src/game/game';
import { SHIP_RADIUS } from '../../src/game/ship';
import { countWaveEnemies } from '../../src/game/spawner';
import { gs } from '../../src/game/state';
import { ENTITY_CAP, Kind } from '../../src/game/world';
import type { BossId } from '../../src/levelgen/leveldef';
import { BOSS_IDS, DT, SESSION_STEPS, bossLevelFor, idleInput, playerInput, recToInput } from './bossHarness';

afterEach(() => bus.clear());

const TELEGRAPH_BY_TIER: Readonly<Record<number, number>> = { 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.6 };
const RING_GAP_MIN_DEG: Readonly<Record<number, number>> = { 1: 60, 2: 60, 3: 45, 4: 45 };
const DEG = Math.PI / 180;
const EPS = 1e-4;

interface Tally {
  violations: string[];
  births: number;
  markers: number;
  deaths: number;
  respawnTicks: number;
  maxHazards: number;
  maxAdds: number;
  maxParts: number;
  maxBullets: number;
  maxWave: number;
  maxEntities: number;
  bossDownTick: number;
}

/** [mode, hash01 seed] of every session a boss plays. */
const SESSIONS: readonly (readonly [mode: number, seed: number])[] = [
  [0, 7],
  [1, 11],
  [1, 12],
  [1, 13],
  [2, 5],
  [3, 6],
];

function sweepOne(id: BossId, mode: number, seed: number): Tally {
  const level = bossLevelFor(id);
  const tier = level.boss?.tier ?? 1;
  const w = createGame(level, { vibrate: () => undefined });
  const bs = bossOf(w);
  if (bs === null) throw new Error('no boss state for ' + id);
  const t: Tally = { violations: [], births: 0, markers: 0, deaths: 0, respawnTicks: 0, maxHazards: 0, maxAdds: 0, maxParts: 0, maxBullets: 0, maxWave: 0, maxEntities: 0, bossDownTick: -1 };
  const bad = (step: number, msg: string): void => {
    if (t.violations.length < 12) t.violations.push(id + ' mode ' + String(mode) + ' seed ' + String(seed) + ' tick ' + String(step) + ': ' + msg);
  };
  const frame = idleInput();
  const prevHazard = new Uint8Array(w.cap);
  const prevT = new Float32Array(w.cap);
  const maxLive = level.waves.maxLiveEnemies;
  let respawning = false;
  let hpAtDeath = -1;
  let enteringAtDeath = false;
  let bossXAtDeath = 0;
  let bossYAtDeath = 0;
  for (let step = 0; step < SESSION_STEPS; step++) {
    const livesBefore = gs(w).lives;
    const invBefore = w.ship.invuln;
    const activeBefore = w.ship.active;
    const px0 = w.x[0] ?? 0;
    const py0 = w.y[0] ?? 0;
    stepGame(w, DT, recToInput(playerInput(w, step, seed, mode), frame));
    const px1 = w.x[0] ?? 0;
    const py1 = w.y[0] ?? 0;
    const boss = bs.id;

    // Live caps.
    const hazards = countHazards(w);
    const adds = countAdds(w, bs);
    let parts = 0;
    let entities = 0;
    for (let i = 0; i < w.cap; i++) {
      if (w.alive[i] !== 1) continue;
      entities++;
      if (w.kind[i] === Kind.BossPart) parts++;
    }
    const bullets = enemyBulletsOf(w).liveCount;
    const wave = countWaveEnemies(w);
    t.maxHazards = Math.max(t.maxHazards, hazards);
    t.maxAdds = Math.max(t.maxAdds, adds);
    t.maxParts = Math.max(t.maxParts, parts);
    t.maxBullets = Math.max(t.maxBullets, bullets);
    t.maxWave = Math.max(t.maxWave, wave);
    t.maxEntities = Math.max(t.maxEntities, entities);
    if (hazards > MAX_HAZARDS) bad(step, String(hazards) + ' live hazards, cap ' + String(MAX_HAZARDS));
    if (adds > MAX_ADDS) bad(step, String(adds) + ' boss adds, cap ' + String(MAX_ADDS));
    if (parts > MAX_PARTS) bad(step, String(parts) + ' parts, cap ' + String(MAX_PARTS));
    if (bullets > ENEMY_BULLET_CAP) bad(step, String(bullets) + ' enemy bullets, cap ' + String(ENEMY_BULLET_CAP));
    if (entities > ENTITY_CAP) bad(step, String(entities) + ' entities, cap ' + String(ENTITY_CAP));
    if (wave > maxLive) bad(step, String(wave) + ' wave enemies, maxLiveEnemies ' + String(maxLive));

    // Rule 5: births.
    for (let h = 1; h < w.cap; h++) {
      const live = w.alive[h] === 1 && w.kind[h] === Kind.BossHazard;
      const born = live && (prevHazard[h] !== 1 || (w.t[h] ?? 0) < (prevT[h] ?? 0));
      prevHazard[h] = live ? 1 : 0;
      prevT[h] = live ? (w.t[h] ?? 0) : 0;
      if (!born) continue;
      const type = w.a[h] ?? -1;
      if (type === HazardType.Pull) continue;
      if (bs.hzMarker[h] === 1) {
        t.markers++;
        if (!((bs.hzLife[h] ?? 0) < (bs.hzTele[h] ?? 0))) bad(step, 'marker ' + String(h) + ' outlives its telegraph');
        continue;
      }
      t.births++;
      const want = TELEGRAPH_BY_TIER[tier] ?? 0.6;
      if (Math.abs((bs.hzTele[h] ?? 0) - want) > EPS) bad(step, 'hazard type ' + String(type) + ' telegraph ' + String(bs.hzTele[h]) + ', tier ' + String(tier) + ' wants ' + String(want));
      if (type === HazardType.Ring && (w.vx[h] ?? 0) * 2 < (RING_GAP_MIN_DEG[tier] ?? 45) * DEG - EPS) bad(step, 'ring gap ' + String(((w.vx[h] ?? 0) * 2) / DEG) + ' deg');
      if (type === HazardType.Lane && (w.radius[h] ?? 0) * 2 > 60 + EPS) bad(step, 'lane ' + String((w.radius[h] ?? 0) * 2) + ' u wide');
      if (type === HazardType.Sweep && (Math.PI * 2) / Math.max(1, w.vy[h] ?? 1) < Math.PI / 2 - EPS) bad(step, 'sweep arms ' + String(w.vy[h]) + ' leave a gap under 90 deg');
      if (activeBefore && w.ship.active) {
        const args = [SHIP_RADIUS, w.x[h] ?? 0, w.y[h] ?? 0, w.rot[h] ?? 0, w.radius[h] ?? 0, w.vx[h] ?? 0, w.vy[h] ?? 0] as const;
        const pre = hazardHits(type, px0, py0, args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
        const post = hazardHits(type, px1, py1, args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
        if (pre && post) bad(step, 'lethal hazard type ' + String(type) + ' born on the ship');
      }
    }

    // Rule 5: invulnerability. A life lost while the respawn shield still had time on it.
    const died = gs(w).lives < livesBefore;
    if (died && invBefore > DT * 2) bad(step, 'a life was lost with ' + String(invBefore) + ' s of invulnerability left');

    // Rule 6.
    if (died) {
      t.deaths++;
      respawning = true;
      hpAtDeath = boss > 0 && w.alive[boss] === 1 ? (w.hp[boss] ?? 0) : -1;
      bossXAtDeath = boss > 0 ? (w.x[boss] ?? 0) : 0;
      bossYAtDeath = boss > 0 ? (w.y[boss] ?? 0) : 0;
      enteringAtDeath = bs.viewMode === 0;
    }
    if (respawning && !w.ship.active) {
      t.respawnTicks++;
      if (hazards !== 0) bad(step, String(hazards) + ' hazards alive during the respawn delay');
      if (bullets !== 0) bad(step, String(bullets) + ' enemy bullets alive during the respawn delay');
      if (adds !== 0) bad(step, String(adds) + ' boss adds alive during the respawn delay');
      if (hpAtDeath >= 0 && boss > 0 && w.alive[boss] === 1) {
        // Bullets already in flight at the moment of death may still land, so hit points may fall.
        // What rule 6 forbids is a heal or a reset: they never rise above the value at death.
        const hp = w.hp[boss] ?? 0;
        if (hp > hpAtDeath) bad(step, 'boss hit points rose from ' + String(hpAtDeath) + ' to ' + String(hp) + ' during the respawn delay');
        hpAtDeath = Math.min(hpAtDeath, hp);
        // The entrance slide is not an attack and keeps running, so a ship that died during the
        // entrance sees the boss keep moving until the slide ends.
        if (!enteringAtDeath && (w.x[boss] !== bossXAtDeath || w.y[boss] !== bossYAtDeath)) bad(step, 'boss moved during the respawn delay');
      }
    } else if (w.ship.active) {
      respawning = false;
    }
    if (t.bossDownTick < 0 && bs.status === 'defeated') t.bossDownTick = step;
  }
  return t;
}

describe('fairness sweep: every boss, 60 s, six fuzzed sessions each (rules 5 and 6, the caps)', { timeout: 300_000 }, () => {
  const all: Tally[] = [];

  it('pins the numbers the sweep asserts against (docs/12 rule 5, docs/13 ruling: hazard cap 8)', () => {
    expect(MAX_HAZARDS).toBe(8);
    expect(MAX_ADDS).toBe(8);
    expect(MAX_PARTS).toBe(4);
    expect(ENEMY_BULLET_CAP).toBe(32);
    expect(ENTITY_CAP).toBe(512);
  });

  it.each(BOSS_IDS.map((id) => [id]))('%s: no violation in any session', (id: BossId) => {
    const tallies = SESSIONS.map(([mode, seed]) => sweepOne(id, mode, seed));
    all.push(...tallies);
    expect(tallies.flatMap((x) => x.violations)).toEqual([]);
  });

  it('is not vacuous: hazards were born, ships died and respawned, markers and boss kills happened, caps were reached', () => {
    expect(all.length).toBe(BOSS_IDS.length * SESSIONS.length);
    const sum = (f: (x: Tally) => number): number => all.reduce((s, x) => s + f(x), 0);
    expect(sum((x) => x.births)).toBeGreaterThan(500);
    expect(sum((x) => x.deaths)).toBeGreaterThan(100);
    expect(sum((x) => x.respawnTicks)).toBeGreaterThan(1000);
    expect(sum((x) => x.markers)).toBeGreaterThan(0);
    expect(all.filter((x) => x.bossDownTick >= 0).length).toBeGreaterThan(5);
    expect(Math.max(...all.map((x) => x.maxHazards))).toBe(MAX_HAZARDS);
    expect(Math.max(...all.map((x) => x.maxParts))).toBe(MAX_PARTS);
    expect(Math.max(...all.map((x) => x.maxBullets))).toBeGreaterThan(0);
    expect(Math.max(...all.map((x) => x.maxAdds))).toBeGreaterThan(0);
  });
});
