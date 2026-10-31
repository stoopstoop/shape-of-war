import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OWNERS, OWNERS_V2, OWNERS_V3, V3_WAVES, WAVES, auditPaths, isOwned, ownersOf, ownsFromList, parseNameStatus, parseV3Wave, parseWave } from './ownership';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const AGENTS_DIR = join(ROOT, '.claude/agents');

describe('isOwned', () => {
  const swarm = OWNERS.swarm;
  const ledger = OWNERS.ledger;

  it('matches directories by prefix and files exactly', () => {
    expect(swarm && isOwned(swarm, 'src/game/enemies/dart.ts')).toBe(true);
    expect(swarm && isOwned(swarm, 'tests/game/combat.test.ts')).toBe(true);
    expect(ledger && isOwned(ledger, 'src/main.ts')).toBe(true);
    expect(ledger && isOwned(ledger, 'src/main.tsx')).toBe(false);
    expect(ledger && isOwned(ledger, 'src/ui/hud.ts')).toBe(true);
  });

  it('does not match a sibling directory that shares a name prefix', () => {
    expect(swarm && isOwned(swarm, 'src/gameplay/x.ts')).toBe(false);
    expect(swarm && isOwned(swarm, 'tests/game2/x.ts')).toBe(false);
  });

  it('honours except: scoring.ts is Ledger only, not Swarm', () => {
    expect(swarm && isOwned(swarm, 'src/game/scoring.ts')).toBe(false);
    expect(ledger && isOwned(ledger, 'src/game/scoring.ts')).toBe(true);
    expect(ownersOf('src/game/scoring.ts')).toEqual(['ledger']);
  });

  it('src/core/types.ts is nobody\'s (Fable only)', () => {
    expect(ownersOf('src/core/types.ts')).toEqual([]);
  });

  it('files in shared areas report every owner', () => {
    expect(ownersOf('src/main.ts').sort()).toEqual(['forge', 'ledger']);
    expect(ownersOf('tests/settings/settings.test.ts').sort()).toEqual(['forge', 'ledger']);
  });
});

describe('parseNameStatus', () => {
  it('reads added, modified and deleted lines and skips blanks', () => {
    expect(parseNameStatus('A\tsrc/a.ts\nM\tsrc/b.ts\n\nD\tsrc/c.ts\n')).toEqual([
      { status: 'A', path: 'src/a.ts' },
      { status: 'M', path: 'src/b.ts' },
      { status: 'D', path: 'src/c.ts' },
    ]);
  });

  it('turns a rename into a deletion of the old path plus the new path', () => {
    expect(parseNameStatus('R087\tsrc/old.ts\tsrc/new.ts\n')).toEqual([
      { status: 'D', path: 'src/old.ts' },
      { status: 'R087', path: 'src/new.ts' },
    ]);
  });
});

describe('auditPaths', () => {
  const changes = parseNameStatus(['M\tsrc/game/combat.ts', 'M\tsrc/ui/hud.ts', 'A\ttests/game/new.test.ts', 'M\tpackage.json'].join('\n'));

  it('splits owned from outside for swarm', () => {
    const a = auditPaths('swarm', changes);
    expect(a.owned).toEqual(['src/game/combat.ts', 'tests/game/new.test.ts']);
    expect(a.outside).toEqual(['src/ui/hud.ts', 'package.json']);
  });

  it('treats everything as outside for an unknown agent', () => {
    expect(auditPaths('nobody', changes).outside).toHaveLength(4);
  });

  it('an agent that touches only its own paths has an empty outside list', () => {
    expect(auditPaths('proctor', parseNameStatus('A\ttests/qa/x.test.ts\nA\tdocs/qa/perf-log.md')).outside).toEqual([]);
  });
});

describe('owner table sanity', () => {
  it('every owned directory that should exist today exists in the repo', () => {
    for (const [agent, rule] of Object.entries(OWNERS)) {
      for (const d of rule.dirs) expect(existsSync(join(ROOT, d)), `${agent}: ${d}`).toBe(true);
    }
  });

  it('every directory entry ends in a slash (prefix match relies on it)', () => {
    for (const rule of Object.values(OWNERS)) for (const d of rule.dirs) expect(d.endsWith('/'), d).toBe(true);
  });
});

