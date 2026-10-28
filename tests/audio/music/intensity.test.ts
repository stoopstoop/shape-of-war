import { describe, expect, it } from 'vitest';
import {
  ATTACK_SEC,
  clampMusicVolume,
  layerGain,
  layerGains,
  masterCutoff,
  mixFor,
  MUSIC_MASTER_MAX,
  musicMasterGain,
  RELEASE_SEC,
  smoothThreat,
  sumGains,
} from '../../../src/audio/music/intensity';
import { LAYERS } from '../../../src/audio/music/track';

const GRID = Array.from({ length: 1001 }, (_, i) => i / 1000);

/** Run the smoother at a fixed 25 ms tick for `sec` seconds. */
function follow(from: number, to: number, sec: number, dt = 0.025): number {
  let l = from;
  const n = Math.round(sec / dt);
  for (let i = 0; i < n; i++) l = smoothThreat(l, to, dt);
  return l;
}

describe('layer gains', () => {
  it('are monotonic non decreasing in threat for every layer', () => {
    for (const layer of LAYERS) {
      let prev = -1;
      for (const l of GRID) {
        const g = layerGain(layer, l);
        expect(g).toBeGreaterThanOrEqual(prev);
        prev = g;
      }
    }
  });

  it('summed gain is at most 1.0', () => {
    for (const l of GRID) expect(sumGains(layerGains(l))).toBeLessThanOrEqual(1);
    expect(sumGains(layerGains(1))).toBeGreaterThan(0.8);
  });

  it('pad always, kick from 0.15, hat from 0.3, arp from 0.45', () => {
    expect(layerGain('pad', 0)).toBeGreaterThan(0);
    const starts: [typeof LAYERS[number], number][] = [
      ['kick', 0.15],
      ['hat', 0.3],
      ['arp', 0.45],
    ];
    for (const [layer, from] of starts) {
      expect(layerGain(layer, from - 0.001)).toBe(0);
      expect(layerGain(layer, from + 0.01)).toBeGreaterThan(0);
    }
    expect(mixFor(0.699).hat16).toBe(false);
    expect(mixFor(0.7).hat16).toBe(true);
  });

  it('master lowpass runs 600 Hz to 6 kHz, monotonic', () => {
    expect(masterCutoff(0)).toBeCloseTo(600, 6);
    expect(masterCutoff(1)).toBeCloseTo(6000, 6);
    let prev = 0;
    for (const l of GRID) {
      const c = masterCutoff(l);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
    expect(masterCutoff(-1)).toBeCloseTo(600, 6);
    expect(masterCutoff(Number.NaN)).toBeCloseTo(600, 6);
  });
});

describe('threat smoothing', () => {
  it('attack covers 95 percent in 0.5 s, not earlier', () => {
    expect(ATTACK_SEC).toBe(0.5);
    expect(follow(0, 1, 0.5)).toBeGreaterThanOrEqual(0.95 - 1e-9);
    expect(follow(0, 1, 0.4)).toBeLessThan(0.95);
  });

  it('release covers 95 percent in 3 s, not earlier', () => {
    expect(RELEASE_SEC).toBe(3);
    expect(follow(1, 0, 3)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(follow(1, 0, 2.5)).toBeGreaterThan(0.05);
    // Release is much slower than attack.
    expect(follow(1, 0, 0.5)).toBeGreaterThan(0.5);
  });

  it('is exact for any dt', () => {
    expect(follow(0, 1, 0.5, 0.005)).toBeCloseTo(smoothThreat(0, 1, 0.5), 9);
    expect(follow(1, 0, 3, 0.1)).toBeCloseTo(smoothThreat(1, 0, 3), 9);
  });

  it('holds on zero or bad dt and clamps inputs', () => {
    expect(smoothThreat(0.3, 1, 0)).toBe(0.3);
    expect(smoothThreat(0.3, 1, -1)).toBe(0.3);
    expect(smoothThreat(0.3, 1, Number.NaN)).toBe(0.3);
    expect(smoothThreat(0, 5, 100)).toBeCloseTo(1, 9);
  });
});

describe('music volume', () => {
  it('clamps to integer 0 to 100 with default 50', () => {
    expect(clampMusicVolume(Number.NaN)).toBe(50);
    expect(clampMusicVolume(-3)).toBe(0);
    expect(clampMusicVolume(140)).toBe(100);
    expect(clampMusicVolume(33.6)).toBe(34);
  });

  it('music master is at most 0.35 of the synth master and 0 at volume 0', () => {
    expect(MUSIC_MASTER_MAX).toBe(0.35);
    expect(musicMasterGain(100)).toBeCloseTo(0.35, 9);
    expect(musicMasterGain(50)).toBeCloseTo(0.175, 9);
    expect(musicMasterGain(0)).toBe(0);
    for (let v = -10; v <= 200; v++) expect(musicMasterGain(v)).toBeLessThanOrEqual(0.35);
  });
});
