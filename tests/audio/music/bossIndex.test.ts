// Boss music through the real entry points with a fake audio clock and timer (v3 wave B):
// stinger and fade quantisation, the boss bed, ducking and its restore, the intensity floor,
// the phase voice, the defeat stinger, the voice cap and the gain budget, a level restart mid
// fight, a boss entering while an enemy motif fades, and the ring out after a boss death ends
// the level.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOSS_MOTIFS, inTierScale } from '../../../src/audio/music/boss';
import { BOSS_DUCK } from '../../../src/audio/music/bossLife';
import { BOSS_VOICE_MAX, MUSIC_VOICE_CAP } from '../../../src/audio/music/engine';
import { harmonyAtStep, inChord } from '../../../src/audio/music/harmony';
import {
  initMusic,
  musicState,
  setMusicVolume,
  startMusic,
  stopMusic,
  type MusicGraph,
  type MusicOptions,
  type NoteLog,
} from '../../../src/audio/music/index';
import { KILL_SPECS } from '../../../src/audio/music/kills';
import { LAYERS_FULL } from '../../../src/audio/music/layers';
import { ACCENT_RESERVE, BOSS_STING_GAIN, GAIN_CEILING, HIT_RESERVE, STINGER_GAIN } from '../../../src/audio/music/lifecycle';
import { TICK_MS } from '../../../src/audio/music/scheduler';
import { BAR_SEC, STEPS_PER_BAR } from '../../../src/audio/music/track';
import { BATTLE_TUNES, tuneById } from '../../../src/audio/music/tunes';
import { Bus } from '../../../src/core/events';
import { Kind } from '../../../src/game/world';
import type { BossId, BossTier, EnemyKind } from '../../../src/levelgen/leveldef';
import { FakeContext, FakeNode, FakeTimer } from './fakeAudio';

let ctx: FakeContext;
let timer: FakeTimer;
let bus: Bus;
let graph: MusicGraph | null;
let log: (NoteLog & { now: number })[];
let uninstall: () => void;

function advance(sec: number, check?: () => void): void {
  const n = Math.round(sec / (TICK_MS / 1000));
  for (let i = 0; i < n; i++) {
    ctx.currentTime += TICK_MS / 1000;
    timer.fire();
    check?.();
  }
}

function install(extra: Partial<MusicOptions> = {}): void {
  uninstall?.();
  uninstall = initMusic({
    tune: 'neon',
    bus,
    graph: () => graph,
    timer,
    visibility: null,
    volume: 50,
    onNote: (n) => log.push({ ...n, now: ctx.currentTime }),
    ...extra,
  });
}

const enter = (id: BossId, tier: BossTier): void => bus.emit('sim:bossEnter', { id, tier });
const role = (r: NoteLog['role']): (NoteLog & { now: number })[] => log.filter((n) => n.role === r);
const barLineAfter = (s: number): number => (Math.floor(s / STEPS_PER_BAR) + 1) * STEPS_PER_BAR;

beforeEach(() => {
  ctx = new FakeContext();
  timer = new FakeTimer();
  bus = new Bus();
  graph = { ctx, master: new FakeNode() };
  log = [];
  setMusicVolume(50);
  install();
});

afterEach(() => {
  uninstall();
});