describe('v2 owner tables (docs/10, one per wave)', () => {
  const owners = (path: string, wave: (typeof WAVES)[number]): string[] => ownersOf(path, OWNERS_V2[wave]);

  it('names the roles that run in each wave and no others', () => {
    expect(Object.keys(OWNERS_V2.A).sort()).toEqual(['chorus', 'forge', 'ledger']);
    expect(Object.keys(OWNERS_V2.B).sort()).toEqual(['glow', 'ledger', 'swarm']);
    expect(Object.keys(OWNERS_V2.C).sort()).toEqual(['foundry', 'glow', 'swarm']);
    expect(Object.keys(OWNERS_V2.D).sort()).toEqual(['chorus', 'glow', 'ledger']);
    expect(Object.keys(OWNERS_V2.E).sort()).toEqual(['proctor', 'scribe']);
  });

  it('Forge owns exactly four files in wave A and nothing in src/game/ but ship.ts', () => {
    expect(owners('src/core/physics.ts', 'A')).toEqual(['forge']);
    expect(owners('src/game/ship.ts', 'A')).toEqual(['forge']);
    expect(owners('tests/core/physics.test.ts', 'A')).toEqual(['forge']);
    expect(owners('tests/game/ship.space.test.ts', 'A')).toEqual(['forge']);
    expect(owners('src/game/world.ts', 'A')).toEqual([]);
    expect(owners('src/core/rng.ts', 'A')).toEqual([]);
    expect(owners('tests/game/ship.test.ts', 'A')).toEqual([]);
  });

  it('ship.ts: Forge in A, Swarm in B and C, nobody in D and E', () => {
    expect(WAVES.map((w) => owners('src/game/ship.ts', w))).toEqual([['forge'], ['swarm'], ['swarm'], [], []]);
  });

  it('scoring.ts: Swarm only in C (Ledger does not run there), nobody in A, B and D', () => {
    expect(WAVES.map((w) => owners('src/game/scoring.ts', w))).toEqual([[], [], ['swarm'], [], []]);
    expect(owners('src/game/defs.ts', 'C')).toEqual(['swarm']);
    expect(owners('tests/scoring/scoring.test.ts', 'C')).toEqual(['swarm']);
    expect(owners('tests/scoring/scoring.test.ts', 'B')).toEqual([]);
  });

  it('src/audio/: Chorus in A and D, nobody in B and C, and Glow never (docs/11 SPEC 7.3 item 2)', () => {
    expect(WAVES.map((w) => owners('src/audio/music/engine.ts', w))).toEqual([['chorus'], [], [], ['chorus'], []]);
    expect(WAVES.map((w) => owners('src/audio/synth.ts', w))).toEqual([['chorus'], [], [], ['chorus'], []]);
    for (const w of WAVES) expect(OWNERS_V2[w].glow === undefined || !isOwned(OWNERS_V2[w].glow, 'src/audio/synth.ts'), w).toBe(true);
  });

  it('Foundry owns the level pin test and its snapshots in wave C only; src/levelgen/ in C only', () => {
    expect(owners('tests/qa/levelSnapshots.test.ts', 'C')).toEqual(['foundry']);
    expect(owners('tests/qa/__snapshots__/levels/seed42-level13-v2.json', 'C')).toEqual(['foundry']);
    expect(owners('tests/qa/generatorSweep.test.ts', 'C')).toEqual([]);
    expect(WAVES.map((w) => owners('src/levelgen/generator.ts', w))).toEqual([[], [], ['foundry'], [], []]);
  });

  it('Ledger holds settings, ui and main in A, B and D only; Glow holds render in B, C and D only', () => {
    expect(WAVES.map((w) => owners('src/core/settings.ts', w))).toEqual([['ledger'], ['ledger'], [], ['ledger'], []]);
    expect(WAVES.map((w) => owners('src/main.ts', w))).toEqual([['ledger'], ['ledger'], [], ['ledger'], []]);
    expect(WAVES.map((w) => owners('src/ui/settings.ts', w))).toEqual([['ledger'], ['ledger'], [], ['ledger'], []]);
    expect(WAVES.map((w) => owners('src/render/renderer.ts', w))).toEqual([[], ['glow'], ['glow'], ['glow'], []]);
  });

  it('Proctor and Scribe: wave E only, and only Scribe may touch STATUS and DECISIONS (as drafts)', () => {
    expect(WAVES.map((w) => owners('tests/qa/physicsReplay.test.ts', w))).toEqual([[], [], [], [], ['proctor']]);
    expect(owners('docs/device-checklist.md', 'E')).toEqual(['proctor']);
    expect(owners('docs/qa/bugs.md', 'E')).toEqual(['proctor']);
    expect(owners('docs/STATUS.md', 'E')).toEqual(['scribe']);
    expect(owners('docs/DECISIONS.md', 'E')).toEqual(['scribe']);
    expect(owners('docs/handoffs/v2e.md', 'E')).toEqual(['scribe']);
    for (const w of ['A', 'B', 'C', 'D'] as const) {
      expect(owners('docs/STATUS.md', w), w).toEqual([]);
      expect(owners('docs/DECISIONS.md', w), w).toEqual([]);
    }
  });

  it('nobody but Fable owns package.json, the lockfile, CLAUDE.md, SPEC.md, the addendum or src/core/types.ts', () => {
    for (const w of WAVES) {
      for (const p of ['package.json', 'package-lock.json', 'CLAUDE.md', 'SPEC.md', 'docs/11-v2-spec-addendum.md', 'docs/10-v2-plan.md', 'src/core/types.ts', 'vite.config.ts']) {
        expect(owners(p, w), `${w} ${p}`).toEqual([]);
      }
    }
  });

  it('no path has two owners in any wave', () => {
    const sample = [
      'src/core/settings.ts', 'src/core/physics.ts', 'src/main.ts', 'src/ui/hud.ts', 'src/game/ship.ts', 'src/game/world.ts', 'src/game/weapons.ts',
      'src/game/scoring.ts', 'src/render/renderer.ts', 'src/audio/music/engine.ts', 'src/levelgen/generator.ts', 'tests/qa/levelSnapshots.test.ts',
      'tests/game/weapons.test.ts', 'tests/settings/spacePhysics.test.ts', 'docs/STATUS.md',
    ];
    for (const w of WAVES) for (const p of sample) expect(owners(p, w).length, `${w} ${p}`).toBeLessThanOrEqual(1);
  });

  it('every nickname has a roster file (the dispatcher refuses a job without one) and every owned path exists', () => {
    const notYet = ['docs/handoffs/'];
    for (const w of WAVES) {
      for (const [agent, rule] of Object.entries(OWNERS_V2[w])) {
        expect(existsSync(join(AGENTS_DIR, `${agent}.md`)), `${w} ${agent} roster file`).toBe(true);
        for (const d of rule.dirs) {
          expect(d.endsWith('/'), d).toBe(true);
          if (!notYet.includes(d)) expect(existsSync(join(ROOT, d)), `${w} ${agent} ${d}`).toBe(true);
        }
        for (const file of rule.files) expect(existsSync(join(ROOT, file)), `${w} ${agent} ${file}`).toBe(true);
      }
    }
  });

  it('the Glow wave D diff (21 paths in the real audit) has one path outside: the cheatsheet note its brief asked for', () => {
    const changes = parseNameStatus(['M\tsrc/render/effects.ts', 'A\tsrc/render/lattice/sim.ts', 'A\ttests/render/lattice/sim.test.ts', 'M\tdocs/pixi8-cheatsheet.md'].join('\n'));
    const a = auditPaths('glow', changes, OWNERS_V2.D);
    expect(a.owned).toEqual(['src/render/effects.ts', 'src/render/lattice/sim.ts', 'tests/render/lattice/sim.test.ts']);
    expect(a.outside).toEqual(['docs/pixi8-cheatsheet.md']);
  });
});

