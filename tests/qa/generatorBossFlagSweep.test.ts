// V3-A: generator sweep with GenConfig.enableBosses off and on (docs/13 SPEC 3.3 rules 3 to 5).
//   flag off: every level and segment is byte identical to v2.1. The digests below were captured
//             by running the generator sources of main 4771347 (v2.1 plus the V3 stubs, which read
//             no flag) unmodified over the same loops, and this branch with V2_GEN_CONFIG gave the
//             same two numbers.
//   flag on:  every non boss level and segment equals flag off byte for byte; a boss level differs
//             only by the boss field, generatorVersion 3 and the rule 12 hazard step, and needs the
//             same number of re-derives.
// No browser, no Math.random: every input is a pure function of the loop counter.
import { beforeAll, describe, expect, it } from 'vitest';
import { bossForLevel, bossForSegment, bossHazards } from '../../src/levelgen/boss';
import { generateEndless, generateEndlessSegment, generateLevel, levelHash } from '../../src/levelgen/generator';
import { DEFAULT_GEN_CONFIG, GENERATOR_VERSION_V3, V2_GEN_CONFIG, fmix32 } from '../../src/levelgen/leveldef';
import type { LevelDef } from '../../src/levelgen/leveldef';
import { validateLevel, validateSegment } from '../../src/levelgen/validate';

const SEEDS = 1000;
/** Odd 32-bit multiplier (2^32 over the golden ratio), as in the other sweeps. */
const SPREAD = 2654435761;
/** Both sides of every band edge, every pass 1 boss tier, the first two pass 2 bosses and a pass 2 end. */
const LEVELS = [1, 4, 5, 6, 10, 13, 15, 20, 25, 30, 31, 35, 40, 45, 50, 55, 60, 85] as const;
const ENDLESS_SEEDS = 50;
const LAST_SEGMENT = 36;
/** Digests of main 4771347 (v2.1) over the loops below. A change means flag off output moved. */
const V21_LEVEL_DIGEST = 'bfbf1886';
const V21_ENDLESS_DIGEST = '40cefa1e';

const ON = DEFAULT_GEN_CONFIG;
const OFF = V2_GEN_CONFIG;