describe('boss entry', () => {
  it('stinger on the next sixteenth, motif on the next bar line with a one bar fade in', () => {
    startMusic(11);
    advance(1.3);
    const at = musicState().nextStep;
    enter('warden', 1);
    advance(BAR_SEC * 4);
    const sting = role('bossEntry');
    expect(sting).toHaveLength(3);
    for (const n of sting) expect(n.step).toBe(at);
    // One chord hit on the chord sounding then.
    const h = harmonyAtStep(at);
    for (const n of sting) expect(inChord(n.midi ?? 0, h)).toBe(true);
    const motif = role('boss');
    const join = barLineAfter(at);
    expect(motif[0]?.step).toBe(join);
    expect(motif.every((n) => n.step >= join)).toBe(true);
    // Fades in over one bar: quiet on the join, full by the second bar.
    const spec = BOSS_MOTIFS.warden;
    const first = motif.find((n) => n.step === join);
    const later = motif.find((n) => n.step === join + 2 * STEPS_PER_BAR);
    expect(first?.gain ?? 1).toBeLessThan(spec.gain * 0.1);
    expect(later?.gain ?? 0).toBeCloseTo(spec.gain, 9);
    expect(musicState().boss).toBe('warden');
    expect(musicState().bossTier).toBe(1);
  });

  it('switches any level tune to the tier boss bed (A, 120 BPM) on the join bar, and back after the boss', () => {
    install({ tune: 'tide' });
    startMusic(12);
    advance(1.1);
    expect(musicState().bpm).toBe(104);
    const at = musicState().nextStep;
    enter('ember', 2);
    advance(BAR_SEC * 3);
    const join = barLineAfter(at);
    expect(musicState().bpm).toBe(120);
    expect(musicState().bossTier).toBe(2);
    // The entry chord is on the tide chord that was sounding (B dorian), the motif in the boss bed.
    const tide = tuneById('tide');
    for (const n of role('bossEntry')) expect(inChord(n.midi ?? 0, harmonyAtStep(at - 0, tide.key))).toBe(true);
    const bedAfter = log.filter((n) => n.role === 'bed' && n.step >= join);
    expect(bedAfter.length).toBeGreaterThan(0);
    const battle = bedAfter[0]?.tune;
    expect(BATTLE_TUNES.map((t) => t.id)).toContain(battle);
    for (const n of bedAfter) expect(n.tune).toBe(battle);
    // Steps after the join are 0.125 s apart (120 BPM).
    const kicks = log.filter((n) => n.role === 'bed' && n.layer === 'kick' && n.step >= join);
    const k0 = kicks[0];
    const k1 = kicks[1];
    expect((k1?.time ?? 0) - (k0?.time ?? 0)).toBeCloseTo(((k1?.step ?? 0) - (k0?.step ?? 0)) * 0.125, 9);
    for (const n of role('boss')) expect(inTierScale(n.midi ?? 0, 2)).toBe(true);
    bus.emit('sim:bossDown', { id: 'ember', x: 0, y: 0 });
    advance(BAR_SEC * 4);
    expect(musicState().bpm).toBe(104);
    expect(musicState().bossTier).toBeNull();
  });

  it('the intensity floor holds 0.8 during the fight and releases after the death', () => {
    startMusic(13);
    bus.emit('sim:threat', { level: 0 });
    advance(1);
    enter('brood', 1);
    advance(3);
    expect(musicState().floor).toBe(true);
    expect(musicState().level).toBeGreaterThan(0.75);
    expect(musicState().level).toBeLessThanOrEqual(0.8 + 1e-9);
    bus.emit('sim:bossDown', { id: 'brood', x: 0, y: 0 });
    advance(0.5);
    expect(musicState().floor).toBe(false);
    const mid = musicState().level;
    expect(mid).toBeLessThan(0.8);
    expect(mid).toBeGreaterThan(0.3); // the 3 s release, not a drop
    advance(3);
    expect(musicState().level).toBeLessThan(0.1);
  });
});

