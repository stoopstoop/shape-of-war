import { describe, expect, it } from 'vitest';
import {
  buildMotifBar,
  CUT1_KEEP,
  cutMotifs,
  LAYER_KINDS,
  LAYERS_FULL,
  MOTIF_MAX_NOTES,
  MOTIF_MIN_NOTES,
  PHRASE_STEPS,
  STINGER_BASE_MIN,
  STINGER_MAX_NOTES,
  STINGER_MIN_NOTES,
  STINGER_STEPS,
  stingerBase,
  stingerMidi,
  stingerPhrase,
  TIMBRES,
  varyPattern,
  type LayerRegistry,
} from '../../../src/audio/music/layers';
import { chordToneMidi, fitsHarmony, harmonyAtStep, harmonyForBar, inChord, isStrongStep } from '../../../src/audio/music/harmony';
import { inPentatonic, pentatonicMidi } from '../../../src/audio/music/scale';
import { LOOP_BARS, STEPS_PER_BAR } from '../../../src/audio/music/track';
import { ENEMY_KINDS, V2_ENEMY_KINDS, type EnemyKind } from '../../../src/levelgen/leveldef';

// Compile time: tsc (npm run build) fails if EnemyKind gains a kind LAYER_KINDS lacks.
type MissingKinds = Exclude<EnemyKind, (typeof LAYER_KINDS)[number]>;
const noneMissing: [MissingKinds] extends [never] ? true : false = true;

const SEEDS = [0, 1, 42, 0xdeadbeef, 123456789];
const ALL_KINDS: readonly EnemyKind[] = [...ENEMY_KINDS, ...V2_ENEMY_KINDS];

/** Both bars of a phrase as one list with phrase steps 0 to 31. */
function phrase(reg: LayerRegistry, kind: EnemyKind, seed: number, firstBar: number): { step: number; midi: number; dur: number }[] {
  const out: { step: number; midi: number; dur: number }[] = [];
  for (let h = 0; h < 2; h++) {
    for (const n of reg[kind].motif(seed, firstBar + h)) out.push({ step: h * STEPS_PER_BAR + n.step, midi: n.midi, dur: n.durSteps });
  }
  return out;
}

