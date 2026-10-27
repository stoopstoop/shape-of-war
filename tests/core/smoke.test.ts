import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatBuildId } from '../../scripts/build-id';

function repoPath(rel: string): string {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

interface ManifestIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose: string;
}

interface Manifest {
  readonly display: string;
  readonly orientation: string;
  readonly start_url: string;
  readonly scope: string;
  readonly icons: readonly ManifestIcon[];
}

function isIcon(x: unknown): x is ManifestIcon {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o['src'] === 'string' &&
    typeof o['sizes'] === 'string' &&
    typeof o['type'] === 'string' &&
    typeof o['purpose'] === 'string'
  );
}

function isManifest(x: unknown): x is Manifest {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  const icons = o['icons'];
  return (
    typeof o['display'] === 'string' &&
    typeof o['orientation'] === 'string' &&
    typeof o['start_url'] === 'string' &&
    typeof o['scope'] === 'string' &&
    Array.isArray(icons) &&
    icons.every(isIcon)
  );
}

function readManifest(): Manifest {
  const parsed: unknown = JSON.parse(readFileSync(repoPath('public/manifest.webmanifest'), 'utf8'));
  if (!isManifest(parsed)) throw new Error('manifest has an unexpected shape');
  return parsed;
}

describe('build id', () => {
  it('formats short sha and UTC time', () => {
    const now = new Date(Date.UTC(2026, 9, 27, 13, 4));
    expect(formatBuildId('a1b2c3d', now)).toBe('a1b2c3d 2026-10-27T13:04Z');
  });

  it('zero pads month, day, hour and minute', () => {
    const now = new Date(Date.UTC(2026, 0, 5, 3, 7));
    expect(formatBuildId('nogit', now)).toBe('nogit 2026-01-05T03:07Z');
  });
});

describe('pwa manifest', () => {
  it('requests fullscreen landscape under a relative scope', () => {
    const m = readManifest();
    expect(m.display).toBe('fullscreen');
    expect(m.orientation).toBe('landscape');
    expect(m.start_url).toBe('./');
    expect(m.scope).toBe('./');
  });

  it('lists four icons, general and maskable purposes, at 192 and 512', () => {
    const keys = readManifest()
      .icons.map((i) => `${i.purpose}:${i.sizes}`)
      .sort();
    expect(keys).toEqual(['any:192x192', 'any:512x512', 'maskable:192x192', 'maskable:512x512']);
  });

  it('points every icon at a real PNG of the declared size', () => {
    for (const icon of readManifest().icons) {
      const bytes = readFileSync(repoPath(`public/${icon.src}`));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const side = Number(icon.sizes.split('x')[0]);
      expect(bytes.readUInt32BE(16)).toBe(side);
      expect(bytes.readUInt32BE(20)).toBe(side);
    }
  });
});
