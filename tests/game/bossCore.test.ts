// Boss core (docs/12 wave V3-A boss rules 1 to 13, docs/13 SPEC 3.4): schedule and entrance, the
// damage table, bomb and Detonate, ship death, enrage, reward, bus events, speeds and the view.
import { afterEach, describe, expect, it } from 'vitest';
import { bus, type Events } from '../../src/core/events';
import {
  bossAlive,
  bossDamageForStyle,
  bossEnraged,
  bossHittable,
  damageBoss,
  damageBossPart,
  livePart,
  keepScheduledEntry,
  phaseFor,
  entryAngle,
  spawnLane,
} from '../../src/game/bosses/core';
import { bossOf } from '../../src/game/bosses/state';
import { BOSS_DAMAGE, BOSS_REWARD_GEOMS, BOSS_TABLE, ENRAGE_AFTER_SEC, ORBIT_BOSS_COOLDOWN, STAGGER_SEC, maxHpFor } from '../../src/game/bosses/table';
import { BossMode, HazardType } from '../../src/game/bosses/types';
import { createBossView, readBoss } from '../../src/game/bosses/view';
import { spawnBullet, STYLE_ORBIT, STYLE_PIERCE, STYLE_RAPID, STYLE_SPREAD, armPierce } from '../../src/game/bullets';
import { bulletHits, damageAny, orbitHits } from '../../src/game/combat';
import * as grunt from '../../src/game/enemies/grunt';
import { stepGame } from '../../src/game/game';
import { killShip, triggerBomb } from '../../src/game/player';
import { RESPAWN_DELAY } from '../../src/game/player';
import { gs, spawnFromDef } from '../../src/game/state';
import { detonate } from '../../src/game/supers';
import { equipWeapon, weaponState } from '../../src/game/weapons';
import { Kind } from '../../src/game/world';
import type { SpawnEntry, WaveSchedule } from '../../src/levelgen/leveldef';
import { bs, bossGame, count, enter, first, park, run } from './bossHelpers';
import { DT, idle, makeGame } from './helpers';

afterEach(() => bus.clear());

describe('schedule and entrance', () => {
  it('a level without a boss never creates boss state (the Off invariant)', () => {
    const { w } = makeGame();
    gs(w).invulnerable = true;
    run(w, 3);
    expect(bossOf(w)).toBeNull();
    expect(readBoss(w, createBossView()).active).toBe(false);
  });

  it('spawns at boss.atSec on the wave clock, emits sim:bossEnter once, entrance lasts 2.0 s', () => {
    const enters: Events['sim:bossEnter'][] = [];
    bus.on('sim:bossEnter', (p) => enters.push({ ...p }));
    const w = bossGame('warden', {}, {}, true, 1.0);
    run(w, 0.9);
    expect(bossAlive(w)).toBe(false);
    run(w, 0.2);
    expect(bossAlive(w)).toBe(true);
    expect(enters).toEqual([{ id: 'warden', tier: 1 }]);
    expect(gs(w).waveClock).toBeGreaterThanOrEqual(1.0);
    // Entering: harmless and untargetable.
    expect(bossHittable(w)).toBe(-1);
    expect(readBoss(w, createBossView()).mode).toBe(BossMode.Entering);
    run(w, 1.9);
    expect(bossHittable(w)).toBe(-1);
    run(w, 0.2);
    expect(bossHittable(w)).toBeGreaterThan(0);
    expect(enters).toHaveLength(1);
  });

  it('slides in from the wall point farthest from the ship', () => {
    expect(entryAngle(0, 0)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(entryAngle(300, 0))).toBeCloseTo(Math.PI);
    const w = bossGame('warden', {}, {}, true, 0.1);
    park(w, 500, 300);
    run(w, 0.15);
    const s = bs(w);
    expect(s.status).toBe('alive');
    // Ship in the lower right quadrant: the boss enters from the upper left wall.
    expect(s.entryX).toBeLessThan(0);
    expect(s.entryY).toBeLessThan(0);
    const half = 700 - BOSS_TABLE.warden.radius;
    expect(Math.abs(s.entryX) >= half - 1 || Math.abs(s.entryY) >= 450 - BOSS_TABLE.warden.radius - 1).toBe(true);
  });

  it('entrance body contact does not kill, contact after the entrance does', () => {
    const w = bossGame('warden', {}, {}, false, 0.1);
    run(w, 0.15);
    const id = bs(w).id;
    w.ship.invuln = 0;
    park(w, w.x[id] ?? 0, w.y[id] ?? 0);
    stepGame(w, DT, idle());
    expect(w.ship.active).toBe(true);
    enter(w);
    w.ship.invuln = 0;
    park(w, w.x[id] ?? 0, w.y[id] ?? 0);
    stepGame(w, DT, idle());
    expect(w.ship.active).toBe(false);
  });

  it('hit points are tenths of a hit times hpMul, clamped to the Int16 range', () => {
    expect(maxHpFor(BOSS_TABLE.warden, 1)).toBe(3600);
    expect(maxHpFor(BOSS_TABLE.prism, 1)).toBe(10000);
    expect(maxHpFor(BOSS_TABLE.spindle, 1.25)).toBe(6250); // 500 hits since G3A (400 before)
    expect(maxHpFor(BOSS_TABLE.prism, 9)).toBe(32767);
    const w = bossGame('spindle', { boss: { id: 'spindle', tier: 1, atSec: 0.1, hpMul: 1.5 } });
    const id = enter(w);
    expect(w.hp[id]).toBe(7500);
  });

  it('phases split hit points evenly', () => {
    expect(phaseFor(1800, 3600, 2)).toBe(1);
    expect(phaseFor(1799, 3600, 2)).toBe(2);
    expect(phaseFor(7500, 10000, 4)).toBe(1);
    expect(phaseFor(7499, 10000, 4)).toBe(2);
    expect(phaseFor(2499, 10000, 4)).toBe(4);
  });
});

