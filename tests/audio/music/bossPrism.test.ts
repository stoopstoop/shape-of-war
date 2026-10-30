// Prism (v3 wave C, boss 10, tier 4): a four bar loop that quotes, transposed, the cells of three
// earlier bosses per phase, in A natural minor, with a rising arpeggio across the second half of
// every second bar. The damage cycle is 4 s, two bars at 120 BPM, so the cue is a fixed two bar
// pattern and the builder is a pure function of the bar. Pure checks first, then the real entry
// points with a fake audio clock for the voice cap beside six enemy motifs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOSS_MOTIFS,
  BOSS_TIMBRES,
  PRISM_ARP_NOTES,
  PRISM_ARP_STEP,
  PRISM_LOOP_BARS,
  inTierScale,
  isPrismCueBar,
  missingBossIds,
  nearestDegree,
  prismArp,
  prismQuote,
  prismQuotedIds,
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

const PHASES = [1, 2, 3, 4];
const STEP_SEC = BAR_SEC / STEPS_PER_BAR;
/** The damage cycle (docs/12 roster row 10): the outline runs to white, then the shield drops. */
const CYCLE_SEC = 4;
const RUN_TO_WHITE_SEC = 0.5;
const prism = BOSS_MOTIFS.prism;
const notesOf = (phase: number, bar: number): readonly BossMotifNote[] => prism.motif(phase, bar);
const barsOf = (phase: number, from: number, to: number): BossMotifNote[] => {
  const out: BossMotifNote[] = [];
  for (let b = from; b < to; b++) out.push(...notesOf(phase, b).map((n) => ({ ...n, step: n.step + (b - from) * STEPS_PER_BAR })));
  return out;
};

describe('prism registry', () => {
  it('covers every BossId, in roster order, and Prism is written in tier 4', () => {
    expect(Object.keys(BOSS_MOTIFS)).toEqual([...BOSS_IDS]);
    expect(missingBossIds(BOSS_MOTIFS)).toEqual([]);
    for (const id of BOSS_IDS) expect(BOSS_MOTIFS[id].id).toBe(id);
    expect(prism.tier).toBe(4);
    expect(prism.loopBars).toBe(PRISM_LOOP_BARS);
    expect(prism.main.length).toBeGreaterThan(0);
    for (const x of prism.main) expect(x.step + x.dur).toBeLessThanOrEqual(PRISM_LOOP_BARS * STEPS_PER_BAR);
    expect(prism.register % 12).toBe(9);
    expect(prism.gain).toBeGreaterThan(0);
    expect(prism.gain).toBeLessThanOrEqual(0.1);
    expect(prism.character.length).toBeGreaterThan(0);
  });

  it('has a timbre of its own, distinct from every other boss', () => {
    expect(prism.timbre).toBe(BOSS_TIMBRES.prism);
    for (const id of BOSS_IDS) {
      if (id !== 'prism') expect(BOSS_MOTIFS[id].timbre.id).not.toBe('prism');
    }
  });
});

