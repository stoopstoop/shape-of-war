// Fight length (docs/12 D5, G3A paste). A scripted fight: a gunner who lands the docs/13 open
// fire figure (18 spread hits a second, 180 tenths a second, half of 36 bullets) whenever the core
// is exposed, and pops one Brood pod every POD_REACTION seconds while pods live. It measures the
// seconds from the end of the entrance to the kill, windows included. Calibration from Ryan's G3A
// paste: Warden measured here was "about right"; Brood and Spindle were "too short". Targets: Brood
// 35 to 50 s, Spindle about 25 percent longer than its G3A build (22.2 s here at 400 hit points).
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { damageBoss, damageBossPart, livePart } from '../../src/game/bosses/core';
import { MAX_PARTS } from '../../src/game/bosses/table';
import { PartType } from '../../src/game/bosses/types';
import { stepGame } from '../../src/game/game';
import type { BossId } from '../../src/levelgen/leveldef';
import { bs, bossGame, enter, park } from './bossHelpers';
import { DT, idle } from './helpers';

afterEach(() => bus.clear());

const OPEN_FIRE = 180;
const POD_REACTION = 0.5;
/** Spindle's fight at G3A (build 3a2bb86, 400 hit points) on this same script. */
const SPINDLE_G3A_SEC = 22.2;

function fightSeconds(id: BossId): number {
  const w = bossGame(id, { lives: 99 });
  park(w, 500, 300);
  enter(w);
  const s = bs(w);
  let acc = 0;
  let podClock = 0;
  for (let i = 0; i < 120 * 400; i++) {
    let pod = -1;
    for (let k = 0; k < MAX_PARTS && pod < 0; k++) {
      const p = livePart(w, s, k);
      if (p > 0 && w.a[p] !== PartType.Broodling) pod = p;
    }
    if (s.split) {
      // After Brood's split the gunner keeps the same fire on the Broodlings (perfect aim), one at a time.
      acc += OPEN_FIRE * DT;
      const n = Math.floor(acc);
      let target = -1;
      for (let k = 0; k < MAX_PARTS && target < 0; k++) target = livePart(w, s, k);
      if (n > 0 && target > 0) {
        damageBossPart(w, target, n, 0, 0);
        acc -= n;
      }
    } else if (pod > 0) {
      podClock += DT;
      if (podClock >= POD_REACTION) {
        damageBossPart(w, pod, 9999, 0, 0);
        podClock = 0;
      }
    } else {
      podClock = 0;
    }
    if (s.exposed) {
      acc += OPEN_FIRE * DT;
      const n = Math.floor(acc);
      if (n > 0) {
        damageBoss(w, n, 0, 0);
        acc -= n;
      }
    }
    if (s.status === 'defeated') return i / 120;
    stepGame(w, DT, idle());
  }
  return Infinity;
}

describe('fight length at open fire', () => {
  const warden = fightSeconds('warden');
  const brood = fightSeconds('brood');
  const spindle = fightSeconds('spindle');

  it('reports the three tier 1 fights', () => {
    console.info(`fight seconds: warden ${warden.toFixed(1)}, brood ${brood.toFixed(1)}, spindle ${spindle.toFixed(1)}`);
    expect(Number.isFinite(warden)).toBe(true);
  });

  it('brood lasts 35 to 50 s', () => {
    expect(brood).toBeGreaterThanOrEqual(35);
    expect(brood).toBeLessThanOrEqual(50);
  });

  it('spindle lasts about 25 percent longer than at G3A', () => {
    expect(spindle / SPINDLE_G3A_SEC).toBeGreaterThanOrEqual(1.2);
    expect(spindle / SPINDLE_G3A_SEC).toBeLessThanOrEqual(1.32);
  });

  it('warden, "about right" at G3A, is unchanged in the same band as brood', () => {
    expect(warden).toBeGreaterThanOrEqual(35);
    expect(warden).toBeLessThanOrEqual(55);
  });
});
