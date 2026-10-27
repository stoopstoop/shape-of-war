import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OWNERS, auditPaths, isOwned, ownersOf, parseNameStatus } from './ownership';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

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
