import { describe, expect, it } from 'vitest';
import { hash01 } from '../../../src/core/rng';
import { voiceLength } from '../../../src/audio/music/engine';
import {
  BAR_SEC,
  buildBar,
  chordForBar,
  LOOP_BARS,
  loopBar,
  STEP_SEC,
  STEPS_PER_BAR,
  type TrackNote,
} from '../../../src/audio/music/track';

const notesOf = (seed: number, bar: number, arp: boolean): TrackNote[] =>
  buildBar(seed, bar).notes.filter((n) => (n.layer === 'arp') === arp);

describe('track timing and form', () => {
  it('is 120 BPM, 16 steps per bar, 8 bar loop', () => {
    expect(STEP_SEC).toBe(0.125);
    expect(BAR_SEC).toBe(2);
    expect(STEPS_PER_BAR).toBe(16);
    expect(LOOP_BARS).toBe(8);
  });

  it('plays Am F C G, two bars each', () => {
    const names = Array.from({ length: 8 }, (_, b) => chordForBar(b).name);
    expect(names).toEqual(['Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G']);
    expect(chordForBar(8).name).toBe('Am');
    expect(loopBar(-1)).toBe(7);
  });

  it('has bass eighths on the root, pad chord, four on the floor kick and hats', () => {
    const bar = buildBar(7, 2);
    const bass = bar.notes.filter((n) => n.layer === 'bass');
    expect(bass.map((n) => n.step)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(new Set(bass.map((n) => n.midi))).toEqual(new Set([41]));
    expect(bar.notes.filter((n) => n.layer === 'pad')).toHaveLength(3);
    expect(bar.notes.filter((n) => n.layer === 'kick').map((n) => n.step)).toEqual([0, 4, 8, 12]);
    const hats = bar.notes.filter((n) => n.layer === 'hat');
    expect(hats).toHaveLength(16);
    expect(hats.filter((n) => n.sub).map((n) => n.step)).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
  });

  it('keeps every note inside the bar and sorted by step', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const notes = buildBar(99, bar).notes;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (!n) continue;
        expect(n.step).toBeGreaterThanOrEqual(0);
        expect(n.step).toBeLessThan(STEPS_PER_BAR);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
        if (i > 0) expect(n.step).toBeGreaterThanOrEqual(notes[i - 1]?.step ?? 0);
      }
    }
  });
});

describe('track determinism', () => {
  it('same seed and bar give identical notes', () => {
    for (const seed of [0, 1, 0xdeadbeef, 0x229578a8]) {
      for (let bar = 0; bar < LOOP_BARS * 2; bar++) {
        expect(buildBar(seed, bar)).toEqual(buildBar(seed, bar));
      }
    }
  });

  it('is serialisable and loops every 8 bars', () => {
    const b = buildBar(12345, 3);
    expect(JSON.parse(JSON.stringify(b))).toEqual(b);
    expect(buildBar(12345, 3 + LOOP_BARS).notes).toEqual(b.notes);
  });

  it('different seeds differ in the arp only', () => {
    for (let i = 0; i < 50; i++) {
      const a = Math.floor(hash01(i, 1) * 4294967296);
      const b = Math.floor(hash01(i, 2) * 4294967296);
      let arpDiffBars = 0;
      for (let bar = 0; bar < LOOP_BARS; bar++) {
        expect(notesOf(a, bar, false)).toEqual(notesOf(b, bar, false));
        if (JSON.stringify(notesOf(a, bar, true)) !== JSON.stringify(notesOf(b, bar, true))) arpDiffBars++;
      }
      expect(arpDiffBars).toBeGreaterThanOrEqual(6);
    }
  });

  it('arp keeps the downbeat of each half bar', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const steps = notesOf(31337, bar, true).map((n) => n.step);
      expect(steps).toContain(0);
      expect(steps).toContain(8);
      expect(new Set(steps).size).toBe(steps.length);
    }
  });
});

describe('perc layer (v2 fixes)', () => {
  it('claps on the backbeat with a ghost on step 14 in odd bars, decaying before the bar line', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const steps = buildBar(1, bar).notes.filter((n) => n.layer === 'perc').map((n) => n.step);
      expect(steps).toEqual(bar % 2 === 1 ? [4, 12, 14] : [4, 12]);
    }
    expect(14 * STEP_SEC + voiceLength('perc', STEP_SEC)).toBeLessThan(BAR_SEC);
  });
});
