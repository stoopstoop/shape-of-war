// Boss music lifecycle, pure (v3 wave B): stinger and fade quantisation, the duck and its
// release, the phase voice on the next bar, the defeat stinger, enemy motif slots beside a boss,
// and the summed gain at or under 1.0.
import { describe, expect, it } from 'vitest';
import { BOSS_MOTIFS, voicesForPhase } from '../../../src/audio/music/boss';
import {
  allowedEnemyKinds,
  BOSS_DUCK,
  BOSS_FLOOR,
  bossDone,
  bossDown,
  bossEnter,
  bossEnvAt,
  bossMotifScale,
  bossPhase,
  clipToStop,
  DEFEAT_STING,
  DEFEAT_STING_STEPS,
  duckAt,
  enemyMotifSlots,
  ENTRY_STING_STEPS,
  entryStingSteps,
  floorOn,
  phaseAt,
  releaseSteps,
  takeBossStings,
  voiceMayStart,
} from '../../../src/audio/music/bossLife';
import { BED_VOICE_MAX, BOSS_VOICE_MAX, ENEMY_MOTIF_SLOTS_WITH_BOSS, MOTIF_VOICE_MAX, MUSIC_VOICE_CAP } from '../../../src/audio/music/engine';
import { mixFor, sumGains } from '../../../src/audio/music/intensity';
import {
  ACCENT_RESERVE,
  BOSS_MOTIF_TOTAL_MAX,
  BOSS_STING_GAIN,
  enterLayer,
  envelopeAt,
  exitLayer,
  GAIN_CEILING,
  HIT_RESERVE,
  layerMix as mix,
  STINGER_GAIN,
  type LayerSet,
} from '../../../src/audio/music/lifecycle';
import { LAYERS_FULL } from '../../../src/audio/music/layers';
import { STEP_SEC, STEPS_PER_BAR } from '../../../src/audio/music/track';
import type { EnemyKind } from '../../../src/levelgen/leveldef';

const REL = releaseSteps(STEP_SEC);

describe('entry: stinger on the next sixteenth, motif on the next bar line with a one bar fade', () => {
  it('quantises from any step inside a bar', () => {
    for (const now of [16, 17, 21, 24, 30, 31]) {
      const b = bossEnter(null, 'warden', 1, now);
      expect(b.entryStep).toBe(now);
      expect(b.joinStep).toBe(32);
      // The stinger ends by the join bar line, at most ENTRY_STING_STEPS long.
      expect(entryStingSteps(b, now)).toBe(Math.min(ENTRY_STING_STEPS, 32 - now));
      expect(now + entryStingSteps(b, now)).toBeLessThanOrEqual(32);
      // Silent before the join, audible on its downbeat, full by the end of the bar, never above 1.
      for (let s = now; s < 32; s++) expect(bossEnvAt(b, s)).toBe(0);
      expect(bossEnvAt(b, 32)).toBeGreaterThan(0);
      expect(bossEnvAt(b, 32)).toBeLessThan(0.1);
      expect(bossEnvAt(b, 32 + 8)).toBeGreaterThan(0.4);
      expect(bossEnvAt(b, 32 + 8)).toBeLessThan(0.7);
      expect(bossEnvAt(b, 32 + 15)).toBe(1);
      expect(bossEnvAt(b, 200)).toBe(1);
      for (let s = 32; s < 48; s++) expect(bossEnvAt(b, s + 1)).toBeGreaterThanOrEqual(bossEnvAt(b, s));
    }
  });

  it('an entry exactly on a bar line joins on the following one', () => {
    const b = bossEnter(null, 'brood', 1, 48);
    expect(b.joinStep).toBe(64);
    expect(entryStingSteps(b, 48)).toBe(ENTRY_STING_STEPS);
  });

  it('the stinger is taken once, on its step; a stale one is dropped', () => {
    const b = bossEnter(null, 'warden', 1, 20);
    expect(takeBossStings(b, 19).entry).toBe(false);
    const t = takeBossStings(b, 20);
    expect(t.entry).toBe(true);
    expect(takeBossStings(t.life, 21).entry).toBe(false);
    // A stall of more than a bar: it is dropped, not played late.
    const late = takeBossStings(b, 20 + STEPS_PER_BAR + 1);
    expect(late.entry).toBe(false);
    expect(late.life.entryStep).toBeNull();
  });

  it('a duplicate enter of the live boss changes nothing', () => {
    const b = bossEnter(null, 'spindle', 1, 5);
    expect(bossEnter(b, 'spindle', 1, 40)).toBe(b);
  });

  it('the duck falls to 40 percent over the same bar the motif fades in', () => {
    const b = bossEnter(null, 'ember', 2, 10);
    expect(duckAt(null, 10)).toBe(1);
    expect(duckAt(b, 10)).toBe(1);
    expect(duckAt(b, 16)).toBe(1);
    expect(duckAt(b, 24)).toBeCloseTo((1 + BOSS_DUCK) / 2, 9);
    expect(duckAt(b, 32)).toBeCloseTo(BOSS_DUCK, 9);
    expect(duckAt(b, 500)).toBeCloseTo(BOSS_DUCK, 9);
    expect(floorOn(b)).toBe(true);
    expect(floorOn(null)).toBe(false);
    expect(BOSS_FLOOR).toBe(0.8);
  });
});