describe('ducking', () => {
  it('ducks the enemy motifs to 40 percent (kill notes stay) and restores them after sim:bossDown', () => {
    startMusic(21);
    bus.emit('sim:threat', { level: 0.5 });
    bus.emit('sim:enemyEnter', { kind: 'grunt', live: 1 });
    advance(BAR_SEC * 3);
    const grunt = (from: number, to: number): number[] => log.filter((n) => n.role === 'motif' && n.kind === 'grunt' && n.step >= from && n.step < to).map((n) => n.gain);
    const peak = (xs: number[]): number => Math.max(...xs);
    const s0 = musicState().nextStep;
    advance(BAR_SEC * 2);
    const before = peak(grunt(s0, s0 + 2 * STEPS_PER_BAR));
    enter('warden', 1);
    advance(BAR_SEC * 3);
    const s1 = musicState().nextStep;
    advance(BAR_SEC * 2);
    expect(musicState().duck).toBeCloseTo(BOSS_DUCK, 9);
    const during = peak(grunt(s1, s1 + 2 * STEPS_PER_BAR));
    expect(during / before).toBeCloseTo(BOSS_DUCK, 6);
    // Kill notes are not ducked.
    bus.emit('fx:kill', { x: 0, y: 0, colour: 'blue', kind: Kind.Grunt, id: 1 });
    bus.emit('sfx', 'explode');
    advance(0.5);
    const kills = role('kill');
    expect(kills.length).toBeGreaterThan(0);
    for (const k of kills) expect(k.gain).toBeGreaterThanOrEqual(KILL_SPECS.grunt.noteGain * 0.8 - 1e-12);
    bus.emit('sim:bossDown', { id: 'warden', x: 0, y: 0 });
    advance(1.5);
    const halfway = musicState().duck;
    expect(halfway).toBeGreaterThan(BOSS_DUCK);
    expect(halfway).toBeLessThan(1);
    advance(2);
    expect(musicState().duck).toBe(1);
    expect(musicState().boss).toBeNull();
    const s2 = musicState().nextStep;
    advance(BAR_SEC * 2);
    expect(peak(grunt(s2, s2 + 2 * STEPS_PER_BAR)) / before).toBeCloseTo(1, 6);
  });

  it('a boss entering while an enemy motif fades out: the motif keeps falling and leaves on time', () => {
    startMusic(22);
    bus.emit('sim:enemyEnter', { kind: 'grunt', live: 1 });
    advance(BAR_SEC * 3);
    const exitAt = musicState().nextStep;
    bus.emit('sim:enemyExit', { kind: 'grunt' });
    const leave = Math.ceil((exitAt + 2 * STEPS_PER_BAR) / STEPS_PER_BAR) * STEPS_PER_BAR;
    advance(BAR_SEC * 1.2);
    const enterAt = musicState().nextStep;
    enter('spindle', 1);
    advance(BAR_SEC * 4);
    const pattern = LAYERS_FULL.grunt.pattern;
    const velAt = (step: number): number => pattern.find((p) => p.step === step % (2 * STEPS_PER_BAR))?.vel ?? 1;
    const after = log.filter((n) => n.role === 'motif' && n.kind === 'grunt' && n.step >= enterAt);
    expect(after.length).toBeGreaterThan(0);
    let prev = Infinity;
    for (const n of after) {
      const g = n.gain / velAt(n.step);
      expect(g).toBeLessThanOrEqual(prev + 1e-12);
      prev = g;
    }
    expect(after.every((n) => n.step < leave)).toBe(true);
    expect(musicState().layers).toEqual([]);
  });
});

describe('phase and defeat', () => {
  it('a phase plays a sting now and adds its voice on the next bar line', () => {
    startMusic(31);
    enter('ember', 2);
    advance(BAR_SEC * 3);
    const at = musicState().nextStep;
    bus.emit('sim:bossPhase', { id: 'ember', phase: 2, phases: 3 });
    advance(BAR_SEC * 3);
    const sting = role('bossPhase');
    expect(sting.length).toBeGreaterThan(0);
    expect(sting[0]?.step).toBe(at);
    for (const n of sting) expect(n.step).toBeLessThan(barLineAfter(at));
    const v1 = log.filter((n) => n.role === 'boss' && n.voice === 1);
    expect(v1.length).toBeGreaterThan(0);
    expect(Math.min(...v1.map((n) => n.step))).toBeGreaterThanOrEqual(barLineAfter(at));
    expect(log.some((n) => n.role === 'boss' && n.voice === 1 && n.step < barLineAfter(at))).toBe(false);
  });

  it('the defeat stinger plays A, C sharp, E; phase voices stop at once, the motif at the next bar', () => {
    startMusic(32);
    enter('mirage', 2);
    advance(BAR_SEC * 2);
    bus.emit('sim:bossPhase', { id: 'mirage', phase: 2, phases: 3 });
    advance(BAR_SEC * 3);
    const at = musicState().nextStep;
    bus.emit('sim:bossDown', { id: 'mirage', x: 0, y: 0 });
    advance(BAR_SEC * 3);
    const d = role('bossDefeat');
    expect(d.map((n) => n.midi)).toEqual([69, 73, 76]);
    expect(d[0]?.step ?? 0).toBeGreaterThanOrEqual(at);
    expect(d[0]?.step ?? 99).toBeLessThan(at + 4);
    expect(log.some((n) => n.role === 'boss' && (n.voice ?? 0) > 0 && n.step >= at)).toBe(false);
    expect(log.some((n) => n.role === 'boss' && n.step >= barLineAfter(at))).toBe(false);
  });

  it('a boss death that ends the level rings the defeat stinger out, then releases the engine', () => {
    startMusic(33);
    enter('warden', 1);
    advance(BAR_SEC * 3);
    // Boss rule 9: the down and game:over arrive in the same sim step.
    bus.emit('sim:bossDown', { id: 'warden', x: 0, y: 0 });
    bus.emit('game:over', { score: 1, stars: 1, levelIndex: 5, mode: 'adventure' });
    expect(role('bossDefeat').map((n) => n.midi)).toEqual([69, 73, 76]);
    expect(musicState().playing).toBe(false);
    expect(musicState().ringing).toBe(true);
    const bedBefore = role('bed').length;
    advance(2.5);
    expect(musicState().ringing).toBe(false);
    expect(role('bed').length).toBe(bedBefore); // the bed stopped scheduling at once
    // A plain game over (no boss death) stops at once.
    startMusic(34);
    advance(0.5);
    bus.emit('game:over', { score: 1, stars: 0, levelIndex: 1, mode: 'adventure' });
    expect(musicState().ringing).toBe(false);
  });

  it('a new level during the ring out releases it at once', () => {
    startMusic(35);
    enter('brood', 1);
    advance(BAR_SEC * 2);
    bus.emit('sim:bossDown', { id: 'brood', x: 0, y: 0 });
    bus.emit('game:over', { score: 1, stars: 1, levelIndex: 10, mode: 'adventure' });
    expect(musicState().ringing).toBe(true);
    startMusic(36);
    expect(musicState().ringing).toBe(false);
    expect(musicState().playing).toBe(true);
  });
});

