// V2 harden: no audio, image or font files in the repo except the PWA icons (SPEC 2, docs/11 SPEC 3.9
// and "Engineering rules that stay" rule 6). Synthesised sound and generated visuals only.
// Reference screenshots for Glow may sit under docs/ref/ (docs/11 SPEC 3.8 rule 5), images only and
// never imported, bundled or placed in public/; that folder is the one allowed exception and the
// scan below proves nothing in the build reads it. No browser, no git: a plain file walk.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stripComments } from './summary';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Directories that are not part of the repo: dependencies, build output, run logs, coverage. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dev-dist', 'coverage', '.git', '.agents']);

const AUDIO = ['mp3', 'ogg', 'oga', 'wav', 'flac', 'm4a', 'aac', 'opus', 'mid', 'midi', 'weba', 'wma', 'aif', 'aiff'];
const VIDEO = ['mp4', 'webm', 'mov', 'mkv', 'avi'];
const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico', 'tif', 'tiff', 'heic', 'heif', 'psd'];
const FONT = ['ttf', 'otf', 'woff', 'woff2', 'eot'];
const ASSET_EXT = new RegExp(`\\.(${[...AUDIO, ...VIDEO, ...IMAGE, ...FONT].join('|')})$`, 'i');
const IMAGE_EXT = new RegExp(`\\.(${IMAGE.join('|')})$`, 'i');

/** The four PWA icons and nothing else (public/manifest.webmanifest lists the same four). */
const PWA_ICONS: readonly string[] = [
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/icon-maskable-192.png',
  'public/icons/icon-maskable-512.png',
];

/** Reference images for Glow: docs only. Images only, never audio or fonts. */
const REF_DIR = 'docs/ref/';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out;
}

const files = walk(ROOT);
const assets = files.filter((f) => ASSET_EXT.test(f));

/** Pure: assets that are neither a PWA icon nor an image under docs/ref/. */
function disallowed(paths: readonly string[]): string[] {
  return paths.filter((p) => !PWA_ICONS.includes(p) && !(p.startsWith(REF_DIR) && IMAGE_EXT.test(p)));
}

/** Pure: width and height from a PNG header, or null when the bytes are not a PNG. */
function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

describe('disallowed and pngSize (the scan helpers)', () => {
  it('lets the four icons through and flags a stray sound, picture or font', () => {
    expect(disallowed([...PWA_ICONS])).toEqual([]);
    expect(disallowed(['public/boom.wav', 'src/ui/logo.png', 'public/fonts/neon.woff2', 'docs/ref/gw3.jpg'])).toEqual(['public/boom.wav', 'src/ui/logo.png', 'public/fonts/neon.woff2']);
    expect(disallowed(['docs/ref/theme.mp3', 'docs/ref/face.ttf'])).toEqual(['docs/ref/theme.mp3', 'docs/ref/face.ttf']);
  });

  it('reads PNG sizes and rejects other bytes', () => {
    const header = new Uint8Array(24);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(header.buffer).setUint32(16, 192);
    new DataView(header.buffer).setUint32(20, 512);
    expect(pngSize(header)).toEqual({ w: 192, h: 512 });
    expect(pngSize(new Uint8Array(24))).toBeNull();
    expect(pngSize(new Uint8Array(3))).toBeNull();
  });
});

