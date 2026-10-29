// The harmonic plan (v2.1 melody): chord per bar, chord tone snapping, phrase transposition.
import { describe, expect, it } from 'vitest';
import {
  BARS_PER_CHORD,
  chordToneMidi,
  fitPitch,
  fitsHarmony,
  harmonyAtStep,
  harmonyForBar,
  HARMONIES,
  inChord,
  inScale,
  isStrongStep,
  LOOP_BARS,
  loopBar,
  PROGRESSION,
  rootNear,
  snapToChord,
  snapToScale,
  stepChordTone,
  STEPS_PER_BAR,
  transposePhrase,
  type PhraseNote,
} from '../../../src/audio/music/harmony';
import { inNaturalMinor, pitchClass } from '../../../src/audio/music/scale';
import { buildBar, chordForBar } from '../../../src/audio/music/track';

describe('chord per bar', () => {
  it('the 8 bar loop is i, VI, III, VII in A minor, two bars each', () => {
    expect(LOOP_BARS).toBe(8);
    expect(BARS_PER_CHORD).toBe(2);
    expect(PROGRESSION).toEqual(['Am', 'F', 'C', 'G']);
    const names = Array.from({ length: LOOP_BARS }, (_, b) => harmonyForBar(b).name);
    expect(names).toEqual(['Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G']);
    expect(Array.from({ length: LOOP_BARS }, (_, b) => harmonyForBar(b).numeral)).toEqual(['i', 'i', 'VI', 'VI', 'III', 'III', 'VII', 'VII']);
    // Wraps forwards and backwards.
    expect(harmonyForBar(8)).toBe(harmonyForBar(0));
    expect(harmonyForBar(-1)).toBe(harmonyForBar(7));
    expect(loopBar(-9)).toBe(7);
  });

  it('every chord is a diatonic triad of A natural minor', () => {
    expect(HARMONIES.Am.tones).toEqual([9, 0, 4]);
    expect(HARMONIES.F.tones).toEqual([5, 9, 0]);
    expect(HARMONIES.C.tones).toEqual([0, 4, 7]);
    expect(HARMONIES.G.tones).toEqual([7, 11, 2]);
    for (const h of Object.values(HARMONIES)) {
      expect(h.tones).toHaveLength(3);
      for (const pc of h.tones) expect(inNaturalMinor(pc)).toBe(true);
      expect(h.tones[0]).toBe(h.root);
    }
  });

  it('the track exposes the current chord per bar, and the bed voices it', () => {
    for (let bar = 0; bar < LOOP_BARS * 2; bar++) {
      const c = chordForBar(bar);
      const h = harmonyForBar(bar);
      expect(c.name).toBe(h.name);
      expect(c.harmony).toBe(h);
      expect(pitchClass(c.bass)).toBe(h.root);
      expect(new Set(c.pad.map(pitchClass))).toEqual(new Set(h.tones));
      expect(buildBar(1, bar).chord).toBe(h.name);
    }
  });

  it('harmonyAtStep reads the bar of an absolute step; strong steps are the beats', () => {
    expect(harmonyAtStep(31).name).toBe('Am');
    expect(harmonyAtStep(32).name).toBe('F');
    expect(harmonyAtStep(-1).name).toBe('G');
    for (let s = 0; s < STEPS_PER_BAR; s++) expect(isStrongStep(s)).toBe(s % 4 === 0);
    expect(isStrongStep(-4)).toBe(true);
    expect(isStrongStep(-3)).toBe(false);
  });
});