describe('restart and silence', () => {
  it('a level restart mid fight drops the boss, the floor, the duck and the boss bed', () => {
    const fresh = (): string => {
      log = [];
      startMusic(41);
      advance(BAR_SEC * 3);
      return JSON.stringify(log.map((n) => [n.role, n.layer, n.step, n.midi, n.gain]));
    };
    const clean = fresh();
    startMusic(41);
    bus.emit('sim:enemyEnter', { kind: 'weaver', live: 1 });
    enter('gravitas', 2);
    advance(BAR_SEC * 3);
    bus.emit('sim:bossPhase', { id: 'gravitas', phase: 2, phases: 3 });
    advance(BAR_SEC);
    expect(musicState().boss).toBe('gravitas');
    const again = fresh();
    expect(musicState().boss).toBeNull();
    expect(musicState().floor).toBe(false);
    expect(musicState().duck).toBe(1);
    expect(musicState().bossTier).toBeNull();
    expect(again).toBe(clean);
    // The boss enters again in the restarted level and plays from phase 1.
    enter('gravitas', 2);
    advance(BAR_SEC * 3);
    expect(role('boss').length).toBeGreaterThan(0);
    expect(role('boss').every((n) => n.voice === 0)).toBe(true);
  });

  it('music volume 0 silences the boss music; the state still follows the bus', () => {
    startMusic(42);
    setMusicVolume(0);
    enter('spindle', 1);
    advance(BAR_SEC * 3);
    expect(log.filter((n) => n.role.startsWith('boss'))).toEqual([]);
    expect(musicState().boss).toBe('spindle');
    setMusicVolume(50);
    advance(BAR_SEC * 2);
    expect(role('boss').length).toBeGreaterThan(0);
    expect(role('bossEntry')).toEqual([]); // a stale stinger is not played late
  });

  it('the same fight on the same battle track gives the same boss notes on every level', () => {
    const run = (seed: number): { tune: string; notes: string } => {
      log = [];
      bus.emit('game:start', { mode: 'adventure', levelIndex: 0 });
      startMusic(seed);
      advance(BAR_SEC);
      enter('mirage', 2);
      advance(BAR_SEC * 6);
      const join = Math.min(...role('boss').map((n) => n.step));
      return { tune: musicState().tune ?? '', notes: JSON.stringify(role('boss').map((n) => [n.step - join, n.midi, n.voice])) };
    };
    const first = run(1);
    expect(run(1)).toEqual(first);
    let matched = 0;
    for (let seed = 2; seed < 40 && matched < 2; seed++) {
      const r = run(seed);
      if (r.tune !== first.tune) continue;
      expect(r.notes).toBe(first.notes);
      matched++;
    }
    expect(matched).toBe(2);
  });
});

