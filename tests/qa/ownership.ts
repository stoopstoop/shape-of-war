// Pure ownership rules for the audit. OWNERS is the v1 table (docs/05 W3 "Owns (exclusive)", plus the
// standing roster files in .claude/agents/). OWNERS_V2 holds one table per v2 wave (docs/10 "Agents and
// ownership" for waves A to E, docs/11 SPEC 7.3 for Chorus). Fixer branches own "only the files named in
// the brief", so they are audited with ownsFromList (the CLI flag --owns=a,b,c) instead of a table.
// OWNERS_V3 holds one table per v3 wave (docs/12), keyed by the wave ids A, B, C1, C2, D, E, H, G0, G1.
// No imports, so Node can run the CLI wrapper with type stripping.
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

export type Wave = 'A' | 'B' | 'C' | 'D' | 'E';

const SETTINGS_UI_MAIN: OwnerRule = {
  dirs: ['src/ui/', 'tests/ui/', 'tests/settings/'],
  files: ['src/main.ts', 'src/core/settings.ts'],
  except: [],
};
const RENDER: OwnerRule = { dirs: ['src/render/', 'tests/render/'], files: [], except: [] };
const AUDIO: OwnerRule = { dirs: ['src/audio/', 'tests/audio/'], files: [], except: [] };
const PROCTOR: OwnerRule = { dirs: ['tests/qa/', 'docs/qa/'], files: ['docs/device-checklist.md'], except: [] };

/**
 * v2 ownership per wave (docs/10 "Agents and ownership" in each wave section). Roles that do not run in
 * a wave are absent. Glow does not own src/audio in v2 (docs/11 SPEC 7.3 item 2); Chorus owns it in waves
 * A and D. Forge owns four named files in A and Swarm owns src/game/ in B (that includes ship.ts, for the
 * one dispatch line) except scoring.ts. In C Swarm also owns scoring.ts and defs.ts, and Foundry owns the
 * level pin test and its snapshot files. Ledger's v2 briefs do not list scoring.ts, so in A, B and D it
 * belongs to no builder. Proctor runs in wave E only, so tests/qa/ belongs to nobody in A, B and D.
 */
export const OWNERS_V2: Readonly<Record<Wave, Readonly<Record<string, OwnerRule>>>> = {
  A: {
    forge: {
      dirs: [],
      files: ['src/core/physics.ts', 'src/game/ship.ts', 'tests/core/physics.test.ts', 'tests/game/ship.space.test.ts'],
      except: [],
    },
    ledger: SETTINGS_UI_MAIN,
    chorus: AUDIO,
  },
  B: {
    swarm: { dirs: ['src/game/', 'tests/game/'], files: [], except: ['src/game/scoring.ts'] },
    ledger: SETTINGS_UI_MAIN,
    glow: RENDER,
  },
  C: {
    swarm: { dirs: ['src/game/', 'tests/game/', 'tests/scoring/'], files: [], except: [] },
    foundry: {
      dirs: ['src/levelgen/', 'tests/levelgen/', 'tests/qa/__snapshots__/levels/'],
      files: ['tests/qa/levelSnapshots.test.ts'],
      except: [],
    },
    glow: RENDER,
  },
  D: {
    glow: RENDER,
    chorus: AUDIO,
    ledger: SETTINGS_UI_MAIN,
  },
  E: {
    proctor: PROCTOR,
    scribe: { dirs: ['docs/handoffs/'], files: ['docs/STATUS.md', 'docs/DECISIONS.md'], except: [] },
  },
};

export const WAVES: readonly Wave[] = ['A', 'B', 'C', 'D', 'E'];

/**
 * v3 wave ids as docs/12 names them: A (boss core), B (tier 2), C1 (tier 3), C2 (Prism), D (weapon
 * combine and drone modes), E (weapon tuning), H (harden), G0 and G1 (the tilt spike and build).
 * Input form for the CLI is "v3" plus the id, any case: v3A, v3c1, v3h.
 */
export type V3Wave = 'A' | 'B' | 'C1' | 'C2' | 'D' | 'E' | 'H' | 'G0' | 'G1';
export const V3_WAVES: readonly V3Wave[] = ['A', 'B', 'C1', 'C2', 'D', 'E', 'H', 'G0', 'G1'];

const AUDIO_V3: OwnerRule = { dirs: ['src/audio/', 'tests/audio/'], files: [], except: [] };
const SWARM_BOSSES: OwnerRule = { dirs: ['src/game/bosses/', 'tests/game/'], files: [], except: [] };
const UI_MAIN: OwnerRule = { dirs: ['src/ui/', 'tests/ui/'], files: ['src/main.ts'], except: [] };
/** Forge's three files in wave A: a file level carve out of Swarm's src/game/ (docs/12 wave V3-A). */
const FORGE_BULLET_FILES: readonly string[] = ['src/game/enemyBullets.ts', 'tests/game/enemyBullets.test.ts', 'tests/game/enemyBulletsSim.test.ts'];

