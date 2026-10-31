// V3 harden: boss replay for each of the ten bosses (docs/12 Proctor brief, docs/13 "Engineering rules
// that stay" rule 4). The same LevelDef and the same input log must give an identical boss, part and
// hazard log, an identical add and enemy bullet count and checksum, and an identical event log.
//   Recording: the real generated boss level (cross module: generator, boss schedule, sim, combat,
//   boss kit, enemy bullets) is played by a player model that reads the world (strafe, shoot the boss,
//   a bomb every 25 s) and every input frame is logged.
//   Replay: a fresh world from a JSON copy of the LevelDef is driven blind from a JSON copy of the log.
// Scope trim agreed in the brief: 60 s of sim time per boss, not 120 s. Math.random throws in here,
// so any boss, hazard or bullet code that reached for it fails the test.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bus } from '../../src/core/events';
import type { BossId } from '../../src/levelgen/leveldef';
import { BOSS_IDS, SESSION_STEPS, bossLevelFor, firstDiff, play } from './bossHarness';
import type { InputRec } from './bossHarness';

afterEach(() => {
  bus.clear();
  vi.restoreAllMocks();
});

/** Column positions in a tick digest (see tickDigest). */
const HP = 2;
const HAZARDS = 5;
const PARTS = 7;
const ADDS = 9;
const BULLETS = 10;

function column(digests: readonly number[][], col: number): number[] {
  return digests.map((d) => d[col] ?? 0);
}

describe('boss replay: same LevelDef and input log give an identical boss, part and hazard log', { timeout: 120_000 }, () => {
  const totals = { damage: 0, hazardTicks: 0, partTicks: 0, bulletTicks: 0, addTicks: 0, entered: 0 };

  it.each(BOSS_IDS.map((id) => [id]))('%s: 60 s, recorded then replayed from JSON copies', (id: BossId) => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random called');
    });
    const level = bossLevelFor(id);
    expect(level.boss?.id).toBe(id);
    const first = play(level, SESSION_STEPS, 7, 0, null);
    const levelCopy = JSON.parse(JSON.stringify(level)) as typeof level;
    const logCopy = JSON.parse(JSON.stringify(first.inputs)) as InputRec[];
    const again = play(levelCopy, SESSION_STEPS, 7, 0, logCopy);

    expect(first.steps).toBe(SESSION_STEPS);
    expect(again.steps).toBe(SESSION_STEPS);
    const bad = firstDiff(first.digests, again.digests);
    expect(bad, 'first tick where the boss, parts, hazards, adds, bullets, score or lives differ').toBe(-1);
    expect(again.events).toEqual(first.events);

    // Not vacuous: the boss entered, and something of the fight is in the log.
    expect(first.events.some((e) => e.includes('|enter|'))).toBe(true);
    const hp = column(first.digests, HP);
    const maxHp = Math.max(...hp);
    expect(maxHp).toBeGreaterThan(0);
    totals.damage += maxHp - Math.min(...hp.filter((v) => v > 0));
    totals.hazardTicks += column(first.digests, HAZARDS).filter((v) => v > 0).length;
    totals.partTicks += column(first.digests, PARTS).filter((v) => v > 0).length;
    totals.bulletTicks += column(first.digests, BULLETS).filter((v) => v > 0).length;
    totals.addTicks += column(first.digests, ADDS).filter((v) => v > 0).length;
    totals.entered++;
  });

  it('a different input log gives a different fight (the log really drives the replay)', () => {
    const level = bossLevelFor('warden');
    const a = play(level, 120 * 20, 7, 0, null);
    const b = play(level, 120 * 20, 8, 1, null);
    expect(firstDiff(a.digests, b.digests)).toBeGreaterThanOrEqual(0);
  });

  it('the ten sessions together saw damage, hazards, parts, adds and enemy bullets (the sweep is not vacuous)', () => {
    expect(totals.entered).toBe(BOSS_IDS.length);
    expect(totals.damage).toBeGreaterThan(0);
    expect(totals.hazardTicks).toBeGreaterThan(0);
    expect(totals.partTicks).toBeGreaterThan(0);
    expect(totals.addTicks).toBeGreaterThan(0);
    expect(totals.bulletTicks).toBeGreaterThan(0);
  });
});