describe('v3 owner tables (docs/12, one per wave)', () => {
  const owners = (path: string, wave: (typeof V3_WAVES)[number]): string[] => ownersOf(path, OWNERS_V3[wave]);

  it('names the roles that run in each wave and no others', () => {
    expect(Object.keys(OWNERS_V3.A).sort()).toEqual(['forge', 'foundry', 'glow', 'ledger', 'swarm']);
    expect(Object.keys(OWNERS_V3.B).sort()).toEqual(['chorus', 'glow', 'swarm']);
    expect(Object.keys(OWNERS_V3.C1).sort()).toEqual(['chorus', 'glow', 'swarm']);
    expect(Object.keys(OWNERS_V3.C2).sort()).toEqual(['chorus', 'glow', 'swarm']);
    expect(Object.keys(OWNERS_V3.D).sort()).toEqual(['chorus', 'glow', 'ledger', 'swarm']);
    expect(Object.keys(OWNERS_V3.E).sort()).toEqual(['glow', 'swarm']);
    expect(Object.keys(OWNERS_V3.H).sort()).toEqual(['proctor', 'scribe']);
    expect(Object.keys(OWNERS_V3.G0)).toEqual(['glow']);
    expect(Object.keys(OWNERS_V3.G1).sort()).toEqual(['glow', 'ledger']);
  });

  it('wave A: Forge owns exactly the three bullet files and Swarm owns the rest of src/game/ and tests/scoring/', () => {
    for (const p of ['src/game/enemyBullets.ts', 'tests/game/enemyBullets.test.ts', 'tests/game/enemyBulletsSim.test.ts']) expect(owners(p, 'A'), p).toEqual(['forge']);
    for (const p of ['src/game/bosses/core.ts', 'src/game/scoring.ts', 'src/game/endless.ts', 'src/game/objective.ts', 'tests/game/bossCore.test.ts', 'tests/scoring/scoring.test.ts']) {
      expect(owners(p, 'A'), p).toEqual(['swarm']);
    }
    expect(owners('src/core/physics.ts', 'A')).toEqual([]);
  });

  it('wave A: Foundry owns the generator, its tests, the pin test, its snapshots and the three sweep files only', () => {
    for (const p of ['src/levelgen/boss.ts', 'tests/levelgen/boss.test.ts', 'tests/qa/levelSnapshots.test.ts', 'tests/qa/generatorBossFlagSweep.test.ts', 'tests/qa/generatorFlagSweep.test.ts', 'tests/qa/generatorSweep.test.ts', 'tests/qa/__snapshots__/levels/seed42-level5-v3.json']) {
      expect(owners(p, 'A'), p).toEqual(['foundry']);
    }
    for (const p of ['tests/qa/physicsReplay.test.ts', 'tests/qa/bossReplay.test.ts', 'tests/qa/storageKeysV3.test.ts', 'tests/qa/ownership.ts']) expect(owners(p, 'A'), p).toEqual([]);
  });

  it('tests/qa/ belongs to Proctor in wave H and to nobody else in any other v3 wave but Foundry in A', () => {
    for (const w of V3_WAVES) {
      const o = owners('tests/qa/bossFairnessSweep.test.ts', w);
      expect(o, w).toEqual(w === 'H' ? ['proctor'] : []);
    }
    expect(owners('docs/device-checklist.md', 'H')).toEqual(['proctor']);
    expect(owners('docs/qa/bugs.md', 'H')).toEqual(['proctor']);
  });

  it('src/audio/: Chorus in B, C1, C2 and D, nobody in A, E, H, G0 and G1; Glow never owns it', () => {
    expect(V3_WAVES.map((w) => owners('src/audio/music/engine.ts', w))).toEqual([[], ['chorus'], ['chorus'], ['chorus'], ['chorus'], [], [], [], []]);
    for (const w of V3_WAVES) expect(OWNERS_V3[w].glow === undefined || !isOwned(OWNERS_V3[w].glow, 'src/audio/synth.ts'), w).toBe(true);
  });

  it('src/game/bosses/: Swarm in A, B, C1, C2; table.ts also in E; nobody else; D owns none of it', () => {
    expect(V3_WAVES.map((w) => owners('src/game/bosses/core.ts', w))).toEqual([['swarm'], ['swarm'], ['swarm'], ['swarm'], [], [], [], [], []]);
    expect(V3_WAVES.map((w) => owners('src/game/bosses/table.ts', w))).toEqual([['swarm'], ['swarm'], ['swarm'], ['swarm'], [], ['swarm'], [], [], []]);
  });

  it('wave D: Swarm owns the ten named files and the chase reads in enemies/, but not gravitywell.ts or the spawner', () => {
    for (const f of ['weapons', 'pickup', 'bullets', 'combat', 'drones', 'ship', 'state', 'remove', 'defs', 'steer']) expect(owners('src/game/' + f + '.ts', 'D'), f).toEqual(['swarm']);
    expect(owners('src/game/enemies/charger.ts', 'D')).toEqual(['swarm']);
    expect(owners('src/game/enemies/gravitywell.ts', 'D')).toEqual([]);
    expect(owners('src/game/enemies/spawner.ts', 'D')).toEqual([]);
    expect(owners('src/game/spawner.ts', 'D')).toEqual([]);
    expect(owners('src/game/bosses/core.ts', 'D')).toEqual([]);
    expect(owners('src/game/world.ts', 'D')).toEqual([]);
  });

  it('wave E: Swarm owns weapons.ts, bullets.ts, bosses/table.ts and tests/game/ only', () => {
    expect(owners('src/game/weapons.ts', 'E')).toEqual(['swarm']);
    expect(owners('src/game/bullets.ts', 'E')).toEqual(['swarm']);
    expect(owners('src/game/combat.ts', 'E')).toEqual([]);
    expect(owners('tests/game/weapons.test.ts', 'E')).toEqual(['swarm']);
  });

  it('Ledger holds src/ui/ and src/main.ts in A and D; settings.ts only in G1', () => {
    expect(V3_WAVES.map((w) => owners('src/main.ts', w))).toEqual([['ledger'], [], [], [], ['ledger'], [], [], [], ['ledger']]);
    expect(V3_WAVES.map((w) => owners('src/core/settings.ts', w))).toEqual([[], [], [], [], [], [], [], [], ['ledger']]);
  });

  it('Scribe may touch STATUS and DECISIONS only in wave H, and nobody else may in any v3 wave', () => {
    for (const w of V3_WAVES) {
      expect(owners('docs/STATUS.md', w), w).toEqual(w === 'H' ? ['scribe'] : []);
      expect(owners('docs/DECISIONS.md', w), w).toEqual(w === 'H' ? ['scribe'] : []);
    }
  });

  it('nobody but Fable owns package.json, the lockfile, CLAUDE.md, SPEC.md, the plans, the addenda or src/core/types.ts', () => {
    for (const w of V3_WAVES) {
      for (const p of ['package.json', 'package-lock.json', 'CLAUDE.md', 'SPEC.md', 'docs/11-v2-spec-addendum.md', 'docs/12-v3-plan.md', 'docs/13-v3-spec-addendum.md', 'src/core/types.ts', 'vite.config.ts']) {
        expect(owners(p, w), `${w} ${p}`).toEqual([]);
      }
    }
  });

  it('no path has two owners in any wave', () => {
    const sample = [
      'src/core/settings.ts', 'src/main.ts', 'src/ui/hud.ts', 'src/game/ship.ts', 'src/game/weapons.ts', 'src/game/enemyBullets.ts', 'src/game/bosses/core.ts',
      'src/game/bosses/table.ts', 'src/game/scoring.ts', 'src/render/project.ts', 'src/render/renderer.ts', 'src/audio/music/engine.ts', 'src/levelgen/boss.ts',
      'tests/qa/levelSnapshots.test.ts', 'tests/game/enemyBullets.test.ts', 'tests/game/weapons.test.ts', 'tests/settings/spacePhysics.test.ts', 'docs/STATUS.md',
    ];
    for (const w of V3_WAVES) for (const p of sample) expect(owners(p, w).length, `${w} ${p}`).toBeLessThanOrEqual(1);
  });

  it('every nickname has a roster file and every owned directory and file exists (src/render/project.ts is the G0 file, built in G0)', () => {
    const notYet = ['docs/handoffs/', 'src/render/project.ts'];
    for (const w of V3_WAVES) {
      for (const [agent, rule] of Object.entries(OWNERS_V3[w])) {
        expect(existsSync(join(AGENTS_DIR, `${agent}.md`)), `${w} ${agent} roster file`).toBe(true);
        for (const d of rule.dirs) {
          expect(d.endsWith('/'), d).toBe(true);
          if (!notYet.includes(d)) expect(existsSync(join(ROOT, d)), `${w} ${agent} ${d}`).toBe(true);
        }
        for (const file of [...rule.files, ...rule.except]) {
          if (!notYet.includes(file)) expect(existsSync(join(ROOT, file)), `${w} ${agent} ${file}`).toBe(true);
        }
      }
    }
  });

  it('the Foundry wave A diff shape: four owned paths and one stray test file is reported as outside', () => {
    const changes = parseNameStatus(['M\tsrc/levelgen/generator.ts', 'A\tsrc/levelgen/boss.ts', 'A\ttests/qa/generatorBossFlagSweep.test.ts', 'M\ttests/qa/levelSnapshots.test.ts', 'M\ttests/qa/ownership.ts'].join('\n'));
    const a = auditPaths('foundry', changes, OWNERS_V3.A);
    expect(a.owned).toHaveLength(4);
    expect(a.outside).toEqual(['tests/qa/ownership.ts']);
  });

  it('parseV3Wave reads v3 plus a wave id in any case with an optional dash and rejects everything else', () => {
    expect(['v3A', 'V3b', 'v3-c1', 'V3C2', 'v3d', 'v3E', 'v3h', 'v3G0', 'v3-g1'].map((x) => parseV3Wave(x))).toEqual(['A', 'B', 'C1', 'C2', 'D', 'E', 'H', 'G0', 'G1']);
    expect([parseV3Wave('A'), parseV3Wave('v3'), parseV3Wave('v3F'), parseV3Wave('v3C3'), parseV3Wave('v2A'), parseV3Wave(''), parseV3Wave(undefined)]).toEqual([null, null, null, null, null, null, null]);
  });

  it('the v2 tables and wave letters are unchanged by the v3 additions', () => {
    expect([...WAVES]).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(Object.keys(OWNERS_V2.E).sort()).toEqual(['proctor', 'scribe']);
    expect(parseWave('C1')).toBeNull();
  });
});