/**
 * v3 ownership per wave (docs/12 "Agents and ownership" in each wave section). Roles that do not run
 * in a wave are absent. Notes on the readings:
 *   A: Swarm owns src/game/ with scoring.ts, endless.ts and objective.ts (and tests/scoring/) except
 *      Forge's three bullet files. Foundry owns src/levelgen/ plus, for this wave only, the pin test,
 *      its snapshots and the flag sweeps in tests/qa/ (read as the three generator sweep files).
 *   B: Swarm owns all of src/game/ (game.ts, player.ts, bosses/, combat edits), enemyBullets.ts for
 *      fixes; Glow render; Chorus audio. Foundry and Ledger idle.
 *   C1, C2: Swarm src/game/bosses/ and tests/game/ only; Glow render; Chorus audio.
 *   D: Swarm owns ten named files in src/game/, the chase reads in src/game/enemies/ (not
 *      gravitywell.ts or the spawner) and tests/game/; Glow, Chorus and Ledger as before. Foundry idles.
 *   E: Swarm weapons.ts, bullets.ts, bosses/table.ts and tests/game/; Glow render.
 *   H: Proctor and Scribe. Fixer branches are audited with ownsFromList (--owns=...).
 *   G0: Glow, one new file in src/render/ plus tests/render/. G1: Glow render; Ledger settings, ui, main.
 */
export const OWNERS_V3: Readonly<Record<V3Wave, Readonly<Record<string, OwnerRule>>>> = {
  A: {
    swarm: { dirs: ['src/game/', 'tests/game/', 'tests/scoring/'], files: [], except: FORGE_BULLET_FILES },
    foundry: {
      dirs: ['src/levelgen/', 'tests/levelgen/', 'tests/qa/__snapshots__/levels/'],
      files: ['tests/qa/levelSnapshots.test.ts', 'tests/qa/generatorSweep.test.ts', 'tests/qa/generatorFlagSweep.test.ts', 'tests/qa/generatorBossFlagSweep.test.ts'],
      except: [],
    },
    glow: RENDER,
    ledger: UI_MAIN,
    forge: { dirs: [], files: FORGE_BULLET_FILES, except: [] },
  },
  B: { swarm: { dirs: ['src/game/', 'tests/game/'], files: [], except: [] }, glow: RENDER, chorus: AUDIO_V3 },
  C1: { swarm: SWARM_BOSSES, glow: RENDER, chorus: AUDIO_V3 },
  C2: { swarm: SWARM_BOSSES, glow: RENDER, chorus: AUDIO_V3 },
  D: {
    swarm: {
      dirs: ['tests/game/', 'src/game/enemies/'],
      files: [
        'src/game/weapons.ts',
        'src/game/pickup.ts',
        'src/game/bullets.ts',
        'src/game/combat.ts',
        'src/game/drones.ts',
        'src/game/ship.ts',
        'src/game/state.ts',
        'src/game/remove.ts',
        'src/game/defs.ts',
        'src/game/steer.ts',
      ],
      except: ['src/game/enemies/gravitywell.ts', 'src/game/enemies/spawner.ts'],
    },
    glow: RENDER,
    chorus: AUDIO_V3,
    ledger: UI_MAIN,
  },
  E: {
    swarm: { dirs: ['tests/game/'], files: ['src/game/weapons.ts', 'src/game/bullets.ts', 'src/game/bosses/table.ts'], except: [] },
    glow: RENDER,
  },
  H: {
    proctor: PROCTOR,
    scribe: { dirs: ['docs/handoffs/'], files: ['docs/STATUS.md', 'docs/DECISIONS.md'], except: [] },
  },
  G0: { glow: { dirs: ['tests/render/'], files: ['src/render/project.ts'], except: [] } },
  G1: {
    glow: RENDER,
    ledger: { dirs: ['src/ui/', 'tests/ui/', 'tests/settings/'], files: ['src/core/settings.ts', 'src/main.ts'], except: [] },
  },
};

/** Pure: the v3 wave id from "v3A", "v3-c1", "V3H" and so on (any case, optional dash), else null. */
export function parseV3Wave(s: string | undefined): V3Wave | null {
  const m = /^v3-?([a-z][0-9]?)$/i.exec((s ?? '').trim());
  const id = (m?.[1] ?? '').toUpperCase();
  return V3_WAVES.find((x) => x === id) ?? null;
}

/** Pure: the wave letter if s is one of A to E (any case), else null. */
export function parseWave(s: string | undefined): Wave | null {
  const u = (s ?? '').toUpperCase();
  return u === 'A' || u === 'B' || u === 'C' || u === 'D' || u === 'E' ? u : null;
}

/** Pure: an owner rule from a comma separated list; entries ending in "/" are directories, the rest exact files. */
export function ownsFromList(list: string): OwnerRule {
  const items = list
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');
  return { dirs: items.filter((x) => x.endsWith('/')), files: items.filter((x) => !x.endsWith('/')), except: [] };
}

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

/**
 * Pure: split changed paths into owned and outside for one agent. Unknown agent: everything is outside.
 * `table` defaults to the v1 table; pass OWNERS_V2[wave] for a v2 wave, or { agent: ownsFromList(...) } for a fixer.
 */
export function auditPaths(agent: string, changes: readonly Change[], table: Readonly<Record<string, OwnerRule>> = OWNERS): Audit {
  const rule = table[agent];
  const owned: string[] = [];
  const outside: string[] = [];
  for (const c of changes) {
    if (rule !== undefined && isOwned(rule, c.path)) owned.push(c.path);
    else outside.push(c.path);
  }
  return { agent, owned, outside };
}

/** Pure: which agents own `path` in a table (more than one means a shared file such as src/main.ts in v1). */
export function ownersOf(path: string, table: Readonly<Record<string, OwnerRule>> = OWNERS): string[] {
  return Object.keys(table).filter((a) => {
    const rule = table[a];
    return rule !== undefined && isOwned(rule, path);
  });
}