describe('phase', () => {
  it('a phase plays a sting on the next sixteenth and its voice from the next bar line', () => {
    let b = bossEnter(null, 'ember', 2, 3);
    b = bossPhase(b, 'ember', 2, 37);
    expect(b.phaseStingStep).toBe(37);
    expect(phaseAt(b, 47)).toBe(1);
    expect(phaseAt(b, 48)).toBe(2);
    // A lower or equal phase, another boss, or a second sting in the same bar is ignored.
    expect(bossPhase(b, 'ember', 2, 40)).toBe(b);
    expect(bossPhase(b, 'mirage', 3, 40)).toBe(b);
    const t = takeBossStings(b, 37);
    expect(t.phase).toBe(true);
    const b3 = bossPhase(t.life, 'ember', 3, 41);
    expect(phaseAt(b3, 48)).toBe(3);
    expect(b3.phaseStingStep).toBeNull(); // one sting per bar
    const b4 = bossPhase(t.life, 'ember', 3, 52);
    expect(b4.phaseStingStep).toBe(52);
    expect(phaseAt(b4, 63)).toBe(2);
    expect(phaseAt(b4, 64)).toBe(3);
  });

  it('a phase before the motif joins books its voice but plays no sting over the entry chord', () => {
    const b = bossPhase(bossEnter(null, 'ember', 2, 20), 'ember', 2, 21);
    expect(b.phaseStingStep).toBeNull();
    expect(phaseAt(b, 32)).toBe(2);
  });

  it('a phase sting plus the voices in play never passes BOSS_VOICE_MAX', () => {
    for (const id of ['warden', 'brood', 'spindle', 'ember', 'mirage', 'gravitas'] as const) {
      const s = BOSS_MOTIFS[id];
      // Phases 2 and 3: the voices of the phase before plus the one sting voice.
      for (const ph of [2, 3]) expect(voicesForPhase(s, ph - 1) + 1).toBeLessThanOrEqual(BOSS_VOICE_MAX);
      // Beyond that the index skips the sting while the voices in play are at the cap.
      expect(voicesForPhase(s, 4)).toBeLessThanOrEqual(BOSS_VOICE_MAX);
    }
  });
});

describe('down', () => {
  it('defeat stinger on the next sixteenth, phase voices stop now, the main line at the next bar line', () => {
    let b = bossEnter(null, 'gravitas', 2, 2);
    b = bossPhase(b, 'gravitas', 3, 20);
    b = takeBossStings(b, 20).life;
    const d = bossDown(b, 'gravitas', 70, REL);
    expect(d.defeatStep).toBe(70);
    expect(d.stopStep).toBe(80);
    expect(floorOn(d)).toBe(false);
    expect(voiceMayStart(d, 0, 75)).toBe(true);
    expect(voiceMayStart(d, 1, 69)).toBe(true);
    expect(voiceMayStart(d, 1, 70)).toBe(false);
    expect(voiceMayStart(d, 0, 80)).toBe(false);
    expect(bossEnvAt(d, 80)).toBe(0);
    expect(clipToStop(d, 76, 14)).toBe(4);
    expect(clipToStop(b, 76, 14)).toBe(14);
    // The defeat stinger waits while a phase voice note still sounds, then plays.
    expect(takeBossStings(d, 70, false).defeat).toBe(false);
    expect(takeBossStings(d, 73, true).defeat).toBe(true);
    // A down for another boss, or a second down, changes nothing.
    expect(bossDown(b, 'warden', 70, REL)).toBe(b);
    expect(bossDown(d, 'gravitas', 71, REL)).toBe(d);
  });

  it('the defeat stinger is an A major resolution, A C sharp E, one voice', () => {
    expect(DEFEAT_STING.map((n) => (69 + n.semis) % 12)).toEqual([9, 1, 4]);
    for (let i = 1; i < DEFEAT_STING.length; i++) {
      const p = DEFEAT_STING[i - 1];
      const c = DEFEAT_STING[i];
      if (p && c) expect(p.at + p.dur).toBeLessThanOrEqual(c.at);
    }
    const last = DEFEAT_STING[DEFEAT_STING.length - 1];
    expect((last?.at ?? 0) + (last?.dur ?? 0)).toBe(DEFEAT_STING_STEPS);
  });

  it('the duck returns to full over the normal release (3 s) and the state then ends', () => {
    expect(REL).toBe(24); // 3 s at 120 BPM
    const b = bossEnter(null, 'mirage', 2, 0);
    const d = bossDown(b, 'mirage', 100, REL);
    expect(duckAt(d, 100)).toBeCloseTo(BOSS_DUCK, 9);
    expect(duckAt(d, 112)).toBeCloseTo((1 + BOSS_DUCK) / 2, 9);
    expect(duckAt(d, 124)).toBe(1);
    for (let s = 100; s < 124; s++) expect(duckAt(d, s + 1)).toBeGreaterThanOrEqual(duckAt(d, s));
    const played = takeBossStings(d, 100).life;
    expect(bossDone(played, 123)).toBe(false);
    expect(bossDone(played, 124)).toBe(true);
    // A defeat stinger never taken (a long stall) does not hold the state past its release.
    const pending = bossDown(b, 'mirage', 116, REL);
    expect(bossDone(pending, 139)).toBe(false);
    expect(bossDone(pending, 140)).toBe(true);
  });

  it('a boss entering while the last one releases starts from the current duck', () => {
    const a = bossDown(bossEnter(null, 'warden', 1, 0), 'warden', 100, REL);
    const b = bossEnter(a, 'brood', 1, 112);
    expect(b.id).toBe('brood');
    expect(duckAt(b, 112)).toBeCloseTo(duckAt(a, 112), 9);
    expect(duckAt(b, 128)).toBeCloseTo(duckAt(a, 112), 9);
    expect(duckAt(b, 144)).toBeCloseTo(BOSS_DUCK, 9);
  });
});