describe('parseWave and ownsFromList', () => {
  it('reads wave letters in either case and rejects everything else', () => {
    expect(['a', 'B', 'c', 'D', 'e'].map((x) => parseWave(x))).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect([parseWave('F'), parseWave(''), parseWave(undefined), parseWave('AB'), parseWave('v1')]).toEqual([null, null, null, null, null]);
  });

  it('turns a brief file list into a rule: trailing slash means directory, anything else an exact file', () => {
    const rule = ownsFromList('src/render/, tests/render/ ,docs/pixi8-cheatsheet.md,,');
    expect(rule).toEqual({ dirs: ['src/render/', 'tests/render/'], files: ['docs/pixi8-cheatsheet.md'], except: [] });
    expect(isOwned(rule, 'src/render/neon.ts')).toBe(true);
    expect(isOwned(rule, 'docs/pixi8-cheatsheet.md')).toBe(true);
    expect(isOwned(rule, 'docs/pixi8-cheatsheet.md.bak')).toBe(false);
    expect(isOwned(rule, 'src/renderer/x.ts')).toBe(false);
  });

  it('a fixer audited with its own list: inside is fine, one stray file is outside', () => {
    const table = { glow: ownsFromList('src/render/,tests/render/') };
    const changes = parseNameStatus('M\tsrc/render/lattice/sim.ts\nA\ttests/render/trails.test.ts\nM\tsrc/game/ship.ts');
    const a = auditPaths('glow', changes, table);
    expect(a.owned).toEqual(['src/render/lattice/sim.ts', 'tests/render/trails.test.ts']);
    expect(a.outside).toEqual(['src/game/ship.ts']);
  });

  it('the v1 table is unchanged by the v2 additions (the v1 audit commands still work)', () => {
    expect(Object.keys(OWNERS).sort()).toEqual(['forge', 'foundry', 'glow', 'ledger', 'proctor', 'swarm', 'thumbs']);
    expect(ownersOf('src/game/scoring.ts')).toEqual(['ledger']);
  });
});
