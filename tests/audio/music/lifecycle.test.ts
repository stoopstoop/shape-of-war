import { describe, expect, it } from 'vitest';
import { LAYER_KINDS, LAYERS_FULL, cutMotifs } from '../../../src/audio/music/layers';
import { LAYER_RAMPS, layerGains, sumGains } from '../../../src/audio/music/intensity';
import {
  ACCENT_RESERVE,
  barLineAfter,
  barLineAtOrAfter,
  enterLayer,
  envelopeAt,
  exitLayer,
  GAIN_CEILING,
  HIT_RESERVE,
  layerMix,
  leaveStepOf,
  MOTIF_TOTAL_MAX,
  pruneLayers,
  rampAt,
  STINGER_GAIN,
  STINGER_STALE_STEPS,
  takeStingers,
  type LayerSet,
  type LayerState,
} from '../../../src/audio/music/lifecycle';
import { STEPS_PER_BAR as BAR } from '../../../src/audio/music/track';

function only(set: LayerSet): LayerState {
  const l = set[0];
  if (!l) throw new Error('no layer');
  return l;
}

describe('layer lifecycle', () => {
  it('bar line helpers', () => {
    expect(barLineAtOrAfter(16)).toBe(16);
    expect(barLineAtOrAfter(17)).toBe(32);
    expect(barLineAfter(16)).toBe(32);
    expect(barLineAfter(15)).toBe(16);
    expect(rampAt({ s0: 0, g0: 0, s1: 16, g1: 1 }, 8)).toBeCloseTo(0.5, 9);
  });

  it('enter: stinger on the given step, motif from the next bar line with a one bar fade in', () => {
    const l = only(enterLayer([], 'grunt', 21));
    expect(l.stingerStep).toBe(21);
    expect(l.joinStep).toBe(32);
    expect(envelopeAt(l, 31)).toBe(0);
    expect(envelopeAt(l, 32)).toBe(0);
    expect(envelopeAt(l, 40)).toBeCloseTo(0.5, 9);
    expect(envelopeAt(l, 48)).toBe(1);
    expect(envelopeAt(l, 500)).toBe(1);
    // A stinger exactly on a bar line still lets the motif wait for the next one.
    expect(only(enterLayer([], 'grunt', 32)).joinStep).toBe(48);
  });

  it('a duplicate enter while live changes nothing', () => {
    const a = enterLayer([], 'dart', 3);
    expect(enterLayer(a, 'dart', 40)).toBe(a);
  });

  it('exit: the motif leaves 2 bars later on a bar line, fading over the last bar', () => {
    let s = enterLayer([], 'snake', 5); // join 16, full at 32
    s = exitLayer(s, 'snake', 64); // exit on a bar line
    const l = only(s);
    expect(leaveStepOf(l)).toBe(64 + 2 * BAR);
    expect(envelopeAt(l, 64)).toBe(1);
    expect(envelopeAt(l, 80)).toBe(1);
    expect(envelopeAt(l, 88)).toBeCloseTo(0.5, 9);
    expect(envelopeAt(l, 96)).toBe(0);
    expect(pruneLayers(takeStingers(s, 10).set, 95)).toHaveLength(1);
    expect(pruneLayers(takeStingers(s, 10).set, 96)).toHaveLength(0);
    // Mid bar exit: at least 2 bars, rounded up to the bar line.
    const m = only(exitLayer(enterLayer([], 'snake', 5), 'snake', 70));
    expect(leaveStepOf(m)).toBe(112);
  });

  it('exit before the fade in finishes: fade in completes, then the 2 bar tail', () => {
    let s = enterLayer([], 'bulwark', 2); // join 16
    s = exitLayer(s, 'bulwark', 20); // 4 steps into the fade in
    const l = only(s);
    expect(envelopeAt(l, 20)).toBeCloseTo(0.25, 9);
    expect(envelopeAt(l, 32)).toBe(1);
    expect(leaveStepOf(l)).toBe(64);
    expect(envelopeAt(l, 56)).toBeCloseTo(0.5, 9);
    expect(envelopeAt(l, 64)).toBe(0);
    // Monotonic up then down, never above 1.
    let peak = false;
    for (let st = 16; st <= 64; st++) {
      const g = envelopeAt(l, st);
      const n = envelopeAt(l, st + 1);
      if (n < g) peak = true;
      if (peak) expect(n).toBeLessThanOrEqual(g);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  it('exit before the motif joined drops the motif but keeps the stinger', () => {
    let s = enterLayer([], 'blink', 4);
    s = exitLayer(s, 'blink', 6);
    const l = only(s);
    for (let st = 0; st < 100; st++) expect(envelopeAt(l, st)).toBe(0);
    expect(pruneLayers(s, 8)).toHaveLength(1); // stinger still pending
    const t = takeStingers(s, 6);
    expect(t.due).toEqual(['blink']);
    expect(pruneLayers(t.set, 7)).toHaveLength(0);
  });

  it('re-entry during the tail cancels the exit without restarting the motif', () => {
    let s = enterLayer([], 'charger', 0); // join 16, full at 32
    s = exitLayer(s, 'charger', 40); // leave 80, fade 64 to 80
    // Before the fade out started: stays at full, new stinger, no leave.
    const a = only(enterLayer(s, 'charger', 50));
    expect(a.stingerStep).toBe(50);
    expect(a.joinStep).toBe(16);
    expect(leaveStepOf(a)).toBeNull();
    for (let st = 50; st < 200; st++) expect(envelopeAt(a, st)).toBe(1);
    // During the fade out: ramps back up from where it was to full by the next bar line.
    const b = only(enterLayer(s, 'charger', 72));
    expect(envelopeAt(b, 72)).toBeCloseTo(0.5, 9);
    expect(envelopeAt(b, 76)).toBeCloseTo(0.75, 9);
    expect(envelopeAt(b, 80)).toBe(1);
    expect(envelopeAt(b, 120)).toBe(1);
    expect(leaveStepOf(b)).toBeNull();
    // And it can exit again with a fresh tail.
    const c = only(exitLayer([b], 'charger', 96));
    expect(leaveStepOf(c)).toBe(128);
  });

  it('re-entry after the motif left (or after an early drop) starts fresh', () => {
    let s = enterLayer([], 'swirl', 0);
    s = exitLayer(s, 'swirl', 4); // before join: dropped
    const a = only(enterLayer(s, 'swirl', 9));
    expect(a.joinStep).toBe(16);
    expect(envelopeAt(a, 16)).toBe(0);
    expect(envelopeAt(a, 24)).toBeCloseTo(0.5, 9);
    expect(leaveStepOf(a)).toBeNull();
  });

  it('stingers play once; stale ones are dropped', () => {
    const s = enterLayer(enterLayer([], 'grunt', 10), 'dart', 12);
    const t1 = takeStingers(s, 10);
    expect(t1.due).toEqual(['grunt']);
    const t2 = takeStingers(t1.set, 13);
    expect(t2.due).toEqual(['dart']);
    expect(takeStingers(t2.set, 14).due).toEqual([]);
    const late = takeStingers(enterLayer([], 'grunt', 10), 10 + STINGER_STALE_STEPS + 1);
    expect(late.due).toEqual([]);
    expect(only(late.set).stingerStep).toBeNull();
  });
});

describe('gain budget', () => {
  const six = ['snake', 'bulwark', 'splime', 'weaver', 'grunt', 'charger'] as const;

  it('bed plus 6 (or all 12) motifs plus a stinger stay at or under 1.0 at any threat', () => {
    let full: LayerSet = [];
    for (const k of six) full = enterLayer(full, k, 0);
    let all: LayerSet = [];
    for (const k of LAYER_KINDS) all = enterLayer(all, k, 0);
    for (const set of [[], full, all]) {
      for (let lv = 0; lv <= 1.0001; lv += 0.05) {
        const bed = sumGains(layerGains(lv));
        const m = layerMix(bed, set, LAYERS_FULL, 100);
        expect(m.motifTotal).toBeLessThanOrEqual(MOTIF_TOTAL_MAX + 1e-12);
        expect(bed * m.bedScale + m.motifTotal + STINGER_GAIN + ACCENT_RESERVE + HIT_RESERVE).toBeLessThanOrEqual(GAIN_CEILING + 1e-12);
        expect(m.bedScale).toBeGreaterThan(0.6);
      }
    }
  });

  it('leaves the wave A bed untouched while it already fits', () => {
    const bedMax = Object.values(LAYER_RAMPS).reduce((a, r) => a + r.max, 0);
    expect(layerMix(0.5, [], LAYERS_FULL, 0).bedScale).toBe(1);
    expect(layerMix(bedMax, [], LAYERS_FULL, 0).bedScale).toBeCloseTo((1 - STINGER_GAIN - ACCENT_RESERVE - HIT_RESERVE) / bedMax, 9);
  });

  it('cut motifs and departed layers take no budget', () => {
    let s: LayerSet = [];
    for (const k of six) s = enterLayer(s, k, 0);
    const cut = cutMotifs();
    expect(layerMix(0.9, s, cut, 100).motifTotal).toBeCloseTo(LAYERS_FULL.weaver.gain + LAYERS_FULL.grunt.gain, 9);
    const gone = exitLayer(enterLayer([], 'snake', 0), 'snake', 20); // leave 64
    expect(layerMix(0.9, gone, LAYERS_FULL, 63).motifTotal).toBeGreaterThan(0);
    expect(layerMix(0.9, gone, LAYERS_FULL, 64).motifTotal).toBe(0);
  });
});