describe('enemy motifs beside a boss', () => {
  const kinds: EnemyKind[] = ['grunt', 'wanderer', 'weaver', 'pinwheel', 'dart', 'snake'];

  it('the bed, 3 boss voices and the enemy motif slots fit the 16 voice cap', () => {
    expect(MOTIF_VOICE_MAX).toBe(6);
    expect(BOSS_VOICE_MAX).toBe(3);
    expect(BED_VOICE_MAX + BOSS_VOICE_MAX + ENEMY_MOTIF_SLOTS_WITH_BOSS).toBe(MUSIC_VOICE_CAP);
    expect(enemyMotifSlots(null)).toBe(6);
    expect(enemyMotifSlots(bossEnter(null, 'warden', 1, 0))).toBe(3);
  });

  it('with 6 enemy kinds only the 3 newest keep a motif voice', () => {
    let set: LayerSet = [];
    kinds.forEach((k, i) => (set = enterLayer(set, k, i)));
    expect([...allowedEnemyKinds(set, 100, 3)]).toEqual(['pinwheel', 'dart', 'snake']);
    expect(allowedEnemyKinds(set, 100, 6).size).toBe(6);
    // A kind whose motif has left gives its slot to an older kind.
    set = exitLayer(set, 'snake', 50);
    expect([...allowedEnemyKinds(set, 200, 3)]).toEqual(['weaver', 'pinwheel', 'dart']);
  });

  it('a motif fading out when the boss enters keeps falling and never jumps up', () => {
    let set: LayerSet = enterLayer([], 'grunt', 0);
    set = exitLayer(set, 'grunt', 40); // tail: fades over bar 4, leaves at step 80
    const l = set[0];
    if (!l) throw new Error('no layer');
    const b = bossEnter(null, 'warden', 1, 60); // joins at 64, the duck falls over bar 4 too
    let prev = Infinity;
    for (let s = 60; s <= 90; s++) {
      const g = envelopeAt(l, s) * duckAt(b, s);
      expect(g).toBeLessThanOrEqual(prev + 1e-12);
      prev = g;
    }
    expect(envelopeAt(l, 80) * duckAt(b, 80)).toBe(0);
  });
});

describe('gain budget', () => {
  it('bed, ducked enemy motifs, the boss motif, a boss sting, a stinger, an accent and hits sum to at most 1.0', () => {
    const all = Object.keys(LAYERS_FULL) as EnemyKind[];
    for (const nKinds of [0, 1, 3, 6, 12]) {
      let set: LayerSet = [];
      all.slice(0, nKinds).forEach((k, i) => (set = enterLayer(set, k, i)));
      for (const threat of [0, 0.5, 0.8, 1]) {
        const bed = sumGains(mixFor(threat).gains);
        for (const id of ['warden', 'brood', 'spindle', 'ember', 'mirage', 'gravitas'] as const) {
          const spec = BOSS_MOTIFS[id];
          const b = bossEnter(null, id, spec.tier, 20);
          for (const step of [20, 32, 36, 40, 47, 48, 200]) {
            for (const ph of [1, 2, 3]) {
              const v = voicesForPhase(spec, ph);
              const total = spec.gain * v * bossMotifScale(spec.gain, v) * bossEnvAt(b, step);
              expect(total).toBeLessThanOrEqual(BOSS_MOTIF_TOTAL_MAX + 1e-12);
              const duck = duckAt(b, step);
              const m = mix(bed, set, LAYERS_FULL, step, { duck, total });
              const sum = bed * m.bedScale + m.motifTotal * duck + total + BOSS_STING_GAIN + STINGER_GAIN + ACCENT_RESERVE + HIT_RESERVE;
              expect(sum, `${id} kinds ${nKinds} threat ${threat} step ${step}`).toBeLessThanOrEqual(GAIN_CEILING + 1e-9);
              expect(m.bedScale).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it('with no boss the budget is unchanged', () => {
    const set = enterLayer([], 'grunt', 0);
    const bed = sumGains(mixFor(1).gains);
    expect(mix(bed, set, LAYERS_FULL, 10)).toEqual(mix(bed, set, LAYERS_FULL, 10, null));
  });
});