/** FNV-1a folded over strings: one number for a long list of hashes. */
function fold(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

interface Problems {
  nonBossDiffers: string[];
  bossShape: string[];
  bossRest: string[];
  hazardStep: string[];
  retries: string[];
  onInvalid: string[];
  offInvalid: string[];
}

interface Sweep {
  digest: string;
  problems: Problems;
  bossLevels: number;
  nonBossLevels: number;
  spawnersRemoved: number;
  wellsTrimmed: number;
  offMs: number;
  onMs: number;
}

/** Every top level field of a LevelDef except the three the boss step may change. */
function rest(d: LevelDef): string {
  const { boss: _b, generatorVersion: _g, hazards: _h, ...r } = d;
  return JSON.stringify(r);
}

function runSweep(): Sweep {
  const p: Problems = { nonBossDiffers: [], bossShape: [], bossRest: [], hazardStep: [], retries: [], onInvalid: [], offInvalid: [] };
  let h = 0x811c9dc5;
  let bossLevels = 0;
  let nonBossLevels = 0;
  let spawnersRemoved = 0;
  let wellsTrimmed = 0;
  let offMs = 0;
  let onMs = 0;
  for (let s = 0; s < SEEDS; s++) {
    const seed = (s * SPREAD) >>> 0;
    for (const n of LEVELS) {
      const id = `seed ${seed} level ${n}`;
      const t0 = performance.now();
      const off = generateLevel(seed, n, OFF);
      const t1 = performance.now();
      const on = generateLevel(seed, n, ON);
      onMs += performance.now() - t1;
      offMs += t1 - t0;
      h = fold(h, levelHash(off));
      if (!validateLevel(off, OFF).ok) p.offInvalid.push(id);
      if (!validateLevel(on, ON).ok) p.onInvalid.push(id);
      if (on.retries !== off.retries) p.retries.push(`${id}: ${String(on.retries)} on, ${String(off.retries)} off`);
      const want = bossForLevel(n);
      if (want === null) {
        nonBossLevels++;
        if (JSON.stringify(on) !== JSON.stringify(off)) p.nonBossDiffers.push(id);
        continue;
      }
      bossLevels++;
      if (off.boss !== undefined || JSON.stringify(on.boss) !== JSON.stringify(want) || on.generatorVersion !== GENERATOR_VERSION_V3) p.bossShape.push(id);
      if (rest(on) !== rest(off)) p.bossRest.push(id);
      if (JSON.stringify(on.hazards) !== JSON.stringify(bossHazards(off.hazards))) p.hazardStep.push(id);
      if (on.hazards.spawners.length > 0 || on.hazards.wells.length > 1) p.hazardStep.push(`${id}: rule 12`);
      if (off.hazards.spawners.length > 0) spawnersRemoved++;
      if (off.hazards.wells.length > 1) wellsTrimmed++;
    }
  }
  return { digest: fmix32(h).toString(16), problems: p, bossLevels, nonBossLevels, spawnersRemoved, wellsTrimmed, offMs, onMs };
}

describe('generator sweep with enableBosses off and on (1000 seeds)', { timeout: 300_000 }, () => {
  let sweep: Sweep;
  beforeAll(() => {
    sweep = runSweep();
  }, 300_000);

  it('flag off: 1000 seeds x 18 levels hash exactly as the v2.1 generator did', () => {
    expect(sweep.digest).toBe(V21_LEVEL_DIGEST);
  });

  it('flag off: every level validates strictly with the off config (J7 included)', () => {
    expect(sweep.problems.offInvalid.slice(0, 5)).toEqual([]);
  });

  it('flag on: every level validates strictly with the on config (B1 to B4)', () => {
    expect(sweep.problems.onInvalid.slice(0, 5)).toEqual([]);
  });

  it('flag on: every non boss level equals flag off byte for byte', () => {
    expect(sweep.problems.nonBossDiffers.slice(0, 5)).toEqual([]);
  });

  it('flag on: a boss level carries the scheduled boss and version 3, flag off none', () => {
    expect(sweep.problems.bossShape.slice(0, 5)).toEqual([]);
  });

  it('flag on: a boss level differs only by the boss field, the version and the hazard step', () => {
    expect(sweep.problems.bossRest.slice(0, 5)).toEqual([]);
    expect(sweep.problems.hazardStep.slice(0, 5)).toEqual([]);
  });

  it('the boss step never changes how many re-derives a level needs', () => {
    expect(sweep.problems.retries.slice(0, 5)).toEqual([]);
  });

  it('is not vacuous: it sweeps boss and non boss levels, and rule 12 removed spawners and trimmed wells', () => {
    expect(sweep.bossLevels).toBe(SEEDS * LEVELS.filter((n) => n % 5 === 0).length);
    expect(sweep.nonBossLevels).toBe(SEEDS * LEVELS.filter((n) => n % 5 !== 0).length);
    expect(sweep.spawnersRemoved).toBeGreaterThan(100);
    expect(sweep.wellsTrimmed).toBeGreaterThan(100);
  });

  it('flag on costs less than 2 times the flag off generation time (the step is a lookup and a slice)', () => {
    expect(sweep.offMs).toBeGreaterThan(0);
    expect(sweep.onMs / sweep.offMs).toBeLessThan(2);
  });
});

describe('Endless with enableBosses off and on', { timeout: 120_000 }, () => {
  it('flag off: the def and segments 0 to 36 of 50 seeds hash exactly as the v2.1 generator did', () => {
    let e = 0x811c9dc5;
    for (let s = 0; s < ENDLESS_SEEDS; s++) {
      e = fold(e, levelHash(generateEndless(s, OFF)));
      for (let k = 0; k <= LAST_SEGMENT; k++) e = fold(e, JSON.stringify(generateEndlessSegment(s, k, OFF)));
    }
    expect(fmix32(e).toString(16)).toBe(V21_ENDLESS_DIGEST);
  });

  it('flag on: only segments 6, 12, 18 and so on change, and only by the boss and the version', () => {
    const bad: string[] = [];
    for (let s = 0; s < ENDLESS_SEEDS; s++) {
      if (JSON.stringify(generateEndless(s, ON)) !== JSON.stringify(generateEndless(s, OFF))) bad.push(`def ${s}`);
      for (let k = 0; k <= LAST_SEGMENT; k++) {
        const on = generateEndlessSegment(s, k, ON);
        const off = generateEndlessSegment(s, k, OFF);
        if (!validateSegment(on, ON).ok || !validateSegment(off, OFF).ok) bad.push(`${s}/${k}: invalid`);
        const want = bossForSegment(k);
        if (want === null) {
          if (JSON.stringify(on) !== JSON.stringify(off)) bad.push(`${s}/${k}: non boss segment differs`);
          continue;
        }
        const { boss, generatorVersion, ...r } = on;
        const { generatorVersion: _g, ...rOff } = off;
        if (JSON.stringify(boss) !== JSON.stringify(want) || generatorVersion !== GENERATOR_VERSION_V3) bad.push(`${s}/${k}: boss`);
        if (JSON.stringify(r) !== JSON.stringify(rOff)) bad.push(`${s}/${k}: rest differs`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
