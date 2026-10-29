// The tune library (v2.1 tunes): every tune validates (tempo, loop, chords present, every bed
// pitch in the tune's scale and chord), the tunes really differ, and every bar of every tune,
// varied passes and fills included, keeps the bed inside BED_VOICE_MAX at full threat.
import { describe, expect, it } from 'vitest';
import { BED_VOICE_MAX, voiceLength } from '../../../src/audio/music/engine';
import { fitsHarmony, harmonyForBar, inChord, inScale, STEPS_PER_BAR, type Harmony } from '../../../src/audio/music/harmony';
import { pentatonicMidi, pitchClass } from '../../../src/audio/music/scale';
import { buildBar, structuralFill, type FillBar, type Layer } from '../../../src/audio/music/track';
import {
  BOSS_KEYS,
  BOSS_TUNES,
  BPM_MAX,
  BPM_MIN,
  bossTuneFor,
  DEFAULT_TUNE,
  FILL_BARS,
  TUNE_IDS,
  TUNES,
  tuneById,
  voicingForBar,
  type Tune,
} from '../../../src/audio/music/tunes';

const SEEDS = [0, 1, 7, 0x5eed, 0xdeadbeef];
const PASSES = 6;

/** The pitch classes of a minor pentatonic on the tune root. */
function pentaPcs(t: Tune): number[] {
  return [0, 1, 2, 3, 4].map((d) => pitchClass(pentatonicMidi(d, t.root)));
}

