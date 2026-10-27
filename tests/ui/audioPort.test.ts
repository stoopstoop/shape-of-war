import { describe, expect, it } from 'vitest';
import { resolveAudio } from '../../src/ui/audioPort';

describe('audio port', () => {
  it('is a no-op without the synth', () => {
    for (const mod of [null, undefined, {}, 3, { unlockAudio: 'x' }]) {
      const a = resolveAudio(mod);
      expect(a.live).toBe(false);
      expect(() => a.unlock()).not.toThrow();
      expect(() => a.setVolume(50)).not.toThrow();
    }
  });

  it('calls unlockAudio and setVolume when present, clamping volume', () => {
    const calls: string[] = [];
    const a = resolveAudio({
      unlockAudio: () => {
        calls.push('unlock');
        return Promise.reject(new Error('blocked'));
      },
      setVolume: (v: number) => calls.push(`vol:${v}`),
    });
    expect(a.live).toBe(true);
    a.unlock();
    a.setVolume(150);
    a.setVolume(33.4);
    expect(calls).toEqual(['unlock', 'vol:100', 'vol:33']);
  });

  it('swallows a throwing synth', () => {
    const a = resolveAudio({
      unlockAudio: () => {
        throw new Error('no AudioContext');
      },
    });
    expect(() => a.unlock()).not.toThrow();
  });
});
