// Brood (docs/12 roster row 2): immune until its three pods die, then open for 5 s, then closed
// again until the pods regrow 10 s after the last one died. Adds from its flanks, Darts in phase 2,
// at most 8 live. Pods score 0, drop nothing and count 0 kills.
import { afterEach, describe, expect, it } from 'vitest';
import { bus, type Events } from '../../src/core/events';
import { countParts, damageBoss, damageBossPart, livePart } from '../../src/game/bosses/core';
import { BROOD, MAX_ADDS } from '../../src/game/bosses/table';
import { PartType } from '../../src/game/bosses/types';
import { spawnBullet } from '../../src/game/bullets';
import { rebuild } from '../../src/game/collide';
import { bulletHits } from '../../src/game/combat';
import { stepGame } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { distBetween } from '../../src/game/steer';
import { Kind, type World } from '../../src/game/world';
import { bs, bossGame, count, enter, park, run } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

function killPods(w: World): void {
  const s = bs(w);
  for (let k = 0; k < BROOD.podCount; k++) {
    const p = livePart(w, s, k);
    if (p > 0) damageBossPart(w, p, BROOD.podHp, 0, 0);
  }
}

describe('brood', () => {
  it('enters with three pods orbiting at 90 u', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    const id = enter(w);
    expect(count(w, Kind.BossPart)).toBe(3);
    const s = bs(w);
    for (let k = 0; k < 3; k++) {
      const p = livePart(w, s, k);
      expect(w.a[p]).toBe(PartType.Pod);
      expect(w.hp[p]).toBe(BROOD.podHp);
    }
    run(w, 2);
    for (let k = 0; k < 3; k++) {
      const p = livePart(w, s, k);
      expect(distBetween(w, id, p)).toBeLessThanOrEqual(BROOD.podOrbit + 0.01);
    }
  });

  it('is immune until its pods die, open 5 s, then closes again until they regrow at 10 s', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    const id = enter(w);
    const hp0 = w.hp[id] ?? 0;
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0);
    // Two pods down: still immune.
    const s = bs(w);
    damageBossPart(w, livePart(w, s, 0), BROOD.podHp, 0, 0);
    damageBossPart(w, livePart(w, s, 1), BROOD.podHp, 0, 0);
    stepGame(w, DT, idle());
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0);
    killPods(w);
    stepGame(w, DT, idle());
    expect(s.open).toBe(true);
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0 - 10);
    run(w, BROOD.openSec - 0.1);
    expect(s.open).toBe(true);
    run(w, 0.2);
    expect(s.open).toBe(false);
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0 - 10);
    expect(countParts(w, s)).toBe(0);
    run(w, BROOD.regrowSec - BROOD.openSec - 0.3);
    expect(countParts(w, s)).toBe(0);
    run(w, 0.3);
    expect(countParts(w, s)).toBe(3);
    damageBoss(w, 10, 0, 0);
    expect(w.hp[id]).toBe(hp0 - 10);
  });

  it('a spread bullet breaks a pod: fx:kill with Kind.BossPart, no score, no geoms, no kill', () => {
    const kills: Events['fx:kill'][] = [];
    bus.on('fx:kill', (p) => kills.push({ ...p }));
    const w = bossGame('brood');
    park(w, 0, 0);
    enter(w);
    const s = bs(w);
    const g = gs(w);
    const p = livePart(w, s, 0);
    rebuild(w.grid, w);
    const score = g.score;
    const k0 = g.kills;
    spawnBullet(w.bullets, w.x[p] ?? 0, w.y[p] ?? 0, 0, 0, 1);
    bulletHits(w);
    expect(w.alive[p]).toBe(0);
    expect(kills.at(-1)).toMatchObject({ kind: Kind.BossPart, colour: 'bossGreen' });
    expect(g.score).toBe(score);
    expect(g.kills).toBe(k0);
    expect(count(w, Kind.Geom)).toBe(0);
  });

  it('summons three Grunts 2 s after entering, Darts in phase 2, never more than 8 live', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    enter(w);
    run(w, BROOD.firstAdds - 0.1);
    expect(count(w, Kind.Grunt)).toBe(0);
    run(w, 0.2);
    expect(count(w, Kind.Grunt)).toBe(3);
    let most = 0;
    for (let i = 0; i < 120 * 40; i++) {
      stepGame(w, DT, idle());
      most = Math.max(most, count(w, Kind.Grunt) + count(w, Kind.Dart));
    }
    expect(most).toBe(MAX_ADDS);
    // Phase 2: Darts.
    const v = bossGame('brood');
    park(v, 0, 0);
    enter(v);
    killPods(v);
    stepGame(v, DT, idle());
    damageBoss(v, 2001, 0, 0);
    expect(bs(v).phase).toBe(2);
    run(v, BROOD.firstAdds + 1.2);
    expect(count(v, Kind.Dart)).toBe(3);
    expect(count(v, Kind.Grunt)).toBe(0);
  });

  it('hugs the boundary, moving clockwise', () => {
    const w = bossGame('brood');
    park(w, 0, 0);
    const id = enter(w);
    run(w, 3);
    const a0 = Math.atan2(w.y[id] ?? 0, w.x[id] ?? 0);
    const x = Math.abs(w.x[id] ?? 0);
    const y = Math.abs(w.y[id] ?? 0);
    const r = w.radius[id] ?? 0;
    expect(x >= 700 - r - 1 || y >= 450 - r - 1).toBe(true);
    run(w, 1);
    const a1 = Math.atan2(w.y[id] ?? 0, w.x[id] ?? 0);
    let d = a1 - a0;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    expect(d).toBeGreaterThan(0);
  });
});
