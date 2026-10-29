// Geom lifetime as the renderer reads it (docs/01 section 5: blink at 8 Hz in the last second).
// The geom keeps its age in w.t, so remaining life is GEOM_LIFE - w.t[id]. No separate field.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { stepGame } from '../../src/game/game';
import { GEOM_LIFE, spawnGeoms } from '../../src/game/geoms';
import { Kind } from '../../src/game/world';
import { DT, idle, makeGame } from './helpers';

afterEach(() => bus.clear());

describe('geom remaining life', () => {
  it('w.t is the age: 0 at spawn, then remaining = GEOM_LIFE - w.t falls from 4 s to 0 and the geom goes', () => {
    const { w } = makeGame();
    w.ship.invuln = 99;
    spawnGeoms(w, 500, 300, 1);
    let id = -1;
    for (let i = 1; i < w.cap; i++) if (w.kind[i] === Kind.Geom) id = i;
    expect(id).toBeGreaterThan(0);
    expect(w.t[id]).toBe(0);
    expect(GEOM_LIFE - (w.t[id] ?? 0)).toBe(GEOM_LIFE);

    let prev = GEOM_LIFE;
    let aliveSteps = 0;
    let blinkSteps = 0;
    for (let i = 0; i < 6 * 120; i++) {
      stepGame(w, DT, idle());
      if (w.alive[id] !== 1 || w.kind[id] !== Kind.Geom) break;
      const remaining = GEOM_LIFE - (w.t[id] ?? 0);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThan(prev);
      prev = remaining;
      aliveSteps++;
      if (remaining <= 1) blinkSteps++;
    }
    expect(w.alive[id]).toBe(0);
    expect(aliveSteps).toBeGreaterThanOrEqual(4 * 120 - 2);
    expect(aliveSteps).toBeLessThanOrEqual(4 * 120);
    // The last second is observable: about 120 steps at 120 Hz where remaining <= 1.
    expect(blinkSteps).toBeGreaterThanOrEqual(118);
    expect(blinkSteps).toBeLessThanOrEqual(121);
  });
});
