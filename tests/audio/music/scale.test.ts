import { describe, expect, it } from 'vitest';
import {
  inNaturalMinor,
  inPentatonic,
  midiToHz,
  pentatonicMidi,
  pitchClass,
} from '../../../src/audio/music/scale';
import { fitsHarmony, harmonyForBar, inChord, isStrongStep } from '../../../src/audio/music/harmony';
import { buildBar, LOOP_BARS, STEPS_PER_BAR } from '../../../src/audio/music/track';

const SEEDS = [0, 1, 2, 42, 0x229578a8, 0xdeadbeef, 0xffffffff, 123456789];

describe('scale maths', () => {
  it('converts MIDI to Hz in equal temperament', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 9);
    expect(midiToHz(57)).toBeCloseTo(220, 9);
    expect(midiToHz(81)).toBeCloseTo(880, 9);
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3);
  });

  it('wraps pitch classes for negatives', () => {
    expect(pitchClass(69)).toBe(9);
    expect(pitchClass(-3)).toBe(9);
  });

  it('knows A minor pentatonic and natural minor', () => {
    const penta = [57, 60, 62, 64, 67].map(pitchClass);
    for (let pc = 0; pc < 12; pc++) expect(inPentatonic(pc)).toBe(penta.includes(pc));
    expect([9, 11, 0, 2, 4, 5, 7].every(inNaturalMinor)).toBe(true);
    expect([1, 3, 6, 8, 10].some(inNaturalMinor)).toBe(false);
  });

  it('maps pentatonic degrees across octaves', () => {
    expect(pentatonicMidi(0)).toBe(69);
    expect(pentatonicMidi(1)).toBe(72);
    expect(pentatonicMidi(4)).toBe(79);
    expect(pentatonicMidi(5)).toBe(81);
    expect(pentatonicMidi(-1)).toBe(67);
    expect(pentatonicMidi(-5)).toBe(57);
    for (let d = -10; d <= 15; d++) {
      expect(inPentatonic(pentatonicMidi(d))).toBe(true);
      expect(pentatonicMidi(d + 1)).toBeGreaterThan(pentatonicMidi(d));
    }
  });
});

describe('every base track note is in the scale', () => {
  it('arp notes follow the harmony, bass and pad notes are chord tones', () => {
    let pitched = 0;
    for (const seed of SEEDS) {
      for (let bar = 0; bar < LOOP_BARS; bar++) {
        for (const n of buildBar(seed, bar).notes) {
          if (n.midi === null) {
            expect(['kick', 'perc', 'hat']).toContain(n.layer);
            continue;
          }
          pitched++;
          expect(inNaturalMinor(n.midi)).toBe(true);
          const abs = bar * STEPS_PER_BAR + n.step;
          if (n.layer === 'arp') {
            expect(fitsHarmony(n.midi, abs)).toBe(true);
            // Weak steps keep the composed pentatonic line.
            if (!isStrongStep(abs)) expect(inPentatonic(n.midi)).toBe(true);
          } else {
            expect(inChord(n.midi, harmonyForBar(bar))).toBe(true);
          }
        }
      }
    }
    expect(pitched).toBeGreaterThan(SEEDS.length * LOOP_BARS * 10);
  });
});