describe('repository assets', () => {
  it('the walk really sees the repo (guards against a path bug making the scan vacuous)', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain('src/main.ts');
    expect(files).toContain('SPEC.md');
    expect(files).not.toContainEqual(expect.stringContaining('node_modules/'));
  });

  it('the only audio, video, image or font files are the four PWA icons (plus docs only reference images)', () => {
    expect(disallowed(assets)).toEqual([]);
    for (const icon of PWA_ICONS) expect(assets, icon).toContain(icon);
  });

  it('public/ holds the manifest and the four icons and nothing else', () => {
    const inPublic = files.filter((f) => f.startsWith('public/')).sort();
    expect(inPublic).toEqual(['public/manifest.webmanifest', ...PWA_ICONS].sort());
  });

  it('the manifest lists exactly those icons and each is a PNG of the size its name says', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8')) as { icons?: { src?: string; sizes?: string }[] };
    const listed = (manifest.icons ?? []).map((i) => `public/${i.src ?? ''}`).sort();
    expect(listed).toEqual([...PWA_ICONS].sort());
    for (const icon of manifest.icons ?? []) {
      const bytes = readFileSync(join(ROOT, 'public', icon.src ?? ''));
      const size = pngSize(bytes);
      expect(size, icon.src).not.toBeNull();
      expect(`${size?.w}x${size?.h}`, icon.src).toBe(icon.sizes);
      expect(bytes.length, `${icon.src} stays a small generated icon`).toBeLessThan(100_000);
    }
  });

  it('any reference image under docs/ref/ is docs only: nothing in src/, public/, scripts/, index.html or vite.config.ts names that folder', () => {
    const readers = files.filter((f) => /^(src|public|scripts)\//.test(f) || f === 'index.html' || f === 'vite.config.ts');
    const offenders = readers.filter((f) => /\.(ts|mjs|js|html|css|webmanifest)$/.test(f)).filter((f) => readFileSync(join(ROOT, f), 'utf8').includes('docs/ref'));
    expect(offenders).toEqual([]);
    if (existsSync(join(ROOT, 'docs/ref'))) expect(statSync(join(ROOT, 'docs/ref')).isDirectory()).toBe(true);
  });
});

describe('source scan: nothing loads a sound, picture or font', () => {
  const code = files
    .filter((f) => (f.startsWith('src/') && f.endsWith('.ts')) || f === 'index.html' || f === 'vite.config.ts')
    .map((f) => ({ f, text: f.endsWith('.ts') ? stripComments(readFileSync(join(ROOT, f), 'utf8')) : readFileSync(join(ROOT, f), 'utf8') }));

  const RULES: readonly [string, RegExp][] = [
    ['HTMLAudioElement', /new\s+Audio\s*\(|<audio\b|createElement\(\s*['"`]audio['"`]/],
    ['an image element', /new\s+Image\s*\(|<img\b|createElement\(\s*['"`]img['"`]/],
    ['a font', /@font-face|new\s+FontFace\s*\(|document\.fonts\.add|<link[^>]+as=["'](font|image|audio)["']/],
    ['a pixi asset load', /\bAssets\.(load|add|addBundle|loadBundle)\s*\(/],
    ['an asset import', /(from|import)\s*\(?\s*['"][^'"]+\.(png|jpe?g|gif|webp|avif|svg|ico|mp3|ogg|wav|flac|m4a|woff2?|ttf|otf)(\?[^'"]*)?['"]/],
    ['a CSS url to an asset', /url\(\s*['"]?[^)'"\s]+\.(png|jpe?g|gif|webp|avif|svg|ico|mp3|ogg|wav|woff2?|ttf|otf)/],
    ['a fetch of an asset', /fetch\(\s*['"`][^'"`]+\.(png|jpe?g|gif|webp|mp3|ogg|wav|flac|m4a|woff2?|ttf|otf)/],
  ];

  it('the scan sees the tree', () => {
    expect(code.length).toBeGreaterThan(100);
    expect(code.some((c) => c.f === 'index.html')).toBe(true);
  });

  it.each(RULES)('no %s', (_name, re) => {
    expect(code.filter((c) => re.test(c.text)).map((c) => c.f)).toEqual([]);
  });

  it('every rule catches its own example (the scan can fail)', () => {
    const examples = [
      'const a = new Audio("x.mp3");',
      'const i = new Image();',
      '@font-face { font-family: X; }',
      'await Assets.load("a.png");',
      "import logo from './logo.png';",
      'background: url("a.png")',
      'fetch("boom.wav")',
    ];
    RULES.forEach(([name, re], i) => expect(re.test(examples[i] ?? ''), name).toBe(true));
  });

  it('sound comes from Web Audio synthesis: the context is created in src/audio only', () => {
    const makers = code.filter((c) => /new\s+(Audio|webkitAudio)?Context\s*\(/.test(c.text)).map((c) => c.f);
    expect(makers.every((f) => f.startsWith('src/audio/'))).toBe(true);
    expect(makers.length).toBeGreaterThan(0);
  });
});
