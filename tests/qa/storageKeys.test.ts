// localStorage key audit (docs/03 section 8, docs/06 section 2.9). Three angles:
//   1. the declared key constants: prefix, shape, uniqueness, no key nested under another;
//   2. what the storage API really writes at run time, through a recording fake;
//   3. a scan of src/ for sow. string literals and for any storage access outside core/settings.ts,
//      so a key added or a bypass introduced by a later wave fails here until it is registered.
// No real localStorage, no browser.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SCORES_KEY,
  DEFAULT_SETTINGS,
  GLOW_PATH_KEY,
  RUN_SEED_KEY,
  SETTINGS_PREFIX,
  UNLOCKED_KEY,
  loadAdventureScores,
  loadRunSeed,
  loadSettings,
  loadUnlocked,
  recordAdventureScore,
  saveGlowPath,
  saveSetting,
  unlockLevel,
} from '../../src/core/settings';
import type { StorageLike } from '../../src/core/settings';
import { stripComments } from './summary';

/** Keys the code writes today, hard coded so a rename or an extra key fails loudly. */
const IMPLEMENTED_KEYS: readonly string[] = [
  'sow.progress.runSeed',
  'sow.progress.unlocked',
  'sow.scores.adventure',
  'sow.settings.glowPath',
  'sow.settings.neon',
  'sow.settings.showFps',
  'sow.settings.volume',
];

/**
 * Documented in docs/03 section 8 (and docs/05 W3 task 3 for the Endless table) but not written by any
 * code yet (Ledger). Registering them here lets Ledger add them without this suite failing on an
 * unknown key. sow.schema is the storage schema version, default 1, bump and migrate on shape change.
 */
const RESERVED_KEYS: readonly string[] = ['sow.scores.endless', 'sow.schema'];

const ALL_KEYS: readonly string[] = [...IMPLEMENTED_KEYS, ...RESERVED_KEYS];
const KEY_SHAPE = /^sow\.(settings|progress|scores)\.[A-Za-z][A-Za-z0-9]*$|^sow\.schema$/;
/** The only file allowed to touch the Storage API. */
const STORAGE_OWNER = 'src/core/settings.ts';
const STORAGE_APIS = ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie'] as const;

const SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url));
const DOC_03 = fileURLToPath(new URL('../../docs/03-architecture.md', import.meta.url));

/** Recording fake: remembers every key written or read. */
function recordingStorage(): StorageLike & { data: Map<string, string>; reads: Set<string>; writes: Set<string> } {
  const data = new Map<string, string>();
  const reads = new Set<string>();
  const writes = new Set<string>();
  return {
    data,
    reads,
    writes,
    getItem: (k) => {
      reads.add(k);
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      writes.add(k);
      data.set(k, v);
    },
  };
}

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, withFileTypes: false })
    .map((p) => String(p))
    .filter((p) => p.endsWith('.ts'))
    .map((p) => join(SRC_DIR, p));
}

const repoPath = (abs: string): string => relative(join(SRC_DIR, '..'), abs).split('\\').join('/');

