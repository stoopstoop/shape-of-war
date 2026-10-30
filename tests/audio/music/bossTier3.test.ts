// Tier 3 boss motifs (v3 wave C): Bastion's heavy march that loses a voice per phase, Tempest's
// sixteenth arpeggio that rises each lap, Twins' two voice canon that goes solo at double time.
// Pure checks first (scale, determinism, distinctness, voices), then the real entry points with a
// fake audio clock for the voice cap with a tier 3 boss at phase 3.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BOSS_MOTIFS,
  doubleTime,
  inTierScale,
  lapClimb,
  missingBossIds,
  tempoForPhase,
  tierMidi,
  voicesForPhase,
  type BossMotifNote,
} from '../../../src/audio/music/boss';
import { bossMotifScale } from '../../../src/audio/music/bossLife';
import { BOSS_VOICE_MAX, MUSIC_VOICE_CAP } from '../../../src/audio/music/engine';
import { harmonyForBar, inChord } from '../../../src/audio/music/harmony';
import { initMusic, musicState, setMusicVolume, startMusic, stopMusic, type MusicGraph, type NoteLog } from '../../../src/audio/music/index';
import { BOSS_MOTIF_TOTAL_MAX } from '../../../src/audio/music/lifecycle';
import { TICK_MS } from '../../../src/audio/music/scheduler';
import { BAR_SEC, STEPS_PER_BAR } from '../../../src/audio/music/track';
import { BOSS_KEYS } from '../../../src/audio/music/tunes';
import { Bus } from '../../../src/core/events';
import { BOSS_IDS, type BossId, type EnemyKind } from '../../../src/levelgen/leveldef';
import { FakeContext, FakeNode, FakeTimer } from './fakeAudio';

const TIER3 = ['bastion', 'tempest', 'twins'] as const;
const OLDER: readonly BossId[] = ['warden', 'brood', 'spindle', 'ember', 'mirage', 'gravitas'];
const PHASES = [1, 2, 3, 4];
const BARS = 32;
const PC_BB = 10;

/** Notes of bars [from, to) of a boss motif in a phase, with `step` counted from the first bar. */
const bars = (id: BossId, phase: number, from: number, to: number): BossMotifNote[] => {
  const out: BossMotifNote[] = [];
  for (let b = from; b < to; b++) out.push(...BOSS_MOTIFS[id].motif(phase, b).map((n) => ({ ...n, step: n.step + (b - from) * STEPS_PER_BAR })));
  return out;
};
const sig = (id: BossId, phase = 1): string => JSON.stringify(bars(id, phase, 0, 8).map((n) => [n.step, n.midi, n.durSteps, n.voice]));

