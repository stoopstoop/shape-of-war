// V3 harden: the storage key set after the v3 waves (docs/13 "Settings keys and bus additions").
// storageKeys.test.ts and storageKeysV2.test.ts audit the declared constants and the run time writes.
// This file pins the v3 answer on its own terms:
//   the key set is exactly the v1 and v2 set of 13 keys plus, at most, sow.settings.tilt (the one key
//   docs/13 allows, added only after D12, wave V3-E, not built at this head);
//   every key keeps the sow. prefix, none collides (also ignoring case), none is nested under another;
//   nothing of v3 is persisted: no key names a boss, a combo, a drone or a drone mode (the docs/13
//   line "No other key is added" and the rule that the boss schedule is a pure function of the level);
//   every key literal in src/ is a registered key or the settings prefix, found by a scan;
//   the documented key table in docs/13 lists nothing that is neither implemented nor tilt.
// No real localStorage, no browser.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as settings from '../../src/core/settings';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The v1 and v2 key set, spelled out by hand (13 keys). */
const V2_KEYS: readonly string[] = [
  'sow.schema',
  'sow.progress.runSeed',
  'sow.progress.unlocked',
  'sow.scores.adventure',
  'sow.scores.endless',
  'sow.settings.neon',
  'sow.settings.volume',
  'sow.settings.showFps',
  'sow.settings.glowPath',
  'sow.settings.spacePhysics',
  'sow.settings.weaponPickups',
  'sow.settings.effects',
  'sow.settings.music',
];
/** The only key v3 may add, and only from wave V3-E. */
const TILT_KEY = 'sow.settings.tilt';

/** Every key the settings module implements: the exported *_KEY constants plus prefix + each Settings field. */
function implementedKeys(): string[] {
  const out = new Set<string>();
  for (const [name, value] of Object.entries(settings)) {
    if (name.endsWith('_KEY') && typeof value === 'string') out.add(value);
  }
  for (const field of Object.keys(settings.DEFAULT_SETTINGS)) out.add(settings.SETTINGS_PREFIX + field);
  return [...out].sort();
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** sow. string literals (any quote style, including template literals up to the first placeholder) outside comments. */
function sowLiterals(text: string): string[] {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const noLine = noBlock
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n');
  const found: string[] = [];
  const re = /['"`](sow\.[A-Za-z0-9_.]*)/g;
  for (let m = re.exec(noLine); m !== null; m = re.exec(noLine)) found.push(m[1] ?? '');
  return found;
}

describe('storage keys after v3', () => {
  const keys = implementedKeys();

  it('the implemented set is exactly the 13 key v2 set, plus at most sow.settings.tilt', () => {
    const extra = keys.filter((k) => !V2_KEYS.includes(k));
    expect(extra.filter((k) => k !== TILT_KEY), 'a key outside the v2 set and outside docs/13').toEqual([]);
    expect(keys.filter((k) => V2_KEYS.includes(k)).sort()).toEqual([...V2_KEYS].sort());
    expect(keys.length).toBeLessThanOrEqual(V2_KEYS.length + 1);
  });

  it('every key has the sow. prefix and the sow.<area>.<name> shape (or sow.schema)', () => {
    for (const k of keys) expect(k, k).toMatch(/^sow\.(schema|(progress|scores|settings)\.[A-Za-z][A-Za-z0-9]*)$/);
  });

  it('no two keys collide, also ignoring case, and none is nested under another', () => {
    expect(new Set(keys.map((k) => k.toLowerCase())).size).toBe(keys.length);
    for (const a of keys) for (const b of keys) if (a !== b) expect(b.startsWith(a + '.'), a + ' is a prefix of ' + b).toBe(false);
  });

  it('nothing of v3 is persisted: no key names a boss, a combo, a drone, a weapon pair or a mode', () => {
    for (const k of keys) expect(k.toLowerCase(), k).not.toMatch(/boss|combo|drone|pair|ingredient|hazard|bullet/);
  });

  it('the settings prefix ends in a dot so sow.settings.neon cannot also match sow.settingsX', () => {
    expect(settings.SETTINGS_PREFIX).toBe('sow.settings.');
  });
});

describe('source scan of src/ for key literals', () => {
  const files = sourceFiles(join(ROOT, 'src'));
  const registered = new Set([...implementedKeys(), TILT_KEY, settings.SETTINGS_PREFIX]);

  it('finds the source tree (guards against a path bug making the scan vacuous)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith('core/settings.ts'))).toBe(true);
  });

  it('every sow. literal in code is a registered key, the tilt key or the settings prefix', () => {
    const stray: string[] = [];
    for (const f of files) {
      for (const lit of sowLiterals(readFileSync(f, 'utf8'))) {
        if (!registered.has(lit)) stray.push(relative(ROOT, f) + ': ' + lit);
      }
    }
    expect(stray).toEqual([]);
  });

  it('the scan can see a stray key (it is not blind)', () => {
    expect(sowLiterals("const k = 'sow.boss.best'; // 'sow.ignored'")).toEqual(['sow.boss.best']);
    expect(sowLiterals('const k = `sow.settings.${name}`;')).toEqual(['sow.settings.']);
  });
});

describe('docs/13 key table', () => {
  const doc = readFileSync(join(ROOT, 'docs/13-v3-spec-addendum.md'), 'utf8');
  const start = doc.indexOf('## Settings keys and bus additions');
  const section = start >= 0 ? doc.slice(start, start + 2500) : '';
  const documented = [...section.matchAll(/^\| `(sow\.[A-Za-z0-9_.]+)` \|/gm)].map((m) => m[1] ?? '');

  it('is found and documents the tilt key', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(documented).toContain(TILT_KEY);
  });

  it('documents no key that is neither implemented nor tilt', () => {
    expect(documented.filter((k) => !implementedKeys().includes(k) && k !== TILT_KEY)).toEqual([]);
  });
});
