// Boss battle tracks (G3C retest): the selection rule, the cross fade into the track and the
// return after the defeat, motif notes fitted to the track's chords, and the voice cap under a
// tier 4 fight with every layer, cue, crack and hit tick on each of the three tracks.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  battleIndexFor,
  battleTuneFor,
  fitBattleNote,
  xfadeFor,
  xfadeGain,
  XFADE_DIP,
  XFADE_IN_STEPS,
  XFADE_STEPS,
} from '../../../src/audio/music/battle';
import { BOSS_MOTIFS, SNAP_STEPS } from '../../../src/audio/music/boss';
import { KIND_BOSS, KIND_BOSS_PART } from '../../../src/audio/music/bossCue';
import { BED_VOICE_MAX, MUSIC_VOICE_CAP } from '../../../src/audio/music/engine';
import { harmonyForBar, inChord, inScale } from '../../../src/audio/music/harmony';
import { initMusic, musicState, selectBossTune, setMusicVolume, startMusic, type MusicGraph, type NoteLog } from '../../../src/audio/music/index';
import { LAYERS_FULL } from '../../../src/audio/music/layers';
import { TICK_MS } from '../../../src/audio/music/scheduler';
import { BAR_SEC, STEPS_PER_BAR } from '../../../src/audio/music/track';
import { BATTLE_TUNES } from '../../../src/audio/music/tunes';
import { Bus } from '../../../src/core/events';
import { BOSS_IDS, type BossId, type EnemyKind } from '../../../src/levelgen/leveldef';
import { FakeContext, FakeNode, FakeTimer } from './fakeAudio';

describe('selection rule', () => {
  it('is a pure function of level seed, boss id and the previous track', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const id of BOSS_IDS) {
        expect(battleIndexFor(seed, id, null)).toBe(battleIndexFor(seed, id, null));
        expect(battleTuneFor(seed, id, 1)).toBe(BATTLE_TUNES[battleIndexFor(seed, id, 1)]);
      }
    }
  });

  it('never repeats the previous fight and reaches every track', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 300; seed++) {
      for (const id of BOSS_IDS) {
        const free = battleIndexFor(seed, id, null);
        expect(free).toBeGreaterThanOrEqual(0);
        expect(free).toBeLessThan(BATTLE_TUNES.length);
        seen.add(free);
        for (let prev = 0; prev < BATTLE_TUNES.length; prev++) {
          const i = battleIndexFor(seed, id, prev);
          expect(i).not.toBe(prev);
          // Only a clash moves the pick.
          if (free !== prev) expect(i).toBe(free);
        }
      }
    }
    expect(seen.size).toBe(BATTLE_TUNES.length);
  });

  it('the same boss gets different tracks on different runs, and bosses differ on one level', () => {
    for (const id of BOSS_IDS) {
      const picks = new Set(Array.from({ length: 40 }, (_, s) => battleIndexFor(s * 7919, id, null)));
      expect(picks.size, id).toBe(BATTLE_TUNES.length);
    }
    const perLevel = new Set(BOSS_IDS.map((id) => battleIndexFor(12345, id, null)));
    expect(perLevel.size).toBeGreaterThan(1);
  });

  it('a run of fights never plays the same track twice in a row', () => {
    let prev: number | null = null;
    for (let level = 0; level < 60; level++) {
      const id: BossId = BOSS_IDS[level % BOSS_IDS.length] ?? 'warden';
      const i = battleIndexFor((level * 0x9e3779b1) >>> 0, id, prev);
      expect(i).not.toBe(prev);
      prev = i;
    }
  });
});

describe('cross fade (pure)', () => {
  it('fits in one bar: dips to XFADE_DIP by the join, full again XFADE_IN_STEPS later', () => {
    for (let entry = 0; entry < 48; entry++) {
      const join = (Math.floor(entry / STEPS_PER_BAR) + 1) * STEPS_PER_BAR;
      const x = xfadeFor(entry, join);
      expect(x.from).toBeGreaterThanOrEqual(entry);
      expect(join + XFADE_IN_STEPS - x.from).toBeLessThanOrEqual(XFADE_STEPS);
      expect(xfadeGain(x, x.from - 1)).toBe(1);
      expect(xfadeGain(x, join - 1)).toBeCloseTo(XFADE_DIP, 9);
      expect(xfadeGain(x, join)).toBeCloseTo(XFADE_DIP, 9);
      expect(xfadeGain(x, join + XFADE_IN_STEPS)).toBe(1);
      let last = 1;
      for (let s = x.from; s < join; s++) {
        const g = xfadeGain(x, s);
        expect(g).toBeLessThanOrEqual(last + 1e-12);
        last = g;
      }
      for (let s = join; s < join + XFADE_IN_STEPS; s++) {
        expect(xfadeGain(x, s + 1)).toBeGreaterThan(xfadeGain(x, s));
      }
    }
    expect(xfadeGain(null, 5)).toBe(1);
  });
});

