// Level source for Adventure (W2 brief item 5). Prefers Foundry's generateLevel(runSeed, index)
// when src/levelgen/generator.ts is present (main.ts finds it with import.meta.glob), else a
// fixture. Pure: the module object is passed in, so tests can supply fakes.
import { fmix32, type LevelDef } from '../levelgen/leveldef';

/** The shape main.ts expects from src/levelgen/generator.ts. Checked at runtime. */
export interface GeneratorModule {
  generateLevel?: unknown;
  levelHash?: unknown;
}

export interface LevelPick {
  def: LevelDef;
  source: 'generator' | 'fixture';
  hash: string;
}

type Gen = (seed: number, index: number) => unknown;
type Hasher = (def: LevelDef) => unknown;

function isGen(v: unknown): v is Gen {
  return typeof v === 'function';
}

function isHasher(v: unknown): v is Hasher {
  return typeof v === 'function';
}

/** Pure: enough structure for the sim and renderer to run. Foundry's validator does the rest. */
export function looksLikeLevel(v: unknown): v is LevelDef {
  if (typeof v !== 'object' || v === null) return false;
  const arena: unknown = 'arena' in v ? v.arena : undefined;
  const objective: unknown = 'objective' in v ? v.objective : undefined;
  const par: unknown = 'par' in v ? v.par : undefined;
  return (
    typeof arena === 'object' &&
    arena !== null &&
    'width' in arena &&
    typeof arena.width === 'number' &&
    typeof objective === 'object' &&
    objective !== null &&
    typeof par === 'number'
  );
}

/** Pure: JSON with object keys sorted, so the hash does not depend on key order. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    const keys = Object.keys(v).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const val: unknown = Reflect.get(v, k);
      if (val === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${canonicalJson(val)}`);
    }
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Pure: 8 hex digit FNV-1a hash of the canonical JSON, avalanched with fmix32. */
export function fallbackHash(def: LevelDef): string {
  const s = canonicalJson(def);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix32(h).toString(16).padStart(8, '0');
}

/** Pure: Foundry's levelHash if it returns a non empty string, else fallbackHash. */
export function hashLevel(mod: GeneratorModule | null, def: LevelDef): string {
  if (mod !== null && isHasher(mod.levelHash)) {
    try {
      const h = mod.levelHash(def);
      if (typeof h === 'string' && h !== '') return h;
      if (typeof h === 'number' && Number.isFinite(h)) return (h >>> 0).toString(16).padStart(8, '0');
    } catch {
      // fall through to the local hash
    }
  }
  return fallbackHash(def);
}

/** Pure: generator output for (runSeed, index), or the fixture at (index - 1) mod count. */
export function pickLevel(mod: GeneratorModule | null, runSeed: number, index: number, fixtures: readonly LevelDef[]): LevelPick {
  if (mod !== null && isGen(mod.generateLevel)) {
    try {
      const def = mod.generateLevel(runSeed >>> 0, index);
      if (looksLikeLevel(def)) return { def, source: 'generator', hash: hashLevel(mod, def) };
    } catch (err) {
      console.warn('[sow] generateLevel failed, using a fixture', err);
    }
  }
  const n = fixtures.length;
  const def = fixtures[(((Math.floor(index) - 1) % n) + n) % n];
  if (def === undefined) throw new Error('no level fixtures');
  return { def, source: 'fixture', hash: hashLevel(mod, def) };
}

export interface LevelQuery {
  seed: number | null;
  level: number | null;
}

/** Pure: ?seed=<uint32>&level=<n>. Anything unparsable is null. */
export function parseLevelQuery(search: string): LevelQuery {
  const q = new URLSearchParams(search);
  const int = (k: string): number | null => {
    const raw = q.get(k);
    if (raw === null || !/^\s*\d+\s*$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : null;
  };
  const seed = int('seed');
  const level = int('level');
  return { seed: seed === null ? null : seed >>> 0, level: level === null ? null : Math.max(1, level) };
}
