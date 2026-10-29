// Endless cadence (docs/13 SPEC 3.4 "Endless cadence", docs/01 section 2.2 override): a segment that
// carries a boss spawns it atSec (10 s) after the segment start; the wave clock and every wave spawn
// pause while it lives and resume when it dies. The reward is 5000 x tier and 20 geoms.
import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { bossAlive, damageBoss } from '../../src/game/bosses/core';
import { createEndlessGame } from '../../src/game/game';
import { gs } from '../../src/game/state';
import { Kind } from '../../src/game/world';
import { generateEndless, generateEndlessSegment } from '../../src/levelgen/generator';
import type { EndlessSegmentDef } from '../../src/levelgen/leveldef';
import { count, run } from './bossHelpers';

afterEach(() => bus.clear());

const SEED = 77;

/** Generator segments, with a Warden on segment 1 (a real run puts bosses on multiples of 6). */
function source(s: number): EndlessSegmentDef {
  const seg = generateEndlessSegment(SEED, s);
  return s === 1 ? { ...seg, boss: { id: 'warden', tier: 1, atSec: 10, hpMul: 1 } } : seg;
}

describe('endless boss', () => {
  it('spawns 10 s into its segment, pauses the wave clock and spawns, resumes on death', () => {
    const w = createEndlessGame(generateEndless(SEED), source, { logSpawns: true, vibrate: () => undefined });
    const g = gs(w);
    g.invulnerable = true;
    run(w, 39.9);
    expect(bossAlive(w)).toBe(false);
    run(w, 0.2);
    expect(bossAlive(w)).toBe(true);
    const clock = g.waveClock;
    expect(clock).toBeGreaterThanOrEqual(40);
    expect(clock).toBeLessThan(40.1);
    const spawns = g.spawnLog?.length ?? 0;
    run(w, 15);
    expect(g.waveClock).toBe(clock);
    expect(g.spawnLog?.length).toBe(spawns);
    expect(g.endless?.segment).toBe(1);
    // Death: 5000 x tier and 20 geoms, then the clock runs again.
    const score = g.score;
    const geoms = count(w, Kind.Geom);
    damageBoss(w, 99999, 0, 0, true);
    expect(g.score - score).toBe(5000);
    expect(count(w, Kind.Geom) - geoms).toBeGreaterThanOrEqual(20);
    run(w, 1);
    expect(g.waveClock).toBeGreaterThan(clock + 0.9);
    run(w, 20);
    expect(g.endless?.segment).toBe(2);
    expect(g.outcome).toBe('running');
  });

  it('a run with no boss segment never creates boss state and its wave clock never stops', () => {
    const w = createEndlessGame(generateEndless(SEED), (s) => generateEndlessSegment(SEED, s), { vibrate: () => undefined });
    gs(w).invulnerable = true;
    run(w, 45);
    expect(gs(w).waveClock).toBeCloseTo(45, 1);
    expect(bossAlive(w)).toBe(false);
  });
});