describe('damage table', () => {
  it('BOSS_DAMAGE holds the plan values', () => {
    expect(BOSS_DAMAGE).toEqual({ spread: 10, rapid: 7, pierce: 40, orbit: 15, drone: 10, ram: 20 });
    expect(bossDamageForStyle(STYLE_SPREAD)).toBe(10);
    expect(bossDamageForStyle(STYLE_RAPID)).toBe(7);
    expect(bossDamageForStyle(STYLE_PIERCE)).toBe(40);
    expect(bossDamageForStyle(STYLE_ORBIT)).toBe(15);
  });

  it('spread, rapid and pierce bullets deal 10, 7 and 40, and a pierce bullet stops at the body', () => {
    const w = bossGame('spindle');
    const id = enter(w);
    const p = w.bullets;
    const hp0 = w.hp[id] ?? 0;
    const bx = w.x[id] ?? 0;
    const by = w.y[id] ?? 0;
    spawnBullet(p, bx, by, 0, 0, 1);
    bulletHits(w);
    expect(w.hp[id]).toBe(hp0 - 10);
    const r = spawnBullet(p, bx, by, 0, 0, 1);
    p.style[r] = STYLE_RAPID;
    bulletHits(w);
    expect(w.hp[id]).toBe(hp0 - 17);
    const pi = spawnBullet(p, bx, by, 0, 0, 1);
    armPierce(p, pi);
    bulletHits(w);
    expect(w.hp[id]).toBe(hp0 - 57);
    expect(p.alive[pi]).toBe(0);
  });

  it('an orbit blade deals 15 and rests 0.25 s against the boss', () => {
    const w = bossGame('spindle');
    const id = enter(w);
    equipWeapon(w, 'orbit');
    const s = weaponState(w);
    const blade = s.blades[0] ?? -1;
    expect(blade).toBeGreaterThanOrEqual(0);
    const hp0 = w.hp[id] ?? 0;
    w.bullets.x[blade] = w.x[id] ?? 0;
    w.bullets.y[blade] = w.y[id] ?? 0;
    orbitHits(w, DT);
    expect(w.hp[id]).toBe(hp0 - 15);
    expect(s.bladeCool[0]).toBeCloseTo(ORBIT_BOSS_COOLDOWN);
    orbitHits(w, DT);
    expect(w.hp[id]).toBe(hp0 - 15);
  });

  it('drone shots and Ram use BOSS_DAMAGE', () => {
    const w = bossGame('spindle');
    const id = enter(w);
    const hp0 = w.hp[id] ?? 0;
    damageAny(w, id, 2, BOSS_DAMAGE.ram);
    expect(w.hp[id]).toBe(hp0 - 20);
    damageAny(w, id, 1, BOSS_DAMAGE.drone);
    expect(w.hp[id]).toBe(hp0 - 30);
  });

  it('a hit emits fx:hit with Kind.Boss; a closed core emits it blocked and takes nothing', () => {
    const hits: Events['fx:hit'][] = [];
    bus.on('fx:hit', (p) => hits.push({ ...p }));
    const w = bossGame('warden');
    const id = enter(w);
    const hp0 = w.hp[id] ?? 0;
    damageBoss(w, 10, 1, 2);
    expect(w.hp[id]).toBe(hp0);
    expect(hits.at(-1)).toMatchObject({ kind: Kind.Boss, id, blocked: true });
    bs(w).open = true;
    damageBoss(w, 10, 1, 2);
    expect(w.hp[id]).toBe(hp0 - 10);
    expect(hits.at(-1)).toMatchObject({ kind: Kind.Boss, id, blocked: false, x: 1, y: 2 });
  });
});