describe.each(TUNES.map((t) => [t.id, t] as const))('tune %s validates', (_id, t) => {
  it('has a tempo in range, an 8 or 16 bar loop and a step length that matches the tempo', () => {
    expect(t.bpm).toBeGreaterThanOrEqual(BPM_MIN);
    expect(t.bpm).toBeLessThanOrEqual(BPM_MAX);
    expect([8, 16]).toContain(t.loopBars);
    expect(t.key.bars).toHaveLength(t.loopBars);
    expect(t.stepSec).toBeCloseTo(60 / t.bpm / 4, 12);
    expect(Math.abs(t.root - 69)).toBeLessThanOrEqual(5);
  });

  it('has a seven note scale on its tonic that holds the minor pentatonic of its root', () => {
    expect(new Set(t.key.scale).size).toBe(7);
    expect(t.key.scale[0]).toBe(t.key.tonic);
    expect(pitchClass(t.root)).toBe(t.key.tonic);
    for (const pc of pentaPcs(t)) expect(t.key.scale).toContain(pc);
  });

  it('every chord of the plan is a triad of scale tones, voiced, and the loop starts on the tonic', () => {
    const chords = new Set<Harmony>(t.key.bars);
    expect(chords.size).toBeGreaterThanOrEqual(4);
    expect(t.key.bars[0]?.root).toBe(t.key.tonic);
    for (const h of chords) {
      expect(h.tones).toHaveLength(3);
      for (const pc of h.tones) expect(t.key.scale).toContain(pc);
      const v = t.voicings[h.name];
      expect(v, h.name).toBeDefined();
      if (!v) continue;
      expect(v.harmony).toBe(h);
      expect(pitchClass(v.bass)).toBe(h.root);
      expect(new Set(v.pad.map(pitchClass))).toEqual(new Set(h.tones));
    }
    // The chord changes at least four times around the loop.
    let changes = 0;
    for (let b = 0; b < t.loopBars; b++) if (harmonyForBar(b, t.key) !== harmonyForBar(b + 1, t.key)) changes++;
    expect(changes).toBeGreaterThanOrEqual(4);
  });

  it('every bed pitch, on every pass and in every fill, is in the scale: chord tones for bass and pad, the harmony rule for the arp', () => {
    for (const seed of SEEDS) {
      for (let bar = 0; bar < t.loopBars * PASSES; bar++) {
        for (const fill of [null, 0, 1] as FillBar[]) {
          const p = buildBar(seed, bar, t, fill);
          expect(p.tune).toBe(t.id);
          const h = harmonyForBar(bar, t.key);
          expect(p.chord).toBe(h.name);
          for (const n of p.notes) {
            if (n.midi === null) continue;
            const what = `${t.id} seed ${seed} bar ${bar} fill ${fill} ${n.layer} step ${n.step} midi ${n.midi}`;
            const abs = bar * STEPS_PER_BAR + n.step;
            expect(inScale(n.midi, t.key), what).toBe(true);
            if (n.layer === 'arp') expect(fitsHarmony(n.midi, abs, t.key), what).toBe(true);
            else expect(inChord(n.midi, h), what).toBe(true);
          }
        }
      }
    }
  });

  it('rests never fall on steps 0 and 8, and the arp and bass stay in a playable range', () => {
    for (const f of [t.arp, t.arpAlt]) {
      expect(f.rests).not.toContain(0);
      expect(f.rests).not.toContain(8);
      expect(f.a).toHaveLength(16);
      expect(f.b).toHaveLength(16);
    }
    for (let bar = 0; bar < t.loopBars * 2; bar++) {
      const p = buildBar(3, bar, t);
      const steps = p.notes.filter((n) => n.layer === 'arp').map((n) => n.step);
      expect(steps).toContain(0);
      expect(steps).toContain(8);
      for (const n of p.notes) {
        if (n.layer === 'bass') expect(n.midi ?? 0).toBeGreaterThanOrEqual(36);
        if (n.layer === 'bass') expect(n.midi ?? 0).toBeLessThanOrEqual(64);
        if (n.layer === 'arp') expect(n.midi ?? 0).toBeLessThanOrEqual(96);
      }
      // Monophonic bass: each note ends at or before the next starts.
      const bass = p.notes.filter((n) => n.layer === 'bass');
      for (let i = 1; i < bass.length; i++) expect((bass[i - 1]?.step ?? 0) + (bass[i - 1]?.durSteps ?? 0)).toBeLessThanOrEqual(bass[i]?.step ?? 0);
    }
  });

  it('every second pass varies the arp or the bass line, and a 3 minute level never repeats a pass verbatim before the fourth', () => {
    for (const seed of SEEDS) {
      const passNotes = (pass: number): string =>
        JSON.stringify(Array.from({ length: t.loopBars }, (_, b) => buildBar(seed, pass * t.loopBars + b, t, structuralFill(t, pass * t.loopBars + b)).notes));
      for (let pass = 0; pass < PASSES; pass++) {
        const v = buildBar(seed, pass * t.loopBars, t).variant;
        if (pass % 2 === 0) expect(v).toBe('none');
        else expect(['arp', 'bass']).toContain(v);
      }
      const passes = Array.from({ length: 4 }, (_, p) => passNotes(p));
      expect(new Set(passes).size).toBe(4);
    }
  });

  it('a structural fill closes every odd pass and only those', () => {
    for (let bar = 0; bar < t.loopBars * PASSES; bar++) {
      const pass = Math.floor(bar / t.loopBars);
      const inLoop = bar % t.loopBars;
      const expected: FillBar = pass % 2 === 1 && inLoop >= t.loopBars - FILL_BARS ? ((inLoop - (t.loopBars - FILL_BARS)) as 0 | 1) : null;
      expect(structuralFill(t, bar)).toBe(expected);
    }
  });

  it('keeps the bed inside BED_VOICE_MAX at full threat on every bar, pass and fill', () => {
    const sec = t.stepSec;
    for (const seed of SEEDS.slice(0, 2)) {
      for (const fills of ['none', 'all'] as const) {
        const spans: { start: number; end: number; layer: Layer }[] = [];
        for (let bar = 0; bar < t.loopBars * 4; bar++) {
          const fill: FillBar = fills === 'none' ? structuralFill(t, bar) : ((bar % 2) as 0 | 1);
          for (const n of buildBar(seed, bar, t, fill).notes) {
            const start = (bar * STEPS_PER_BAR + n.step) * sec;
            spans.push({ start, end: start + voiceLength(n.layer, n.durSteps * sec), layer: n.layer });
          }
        }
        const ev: [number, number][] = [];
        for (const s of spans) ev.push([s.start, 1], [s.end, -1]);
        ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        let cur = 0;
        let peak = 0;
        for (const [, d] of ev) {
          cur += d;
          peak = Math.max(peak, cur);
        }
        expect(peak, `${t.id} fills ${fills}`).toBeLessThanOrEqual(BED_VOICE_MAX);
      }
    }
  });
});

