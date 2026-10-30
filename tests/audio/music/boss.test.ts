// Boss motifs (v3 wave B): the registry covers every BossId, every motif note is in its tier
// scale, a motif is a pure function of (boss id, phase, bar), distinct bosses sound distinct, and
// each phase adds one monophonic voice up to BOSS_VOICE_MAX.
import { describe, expect, it } from 'vitest';
import {
  BOSS_MOTIFS,
  buildBossBar,
  inTierScale,
  mainForPass,
  missingBossIds,
  MOTIF_LOOP_NOTES_MAX,
  MOTIF_LOOP_NOTES_MIN,
  snapTierChord,
  TIER_SCALES,
  tierMidi,
  voicesForPhase,
  type BossMotifNote,
  type BossMotifSpec,
} from '../../../src/audio/music/boss';
import { BOSS_VOICE_MAX } from '../../../src/audio/music/engine';
import { harmonyForBar, inChord } from '../../../src/audio/music/harmony';
import { STEPS_PER_BAR } from '../../../src/audio/music/track';
import { BOSS_KEYS } from '../../../src/audio/music/tunes';
import { BOSS_IDS, type BossId } from '../../../src/levelgen/leveldef';

/** Bosses with a written motif in wave B (1 to 6). */
const WRITTEN: readonly BossId[] = ['warden', 'brood', 'spindle', 'ember', 'mirage', 'gravitas'];
/** Wave C fills this one (tier 3 is covered in bossTier3.test.ts). */
const EMPTY: readonly BossId[] = ['prism'];
const PHASES = [1, 2, 3, 4];
const BARS = 32;

/** The docs/12 roster tiers, by id. */
const ROSTER_TIER: Readonly<Record<BossId, number>> = {
  warden: 1,
  brood: 1,
  spindle: 1,
  ember: 2,
  mirage: 2,
  gravitas: 2,
  bastion: 3,
  tempest: 3,
  twins: 3,
  prism: 4,
};

const spec = (id: BossId): BossMotifSpec => BOSS_MOTIFS[id];

describe('boss motif registry', () => {
  it('has an entry for every BossId, in roster order, with the roster tier', () => {
    expect(Object.keys(BOSS_MOTIFS)).toEqual([...BOSS_IDS]);
    expect(missingBossIds(BOSS_MOTIFS)).toEqual([]);
    for (const id of BOSS_IDS) {
      expect(spec(id).id).toBe(id);
      expect(spec(id).tier).toBe(ROSTER_TIER[id]);
    }
  });

  it('a registry missing an id fails the coverage check', () => {
    const partial: Partial<Record<BossId, BossMotifSpec>> = { ...BOSS_MOTIFS };
    delete partial.gravitas;
    expect(missingBossIds(partial)).toEqual(['gravitas']);
    expect(missingBossIds({})).toEqual([...BOSS_IDS]);
  });

  it('bosses 1 to 6 have a motif, a timbre, a register and a gain; Prism is present and empty', () => {
    for (const id of WRITTEN) {
      const s = spec(id);
      expect(s.main.length, id).toBeGreaterThan(0);
      expect([2, 4]).toContain(s.loopBars);
      expect(s.gain).toBeGreaterThan(0);
      expect(s.gain).toBeLessThanOrEqual(0.1);
      expect(s.register % 12).toBe(9); // an A
      expect(s.timbre.id).toBeTruthy();
      expect(s.character.length).toBeGreaterThan(0);
    }
    for (const id of EMPTY) {
      const s = spec(id);
      expect(s.main).toEqual([]);
      expect(s.phaseVoices).toEqual([]);
      for (const ph of PHASES) for (let bar = 0; bar < 8; bar++) expect(s.motif(ph, bar)).toEqual([]);
      expect(voicesForPhase(s, 3)).toBe(0);
    }
  });

  it('each main line is a 2 or 4 bar loop of 4 to 8 notes that fits inside its loop', () => {
    for (const id of WRITTEN) {
      const s = spec(id);
      expect(s.main.length, id).toBeGreaterThanOrEqual(MOTIF_LOOP_NOTES_MIN);
      expect(s.main.length, id).toBeLessThanOrEqual(MOTIF_LOOP_NOTES_MAX);
      for (const n of s.main) expect(n.step + n.dur, id).toBeLessThanOrEqual(s.loopBars * STEPS_PER_BAR);
      for (const pv of s.phaseVoices) {
        if (pv.type !== 'voice') continue;
        expect(pv.line.length).toBeGreaterThanOrEqual(MOTIF_LOOP_NOTES_MIN);
        expect(pv.line.length).toBeLessThanOrEqual(MOTIF_LOOP_NOTES_MAX);
        for (const n of pv.line) expect(n.step + n.dur).toBeLessThanOrEqual(s.loopBars * STEPS_PER_BAR);
      }
    }
  });
});