describe('bomb and Detonate', () => {
  it('a bomb clears hazards and adds, staggers the boss 1.5 s, and deals no damage', () => {
    const w = bossGame('spindle');
    const id = enter(w);
    run(w, 0.1);
    expect(count(w, Kind.BossHazard)).toBeGreaterThan(0);
    const add = spawnFromDef(w, grunt.def, 300, 300, 0);
    expect(add).toBeGreaterThan(0);
    const hp0 = w.hp[id] ?? 0;
    expect(triggerBomb(w)).toBe(true);
    expect(w.hp[id]).toBe(hp0);
    expect(w.alive[id]).toBe(1);
    expect(count(w, Kind.BossHazard)).toBe(0);
    expect(count(w, Kind.Grunt)).toBe(0);
    expect(bs(w).stagger).toBeCloseTo(STAGGER_SEC);
    stepGame(w, DT, idle());
    expect(readBoss(w, createBossView()).mode).toBe(BossMode.Stunned);
    // No attack while staggered.
    run(w, 1.3);
    expect(count(w, Kind.BossHazard)).toBe(0);
    expect(w.hp[id]).toBe(hp0);
    run(w, 0.4);
    expect(bs(w).stagger).toBe(0);
  });

  // G3A ruling on boss rule 7 ("staggers ... stays vulnerable ... does no damage"): the stagger
  // keeps the vulnerability the boss had. It never opens a closed core, so a bomb can never turn
  // into damage, and an open window is frozen (not shortened) while the boss is staggered.
  it('a bomb never opens a closed core: shots during the stagger are blocked', () => {
    const blocked: boolean[] = [];
    bus.on('fx:hit', (p) => blocked.push(p.blocked));
    const w = bossGame('warden');
    const id = enter(w);
    const hp0 = w.hp[id] ?? 0;
    expect(bs(w).open).toBe(false);
    expect(triggerBomb(w)).toBe(true);
    expect(w.hp[id]).toBe(hp0);
    for (let i = 0; i < 120 * STAGGER_SEC - 2; i++) {
      damageBoss(w, 10, 0, 0);
      stepGame(w, DT, idle());
    }
    expect(bs(w).stagger).toBeGreaterThan(0);
    expect(w.hp[id]).toBe(hp0);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every((b) => b)).toBe(true);
  });

  it('a bomb during an open window keeps it open, frozen for the stagger, and deals nothing itself', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    const id = enter(w);
    const s = bs(w);
    for (let k = 0; k < 3; k++) {
      const p = livePart(w, s, k);
      if (p > 0) damageBossPart(w, p, 10, 0, 0);
    }
    stepGame(w, DT, idle());
    expect(s.open).toBe(true);
    const left = s.openLeft;
    const hp0 = w.hp[id] ?? 0;
    expect(triggerBomb(w)).toBe(true);
    expect(w.hp[id]).toBe(hp0);
    run(w, 1.0);
    expect(s.open).toBe(true);
    expect(s.openLeft).toBeCloseTo(left, 5);
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0 - 10);
  });

  it('Detonate takes 10 percent of maximum hit points within 260 u, shield or not', () => {
    const w = bossGame('warden', { superType: 'detonate', drone: 'attack' });
    const id = enter(w);
    const g = gs(w);
    const drone = g.droneId;
    expect(drone).toBeGreaterThan(0);
    w.x[drone] = (w.x[id] ?? 0) + 200;
    w.y[drone] = w.y[id] ?? 0;
    const hp0 = w.hp[id] ?? 0;
    detonate(w);
    expect(w.hp[id]).toBe(hp0 - 360);
  });

  it('Detonate out of range does nothing to the boss', () => {
    const w = bossGame('warden', { superType: 'detonate', drone: 'attack' });
    const id = enter(w);
    const drone = gs(w).droneId;
    w.x[drone] = (w.x[id] ?? 0) + 260 + BOSS_TABLE.warden.radius + 20;
    w.y[drone] = w.y[id] ?? 0;
    const hp0 = w.hp[id] ?? 0;
    detonate(w);
    expect(w.hp[id]).toBe(hp0);
  });
});