/** String literals in code that start with "sow." (CSS classes use "sow-" and never match). */
function sowLiterals(code: string): string[] {
  const out: string[] = [];
  const re = /(['"`])(sow\.[^'"`\n]*)\1/g;
  for (let m = re.exec(code); m !== null; m = re.exec(code)) out.push(m[2] ?? '');
  return out;
}

describe('stripComments', () => {
  it('removes line and block comments but keeps string contents', () => {
    const src = ["const a = 'x'; // note localStorage", '/* block', 'localStorage */ const b = "// not a comment";'].join('\n');
    const out = stripComments(src);
    expect(out).not.toContain('note');
    expect(out).not.toContain('localStorage');
    expect(out).toContain("const a = 'x';");
    expect(out).toContain('"// not a comment"');
  });

  it('keeps escaped quotes inside strings and line numbers stable', () => {
    const src = "const s = 'it\\'s // fine';\n// gone\nconst t = 1;";
    const out = stripComments(src);
    expect(out).toContain("'it\\'s // fine'");
    expect(out).not.toContain('gone');
    expect(out.split('\n')).toHaveLength(3);
  });
});

describe('sowLiterals', () => {
  it('finds sow. keys in all three quote styles and ignores sow- CSS names and bare mentions', () => {
    const code = ["a('sow.x.one'); b(\"sow.y.two\"); c(`sow.z.three`);", "el('div', 'sow-btn'); const note = sow.notQuoted;"].join('\n');
    expect(sowLiterals(code)).toEqual(['sow.x.one', 'sow.y.two', 'sow.z.three']);
  });

  it('flags an unregistered key and a storage bypass that the scans would then report', () => {
    const rogue = stripComments("// ok\nconst k = 'sow.rogue.key'; window.localStorage.setItem(k, '1');");
    expect(sowLiterals(rogue).filter((l) => !ALL_KEYS.includes(l))).toEqual(['sow.rogue.key']);
    expect(STORAGE_APIS.filter((api) => rogue.includes(api))).toEqual(['localStorage']);
  });
});

describe('declared storage keys', () => {
  const declared = [
    ...Object.keys(DEFAULT_SETTINGS).map((k) => `${SETTINGS_PREFIX}${k}`),
    GLOW_PATH_KEY,
    RUN_SEED_KEY,
    UNLOCKED_KEY,
    ADVENTURE_SCORES_KEY,
  ];

  it('the exported constants are exactly the implemented key set', () => {
    expect([...declared].sort()).toEqual([...IMPLEMENTED_KEYS].sort());
  });

  it('every key (implemented and reserved) uses the sow. prefix and the sow.<area>.<name> shape (or sow.schema)', () => {
    for (const k of ALL_KEYS) {
      expect(k.startsWith('sow.'), k).toBe(true);
      expect(KEY_SHAPE.test(k), k).toBe(true);
    }
  });

  it('there are no collisions, also ignoring case', () => {
    expect(new Set(ALL_KEYS).size).toBe(ALL_KEYS.length);
    expect(new Set(ALL_KEYS.map((k) => k.toLowerCase())).size).toBe(ALL_KEYS.length);
  });

  it('no key is nested under another (a key that is also a prefix invites a collision)', () => {
    for (const a of ALL_KEYS) for (const b of ALL_KEYS) if (a !== b) expect(b.startsWith(`${a}.`), `${b} under ${a}`).toBe(false);
  });

  it('the settings prefix ends in a dot so sow.settings.neon cannot also match sow.settingsX', () => {
    expect(SETTINGS_PREFIX).toBe('sow.settings.');
  });
});

describe('keys written at run time', () => {
  it('exercising the whole public API writes exactly the implemented key set', () => {
    const store = recordingStorage();
    saveSetting('neon', 33, store);
    saveSetting('volume', 40, store);
    saveSetting('showFps', true, store);
    saveGlowPath('fallback', store);
    loadRunSeed(() => 123456, store);
    unlockLevel(4, store);
    recordAdventureScore(1, 2500, 1, store);
    expect([...store.writes].sort()).toEqual([...IMPLEMENTED_KEYS].sort());
    for (const k of store.writes) expect(KEY_SHAPE.test(k), k).toBe(true);
  });

  it('loading from an empty store only reads implemented keys and writes nothing', () => {
    const store = recordingStorage();
    loadSettings(store);
    loadUnlocked(store);
    loadAdventureScores(store);
    expect(store.writes.size).toBe(0);
    for (const k of store.reads) expect(IMPLEMENTED_KEYS, k).toContain(k);
  });

  it('values are independent: each key keeps its own value and corrupting one leaves the rest', () => {
    const store = recordingStorage();
    saveSetting('neon', 33, store);
    saveSetting('volume', 40, store);
    saveSetting('showFps', true, store);
    saveGlowPath('fallback', store);
    loadRunSeed(() => 123456, store);
    unlockLevel(4, store);
    recordAdventureScore(2, 2500, 2, store);
    store.data.set('sow.settings.volume', 'garbage');
    const s = loadSettings(store);
    expect(s.neon).toBe(33);
    expect(s.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(s.showFps).toBe(true);
    expect(loadRunSeed(() => 1, store)).toBe(123456);
    expect(loadUnlocked(store)).toBe(4);
    expect(loadAdventureScores(store)).toEqual({ '2': { best: 2500, stars: 2 } });
  });
});

describe('source scan of src/', () => {
  const files = sourceFiles();

  it('finds the source tree (guards against a path bug making the scans vacuous)', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.map(repoPath)).toContain(STORAGE_OWNER);
  });

  it('every sow. string literal in code is a registered key or the settings prefix', () => {
    const unknown: string[] = [];
    for (const f of files) {
      for (const lit of sowLiterals(stripComments(readFileSync(f, 'utf8')))) {
        const registered = ALL_KEYS.includes(lit) || lit === SETTINGS_PREFIX;
        if (!registered) unknown.push(`${repoPath(f)}: ${lit}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('the implemented keys are all spelled out or built from the exported prefix in core/settings.ts', () => {
    const code = stripComments(readFileSync(join(SRC_DIR, 'core/settings.ts'), 'utf8'));
    const literals = sowLiterals(code);
    for (const k of ['sow.progress.runSeed', 'sow.progress.unlocked', 'sow.scores.adventure', SETTINGS_PREFIX]) {
      expect(literals, k).toContain(k);
    }
  });

  it(`no file other than ${STORAGE_OWNER} touches localStorage, sessionStorage, indexedDB or cookies`, () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (repoPath(f) === STORAGE_OWNER) continue;
      const code = stripComments(readFileSync(f, 'utf8'));
      for (const api of STORAGE_APIS) if (code.includes(api)) offenders.push(`${repoPath(f)}: ${api}`);
    }
    expect(offenders).toEqual([]);
  });

  it(`${STORAGE_OWNER} reaches storage only through localStorage (no other persistence API)`, () => {
    const code = stripComments(readFileSync(join(SRC_DIR, STORAGE_OWNER.replace('src/', '')), 'utf8'));
    expect(code).toContain('localStorage');
    for (const api of ['sessionStorage', 'indexedDB', 'document.cookie']) expect(code, api).not.toContain(api);
  });
});

describe('docs/03 section 8 key table', () => {
  const doc = readFileSync(DOC_03, 'utf8');
  const documented = [...doc.matchAll(/^\|\s*`(sow\.[A-Za-z.]+)`/gm)].map((m) => m[1] ?? '');

  it('is found and lists at least the SPEC 4 key and the progress keys', () => {
    for (const k of ['sow.settings.neon', 'sow.progress.runSeed', 'sow.progress.unlocked', 'sow.scores.adventure']) {
      expect(documented, k).toContain(k);
    }
  });

  it('every documented key is implemented or reserved here (docs and code agree on spelling)', () => {
    for (const k of documented) expect(ALL_KEYS, k).toContain(k);
  });
});