describe('snapping', () => {
  it('snapToChord picks the nearest chord tone, ties down', () => {
    const am = HARMONIES.Am;
    expect(snapToChord(69, am)).toBe(69);
    expect(snapToChord(70, am)).toBe(69);
    expect(snapToChord(71, am)).toBe(72);
    expect(snapToChord(74, am)).toBe(72); // D: C and E are both 2 away, ties go down
    const f = HARMONIES.F;
    expect(snapToChord(64, f)).toBe(65); // E over F: up to F
    expect(snapToChord(67, f)).toBe(65); // G over F: F and A tie, down
    for (const h of Object.values(HARMONIES)) {
      for (let m = 40; m < 100; m++) {
        const s = snapToChord(m, h);
        expect(inChord(s, h)).toBe(true);
        expect(Math.abs(s - m)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('snapToScale keeps scale tones and moves the rest a semitone', () => {
    for (let m = 40; m < 100; m++) {
      const s = snapToScale(m);
      expect(inScale(s)).toBe(true);
      if (inScale(m)) expect(s).toBe(m);
      else expect(Math.abs(s - m)).toBe(1);
    }
    expect(snapToScale(70)).toBe(69); // A sharp: down to A (tie with B)
  });

  it('fitPitch is a chord tone on the beats and a scale tone between; fitsHarmony agrees', () => {
    for (let step = 0; step < LOOP_BARS * STEPS_PER_BAR; step++) {
      for (let m = 50; m < 90; m++) {
        const p = fitPitch(m, step);
        expect(fitsHarmony(p, step)).toBe(true);
        if (isStrongStep(step)) expect(inChord(p, harmonyAtStep(step))).toBe(true);
        else expect(inScale(p)).toBe(true);
      }
    }
    // E on the downbeat of an F bar becomes F; between beats it stays E.
    expect(fitPitch(64, 32)).toBe(65);
    expect(fitPitch(64, 33)).toBe(64);
    expect(fitsHarmony(64, 32)).toBe(false);
  });

  it('stepChordTone moves by chord tones', () => {
    const c = HARMONIES.C;
    expect(stepChordTone(60, c, 1)).toBe(64);
    expect(stepChordTone(60, c, 2)).toBe(67);
    expect(stepChordTone(60, c, -1)).toBe(55);
    expect(stepChordTone(62, c, 1)).toBe(64);
    expect(stepChordTone(62, c, 0)).toBe(60);
    for (const n of [-2, -1, 1, 2]) expect(inChord(stepChordTone(69, HARMONIES.G, n), HARMONIES.G)).toBe(true);
  });
});

describe('phrase transposition', () => {
  it('rootNear finds the closest root, ties down', () => {
    expect(rootNear(HARMONIES.Am, 69)).toBe(69);
    expect(rootNear(HARMONIES.F, 69)).toBe(65);
    expect(rootNear(HARMONIES.C, 69)).toBe(72);
    expect(rootNear(HARMONIES.G, 69)).toBe(67);
    expect(rootNear(HARMONIES.C, 66)).toBe(60); // F sharp: C4 and C5 are 6 away, ties down
  });

  it('chordToneMidi counts chord degrees up and down from the root', () => {
    const am = HARMONIES.Am;
    expect([-3, -2, -1, 0, 1, 2, 3, 4].map((d) => chordToneMidi(am, d, 69))).toEqual([57, 60, 64, 69, 72, 76, 81, 84]);
    const g = HARMONIES.G;
    expect([0, 1, 2, 3].map((d) => chordToneMidi(g, d, 69))).toEqual([67, 71, 74, 79]);
  });

  it('a phrase keeps its rhythm and degree contour in every chord', () => {
    const shape: PhraseNote[] = [
      { at: 0, deg: 0, dur: 1, vel: 1 },
      { at: 1, deg: 2, dur: 1, vel: 0.8 },
      { at: 2, deg: 1, dur: 1, vel: 0.8 },
      { at: 3, deg: 3, dur: 2, vel: 1 },
    ];
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const start = bar * STEPS_PER_BAR + 4;
      const p = transposePhrase(shape, start, 69);
      const h = harmonyForBar(bar);
      expect(p.map((n) => n.step)).toEqual([start, start + 1, start + 2, start + 3]);
      expect(p.map((n) => n.dur)).toEqual([1, 1, 1, 2]);
      expect(p.map((n) => n.vel)).toEqual([1, 0.8, 0.8, 1]);
      for (const n of p) expect(inChord(n.midi, h)).toBe(true);
      // Same rises and falls: up, down, up.
      const dirs = p.slice(1).map((n, i) => Math.sign(n.midi - (p[i]?.midi ?? 0)));
      expect(dirs).toEqual([1, -1, 1]);
      expect(pitchClass(p[0]?.midi ?? 0)).toBe(h.root);
      expect((p[3]?.midi ?? 0) - (p[0]?.midi ?? 0)).toBe(12);
    }
    // In A minor exactly A C E A, transposed to F it is F A C F.
    expect(transposePhrase([{ at: 0, deg: 0, dur: 1, vel: 1 }, { at: 1, deg: 1, dur: 1, vel: 1 }, { at: 2, deg: 2, dur: 1, vel: 1 }, { at: 3, deg: 3, dur: 1, vel: 1 }], 0, 69).map((n) => n.midi)).toEqual([69, 72, 76, 81]);
    expect(transposePhrase([{ at: 0, deg: 0, dur: 1, vel: 1 }, { at: 1, deg: 1, dur: 1, vel: 1 }, { at: 2, deg: 2, dur: 1, vel: 1 }, { at: 3, deg: 3, dur: 1, vel: 1 }], 32, 69).map((n) => n.midi)).toEqual([65, 69, 72, 77]);
  });

  it('a phrase crossing a chord change takes the new chord from the bar line', () => {
    const shape: PhraseNote[] = [
      { at: 0, deg: 0, dur: 2, vel: 1 },
      { at: 2, deg: 1, dur: 2, vel: 1 },
      { at: 4, deg: 2, dur: 2, vel: 1 },
    ];
    const p = transposePhrase(shape, 30, 69); // steps 30, 32, 34: Am, then F
    expect(inChord(p[0]?.midi ?? 0, HARMONIES.Am)).toBe(true);
    expect(inChord(p[1]?.midi ?? 0, HARMONIES.F)).toBe(true);
    expect(inChord(p[2]?.midi ?? 0, HARMONIES.F)).toBe(true);
  });

  it('is pure and JSON safe', () => {
    const shape: PhraseNote[] = [{ at: 0, deg: 1, dur: 3, vel: 1 }];
    const a = transposePhrase(shape, 77, 60);
    expect(transposePhrase(shape, 77, 60)).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});