describe('ship death (boss rule 6)', () => {
  it('keeps the boss and its hit points, clears hazards and adds, pauses attacks, restarts the cycle', () => {
    const w = bossGame('spindle', { lives: 3 }, {}, false);
    park(w, 600, 400);
    const id = enter(w);
    w.ship.invuln = 0;
    run(w, 0.5);
    bs(w).open = true;
    damageBoss(w, 100, 0, 0);
    const hp = w.hp[id] ?? 0;
    spawnFromDef(w, grunt.def, 300, -300, 0);
    expect(count(w, Kind.BossHazard)).toBe(1);
    const x0 = w.x[id] ?? 0;
    killShip(w);
    expect(w.alive[id]).toBe(1);
    expect(w.hp[id]).toBe(hp);
    expect(count(w, Kind.BossHazard)).toBe(0);
    expect(count(w, Kind.Grunt)).toBe(0);
    expect(bs(w).t0).toBe(0);
    // Paused through the respawn delay: no movement, no new hazard.
    for (let i = 0; i < Math.floor(RESPAWN_DELAY * 120) - 2; i++) stepGame(w, DT, idle());
    expect(w.ship.active).toBe(false);
    expect(w.x[id]).toBe(x0);
    expect(count(w, Kind.BossHazard)).toBe(0);
    run(w, 0.1);
    expect(w.ship.active).toBe(true);
    expect(count(w, Kind.BossHazard)).toBe(1);
  });
});

describe('enrage', () => {
  it('a boss alive 90 s attacks 30 percent faster', () => {
    const w = bossGame('warden');
    enter(w);
    expect(bossEnraged(w)).toBe(false);
    bs(w).age = ENRAGE_AFTER_SEC;
    expect(bossEnraged(w)).toBe(true);
    // Warden's ring clock runs 1.3 x: after 1 s it has advanced 1.3 s.
    const t0 = bs(w).t0;
    bs(w).retry = 0;
    run(w, 1);
    expect(bs(w).t0 - t0).toBeCloseTo(1.3, 1);
  });
});

describe('death and reward', () => {
  it('emits sim:bossDown at the body, pays the flat bonus, counts one kill and drops 20 geoms', () => {
    const downs: Events['sim:bossDown'][] = [];
    bus.on('sim:bossDown', (p) => downs.push({ ...p }));
    const w = bossGame('spindle', { par: 10000 });
    const id = enter(w);
    const g = gs(w);
    const x = w.x[id] ?? 0;
    const y = w.y[id] ?? 0;
    const score0 = g.score;
    const kills0 = g.kills;
    const mult0 = g.multiplier;
    expect(damageBoss(w, 99999, 0, 0)).toBe(true);
    expect(downs).toEqual([{ id: 'spindle', x, y }]);
    expect(g.score - score0).toBe(2500);
    expect(g.multiplier).toBe(mult0); // never multiplied, no multiplier change from the kill itself
    expect(g.kills - kills0).toBe(1);
    expect(count(w, Kind.Geom)).toBe(BOSS_REWARD_GEOMS);
    expect(count(w, Kind.Boss)).toBe(0);
    expect(count(w, Kind.BossHazard)).toBe(0);
    expect(count(w, Kind.BossPart)).toBe(0);
    expect(readBoss(w, createBossView()).active).toBe(false);
  });

  it('crossing 50 percent emits sim:bossPhase once with the phase count', () => {
    const phases: Events['sim:bossPhase'][] = [];
    bus.on('sim:bossPhase', (p) => phases.push({ ...p }));
    const w = bossGame('spindle');
    const id = enter(w);
    damageBoss(w, 2500, 0, 0);
    expect(w.hp[id]).toBe(2500);
    expect(phases).toHaveLength(0);
    damageBoss(w, 1, 0, 0);
    expect(phases).toEqual([{ id: 'spindle', phase: 2, phases: 2 }]);
    damageBoss(w, 10, 0, 0);
    expect(phases).toHaveLength(1);
    expect(w.hp[id]).toBe(5000 - 2511);
  });
});