describe('tier 3 registry', () => {
  it('still covers every BossId, in roster order, and the three tier 3 entries are written', () => {
    expect(Object.keys(BOSS_MOTIFS)).toEqual([...BOSS_IDS]);
    expect(missingBossIds(BOSS_MOTIFS)).toEqual([]);
    for (const id of TIER3) {
      const s = BOSS_MOTIFS[id];
      expect(s.id).toBe(id);
      expect(s.tier).toBe(3);
      expect(s.main.length).toBeGreaterThan(0);
      expect(s.gain).toBeGreaterThan(0);
      expect(s.gain).toBeLessThanOrEqual(0.1);
      expect(s.register % 12).toBe(9);
      expect(s.character.length).toBeGreaterThan(0);
      expect([2, 4]).toContain(s.loopBars);
      for (const x of s.main) expect(x.step + x.dur).toBeLessThanOrEqual(s.loopBars * STEPS_PER_BAR);
    }
    // The older entries keep their wave B shape.
    for (const id of OLDER) expect(BOSS_MOTIFS[id].main.length).toBeGreaterThan(0);
  });

  it('the three timbres are distinct from each other and from the older bosses', () => {
    const ids = [...TIER3, ...OLDER].map((id) => BOSS_MOTIFS[id].timbre.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('tier 3 scale', () => {
  it('every note and glide start is phrygian (A Bb C D E F G), in every phase', () => {
    for (const id of TIER3) {
      for (const ph of PHASES) {
        const notes = bars(id, ph, 0, BARS);
        expect(notes.length, `${id} phase ${ph}`).toBeGreaterThan(0);
        for (const n of notes) {
          expect(inTierScale(n.midi, 3), `${id} phase ${ph} midi ${n.midi}`).toBe(true);
          if (n.fromMidi !== null) expect(inTierScale(n.fromMidi, 3)).toBe(true);
        }
      }
    }
  });

  it('a note on the downbeat or the half bar is a chord tone of its bar', () => {
    for (const id of TIER3) {
      for (let bar = 0; bar < BARS; bar++) {
        const h = harmonyForBar(bar, BOSS_KEYS[3]);
        for (const n of BOSS_MOTIFS[id].motif(1, bar)) {
          if (n.step === 0 || n.step === 8) expect(inChord(n.midi, h), `${id} bar ${bar} step ${n.step}`).toBe(true);
        }
      }
    }
  });

  it('each boss leans on the phrygian second (B flat) somewhere in its first lap', () => {
    for (const id of TIER3) expect(bars(id, 1, 0, 8).some((n) => n.midi % 12 === PC_BB), id).toBe(true);
  });
});

describe('determinism and distinct motifs', () => {
  it('a motif is a pure function of (boss, phase, bar)', () => {
    for (const id of TIER3) for (const ph of PHASES) expect(sig(id, ph)).toBe(sig(id, ph));
    const a = BOSS_MOTIFS.tempest.motif(2, 11);
    expect(JSON.stringify(BOSS_MOTIFS.tempest.motif(2, 11))).toBe(JSON.stringify(a));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('the three tier 3 motifs differ from each other and from bosses 1 to 6, in every phase', () => {
    for (const ph of PHASES) {
      const all = [...TIER3, ...OLDER].map((id) => sig(id, ph));
      expect(new Set(all).size, `phase ${ph}`).toBe(all.length);
    }
  });

  it('a later phase changes the sound of every tier 3 boss', () => {
    for (const id of TIER3) expect(sig(id, 2), id).not.toBe(sig(id, 1));
    // Bastion and Tempest change again in phase 3; Twins has two phases and holds.
    expect(sig('bastion', 3)).not.toBe(sig('bastion', 2));
    expect(sig('tempest', 3)).not.toBe(sig('tempest', 2));
    // (a phase past the last only changes the hashed answer note, never the voices or the tempo)
    expect(voicesForPhase(BOSS_MOTIFS.twins, 3)).toBe(voicesForPhase(BOSS_MOTIFS.twins, 2));
    expect(tempoForPhase(BOSS_MOTIFS.twins, 3)).toBe(tempoForPhase(BOSS_MOTIFS.twins, 2));
  });
});

describe('bastion: a heavy march that loses a voice per phase', () => {
  const s = BOSS_MOTIFS.bastion;
  const voicesOf = (ph: number): number[] => [...new Set(bars('bastion', ph, 0, 2).map((n) => n.voice))].sort();

  it('three voices with four turrets, two with two, one with none', () => {
    expect([1, 2, 3].map((p) => voicesForPhase(s, p))).toEqual([3, 2, 1]);
    expect(voicesForPhase(s, 4)).toBe(1);
    expect(voicesOf(1)).toEqual([0, 1, 2]);
    expect(voicesOf(2)).toEqual([0, 1]);
    expect(voicesOf(3)).toEqual([0]);
  });

  it('the march is quarter notes on the low A, the double sits an octave up, the counter line stays high', () => {
    const p1 = bars('bastion', 1, 0, 1);
    const main = p1.filter((n) => n.voice === 0);
    expect(main.map((n) => n.step)).toEqual([0, 4, 8, 12]);
    for (const n of main) expect(n.midi).toBeLessThan(57);
    expect(main[0]?.midi).toBe(45);
    const up = p1.filter((n) => n.voice === 1);
    expect(up.map((n) => n.midi)).toEqual(main.map((n) => n.midi + 12));
    for (const n of p1.filter((x) => x.voice === 2)) expect(n.midi).toBeGreaterThanOrEqual(57);
  });

  it('the march itself never drops: voice 0 plays in every phase', () => {
    for (const ph of PHASES) expect(bars('bastion', ph, 0, 2).some((n) => n.voice === 0)).toBe(true);
    expect(bars('bastion', 3, 0, 8).every((n) => n.voice === 0)).toBe(true);
  });
});

describe('tempest: a sixteenth arpeggio that rises each lap', () => {
  const s = BOSS_MOTIFS.tempest;

  it('plays a note on every sixteenth, one step long', () => {
    for (let bar = 0; bar < 4; bar++) {
      const v0 = s.motif(1, bar).filter((n) => n.voice === 0);
      expect(v0.map((n) => n.step)).toEqual(Array.from({ length: 16 }, (_, i) => i));
      for (const n of v0) expect(n.durSteps).toBe(1);
    }
  });

  it('each lap (two bars) starts two scale degrees higher for four laps, then resets', () => {
    expect([0, 1, 2, 3, 4, 5].map((p) => lapClimb(s.lap, p))).toEqual([0, 2, 4, 6, 0, 2]);
    // Step 1 is never snapped to a chord tone, so it shows the climb exactly.
    const at = (lap: number): number | undefined => s.motif(1, lap * 2).find((n) => n.step === 1)?.midi;
    expect([0, 1, 2, 3].map(at)).toEqual([2, 4, 6, 8].map((d) => tierMidi(d, 3, 57)));
    expect(at(4)).toBe(at(0));
    expect(lapClimb(undefined, 5)).toBe(0);
  });

  it('the bar climbs too: the last beat is above the first', () => {
    const v0 = s.motif(1, 0).filter((n) => n.voice === 0);
    expect(v0[13]?.midi ?? 0).toBeGreaterThan(v0[1]?.midi ?? 99);
  });

  it('phase 2 doubles it an octave down, phase 3 adds a quarter note pulse low on A', () => {
    const p2 = s.motif(2, 0);
    const main = p2.filter((n) => n.voice === 0);
    expect(p2.filter((n) => n.voice === 1).map((n) => n.midi)).toEqual(main.map((n) => n.midi - 12));
    const pulse = s.motif(3, 0).filter((n) => n.voice === 2);
    expect(pulse.map((n) => n.step)).toEqual([0, 4, 8, 12]);
    expect(pulse[0]?.midi).toBe(45);
    expect([1, 2, 3].map((p) => voicesForPhase(s, p))).toEqual([1, 2, 3]);
  });
});

describe('twins: a canon that goes solo at double time', () => {
  const s = BOSS_MOTIFS.twins;
  const key = (n: BossMotifNote): string => JSON.stringify([n.step, n.midi, n.durSteps, n.vel]);

  it('phase 1 is two voices; the second plays the line a bar after the first', () => {
    expect(voicesForPhase(s, 1)).toBe(2);
    expect(s.motif(1, 0).every((n) => n.voice === 0)).toBe(true);
    for (const bar of [1, 3, 5, 7]) {
      const late = s.motif(1, bar).filter((n) => n.voice === 1);
      const lead = s.motif(1, bar - 1).filter((n) => n.voice === 0);
      expect(late.length).toBeGreaterThan(0);
      expect(late.map((n) => [n.step, n.durSteps])).toEqual(lead.map((n) => [n.step, n.durSteps]));
    }
    // Bars 0 and 1 share the chord, so there the late voice is the lead note for note.
    expect(s.motif(1, 1).filter((n) => n.voice === 1).map(key)).toEqual(s.motif(1, 0).map(key));
  });

  it('phase 2 is one voice at double time: the whole two bar line fits in every bar', () => {
    expect(voicesForPhase(s, 2)).toBe(1);
    expect(voicesForPhase(s, 3)).toBe(1);
    expect(tempoForPhase(s, 1)).toBe(1);
    expect(tempoForPhase(s, 2)).toBe(2);
    expect(tempoForPhase(s, 9)).toBe(2);
    expect(tempoForPhase(BOSS_MOTIFS.warden, 2)).toBe(1);
    const bar = s.motif(2, 0);
    expect(bar.every((n) => n.voice === 0)).toBe(true);
    expect(bar.map((n) => n.step)).toEqual([0, 2, 3, 4, 8, 9, 12, 14]);
    expect(s.motif(2, 1).map((n) => n.step)).toEqual(bar.map((n) => n.step));
    // Twice the notes in the same two bars as the phase 1 lead voice.
    expect(bars('twins', 2, 0, 2).length).toBe(2 * bars('twins', 1, 0, 2).filter((n) => n.voice === 0).length);
  });

  it('doubleTime halves steps and durations and keeps a duration at one step or more', () => {
    const out = doubleTime([
      { step: 6, deg: 1, dur: 1, vel: 1, from: null },
      { step: 31, deg: 2, dur: 4, vel: 0.5, from: 1 },
    ]);
    expect(out.map((x) => [x.step, x.dur, x.from])).toEqual([[3, 1, null], [15, 2, 1]]);
  });
});

describe('tier 3 voices and budget', () => {
  it('voices never pass BOSS_VOICE_MAX, and Tempest holds the cap at phase 3', () => {
    for (const id of TIER3) for (const ph of PHASES) expect(voicesForPhase(BOSS_MOTIFS[id], ph), `${id} ${ph}`).toBeLessThanOrEqual(BOSS_VOICE_MAX);
    expect(voicesForPhase(BOSS_MOTIFS.tempest, 3)).toBe(BOSS_VOICE_MAX);
  });

  it('a phase sting plus the voices in play fits the cap: the index skips the sting at the cap', () => {
    for (const id of TIER3) {
      for (const ph of [1, 2, 3]) {
        const inPlay = voicesForPhase(BOSS_MOTIFS[id], ph);
        const sting = inPlay < BOSS_VOICE_MAX ? 1 : 0;
        expect(inPlay + sting, `${id} phase ${ph}`).toBeLessThanOrEqual(BOSS_VOICE_MAX);
      }
    }
  });

  it('every voice is monophonic, so the notes sounding at once never exceed the voices', () => {
    for (const id of TIER3) {
      const s = BOSS_MOTIFS[id];
      for (const ph of PHASES) {
        const notes = bars(id, ph, 0, 16);
        const byVoice = new Map<number, BossMotifNote[]>();
        for (const n of notes) byVoice.set(n.voice, [...(byVoice.get(n.voice) ?? []), n]);
        for (const list of byVoice.values()) {
          for (let i = 1; i < list.length; i++) {
            const prev = list[i - 1];
            const cur = list[i];
            if (prev && cur) expect(prev.step + prev.durSteps, `${id} phase ${ph}`).toBeLessThanOrEqual(cur.step);
          }
        }
        for (let step = 0; step < 16 * STEPS_PER_BAR; step++) {
          const sounding = notes.filter((n) => n.step <= step && n.step + n.durSteps > step).length;
          expect(sounding, `${id} phase ${ph}`).toBeLessThanOrEqual(voicesForPhase(s, ph));
        }
      }
    }
  });

  it('the summed voice gain of every phase stays inside BOSS_MOTIF_TOTAL_MAX', () => {
    for (const id of TIER3) {
      const s = BOSS_MOTIFS[id];
      for (const ph of PHASES) {
        const v = voicesForPhase(s, ph);
        expect(s.gain * v * bossMotifScale(s.gain, v)).toBeLessThanOrEqual(BOSS_MOTIF_TOTAL_MAX + 1e-12);
      }
    }
  });
});

// Through the real entry points: a tier 3 boss walked to phase 3 beside six enemy motifs.
describe('tier 3 boss at phase 3 through the bus', () => {
  let ctx: FakeContext;
  let timer: FakeTimer;
  let bus: Bus;
  let graph: MusicGraph | null;
  let log: (NoteLog & { now: number })[];
  let uninstall: () => void;

  const advance = (sec: number, check?: () => void): void => {
    const n = Math.round(sec / (TICK_MS / 1000));
    for (let i = 0; i < n; i++) {
      ctx.currentTime += TICK_MS / 1000;
      timer.fire();
      check?.();
    }
  };
  const barLineAfter = (s: number): number => (Math.floor(s / STEPS_PER_BAR) + 1) * STEPS_PER_BAR;
  const six: EnemyKind[] = ['grunt', 'wanderer', 'weaver', 'pinwheel', 'dart', 'snake'];

  beforeEach(() => {
    ctx = new FakeContext();
    timer = new FakeTimer();
    bus = new Bus();
    graph = { ctx, master: new FakeNode() };
    log = [];
    setMusicVolume(50);
    uninstall = initMusic({ tune: 'neon', bus, graph: () => graph, timer, visibility: null, volume: 50, onNote: (n) => log.push({ ...n, now: ctx.currentTime }) });
  });
  afterEach(() => {
    stopMusic();
    uninstall();
  });

  it.each(TIER3)('%s: 16 voices, 3 boss voices, no steals, every note in the scale, across phases 2 and 3', (id) => {
    startMusic(51);
    bus.emit('sim:threat', { level: 1 });
    for (const k of six) bus.emit('sim:enemyEnter', { kind: k, live: 1 });
    advance(BAR_SEC * 3);
    let maxBoss = 0;
    const check = (): void => {
      const st = musicState();
      expect(st.voices).toBeLessThanOrEqual(MUSIC_VOICE_CAP);
      expect(st.bossVoices).toBeLessThanOrEqual(BOSS_VOICE_MAX);
      maxBoss = Math.max(maxBoss, st.bossVoices);
    };
    bus.emit('sim:bossEnter', { id, tier: 3 });
    advance(BAR_SEC * 4.5, check);
    bus.emit('sim:bossPhase', { id, phase: 2, phases: 3 });
    advance(BAR_SEC * 3.3, check);
    const at3 = musicState().nextStep;
    bus.emit('sim:bossPhase', { id, phase: 3, phases: 3 });
    advance(BAR_SEC * 8, check);
    const st = musicState();
    expect(st.bedSteals).toBe(0);
    expect(st.bossSteals).toBe(0);
    expect(st.motifVoices).toBeLessThanOrEqual(3);
    const boss = log.filter((n) => n.role === 'boss');
    expect(boss.length).toBeGreaterThan(0);
    for (const n of boss) expect(inTierScale(n.midi ?? 0, 3), `${id} midi ${n.midi}`).toBe(true);
    const after = boss.filter((n) => n.step >= barLineAfter(at3));
    expect(after.length).toBeGreaterThan(0);
    expect(new Set(after.map((n) => n.voice)).size).toBe(voicesForPhase(BOSS_MOTIFS[id], 3));
    if (id === 'bastion') expect(after.every((n) => n.voice === 0)).toBe(true);
    if (id === 'tempest') expect(maxBoss).toBe(BOSS_VOICE_MAX);
  });
});