describe('prism quotes three earlier bosses per phase', () => {
  it('phase p quotes bosses 2p-1, 2p and 2p+1, never itself, and the four phases cover bosses 1 to 9', () => {
    const seen = new Set<BossId>();
    for (const p of PHASES) {
      const ids = prismQuotedIds(p);
      expect(ids).toEqual(BOSS_IDS.slice(2 * p - 2, 2 * p + 1));
      expect(new Set(ids).size).toBe(3);
      expect(ids).not.toContain('prism');
      for (const id of ids) seen.add(id);
    }
    expect([...seen]).toEqual(BOSS_IDS.slice(0, 9));
    expect(prismQuotedIds(0)).toEqual(prismQuotedIds(1));
    expect(prismQuotedIds(9)).toEqual(prismQuotedIds(4));
  });

  it('bar 0 keeps the rhythm of one bar of the first quoted boss', () => {
    for (const p of PHASES) {
      const id = prismQuotedIds(p)[0];
      const src = id === undefined ? null : BOSS_MOTIFS[id];
      expect(src).not.toBeNull();
      if (!src) continue;
      const rhythms: string[] = [];
      for (let b = 0; b < src.loopBars; b++) {
        const cell = src.main.filter((x) => Math.floor(x.step / STEPS_PER_BAR) === b);
        rhythms.push(cell.map((x) => `${x.step % STEPS_PER_BAR}:${Math.min(x.dur, STEPS_PER_BAR - (x.step % STEPS_PER_BAR))}`).join(','));
      }
      const quoted = prismQuote(p)
        .filter((x) => x.step < STEPS_PER_BAR)
        .map((x) => `${x.step}:${x.dur}`)
        .join(',');
      expect(rhythms, `phase ${p}`).toContain(quoted);
    }
  });

  it('bar 3 answers the cell of bar 0 a fourth lower (three scale degrees), step for step', () => {
    for (const p of PHASES) {
      const line = prismQuote(p);
      const first = line.filter((x) => x.step < STEPS_PER_BAR / 2);
      const answer = line.filter((x) => x.step >= 3 * STEPS_PER_BAR && x.step < 3 * STEPS_PER_BAR + STEPS_PER_BAR / 2);
      expect(answer.length, `phase ${p}`).toBeGreaterThan(0);
      for (const a of answer) {
        const q = first.find((x) => x.step === a.step - 3 * STEPS_PER_BAR);
        expect(q, `phase ${p} step ${a.step}`).toBeDefined();
        if (q) expect(a.deg).toBe(q.deg - 3);
      }
    }
  });

  it('the half bar cells leave the second half of bars 1 and 3 clear for the cue', () => {
    for (const p of PHASES) {
      for (const x of prismQuote(p)) {
        const inBar = x.step % STEPS_PER_BAR;
        if (isPrismCueBar(Math.floor(x.step / STEPS_PER_BAR))) expect(inBar + x.dur, `phase ${p}`).toBeLessThanOrEqual(PRISM_ARP_STEP);
        else expect(inBar + x.dur).toBeLessThanOrEqual(STEPS_PER_BAR);
      }
    }
  });

  it('every phase sounds different, and the quote is not another boss played as written', () => {
    const sig = (p: number): string => JSON.stringify(barsOf(p, 0, 8).map((n) => [n.step, n.midi, n.durSteps]));
    expect(new Set(PHASES.map(sig)).size).toBe(PHASES.length);
    for (const id of BOSS_IDS.slice(0, 9)) {
      const own = JSON.stringify(Array.from({ length: 8 }, (_, b) => BOSS_MOTIFS[id].motif(1, b).map((n) => [n.step + b * STEPS_PER_BAR, n.midi, n.durSteps])).flat());
      expect(sig(1)).not.toBe(own);
    }
  });

  it('nearestDegree picks the closest scale pitch and ties go down', () => {
    expect(nearestDegree(57, 4, 57)).toBe(0);
    expect(nearestDegree(62, 4, 57)).toBe(3); // D
    expect(tierMidi(nearestDegree(68, 4, 57), 4, 57)).toBe(67); // G sharp falls to G
    expect(tierMidi(nearestDegree(58, 4, 57), 4, 57)).toBe(57); // A sharp is between A and B: down
  });
});