describe('hud:boss', () => {
  it('emits on change and at most every 100 ms', () => {
    const huds: Events['hud:boss'][] = [];
    bus.on('hud:boss', (p) => huds.push({ ...p }));
    const w = bossGame('spindle');
    const id = enter(w);
    run(w, 0.5);
    const n0 = huds.length;
    expect(n0).toBeGreaterThan(0);
    expect(huds.at(-1)).toMatchObject({ id: 'spindle', maxHp: 5000, phases: 2 });
    // Nothing changes: no emits.
    run(w, 1);
    expect(huds.length).toBe(n0);
    // Damage every step for 1 s: about 10 emits, never more than one per 100 ms.
    let steps = 0;
    const before = huds.length;
    for (let i = 0; i < 120; i++) {
      damageBoss(w, 1, 0, 0);
      stepGame(w, DT, idle());
      steps++;
    }
    const n = huds.length - before;
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(11);
    expect(steps).toBe(120);
    // The last emit trails the live value by at most 100 ms of damage (12 steps of 1).
    expect((huds.at(-1)?.hp ?? 0) - (w.hp[id] ?? 0)).toBeLessThanOrEqual(12);
  });
});

describe('speeds ignore speedScale (boss rule 13)', () => {
  it('the same boss moves the same at speedScale 1 and 3', () => {
    const a = bossGame('warden', { speedScale: 1 });
    const b = bossGame('warden', { speedScale: 3 });
    park(a, 500, 300);
    park(b, 500, 300);
    run(a, 6);
    run(b, 6);
    const ia = bs(a).id;
    const ib = bs(b).id;
    expect(a.x[ia]).toBe(b.x[ib]);
    expect(a.y[ia]).toBe(b.y[ib]);
  });
});

describe('waves while a boss lives (boss rule 4)', () => {
  it('keeps 3 of every 5 scheduled entries, and all of them without a live boss', () => {
    const { w } = makeGame();
    for (let i = 0; i < 10; i++) expect(keepScheduledEntry(w)).toBe(true);
    const b = bossGame('spindle');
    for (let i = 0; i < 10; i++) expect(keepScheduledEntry(b)).toBe(true); // boss still waiting
    enter(b);
    let kept = 0;
    for (let i = 0; i < 100; i++) if (keepScheduledEntry(b)) kept++;
    expect(kept).toBe(60);
  });

  it('a wave due while the boss lives spawns 0.6 of its entries', () => {
    const entries: SpawnEntry[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push({ kind: 'grunt', tOffsetSec: 0, mode: 'fixed', x: -600 + i * 20, y: -400, angleDeg: 0, radius: 0, headingDeg: 0 });
    }
    const waves: WaveSchedule = {
      maxLiveEnemies: 60,
      intervalStartSec: 4,
      intervalEndSec: 2,
      rampSec: 60,
      rampExponent: 1,
      budgetStart: 4,
      budgetEnd: 12,
      waves: [{ index: 0, atSec: 4, pattern: 'edges', entries }],
      loopFromIndex: -1,
      loopPeriodSec: 0,
    };
    const w = bossGame('spindle', { waves });
    park(w, 600, 400);
    run(w, 5);
    expect(count(w, Kind.Grunt)).toBe(6);
    const v = bossGame('spindle', { waves, boss: undefined });
    park(v, 600, 400);
    run(v, 5);
    expect(count(v, Kind.Grunt)).toBe(10);
  });
});

describe('readBoss', () => {
  it('fills the caller object with no allocation and reports the render contract fields', () => {
    const w = bossGame('spindle');
    const id = enter(w);
    const out = createBossView();
    const r = readBoss(w, out);
    expect(r).toBe(out);
    expect(out).toMatchObject({ active: true, id: 2, phase: 1, hp: 5000, maxHp: 5000, radius: BOSS_TABLE.spindle.radius });
    expect(out.x).toBe(w.x[id]);
    expect(out.mode).toBe(BossMode.Attacking);
  });

  it('the first hazard carries the render contract fields', () => {
    const w = bossGame('spindle');
    enter(w);
    run(w, 0.05);
    const h = first(w, Kind.BossHazard);
    expect(w.a[h]).toBe(HazardType.Sweep);
    expect(w.vy[h]).toBe(2);
    expect(w.vx[h]).toBe(380);
    expect(w.radius[h]).toBe(12);
    expect(spawnLane).toBeTypeOf('function');
  });
});
