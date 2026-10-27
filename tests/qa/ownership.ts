// Pure ownership rules for the audit (docs/05 W3 table "Owns (exclusive)", plus the standing roster
// files in .claude/agents/). No imports, so Node can run the CLI wrapper with type stripping.
// Dirs end in "/" and match by prefix; files match exactly; "except" removes exact files from the dirs.

export interface OwnerRule {
  readonly dirs: readonly string[];
  readonly files: readonly string[];
  readonly except: readonly string[];
}

export const OWNERS: Readonly<Record<string, OwnerRule>> = {
  swarm: { dirs: ['src/game/', 'tests/game/'], files: [], except: ['src/game/scoring.ts'] },
  ledger: {
    dirs: ['src/ui/', 'tests/ui/', 'tests/scoring/', 'tests/settings/'],
    files: ['src/main.ts', 'src/core/settings.ts', 'src/game/scoring.ts'],
    except: [],
  },
  glow: { dirs: ['src/render/', 'src/audio/', 'tests/render/', 'tests/audio/'], files: [], except: [] },
  proctor: { dirs: ['tests/qa/', 'docs/qa/'], files: ['docs/device-checklist.md'], except: [] },
  foundry: { dirs: ['src/levelgen/', 'tests/levelgen/'], files: [], except: [] },
  thumbs: { dirs: ['src/input/', 'tests/input/'], files: [], except: [] },
  forge: {
    dirs: ['src/core/', 'tests/core/', 'tests/settings/', 'tests/game/'],
    files: ['src/main.ts', 'src/game/world.ts', 'src/game/ship.ts', 'src/game/bullets.ts'],
    except: ['src/core/types.ts'],
  },
};

export interface Change {
  status: string;
  path: string;
}

export interface Audit {
  agent: string;
  owned: string[];
  outside: string[];
}

/** Pure: true if `path` is inside the rule's owned set. */
export function isOwned(rule: OwnerRule, path: string): boolean {
  if (rule.except.includes(path)) return false;
  return rule.files.includes(path) || rule.dirs.some((d) => path.startsWith(d));
}

/**
 * Pure: parse `git diff --name-status` output. Renames and copies ("R100<TAB>old<TAB>new") yield one
 * change for the new path; the old path of a rename is also returned as a deletion so both ends are audited.
 */
export function parseNameStatus(text: string): Change[] {
  const out: Change[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const [status = '', first = '', second] = line.split('\t');
    if (second !== undefined && (status.startsWith('R') || status.startsWith('C'))) {
      out.push({ status: 'D', path: first }, { status, path: second });
    } else {
      out.push({ status, path: first });
    }
  }
  return out;
}

/** Pure: split changed paths into owned and outside for one agent. Unknown agent: everything is outside. */
export function auditPaths(agent: string, changes: readonly Change[]): Audit {
  const rule = OWNERS[agent];
  const owned: string[] = [];
  const outside: string[] = [];
  for (const c of changes) {
    if (rule !== undefined && isOwned(rule, c.path)) owned.push(c.path);
    else outside.push(c.path);
  }
  return { agent, owned, outside };
}

/** Pure: which agents own `path` (more than one means a shared file such as src/main.ts across waves). */
export function ownersOf(path: string): string[] {
  return Object.keys(OWNERS).filter((a) => {
    const rule = OWNERS[a];
    return rule !== undefined && isOwned(rule, path);
  });
}
