// Prism (tier 4, roster row 10): the 4 s damage cycle and its window, the shield leak, the four
// phases, the caps under fuzzed input, tier 4 fairness, determinism and the single bonus.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bus } from '../../src/core/events';
import { countAdds, countHazards, damageBoss, phaseFor, syncBossPhase } from '../../src/game/bosses/core';
import { bossBonusAwarded, bossDefOf } from '../../src/game/bosses/index';
import { hazardHits, hazardTelegraph, ringGapMin } from '../../src/game/bosses/kit';
import {
  averageMul,
  cycleT,
  damageMul,
  fightSeconds,
  kitFor,
  PRISM_CYCLE,
  PrismStage,
  stageAt,
} from '../../src/game/bosses/prism';
import { bossOf } from '../../src/game/bosses/state';
import { BOSS_TABLE, MAX_ADDS, MAX_PARTS, PRISM } from '../../src/game/bosses/table';
import { HazardType, PartType } from '../../src/game/bosses/types';
import { createGame, stepGame } from '../../src/game/game';
import { SHIP_RADIUS } from '../../src/game/ship';
import { gs } from '../../src/game/state';
import { Kind, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import { bossGame, bossLevel, bs, count, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => {
  bus.clear();
  vi.restoreAllMocks();
});

/** Deterministic integer hash in [0, 1) for fuzzed input (no Math.random). */
function h01(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return x / 4294967296;
}

function fuzz(step: number, out: InputState): InputState {
  const seg = Math.floor(step / 30);
  out.move.active = h01(seg * 3 + 1) > 0.15;
  out.move.x = h01(seg * 3 + 2) * 2 - 1;
  out.move.y = h01(seg * 3 + 3) * 2 - 1;
  out.aim.active = true;
  out.aim.x = Math.cos(step * 0.01);
  out.aim.y = Math.sin(step * 0.01);
  out.bomb = step % (120 * 23) === 120 * 11;
  out.superPressed = step % (120 * 17) === 0 && step > 0;
  return out;
}

/** Spread hits at hitsPerSec on the boss body each step (accumulated), as if every shot landed. */
function makeHammer(hitsPerSec: number): (w: World) => void {
  let acc = 0;
  return (w: World) => {
    const s = bossOf(w);
    if (s === null || s.status !== 'alive' || s.mode === 0) return;
    acc += hitsPerSec * DT;
    while (acc >= 1) {
      acc -= 1;
      if (s.id > 0) damageBoss(w, 10, w.x[s.id] ?? 0, w.y[s.id] ?? 0);
    }
  };
}

describe('prism pure rules', () => {
  it('is registered with 1000 hit points and four phases', () => {
    expect(bossDefOf('prism')).not.toBeNull();
    expect(BOSS_TABLE.prism.hp).toBe(1000);
    expect(BOSS_TABLE.prism.phases).toBe(4);
  });

  it('the 4 s cycle: 2.3 s colour, 0.5 s run to white, 1.2 s window', () => {
    expect(PRISM_CYCLE).toBeCloseTo(4, 9);
    expect(stageAt(0)).toBe(PrismStage.Colour);
    expect(stageAt(2.29)).toBe(PrismStage.Colour);
    expect(stageAt(2.31)).toBe(PrismStage.White);
    expect(stageAt(2.79)).toBe(PrismStage.White);
    expect(stageAt(2.81)).toBe(PrismStage.Window);
    expect(stageAt(3.99)).toBe(PrismStage.Window);
    expect(stageAt(4.01)).toBe(PrismStage.Colour);
    expect(cycleT(10.5)).toBeCloseTo(2.5, 9);
  });

  it('full damage in the window, 25 percent outside it, a 0.475 average', () => {
    expect(damageMul(3)).toBe(1);
    expect(damageMul(1)).toBe(0.25);
    expect(damageMul(2.5)).toBe(0.25);
    expect(averageMul()).toBeCloseTo(0.475, 9);
  });

  it('hit point arithmetic: about 117 s at 18 spread hits a second', () => {
    expect(fightSeconds(1000, 18)).toBeCloseTo(116.96, 1);
  });

  it('phases at 75, 50 and 25 percent, and the cut 7 mapping keeps phases 1 and 4', () => {
    expect(phaseFor(7500, 10000, 4)).toBe(1);
    expect(phaseFor(7499, 10000, 4)).toBe(2);
    expect(phaseFor(5000, 10000, 4)).toBe(2);
    expect(phaseFor(4999, 10000, 4)).toBe(3);
    expect(phaseFor(2500, 10000, 4)).toBe(3);
    expect(phaseFor(2499, 10000, 4)).toBe(4);
    for (let p = 1; p <= 4; p++) expect(kitFor(p, 4)).toBe(p);
    expect(kitFor(1, 2)).toBe(1);
    expect(kitFor(2, 2)).toBe(4);
  });
});

describe('prism in the sim', () => {
  it('a hit in the window lands in full, outside it a quarter (exact over four hits)', () => {
    const w = bossGame('prism');
    const id = enter(w);
    const s = bs(w);
    for (let i = 0; i < 120 * 4 && s.open; i++) stepGame(w, DT, idle());
    expect(s.open).toBe(false);
    let hp = w.hp[id] ?? 0;
    for (let k = 0; k < 4; k++) damageBoss(w, 10, w.x[id] ?? 0, w.y[id] ?? 0);
    expect(hp - (w.hp[id] ?? 0)).toBe(10);
    for (let i = 0; i < 120 * 4 && !s.open; i++) stepGame(w, DT, idle());
    expect(s.open).toBe(true);
    expect(s.exposed).toBe(true);
    hp = w.hp[id] ?? 0;
    damageBoss(w, 10, w.x[id] ?? 0, w.y[id] ?? 0);
    expect(hp - (w.hp[id] ?? 0)).toBe(10);
  });

  it('the window opens for 1.2 s every 4 s, after a 0.5 s run to white', () => {
    const w = bossGame('prism');
    enter(w);
    const s = bs(w);
    const opens: number[] = [];
    const closes: number[] = [];
    const whites: number[] = [];
    let wasOpen = s.open;
    let wasMode = s.mode;
    for (let i = 1; i <= 120 * 13; i++) {
      stepGame(w, DT, idle());
      if (s.open !== wasOpen) (s.open ? opens : closes).push(i * DT);
      if (s.mode !== wasMode && s.mode === 2) whites.push(i * DT);
      wasOpen = s.open;
      wasMode = s.mode;
    }
    expect(opens.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < opens.length; k++) expect((opens[k] ?? 0) - (opens[k - 1] ?? 0)).toBeCloseTo(4, 1);
    for (let k = 0; k < opens.length; k++) {
      const c = closes.find((t) => t > (opens[k] ?? 0));
      if (c !== undefined) expect(c - (opens[k] ?? 0)).toBeCloseTo(1.2, 1);
      const wt = whites.filter((t) => t < (opens[k] ?? 0)).pop();
      if (wt !== undefined) expect((opens[k] ?? 0) - wt).toBeCloseTo(0.5, 1);
    }
  });

  it('four phases at the thresholds, each with its own kit', () => {
    const w = bossGame('prism');
    const id = enter(w);
    const s = bs(w);
    run(w, 0.5);
    expect(count(w, Kind.BossPart)).toBe(PRISM.pods);
    w.hp[id] = 7500;
    syncBossPhase(w, s, id);
    expect(s.phase).toBe(1);
    w.hp[id] = 7499;
    syncBossPhase(w, s, id);
    expect(s.phase).toBe(2);
    expect(count(w, Kind.BossPart)).toBe(0);
    run(w, 2);
    let sweeps = 0;
    for (let h = 1; h < w.cap; h++) if (w.alive[h] === 1 && w.kind[h] === Kind.BossHazard && w.a[h] === HazardType.Sweep) sweeps++;
    expect(sweeps).toBe(1);
    w.hp[id] = 4999;
    syncBossPhase(w, s, id);
    expect(s.phase).toBe(3);
    run(w, 2);
    let pulls = 0;
    for (let h = 1; h < w.cap; h++) if (w.alive[h] === 1 && w.kind[h] === Kind.BossHazard && w.a[h] === HazardType.Pull) pulls++;
    expect(pulls).toBe(1);
    w.hp[id] = 2499;
    syncBossPhase(w, s, id);
    expect(s.phase).toBe(4);
    run(w, 2);
    let turrets = 0;
    for (let h = 1; h < w.cap; h++) if (w.alive[h] === 1 && w.kind[h] === Kind.BossPart && w.a[h] === PartType.Turret) turrets++;
    expect(turrets).toBe(PRISM.turrets);
  });

  it('caps hold across 120 s of fuzzed input through every phase, and no second boss', () => {
    const w = bossGame('prism', { lives: 99 });
    const s = bs(w);
    const hammer = makeHammer(16);
    const input = idle();
    let maxPhase = 1;
    for (let i = 0; i < 120 * 120; i++) {
      stepGame(w, DT, fuzz(i, input));
      hammer(w);
      expect(countHazards(w)).toBeLessThanOrEqual(PRISM.maxHazards);
      expect(count(w, Kind.BossPart)).toBeLessThanOrEqual(MAX_PARTS);
      expect(countAdds(w, s)).toBeLessThanOrEqual(MAX_ADDS);
      expect(countAdds(w, s)).toBe(0);
      expect(count(w, Kind.Boss)).toBeLessThanOrEqual(1);
      if (s.phase > maxPhase) maxPhase = s.phase;
    }
    expect(maxPhase).toBe(4);
  });

  it('tier 4 fairness: every hazard is born off the ship with the 0.6 s telegraph, 45 deg gaps, 60 u lanes', () => {
    expect(hazardTelegraph(4)).toBe(0.6);
    expect(ringGapMin(4)).toBeCloseTo(Math.PI / 4);
    const w = bossGame('prism', { lives: 99 });
    const s = bs(w);
    const hammer = makeHammer(16);
    const input = idle();
    let born = 0;
    for (let i = 0; i < 120 * 110; i++) {
      stepGame(w, DT, fuzz(i, input));
      hammer(w);
      for (let h = 1; h < w.cap; h++) {
        if (w.alive[h] !== 1 || w.kind[h] !== Kind.BossHazard || (w.t[h] ?? 0) > DT * 1.5) continue;
        const type = w.a[h] ?? -1;
        if (type === HazardType.Pull) continue;
        if (s.hzMarker[h] === 1) {
          expect(s.hzLife[h] ?? 0).toBeLessThan(s.hzTele[h] ?? 0);
          continue;
        }
        born++;
        expect(s.hzTele[h]).toBeCloseTo(0.6, 5);
        if (type === HazardType.Ring) expect((w.vx[h] ?? 0) * 2).toBeGreaterThanOrEqual(ringGapMin(4) - 1e-6);
        if (type === HazardType.Lane) expect((w.radius[h] ?? 0) * 2).toBeLessThanOrEqual(60);
        const hit = hazardHits(type, w.x[0] ?? 0, w.y[0] ?? 0, SHIP_RADIUS, w.x[h] ?? 0, w.y[h] ?? 0, w.rot[h] ?? 0, w.radius[h] ?? 0, w.vx[h] ?? 0, w.vy[h] ?? 0);
        expect(hit).toBe(false);
      }
    }
    expect(born).toBeGreaterThan(10);
  });

  it('tier 4 fairness: respawn invulnerability is honoured by the body and every hazard', () => {
    const w = bossGame('prism', { lives: 3 }, {}, false);
    park(w, 400, 250);
    w.ship.invuln = 0;
    const boss = enter(w);
    w.ship.invuln = 3;
    for (let i = 0; i < 120 * 2.5; i++) {
      park(w, w.x[boss] ?? 0, w.y[boss] ?? 0);
      stepGame(w, DT, idle());
    }
    expect(w.ship.active).toBe(true);
    expect(gs(w).lives).toBe(3);
  });

  it('determinism: an identical log over 60 s, no Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random called');
    });
    const record = (): number[] => {
      const w = createGame(bossLevel('prism', { lives: 40, par: 6000 }, 2), { vibrate: () => undefined });
      const hammer = makeHammer(40);
      const input = idle();
      const log: number[] = [];
      for (let i = 0; i < 120 * 60; i++) {
        stepGame(w, DT, fuzz(i, input));
        hammer(w);
        const s = bossOf(w);
        const b = s === null ? -1 : s.id;
        log.push(b > 0 ? (w.x[b] ?? 0) : 0, b > 0 ? (w.y[b] ?? 0) : 0, b > 0 ? (w.hp[b] ?? 0) : 0, s === null ? 0 : s.phase);
        let sum = 0;
        for (let h = 1; h < w.cap; h++) {
          const k = w.kind[h] ?? 0;
          if (w.alive[h] !== 1 || (k !== Kind.BossHazard && k !== Kind.BossPart)) continue;
          sum += h * 7 + k * 13 + (w.a[h] ?? 0) + (w.x[h] ?? 0) + (w.y[h] ?? 0) * 3 + (w.rot[h] ?? 0) * 11 + (w.radius[h] ?? 0) + (w.hp[h] ?? 0);
        }
        log.push(sum, gs(w).score, gs(w).lives);
      }
      return log;
    };
    const a = record();
    const b = record();
    expect(a).toEqual(b);
    expect(Math.max(...a.filter((_, i) => i % 7 === 3))).toBe(4);
  });

  it('the fight ends near 117 s at 18 hits a second and awards the bonus once', () => {
    const w = bossGame('prism', { lives: 99, par: 6000 });
    let downs = 0;
    bus.on('sim:bossDown', () => {
      downs++;
    });
    const id = enter(w);
    const s = bs(w);
    const hammer = makeHammer(18);
    let t = 0;
    while (s.status === 'alive' && t < 200) {
      stepGame(w, DT, idle());
      hammer(w);
      t += DT;
    }
    expect(s.status).toBe('defeated');
    expect(t).toBeGreaterThan(105);
    expect(t).toBeLessThan(130);
    expect(downs).toBe(1);
    const bonus = bossBonusAwarded(w);
    expect(bonus).toBeGreaterThan(0);
    const score = gs(w).score;
    expect(damageBoss(w, 10, 0, 0)).toBe(false);
    run(w, 2);
    expect(downs).toBe(1);
    expect(bossBonusAwarded(w)).toBe(bonus);
    expect(gs(w).score).toBeGreaterThanOrEqual(score);
    expect(w.alive[id] === 1 && w.kind[id] === Kind.Boss).toBe(false);
  });
});