describe('the tunes differ', () => {
  it('has at least four tunes with distinct keys, tempos, chord plans, bed timbres and drums', () => {
    expect(TUNES.length).toBeGreaterThanOrEqual(4);
    expect(TUNES.map((t) => t.id)).toEqual([...TUNE_IDS]);
    const distinct = <T>(f: (t: Tune) => T): number => new Set(TUNES.map((t) => JSON.stringify(f(t)))).size;
    expect(distinct((t) => t.key.tonic)).toBe(TUNES.length);
    expect(distinct((t) => t.bpm)).toBe(TUNES.length);
    expect(distinct((t) => t.key.bars.map((h) => h.numeral))).toBe(TUNES.length);
    expect(distinct((t) => t.bed)).toBe(TUNES.length);
    expect(distinct((t) => t.drums.kick)).toBe(TUNES.length);
    expect(distinct((t) => t.bass)).toBe(TUNES.length);
    expect(distinct((t) => t.arp)).toBe(TUNES.length);
  });

  it('the default tune is the original track: A minor, 120 BPM, Am F C G', () => {
    expect(DEFAULT_TUNE.id).toBe('neon');
    expect(DEFAULT_TUNE.bpm).toBe(120);
    expect(Array.from({ length: 8 }, (_, b) => voicingForBar(DEFAULT_TUNE, b).name)).toEqual(['Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G']);
    expect(buildBar(9, 2)).toEqual(buildBar(9, 2, DEFAULT_TUNE, null));
  });

  it('looks tunes up by id', () => {
    for (const t of TUNES) expect(tuneById(t.id)).toBe(t);
    expect(tuneById('nope')).toBe(DEFAULT_TUNE);
  });

  it('every tune is serialisable', () => {
    for (const t of TUNES) expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });
});

describe('boss hook', () => {
  it('returns the tier boss bed in A at 120 BPM whatever the active tune (wave B)', () => {
    for (const t of TUNES) {
      for (const tier of [1, 2, 3, 4] as const) {
        const b = bossTuneFor(tier, t);
        expect(b).toBe(BOSS_TUNES[tier]);
        expect(b.bpm).toBe(120);
        expect(b.root).toBe(69);
        expect(b.key.tonic).toBe(9);
        expect(b.bossTier).toBe(tier);
      }
    }
    // Out of range tiers fall back to tier 1.
    expect(bossTuneFor(0, DEFAULT_TUNE)).toBe(BOSS_TUNES[1]);
  });

  it('every boss bed chord is built from its key scale and has a voicing', () => {
    for (const tier of [1, 2, 3, 4] as const) {
      const t = BOSS_TUNES[tier];
      expect(t.key.bars).toHaveLength(t.loopBars);
      for (const h of t.key.bars) {
        for (const pc of h.tones) expect(t.key.scale).toContain(pc);
        expect(t.voicings[h.name]).toBeDefined();
      }
      expect(JSON.parse(JSON.stringify(t))).toEqual(t);
    }
    // Tier 2 carries the raised seventh (G sharp, pitch class 8), tier 3 the flat second (B flat, 10).
    expect(BOSS_KEYS[2].scale).toContain(8);
    expect(BOSS_KEYS[3].scale).toContain(10);
  });

  it('every boss bed pitch keeps the harmony rule and the bed stays inside BED_VOICE_MAX', () => {
    for (const tier of [1, 2, 3, 4] as const) {
      const t = BOSS_TUNES[tier];
      const sec = t.stepSec;
      const ev: [number, number][] = [];
      for (let bar = 0; bar < t.loopBars * 4; bar++) {
        const h = harmonyForBar(bar, t.key);
        for (const n of buildBar(5, bar, t, structuralFill(t, bar)).notes) {
          const start = (bar * STEPS_PER_BAR + n.step) * sec;
          ev.push([start, 1], [start + voiceLength(n.layer, n.durSteps * sec), -1]);
          if (n.midi === null) continue;
          const what = `tier ${tier} bar ${bar} ${n.layer} step ${n.step} midi ${n.midi}`;
          expect(inScale(n.midi, t.key), what).toBe(true);
          if (n.layer === 'arp') expect(fitsHarmony(n.midi, bar * STEPS_PER_BAR + n.step, t.key), what).toBe(true);
          else expect(inChord(n.midi, h), what).toBe(true);
        }
      }
      ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let cur = 0;
      let peak = 0;
      for (const [, d] of ev) {
        cur += d;
        peak = Math.max(peak, cur);
      }
      expect(peak, `tier ${tier}`).toBeLessThanOrEqual(BED_VOICE_MAX);
    }
  });

  it('the level tunes are not boss beds', () => {
    for (const t of TUNES) expect(t.bossTier).toBeUndefined();
  });
});