describe('tier scales', () => {
  it('tier 1 is A minor pentatonic, tier 2 harmonic minor, tier 3 phrygian', () => {
    expect(TIER_SCALES[1]).toEqual([0, 3, 5, 7, 10]);
    expect(TIER_SCALES[2]).toEqual([0, 2, 3, 5, 7, 8, 11]);
    expect(TIER_SCALES[3]).toEqual([0, 1, 3, 5, 7, 8, 10]);
    expect(inTierScale(68, 2)).toBe(true); // G#4
    expect(inTierScale(67, 2)).toBe(false); // G4
    expect(inTierScale(70, 3)).toBe(true); // Bb4
    expect(inTierScale(71, 3)).toBe(false); // B4
    expect(inTierScale(65, 1)).toBe(false); // F4
    expect(tierMidi(0, 1, 57)).toBe(57);
    expect(tierMidi(5, 1, 57)).toBe(69);
    expect(tierMidi(-1, 1, 57)).toBe(55);
    expect(tierMidi(6, 2, 57)).toBe(68);
    expect(tierMidi(-7, 2, 57)).toBe(45);
    expect(tierMidi(1, 3, 57)).toBe(58);
  });

  it('a snapped pitch is both a chord tone and in the tier scale', () => {
    for (const tier of [1, 2, 3] as const) {
      for (const h of BOSS_KEYS[tier].bars) {
        for (let m = 40; m < 90; m++) {
          const s = snapTierChord(m, h, tier);
          expect(inChord(s, h)).toBe(true);
          expect(inTierScale(s, tier)).toBe(true);
          expect(Math.abs(s - m)).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('every motif note and glide start of every boss, phase and bar is in its tier scale', () => {
    let checked = 0;
    for (const id of WRITTEN) {
      const s = spec(id);
      for (const ph of PHASES) {
        for (let bar = 0; bar < BARS; bar++) {
          for (const n of s.motif(ph, bar)) {
            const what = `${id} phase ${ph} bar ${bar} step ${n.step} midi ${n.midi}`;
            expect(inTierScale(n.midi, s.tier), what).toBe(true);
            if (n.fromMidi !== null) expect(inTierScale(n.fromMidi, s.tier), what).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('notes on the downbeat and the half bar are chord tones of the boss bed', () => {
    for (const id of WRITTEN) {
      const s = spec(id);
      for (let bar = 0; bar < BARS; bar++) {
        const h = harmonyForBar(bar, BOSS_KEYS[s.tier]);
        for (const n of s.motif(1, bar)) if (n.step === 0 || n.step === 8) expect(inChord(n.midi, h), `${id} bar ${bar}`).toBe(true);
      }
    }
  });
});

describe('boss motif builder', () => {
  it('is a pure function of (boss id, phase, bar): the same arguments, the same notes', () => {
    for (const id of WRITTEN) {
      for (const ph of PHASES) {
        for (let bar = 0; bar < BARS; bar++) {
          const a = spec(id).motif(ph, bar);
          const b = buildBossBar(spec(id), ph, bar);
          expect(JSON.stringify(a)).toBe(JSON.stringify(b));
          expect(JSON.parse(JSON.stringify(a))).toEqual(a);
        }
      }
    }
    // A fresh call after other calls still matches (no hidden state).
    const before = JSON.stringify(spec('ember').motif(2, 13));
    for (let i = 0; i < 50; i++) spec('mirage').motif(3, i);
    expect(JSON.stringify(spec('ember').motif(2, 13))).toBe(before);
  });

  it('distinct bosses give distinct motifs', () => {
    const shape = (id: BossId): string => {
      const s = spec(id);
      const out: string[] = [];
      for (let bar = 0; bar < 4; bar++) for (const n of s.motif(1, bar)) out.push(`${bar}:${n.step}:${n.midi}:${n.durSteps}`);
      return out.join(',');
    };
    const shapes = WRITTEN.map(shape);
    expect(new Set(shapes).size).toBe(WRITTEN.length);
    // Rhythms alone already differ.
    const rhythms = WRITTEN.map((id) => spec(id).main.map((n) => `${n.step}:${n.dur}`).join(','));
    expect(new Set(rhythms).size).toBe(WRITTEN.length);
  });

  it('odd passes may answer: only the last main note moves, by one degree, decided by hash', () => {
    let answered = 0;
    for (const id of WRITTEN) {
      const s = spec(id);
      for (const ph of PHASES) {
        for (let pass = 0; pass < 8; pass++) {
          const m = mainForPass(s, ph, pass);
          for (let i = 0; i < m.length - 1; i++) expect(m[i]).toEqual(s.main[i]);
          const last = m[m.length - 1];
          const orig = s.main[s.main.length - 1];
          const move = (last?.deg ?? 0) - (orig?.deg ?? 0);
          if (pass % 2 === 0) expect(move).toBe(0);
          else expect([-1, 0, 1]).toContain(move);
          if (move !== 0) answered++;
        }
      }
    }
    expect(answered).toBeGreaterThan(0);
  });

  it('phase 1 is one voice and each later phase adds one, never more than BOSS_VOICE_MAX', () => {
    for (const id of WRITTEN) {
      const s = spec(id);
      expect(voicesForPhase(s, 1)).toBe(1);
      for (const ph of PHASES) {
        const v = voicesForPhase(s, ph);
        expect(v).toBeLessThanOrEqual(BOSS_VOICE_MAX);
        expect(v).toBe(Math.min(BOSS_VOICE_MAX, 1 + Math.min(s.phaseVoices.length, ph - 1)));
        const used = new Set<number>();
        for (let bar = 0; bar < s.loopBars; bar++) for (const n of s.motif(ph, bar)) used.add(n.voice);
        expect(used.size, `${id} phase ${ph}`).toBe(v);
      }
    }
  });

  it('every voice is monophonic, so the notes sounding at once never exceed the voices', () => {
    for (const id of WRITTEN) {
      const s = spec(id);
      for (const ph of PHASES) {
        const notes: (BossMotifNote & { abs: number })[] = [];
        for (let bar = 0; bar < s.loopBars * 4; bar++) for (const n of s.motif(ph, bar)) notes.push({ ...n, abs: bar * STEPS_PER_BAR + n.step });
        const byVoice = new Map<number, (BossMotifNote & { abs: number })[]>();
        for (const n of notes) byVoice.set(n.voice, [...(byVoice.get(n.voice) ?? []), n]);
        for (const list of byVoice.values()) {
          list.sort((a, b) => a.abs - b.abs);
          for (let i = 1; i < list.length; i++) {
            const prev = list[i - 1];
            const cur = list[i];
            if (prev && cur) expect(prev.abs + prev.durSteps, `${id} phase ${ph}`).toBeLessThanOrEqual(cur.abs);
          }
        }
        for (let step = 0; step < s.loopBars * 4 * STEPS_PER_BAR; step++) {
          const sounding = notes.filter((n) => n.abs <= step && n.abs + n.durSteps > step).length;
          expect(sounding).toBeLessThanOrEqual(voicesForPhase(s, ph));
        }
      }
    }
  });

  it('an octave phase voice doubles the main line an octave away', () => {
    const s = spec('warden');
    const bar = s.motif(2, 0);
    const main = bar.filter((n) => n.voice === 0);
    const up = bar.filter((n) => n.voice === 1);
    expect(up.map((n) => n.midi)).toEqual(main.map((n) => n.midi + 12));
    // Warden's heartbeat: A2 then E3 on an A minor bar.
    expect(main.map((n) => n.midi)).toEqual([45, 52]);
  });

  it('Ember winds up through the raised seventh: E F G sharp A, then a low A', () => {
    const s = spec('ember');
    const all = [...s.motif(1, 0), ...s.motif(1, 1).map((n) => ({ ...n, step: n.step + 16 }))];
    expect(all.map((n) => n.midi)).toEqual([64, 65, 68, 69, 45]);
  });
});