describe('prism scale and harmony', () => {
  it('every note and glide start is A natural minor (A B C D E F G), in every phase', () => {
    for (const p of PHASES) {
      for (const n of barsOf(p, 0, 32)) {
        expect(inTierScale(n.midi, 4), `phase ${p} midi ${n.midi}`).toBe(true);
        if (n.fromMidi !== null) expect(inTierScale(n.fromMidi, 4)).toBe(true);
      }
    }
  });

  it('a note on the downbeat or the half bar is a chord tone of the tier 4 bed', () => {
    for (const p of PHASES) {
      for (let b = 0; b < 32; b++) {
        const h = harmonyForBar(b, BOSS_KEYS[4]);
        for (const n of notesOf(p, b)) {
          if (n.step === 0 || n.step === 8) expect(inChord(n.midi, h), `phase ${p} bar ${b} step ${n.step}`).toBe(true);
        }
      }
    }
  });

  it('every note sits inside its bar, lasts a step or more, with velocity in 0 to 1', () => {
    for (const p of PHASES) {
      for (let b = 0; b < 16; b++) {
        for (const n of notesOf(p, b)) {
          expect(n.step + n.durSteps).toBeLessThanOrEqual(STEPS_PER_BAR);
          expect(n.durSteps).toBeGreaterThanOrEqual(1);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('prism determinism', () => {
  it('a motif is a pure function of (phase, bar), JSON serialisable, with no PRNG', () => {
    const forward = PHASES.map((p) => Array.from({ length: 16 }, (_, b) => notesOf(p, b)));
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random called');
    });
    try {
      const backward = PHASES.map((p) => Array.from({ length: 16 }, (_, i) => notesOf(p, 15 - i)).reverse());
      expect(backward).toEqual(forward);
      expect(JSON.parse(JSON.stringify(forward))).toEqual(forward);
      expect(prismQuote(2)).toEqual(prismQuote(2));
    } finally {
      spy.mockRestore();
    }
  });

  it('the quoted line repeats every four bars (the cue follows the bed chord)', () => {
    for (const p of PHASES) {
      for (let b = 0; b < 8; b++) {
        const quote = (bar: number): string =>
          JSON.stringify(notesOf(p, bar).filter((n) => !(isPrismCueBar(bar) && n.step >= PRISM_ARP_STEP)).map((n) => [n.step, n.durSteps, n.voice]));
        expect(quote(b + PRISM_LOOP_BARS), `phase ${p} bar ${b}`).toBe(quote(b));
      }
    }
  });

  it('a bar before the join is empty', () => {
    expect(notesOf(1, -1)).toEqual([]);
    expect(prismArp(-1)).toEqual([]);
  });
});

describe('prism cue: the rising arpeggio lands before each flash', () => {
  const BARS = 16;

  it('the damage cycle is exactly two bars at 120 BPM and the cue is one second long', () => {
    expect(CYCLE_SEC / BAR_SEC).toBe(2);
    expect(PRISM_ARP_NOTES * STEP_SEC).toBe(1);
  });

  it('over 16 bars every flash (a cycle line, from bar 2) is preceded by eight rising sixteenths', () => {
    for (const p of PHASES) {
      for (let flashBar = 2; flashBar <= BARS; flashBar += 2) {
        const flash = flashBar * BAR_SEC;
        expect(flash % CYCLE_SEC).toBe(0);
        const cue = notesOf(p, flashBar - 1).filter((n) => n.voice === 0 && n.step >= PRISM_ARP_STEP);
        expect(cue.length, `phase ${p} flash at bar ${flashBar}`).toBe(PRISM_ARP_NOTES);
        const starts = cue.map((n) => (flashBar - 1) * BAR_SEC + n.step * STEP_SEC);
        const ends = cue.map((n, i) => (starts[i] ?? 0) + n.durSteps * STEP_SEC);
        // Every note ends by the flash; the cue begins a second early, ahead of the 0.5 s run to white.
        for (const e of ends) expect(e).toBeLessThanOrEqual(flash + 1e-9);
        expect(flash - (starts[0] ?? flash)).toBeGreaterThanOrEqual(RUN_TO_WHITE_SEC);
        expect(Math.max(...ends)).toBeCloseTo(flash, 9);
        for (let i = 1; i < cue.length; i++) {
          expect(cue[i]?.step).toBe((cue[i - 1]?.step ?? 0) + 1);
          expect(cue[i]?.midi ?? 0, `phase ${p} bar ${flashBar}`).toBeGreaterThan(cue[i - 1]?.midi ?? 0);
          expect(cue[i]?.vel ?? 0).toBeGreaterThan(cue[i - 1]?.vel ?? 1);
        }
      }
    }
  });

  it('the cue is the only thing in the second half of a cue bar, and no other bar has one', () => {
    for (const p of PHASES) {
      for (let b = 0; b < BARS; b++) {
        const late = notesOf(p, b).filter((n) => n.voice === 0 && n.step >= PRISM_ARP_STEP);
        if (isPrismCueBar(b)) expect(late.map((n) => n.step)).toEqual(Array.from({ length: PRISM_ARP_NOTES }, (_, i) => PRISM_ARP_STEP + i));
        else expect(prismArp(b)).toEqual([]);
      }
    }
  });

  it('the arpeggio is stacked thirds on the bar chord: A, F, C, G on bars 1, 3, 5, 7', () => {
    const roots = [9, 5, 0, 7];
    [1, 3, 5, 7].forEach((bar, i) => {
      const arp = prismArp(bar);
      const h = harmonyForBar(bar, BOSS_KEYS[4]);
      expect(h.root).toBe(roots[i]);
      expect((arp[0]?.midi ?? -1) % 12).toBe(roots[i]);
      for (const n of arp) expect(inChord(n.midi, h), `bar ${bar} midi ${n.midi}`).toBe(true);
      expect(arp.map((n) => n.step)).toEqual(Array.from({ length: PRISM_ARP_NOTES }, (_, k) => PRISM_ARP_STEP + k));
    });
  });
});

describe('prism voices and budget', () => {
  it('one voice in phases 1 and 2, two in phases 3 and 4, never past BOSS_VOICE_MAX', () => {
    expect(PHASES.map((p) => voicesForPhase(prism, p))).toEqual([1, 1, 2, 2]);
    for (const p of PHASES) expect(voicesForPhase(prism, p)).toBeLessThanOrEqual(BOSS_VOICE_MAX);
    expect(voicesForPhase(prism, 9)).toBe(2);
  });

  it('phases 3 and 4 double the whole line, cue included, an octave up on voice 1', () => {
    for (const p of [3, 4]) {
      for (const b of [0, 1, 2, 3]) {
        const all = notesOf(p, b);
        const v0 = all.filter((n) => n.voice === 0);
        const v1 = all.filter((n) => n.voice === 1);
        expect(v1.map((n) => [n.step, n.midi])).toEqual(v0.map((n) => [n.step, n.midi + 12]));
      }
    }
    for (const p of [1, 2]) expect(barsOf(p, 0, 8).every((n) => n.voice === 0)).toBe(true);
  });

  it('every voice is monophonic, so the notes sounding at once never exceed the voices', () => {
    for (const p of PHASES) {
      const notes = barsOf(p, 0, 16);
      for (const v of [0, 1]) {
        const list = notes.filter((n) => n.voice === v);
        for (let i = 1; i < list.length; i++) {
          const prev = list[i - 1];
          const cur = list[i];
          if (prev && cur) expect(prev.step + prev.durSteps, `phase ${p} voice ${v}`).toBeLessThanOrEqual(cur.step);
        }
      }
      for (let step = 0; step < 16 * STEPS_PER_BAR; step++) {
        const sounding = notes.filter((n) => n.step <= step && n.step + n.durSteps > step).length;
        expect(sounding, `phase ${p} step ${step}`).toBeLessThanOrEqual(voicesForPhase(prism, p));
      }
    }
  });

  it('the summed voice gain of every phase stays inside BOSS_MOTIF_TOTAL_MAX', () => {
    for (const p of PHASES) {
      const v = voicesForPhase(prism, p);
      expect(prism.gain * v * bossMotifScale(prism.gain, v)).toBeLessThanOrEqual(BOSS_MOTIF_TOTAL_MAX + 1e-12);
    }
  });
});

// Through the real entry points: Prism walked to phase 4 beside six enemy motifs.
describe('prism through the bus', () => {
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

  it('16 voices, 3 boss voices, no steals, every note in the scale, a rising cue before each cycle line', () => {
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
    bus.emit('sim:bossEnter', { id: 'prism', tier: 4 });
    advance(BAR_SEC * 4.5, check);
    bus.emit('sim:bossPhase', { id: 'prism', phase: 2, phases: 4 });
    advance(BAR_SEC * 3.3, check);
    bus.emit('sim:bossPhase', { id: 'prism', phase: 3, phases: 4 });
    advance(BAR_SEC * 3.3, check);
    const at4 = musicState().nextStep;
    bus.emit('sim:bossPhase', { id: 'prism', phase: 4, phases: 4 });
    advance(BAR_SEC * 8, check);
    const st = musicState();
    expect(st.bedSteals).toBe(0);
    expect(st.bossSteals).toBe(0);
    expect(st.motifVoices).toBeLessThanOrEqual(3);
    expect(maxBoss).toBeLessThanOrEqual(BOSS_VOICE_MAX);
    const boss = log.filter((n) => n.role === 'boss');
    expect(boss.length).toBeGreaterThan(0);
    for (const n of boss) expect(inTierScale(n.midi ?? 0, 4), `midi ${n.midi}`).toBe(true);
    const after = boss.filter((n) => n.step >= barLineAfter(at4));
    expect(new Set(after.map((n) => n.voice)).size).toBe(voicesForPhase(prism, 4));
    // A run of eight consecutive sixteenths, each higher than the last, starting on a half bar.
    const v0 = boss.filter((n) => n.voice === 0).sort((a, b) => a.step - b.step);
    let runs = 0;
    for (let i = 0; i + PRISM_ARP_NOTES <= v0.length; i++) {
      const run = v0.slice(i, i + PRISM_ARP_NOTES);
      const first = run[0];
      if (!first || first.step % STEPS_PER_BAR !== PRISM_ARP_STEP) continue;
      if (run.every((n, k) => n.step === first.step + k && (k === 0 || (n.midi ?? 0) > (run[k - 1]?.midi ?? 0)))) runs++;
    }
    expect(runs).toBeGreaterThanOrEqual(4);
  });
});
