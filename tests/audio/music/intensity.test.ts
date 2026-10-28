import { describe, expect, it } from 'vitest';
import {
  ATTACK_SEC,
  clampMusicVolume,
  CUTOFF_EPS,
  CUTOFF_MAX_HZ,
  CUTOFF_MIN_HZ,
  cutoffChanged,
  layerGain,
  layerGains,
  LIFT_CUTOFF_MUL,
  LIFT_OFF,
  LIFT_ON,
  masterCutoff,
  mixFor,
  MUSIC_MASTER_MAX,
  musicMasterGain,
  nextLift,
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

  it('pad always, bass from 0.06, kick from 0.15, hat from 0.28, arp from 0.42, perc from 0.7', () => {
    expect(layerGain('pad', 0)).toBeGreaterThan(0);
    const starts: [typeof LAYERS[number], number][] = [
      ['bass', 0.06],
      ['kick', 0.15],
      ['hat', 0.28],
      ['arp', 0.42],
      ['perc', LIFT_ON],
    ];
    for (const [layer, from] of starts) {
      expect(layerGain(layer, from - 0.001)).toBe(0);
      expect(layerGain(layer, from + 0.01)).toBeGreaterThan(0);
    }
    expect(mixFor(0.699).hat16).toBe(false);
    expect(mixFor(0.7).hat16).toBe(true);
  });

  it('an empty arena is the bed only: pad, then the sub bass, nothing rhythmic', () => {
    const m = mixFor(0);
    expect(m.gains.pad).toBeGreaterThan(0);
    for (const l of ['bass', 'kick', 'hat', 'arp', 'perc'] as const) expect(m.gains[l]).toBe(0);
    const low = mixFor(0.1);
    expect(low.gains.bass).toBeGreaterThan(0);
    for (const l of ['kick', 'hat', 'arp', 'perc'] as const) expect(low.gains[l]).toBe(0);
  });

  it('widens the range: crowded is far louder and brighter than empty', () => {
    const quiet = sumGains(mixFor(0).gains);
    const loud = sumGains(mixFor(1, true).gains);
    // At least 15 dB of summed layer gain between an empty arena and a full wave.
    expect(20 * Math.log10(loud / quiet)).toBeGreaterThan(15);
    expect(mixFor(1, true).cutoffHz / mixFor(0).cutoffHz).toBeGreaterThan(15);
  });

  it('the lift adds perc, opens the lowpass and has hysteresis', () => {
    expect(mixFor(0.8, false).gains.perc).toBe(0);
    expect(mixFor(0.8, true).gains.perc).toBeGreaterThan(0);
    expect(masterCutoff(0.8, true)).toBeCloseTo(masterCutoff(0.8) * LIFT_CUTOFF_MUL, 6);
    expect(nextLift(false, LIFT_ON - 0.001)).toBe(false);
    expect(nextLift(false, LIFT_ON)).toBe(true);
    expect(nextLift(true, LIFT_OFF + 0.001)).toBe(true);
    expect(nextLift(true, LIFT_OFF - 0.001)).toBe(false);
    // Hovering around the threshold never flickers: one switch on, none off.
    let lift = false;
    let switches = 0;
    for (let i = 0; i < 400; i++) {
      const next = nextLift(lift, LIFT_ON + 0.05 * Math.sin(i / 3));
      if (next !== lift) switches++;
      lift = next;
    }
    expect(switches).toBe(1);
  });

  it('summed gain stays at most 1.0 with the lift', () => {
    for (const l of GRID) expect(sumGains(mixFor(l, true).gains)).toBeLessThanOrEqual(1);
  });

  it('master lowpass runs 450 Hz to 5.5 kHz on a curve, monotonic, and the lift opens it further', () => {
    expect(masterCutoff(0)).toBeCloseTo(CUTOFF_MIN_HZ, 6);
    expect(masterCutoff(1)).toBeCloseTo(CUTOFF_MAX_HZ, 6);
    expect(masterCutoff(1, true)).toBeGreaterThan(8000);
    let prev = 0;
    for (const l of GRID) {
      const c = masterCutoff(l);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
    expect(masterCutoff(-1)).toBeCloseTo(CUTOFF_MIN_HZ, 6);
    expect(masterCutoff(Number.NaN)).toBeCloseTo(CUTOFF_MIN_HZ, 6);
  });

  it('cutoff updates are only sent on a meaningful change', () => {
    expect(cutoffChanged(null, 500)).toBe(true);
    expect(cutoffChanged(1000, 1010)).toBe(false);
    expect(cutoffChanged(1000, 1000 * (1 + CUTOFF_EPS))).toBe(true);
    expect(cutoffChanged(1000, 970)).toBe(true);
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