describe('motif fit', () => {
  it('every boss motif note lands on the battle chord on snap steps and long notes, in the scale elsewhere', () => {
    for (const t of BATTLE_TUNES) {
      for (const id of BOSS_IDS) {
        const spec = BOSS_MOTIFS[id];
        for (let phase = 1; phase <= 4; phase++) {
          for (let bar = 0; bar < 16; bar++) {
            const h = harmonyForBar(bar, t.key);
            for (const raw of spec.motif(phase, bar)) {
              const n = fitBattleNote(raw, h, t.key, spec.tier);
              const what = `${t.id} ${id} phase ${phase} bar ${bar} step ${n.step}`;
              expect(inScale(n.midi, t.key), what).toBe(true);
              if (SNAP_STEPS.includes(n.step) || n.durSteps >= 4) expect(inChord(n.midi, h), what).toBe(true);
              expect(Math.abs(n.midi - raw.midi), what).toBeLessThanOrEqual(6);
            }
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------------------
// Through the real entry points.

let ctx: FakeContext;
let timer: FakeTimer;
let bus: Bus;
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

const barLineAfter = (s: number): number => (Math.floor(s / STEPS_PER_BAR) + 1) * STEPS_PER_BAR;
const battleIds = BATTLE_TUNES.map((t) => t.id as string);

/** The first level seed from `from` whose first fight with `id` plays battle track `want`. */
function seedFor(id: BossId, want: number, from = 1): number {
  for (let s = from; s < from + 500; s++) if (battleIndexFor(s, id, null) === want) return s;
  throw new Error('no seed');
}

beforeEach(() => {
  ctx = new FakeContext();
  timer = new FakeTimer();
  bus = new Bus();
  const graph: MusicGraph = { ctx, master: new FakeNode() };
  log = [];
  setMusicVolume(50);
  uninstall = initMusic({ tune: 'tide', bus, graph: () => graph, timer, visibility: null, volume: 50, onNote: (n) => log.push({ ...n, now: ctx.currentTime }) });
  bus.emit('game:start', { mode: 'adventure', levelIndex: 0 });
});

afterEach(() => uninstall());

describe('transitions', () => {
  it('cross fades into the battle track inside one bar and returns to the level tune two bars after the defeat', () => {
    startMusic(21);
    bus.emit('sim:threat', { level: 1 });
    advance(BAR_SEC * 3.3);
    const at = musicState().nextStep;
    const want = selectBossTune('warden');
    bus.emit('sim:bossEnter', { id: 'warden', tier: 1 });
    const join = barLineAfter(at);
    expect(join - at).toBeLessThanOrEqual(STEPS_PER_BAR);
    advance(BAR_SEC * 4);
    expect(musicState().tune).toBe(want.id);
    expect(musicState().bossTier).toBe(1);
    // The entry stinger still plays at once.
    expect(log.filter((n) => n.role === 'bossEntry').every((n) => n.step === at)).toBe(true);
    const bed = log.filter((n) => n.role === 'bed');
    expect(bed.filter((n) => n.step >= join).every((n) => n.tune === want.id)).toBe(true);
    expect(bed.filter((n) => n.step < join).every((n) => n.tune === 'tide')).toBe(true);
    // Pad gain: one bar before the entry (full), on the join (dipped), two bars on (full again).
    const pad = (s: number): number => Math.max(0, ...bed.filter((n) => n.layer === 'pad' && n.step === s).map((n) => n.gain));
    const before = pad(join - 2 * STEPS_PER_BAR);
    expect(pad(join)).toBeGreaterThan(0);
    expect(pad(join) / before).toBeLessThan(XFADE_DIP + 0.1);
    expect(pad(join + 2 * STEPS_PER_BAR) / pad(join)).toBeGreaterThan(2);
    // Defeat: the chord rings, the battle track holds two more bars, then the level tune.
    const down = musicState().nextStep;
    bus.emit('sim:bossDown', { id: 'warden', x: 0, y: 0 });
    advance(BAR_SEC * 5);
    expect(log.filter((n) => n.role === 'bossDefeat')).toHaveLength(3);
    const back = barLineAfter(down) + 2 * STEPS_PER_BAR;
    const bedAfter = log.filter((n) => n.role === 'bed' && n.step >= barLineAfter(down));
    for (const n of bedAfter) expect(n.tune, `step ${n.step}`).toBe(n.step < back ? want.id : 'tide');
    expect(musicState().tune).toBe('tide');
    expect(musicState().bossTier).toBeNull();
  });

  it('the next boss in the run never gets the previous fight track', () => {
    let prev: string | null = null;
    for (let level = 1; level <= 12; level++) {
      startMusic(level * 101);
      advance(BAR_SEC);
      const id: BossId = BOSS_IDS[level % BOSS_IDS.length] ?? 'warden';
      bus.emit('sim:bossEnter', { id, tier: BOSS_MOTIFS[id].tier });
      advance(BAR_SEC * 2);
      const tune = musicState().tune;
      expect(battleIds).toContain(tune);
      expect(tune).not.toBe(prev);
      prev = tune;
    }
  });

  it('window cue, crack stingers and hit ticks still play over the battle track, on its chords', () => {
    startMusic(seedFor('prism', 1));
    advance(BAR_SEC);
    bus.emit('sim:bossEnter', { id: 'prism', tier: 4 });
    advance(BAR_SEC * 2);
    const t = BATTLE_TUNES.find((x) => x.id === musicState().tune);
    expect(t).toBeDefined();
    for (let i = 0; i < 3; i++) {
      bus.emit('sim:bossWindow', { id: 'prism', open: false, secondsLeft: 1 });
      advance(1);
      bus.emit('sim:bossWindow', { id: 'prism', open: true, secondsLeft: 2 });
      bus.emit('fx:hit', { x: 0, y: 0, kind: KIND_BOSS, id: 1, blocked: false });
      advance(0.6);
    }
    bus.emit('sim:bossCrack', { id: 'prism', stage: 1, x: 0, y: 0 });
    advance(0.5);
    for (const r of ['bossWindow', 'bossCrack', 'bossTick'] as const) {
      const ns = log.filter((n) => n.role === r);
      expect(ns.length, r).toBeGreaterThan(0);
      for (const n of ns) expect(battleIds, r).toContain(n.tune);
    }
    for (const n of log.filter((x) => x.role === 'boss')) expect(battleIds).toContain(n.tune);
  });
});

describe('voice budget', () => {
  const kinds = Object.keys(LAYERS_FULL) as EnemyKind[];

  it.each(BATTLE_TUNES.map((t, i) => [t.id, i] as const))('tier 4 fight on %s with every layer stays inside the caps', (name, idx) => {
    startMusic(seedFor('prism', idx));
    bus.emit('sim:threat', { level: 1 });
    for (const k of kinds) bus.emit('sim:enemyEnter', { kind: k, live: 3 });
    advance(BAR_SEC * 2);
    let peak = 0;
    const check = (): void => {
      const st = musicState();
      expect(st.voices).toBeLessThanOrEqual(MUSIC_VOICE_CAP);
      // Cues and ticks are boss voices too (bossCue.test.ts): the bed keeps its share.
      expect(st.bossVoices).toBeLessThanOrEqual(MUSIC_VOICE_CAP - BED_VOICE_MAX);
      peak = Math.max(peak, st.voices);
    };
    bus.emit('sim:bossEnter', { id: 'prism', tier: 4 });
    advance(BAR_SEC * 2, check);
    expect(musicState().tune).toBe(name);
    for (let phase = 2; phase <= 4; phase++) {
      bus.emit('sim:bossPhase', { id: 'prism', phase, phases: 4 });
      for (let i = 0; i < 3; i++) {
        bus.emit('sim:bossWindow', { id: 'prism', open: false, secondsLeft: 1 });
        bus.emit('fx:hit', { x: 0, y: 0, kind: KIND_BOSS_PART, id: 2, blocked: false });
        advance(1, check);
        bus.emit('sim:bossWindow', { id: 'prism', open: true, secondsLeft: 3 });
        bus.emit('fx:hit', { x: 0, y: 0, kind: KIND_BOSS, id: 1, blocked: false });
        bus.emit('fx:kill', { x: 0, y: 0, colour: 'blue', kind: 1, id: 9 });
        bus.emit('sfx', 'explode');
        advance(1, check);
      }
    }
    bus.emit('sim:bossCrack', { id: 'prism', stage: 1, x: 0, y: 0 });
    bus.emit('sim:bossCrack', { id: 'prism', stage: 2, x: 0, y: 0 });
    advance(BAR_SEC * 2, check);
    bus.emit('sim:bossDown', { id: 'prism', x: 0, y: 0 });
    advance(BAR_SEC * 4, check);
    const st = musicState();
    expect(peak).toBeGreaterThan(0);
    expect(st.bedSteals).toBe(0);
    expect(log.some((n) => n.role === 'bossWindow')).toBe(true);
  });
});