describe('voice budget', () => {
  const six: EnemyKind[] = ['grunt', 'wanderer', 'weaver', 'pinwheel', 'dart', 'snake'];

  it('a boss with 3 voices and 6 enemy motifs stays inside 16 voices; the bed and the boss are never stolen', () => {
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
    enter('gravitas', 2);
    advance(BAR_SEC * 1.5, check);
    bus.emit('sim:bossPhase', { id: 'gravitas', phase: 2, phases: 3 });
    advance(BAR_SEC * 1.3, check);
    bus.emit('sim:bossPhase', { id: 'gravitas', phase: 3, phases: 3 });
    advance(BAR_SEC * 10, check);
    expect(role('bossPhase').length).toBeGreaterThan(0);
    expect(maxBoss).toBe(BOSS_VOICE_MAX);
    const st = musicState();
    expect(st.bedSteals).toBe(0);
    expect(st.bossSteals).toBe(0);
    expect(st.motifVoices).toBeLessThanOrEqual(3);
    expect(new Set(log.filter((n) => n.role === 'boss').map((n) => n.voice))).toEqual(new Set([0, 1, 2]));
    // The defeat while all three voices play still keeps the boss at 3 voices.
    bus.emit('sim:bossDown', { id: 'gravitas', x: 0, y: 0 });
    advance(BAR_SEC * 4, () => expect(musicState().bossVoices).toBeLessThanOrEqual(BOSS_VOICE_MAX));
    expect(role('bossDefeat')).toHaveLength(3);
    expect(musicState().bossSteals).toBe(0);
  });

  it.each([
    ['warden', 1, 2],
    ['gravitas', 2, 3],
  ] as const)('summed gain stays at or under 1.0 with 6 enemy kinds and %s in phase %s', (id, tier, phase) => {
    log = [];
    startMusic(52);
    bus.emit('sim:threat', { level: 1 });
    for (const k of six) bus.emit('sim:enemyEnter', { kind: k, live: 1 });
    advance(BAR_SEC * 3);
    enter(id, tier);
    for (let ph = 2; ph <= phase; ph++) bus.emit('sim:bossPhase', { id, phase: ph, phases: phase });
    const joinStep = barLineAfter(musicState().nextStep);
    advance(BAR_SEC * 8);
    expect(new Set(role('boss').map((n) => n.voice)).size).toBe(phase);
    const lastStep = Math.max(...log.map((n) => n.step));
    let checked = 0;
    // From one bar after the duck and the fade settled: for each step, the loudest note of each
    // bed layer, enemy kind and boss voice over the bar before it, plus every reserve.
    for (let s = joinStep + 2 * STEPS_PER_BAR; s <= lastStep; s++) {
      const loudest = new Map<string, number>();
      for (const n of log) {
        if (n.step > s || n.step <= s - STEPS_PER_BAR) continue;
        if (n.role !== 'bed' && n.role !== 'motif' && n.role !== 'boss') continue;
        const key = n.role === 'bed' ? `bed:${n.layer ?? ''}` : n.role === 'motif' ? `motif:${n.kind ?? ''}` : `boss:${n.voice ?? 0}`;
        loudest.set(key, Math.max(loudest.get(key) ?? 0, n.gain));
      }
      const sum = [...loudest.values()].reduce((a, b) => a + b, 0);
      expect(sum + STINGER_GAIN + BOSS_STING_GAIN + ACCENT_RESERVE + HIT_RESERVE, `step ${s}`).toBeLessThanOrEqual(GAIN_CEILING + 1e-9);
      checked++;
    }
    expect(checked).toBeGreaterThan(STEPS_PER_BAR * 4);
  });

  it('every boss bed is reachable from the bus and every boss 1 to 6 plays notes in its scale', () => {
    for (const id of ['warden', 'brood', 'spindle', 'ember', 'mirage', 'gravitas'] as const) {
      log = [];
      startMusic(60);
      const tier = BOSS_MOTIFS[id].tier;
      enter(id, tier);
      advance(BAR_SEC * 5);
      expect(musicState().bossTier).toBe(tier);
      expect(BATTLE_TUNES.map((t) => t.id)).toContain(musicState().tune);
      const notes = role('boss');
      expect(notes.length, id).toBeGreaterThan(0);
      for (const n of notes) expect(inTierScale(n.midi ?? 0, tier), id).toBe(true);
      stopMusic();
    }
  });
});
