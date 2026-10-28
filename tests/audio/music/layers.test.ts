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
  stingerMidi,
  TIMBRES,
  varyPattern,
  type LayerRegistry,
} from '../../../src/audio/music/layers';
import { inPentatonic, pentatonicMidi } from '../../../src/audio/music/scale';
import { chordForBar, LOOP_BARS, STEPS_PER_BAR } from '../../../src/audio/music/track';
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
      expect([-1, 0, 1]).toContain(e.stingerDegree);
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
    // the shield deflect (hits.ts).
    expect(Object.keys(TIMBRES)).toHaveLength(kinds.length + 7);
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

  it('every motif note, glide start and stinger is in the scale', () => {
    for (const k of LAYER_KINDS) {
      for (const seed of SEEDS) {
        for (let bar = 0; bar < LOOP_BARS * 2; bar++) {
          for (const n of LAYERS_FULL[k].motif(seed, bar)) {
            expect(inPentatonic(n.midi), `${k} ${n.midi}`).toBe(true);
            if (n.fromMidi !== null) expect(inPentatonic(n.fromMidi)).toBe(true);
            expect(n.step).toBeGreaterThanOrEqual(0);
            expect(n.step).toBeLessThan(STEPS_PER_BAR);
          }
          expect(inPentatonic(stingerMidi(LAYERS_FULL[k], bar))).toBe(true);
        }
      }
    }
  });

  it('the stinger is the chord anchor or its pentatonic neighbour, in the kind octave', () => {
    for (const k of LAYER_KINDS) {
      const e = LAYERS_FULL[k];
      for (let bar = 0; bar < LOOP_BARS; bar++) {
        const anchor = chordForBar(bar).arpAnchor + Math.floor(e.register / 5) * 5;
        expect(stingerMidi(e, bar)).toBe(pentatonicMidi(anchor + e.stingerDegree));
      }
    }
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
      expect(e.stingerDegree).toBe(LAYERS_FULL[k].stingerDegree);
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