describe('layer registry', () => {
  it('covers every EnemyKind with exactly one entry', () => {
    expect(noneMissing).toBe(true);
    expect(new Set(ALL_KINDS).size).toBe(12);
    expect([...LAYER_KINDS].sort()).toEqual([...ALL_KINDS].sort());
    for (const k of ALL_KINDS) {
      const e = LAYERS_FULL[k];
      expect(e, k).toBeDefined();
      expect(e.kind).toBe(k);
      expect(e.phrase.length).toBeGreaterThanOrEqual(STINGER_MIN_NOTES);
      expect(e.phrase.length).toBeLessThanOrEqual(STINGER_MAX_NOTES);
      expect(e.gain).toBeGreaterThan(0);
      expect(typeof e.motif).toBe('function');
    }
    expect(Object.keys(LAYERS_FULL).sort()).toEqual([...ALL_KINDS].sort());
  });

  it('gives every kind a distinct timbre and a distinct register', () => {
    const kinds = LAYER_KINDS;
    expect(new Set(kinds.map((k) => LAYERS_FULL[k].timbre.id)).size).toBe(kinds.length);
    expect(new Set(kinds.map((k) => LAYERS_FULL[k].register)).size).toBe(kinds.length);
    // Plus six accent only timbres (kills.ts): gong, clank, chime, rattle, pop and blip, and
    // the shield deflect (hits.ts) and the resolution lead (kills.ts).
    expect(Object.keys(TIMBRES)).toHaveLength(kinds.length + 8);
    // Register roots are themselves scale notes.
    for (const k of kinds) expect(inPentatonic(pentatonicMidi(LAYERS_FULL[k].register))).toBe(true);
  });

  it('motifs are 2 bar loops of 4 to 8 notes', () => {
    for (const k of LAYER_KINDS) {
      for (const seed of SEEDS) {
        for (let first = 0; first < LOOP_BARS; first += 2) {
          const n = phrase(LAYERS_FULL, k, seed, first).length;
          expect(n, `${k} seed ${seed} bar ${first}`).toBeGreaterThanOrEqual(MOTIF_MIN_NOTES);
          expect(n, `${k} seed ${seed} bar ${first}`).toBeLessThanOrEqual(MOTIF_MAX_NOTES);
        }
      }
    }
  });

  it('every motif note follows the harmony: chord tones on the beats, scale tones between', () => {
    let strong = 0;
    for (const k of LAYER_KINDS) {
      for (const seed of SEEDS) {
        for (let bar = 0; bar < LOOP_BARS * 2; bar++) {
          for (const n of LAYERS_FULL[k].motif(seed, bar)) {
            const abs = bar * STEPS_PER_BAR + n.step;
            expect(fitsHarmony(n.midi, abs), `${k} bar ${bar} step ${n.step} midi ${n.midi}`).toBe(true);
            if (isStrongStep(abs)) {
              strong++;
              expect(inChord(n.midi, harmonyForBar(bar))).toBe(true);
            }
            if (n.fromMidi !== null) expect(inPentatonic(n.fromMidi)).toBe(true);
            expect(n.step).toBeGreaterThanOrEqual(0);
            expect(n.step).toBeLessThan(STEPS_PER_BAR);
          }
          expect(inChord(stingerMidi(LAYERS_FULL[k], bar), harmonyForBar(bar))).toBe(true);
        }
      }
    }
    expect(strong).toBeGreaterThan(500);
  });

  it('entrance phrases: 3 to 5 chord tones, monophonic, the same shape in every chord', () => {
    const shapes = new Set<string>();
    for (const k of LAYER_KINDS) {
      const e = LAYERS_FULL[k];
      shapes.add(JSON.stringify(e.phrase));
      // Monophonic and inside the longest phrase.
      e.phrase.forEach((n, i) => {
        const next = e.phrase[i + 1];
        if (next) expect(n.at + n.dur, k).toBeLessThanOrEqual(next.at);
        else expect(n.at + n.dur).toBeLessThanOrEqual(STINGER_STEPS);
      });
      for (let start = 0; start < LOOP_BARS * STEPS_PER_BAR; start++) {
        const placed = stingerPhrase(e, start);
        expect(placed).toHaveLength(e.phrase.length);
        placed.forEach((n, i) => {
          const shape = e.phrase[i];
          expect(n.step).toBe(start + (shape?.at ?? 0));
          expect(n.dur).toBe(shape?.dur);
          // Each note is the shape's chord degree in its own bar's chord, never below A3.
          const h = harmonyAtStep(n.step);
          expect(inChord(n.midi, h)).toBe(true);
          expect(n.midi).toBe(chordToneMidi(h, shape?.deg ?? 0, stingerBase(e.register)));
          expect(n.midi).toBeGreaterThanOrEqual(STINGER_BASE_MIN - 12);
        });
        // Inside one chord the contour is identical whatever the chord: same rises and falls.
        const sameChord = placed.every((n) => harmonyAtStep(n.step) === harmonyAtStep(start));
        if (sameChord) {
          const dirs = placed.slice(1).map((n, i) => Math.sign(n.midi - (placed[i]?.midi ?? 0)));
          const want = e.phrase.slice(1).map((n, i) => Math.sign(n.deg - (e.phrase[i]?.deg ?? 0)));
          expect(dirs, `${k} at ${start}`).toEqual(want);
        }
      }
    }
    // Every kind has its own phrase.
    expect(shapes.size).toBe(LAYER_KINDS.length);
  });

  it('motifs are monophonic: a note ends by the next one, wrapping at the phrase end', () => {
    for (const k of LAYER_KINDS) {
      for (const seed of SEEDS) {
        for (let first = 0; first < LOOP_BARS; first += 2) {
          const notes = phrase(LAYERS_FULL, k, seed, first).sort((a, b) => a.step - b.step);
          notes.forEach((n, i) => {
            const next = notes[(i + 1) % notes.length];
            const gap = next ? (next.step - n.step + PHRASE_STEPS) % PHRASE_STEPS || PHRASE_STEPS : PHRASE_STEPS;
            expect(n.dur, `${k} step ${n.step}`).toBeLessThanOrEqual(gap);
          });
        }
      }
    }
  });

  it('is deterministic per (seed, kind, bar)', () => {
    for (const k of LAYER_KINDS) {
      for (const seed of SEEDS) {
        for (let bar = 0; bar < 20; bar++) {
          expect(LAYERS_FULL[k].motif(seed, bar)).toEqual(LAYERS_FULL[k].motif(seed, bar));
          expect(cutMotifs([...LAYER_KINDS])[k].motif(seed, bar)).toEqual(LAYERS_FULL[k].motif(seed, bar));
        }
        // The loop repeats every 8 bars.
        expect(LAYERS_FULL[k].motif(seed, 3)).toEqual(LAYERS_FULL[k].motif(seed, 3 + LOOP_BARS));
      }
    }
  });

  it('different kinds produce different motifs', () => {
    for (const seed of SEEDS) {
      const sigs = LAYER_KINDS.map((k) => JSON.stringify(phrase(LAYERS_FULL, k, seed, 0).map((n) => [n.step, n.midi, n.dur])));
      expect(new Set(sigs).size).toBe(LAYER_KINDS.length);
    }
  });

  it('the seed varies seeded kinds and leaves composed ones recognisable', () => {
    const sig = (k: EnemyKind, seed: number): string =>
      JSON.stringify([0, 2, 4, 6].map((b) => phrase(LAYERS_FULL, k, seed, b)));
    for (const k of ['wanderer', 'pinwheel', 'dart', 'blink', 'swirl', 'sower'] as const) {
      expect(new Set(SEEDS.map((s) => sig(k, s))).size, k).toBeGreaterThan(1);
    }
    // Every kind varies at least in the answering last phrase of the loop.
    for (const k of LAYER_KINDS) expect(new Set(SEEDS.map((s) => sig(k, s))).size, k).toBeGreaterThan(1);
  });

  it('varyPattern keeps the note count and an empty pattern stays empty', () => {
    const pat = LAYERS_FULL.dart.pattern;
    for (const v of ['none', 'walk', 'rotate', 'offset'] as const) {
      for (let ph = 0; ph < 4; ph++) expect(varyPattern(pat, v, 7, 'dart', ph)).toHaveLength(pat.length);
      expect(varyPattern([], v, 7, 'dart', 0)).toEqual([]);
    }
    expect(buildMotifBar({ kind: 'grunt', register: -5, pattern: [], variation: 'none' }, 1, 0)).toEqual([]);
  });
});

describe('cut 1', () => {
  it('keeps every key and every stinger, empties motifs beyond the first three kinds', () => {
    const cut = cutMotifs();
    expect(CUT1_KEEP).toEqual(['grunt', 'wanderer', 'weaver']);
    expect(Object.keys(cut).sort()).toEqual([...ALL_KINDS].sort());
    for (const k of LAYER_KINDS) {
      const e = cut[k];
      expect(e.phrase).toEqual(LAYERS_FULL[k].phrase);
      expect(stingerMidi(e, 2)).toBe(stingerMidi(LAYERS_FULL[k], 2));
      if (CUT1_KEEP.includes(k)) {
        expect(e.pattern.length).toBeGreaterThan(0);
        expect(e.motif(5, 0)).toEqual(LAYERS_FULL[k].motif(5, 0));
      } else {
        expect(e.pattern).toEqual([]);
        for (let bar = 0; bar < LOOP_BARS; bar++) expect(e.motif(5, bar)).toEqual([]);
      }
    }
  });
});
