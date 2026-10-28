// Hit sounds, pure parts: per source ticks, the deflect, and the rate and lane gate.
import { describe, expect, it } from 'vitest';
import {
  DEFLECT_DUR_SEC,
  DEFLECT_GAIN,
  DEFLECT_GAP_SEC,
  DEFLECT_RATE_MAX,
  DEFLECT_TIMBRE,
  deflectMidi,
  gateDeflect,
  gateHit,
  hasQueued,
  HIT_DUR_SEC,
  HIT_GAIN_MAX,
  HIT_GAP_SEC,
  HIT_GATE_INIT,
  HIT_MIDI_MAX,
  HIT_MIN_ROOM,
  HIT_RATE_MAX,
  hitGain,
  hitMidi,
  hitOrder,
  hitTimbreFor,
  type HitGate,
  type QueuedHit,
} from '../../../src/audio/music/hits';
import { KILL_SPECS, killMidi, type KillSource } from '../../../src/audio/music/kills';
import { HIT_RESERVE } from '../../../src/audio/music/lifecycle';
import { inPentatonic, pitchClass } from '../../../src/audio/music/scale';
import { LOOP_BARS, STEP_SEC } from '../../../src/audio/music/track';

const SOURCES = Object.keys(KILL_SPECS) as KillSource[];
const ROOM = (): number => 8;

/** Most times inside any half open window [t, t + width). */
function maxInWindow(times: readonly number[], width: number): number {
  let best = 0;
  for (let i = 0; i < times.length; i++) {
    let n = 0;
    for (let j = i; j < times.length && (times[j] ?? Infinity) < (times[i] ?? 0) + width; j++) n++;
    best = Math.max(best, n);
  }
  return best;
}

describe('hit ticks per source', () => {
  it('each tick is in the kill note pitch family, an octave up unless that passes E7', () => {
    for (const s of SOURCES) {
      for (let bar = 0; bar < LOOP_BARS; bar++) {
        const kill = killMidi(KILL_SPECS[s], bar);
        const hit = hitMidi(s, bar);
        expect(pitchClass(hit)).toBe(pitchClass(kill));
        expect(inPentatonic(hit)).toBe(true);
        expect(hit).toBeLessThanOrEqual(HIT_MIDI_MAX);
        expect(hit).toBe(kill + 12 > HIT_MIDI_MAX ? kill : kill + 12);
      }
    }
    // The low and middle kinds really are an octave up.
    expect(hitMidi('grunt', 0)).toBe(killMidi(KILL_SPECS.grunt, 0) + 12);
    expect(hitMidi('bulwark', 0)).toBe(killMidi(KILL_SPECS.bulwark, 0) + 12);
  });

  it('every source has its own tick: its kill timbre, made short', () => {
    expect(new Set(SOURCES.map((s) => hitTimbreFor(s).id)).size).toBe(SOURCES.length);
    for (const s of SOURCES) {
      const t = hitTimbreFor(s);
      expect(t.id).toBe(KILL_SPECS[s].timbre.id);
      expect(t.wave).toBe(KILL_SPECS[s].timbre.wave);
      expect(t.attack).toBeLessThanOrEqual(0.002);
      expect(t.release).toBeLessThan(HIT_DUR_SEC);
      expect(t.glideSec).toBe(0);
      expect(hitTimbreFor(s)).toBe(t);
    }
  });

  it('ticks are shorter and quieter than kill notes and fit the hit reserve', () => {
    expect(HIT_DUR_SEC).toBeLessThan(STEP_SEC / 2);
    expect(DEFLECT_DUR_SEC).toBeLessThan(STEP_SEC);
    for (const s of SOURCES) {
      expect(hitGain(s)).toBeLessThan(KILL_SPECS[s].gain);
      expect(hitGain(s)).toBeLessThanOrEqual(HIT_GAIN_MAX);
      expect(hitGain(s)).toBeGreaterThan(0.01);
    }
    // One sound on the hit lane at a time, so the loudest one bounds the sum.
    expect(Math.max(HIT_GAIN_MAX, DEFLECT_GAIN)).toBeLessThanOrEqual(HIT_RESERVE);
  });

  it('the deflect is a metallic ping in the scale, apart from the Bulwark tick', () => {
    for (let bar = 0; bar < LOOP_BARS; bar++) {
      const m = deflectMidi(bar);
      expect(inPentatonic(m)).toBe(true);
      expect(m).toBeLessThanOrEqual(HIT_MIDI_MAX);
      expect(m).toBeGreaterThan(hitMidi('bulwark', bar));
      expect(pitchClass(m)).toBe(pitchClass(killMidi(KILL_SPECS.bulwark, bar)));
    }
    expect(DEFLECT_TIMBRE.id).toBe('deflect');
    expect(SOURCES.some((s) => hitTimbreFor(s).id === DEFLECT_TIMBRE.id)).toBe(false);
    // An inharmonic partner (not an octave or a fifth multiple): a ring, not a chord.
    const d = DEFLECT_TIMBRE.partner?.detune ?? 0;
    expect(d % 1200).not.toBe(0);
    expect(d % 700).not.toBe(0);
    expect(DEFLECT_TIMBRE.glideSec).toBeGreaterThan(0);
  });
});

describe('hit gate', () => {
  it('one source sounds at most 8 times a second however fast it is hit', () => {
    let g: HitGate = HIT_GATE_INIT;
    const heard: number[] = [];
    for (let t = 0; t < 5; t += 0.01) {
      const r = gateHit(g, 'bulwark', t, ROOM);
      g = r.gate;
      if (r.ok) heard.push(t);
    }
    expect(HIT_RATE_MAX).toBe(8);
    expect(maxInWindow(heard, 1)).toBeLessThanOrEqual(8);
    expect(heard.length).toBeGreaterThanOrEqual(38);
    for (let i = 1; i < heard.length; i++) expect((heard[i] ?? 0) - (heard[i - 1] ?? 0)).toBeGreaterThanOrEqual(HIT_GAP_SEC - 1e-9);
  });

  it('one tick at a time: a second source in the same instant waits for the lane', () => {
    const a = gateHit(HIT_GATE_INIT, 'grunt', 1, ROOM);
    expect(a.ok).toBe(true);
    const b = gateHit(a.gate, 'splime', 1, ROOM);
    expect(b).toMatchObject({ ok: false, why: 'lane' });
    expect(gateHit(a.gate, 'splime', 1 + HIT_DUR_SEC, ROOM).ok).toBe(true);
    // The per source limit is separate from the lane.
    expect(gateHit(a.gate, 'grunt', 1 + HIT_DUR_SEC, ROOM)).toMatchObject({ ok: false, why: 'rate' });
  });

  it('skips when the voice budget is short, and only counts voices when it could play', () => {
    let asked = 0;
    const room = (n: number) => (): number => {
      asked++;
      return n;
    };
    expect(gateHit(HIT_GATE_INIT, 'grunt', 0, room(HIT_MIN_ROOM - 1))).toMatchObject({ ok: false, why: 'voices' });
    expect(gateDeflect(HIT_GATE_INIT, 0, room(0))).toMatchObject({ ok: false, why: 'voices' });
    expect(asked).toBe(2);
    const ok = gateHit(HIT_GATE_INIT, 'grunt', 0, room(HIT_MIN_ROOM));
    expect(ok.ok).toBe(true);
    asked = 0;
    gateHit(ok.gate, 'grunt', 0.01, room(8));
    gateHit(ok.gate, 'weaver', 0.01, room(8));
    expect(asked).toBe(0);
    // A skipped tick leaves no trace: the next one may play at once.
    const skipped = gateHit(HIT_GATE_INIT, 'grunt', 0, room(0));
    expect(skipped.gate).toBe(HIT_GATE_INIT);
  });

  it('deflects at most 4 a second, sharing the lane with ticks', () => {
    let g: HitGate = HIT_GATE_INIT;
    const heard: number[] = [];
    for (let t = 0; t < 5; t += 0.01) {
      const r = gateDeflect(g, t, ROOM);
      g = r.gate;
      if (r.ok) heard.push(t);
    }
    expect(DEFLECT_RATE_MAX).toBe(4);
    expect(maxInWindow(heard, 1)).toBeLessThanOrEqual(4);
    expect(heard.length).toBeGreaterThanOrEqual(18);
    for (let i = 1; i < heard.length; i++) expect((heard[i] ?? 0) - (heard[i - 1] ?? 0)).toBeGreaterThanOrEqual(DEFLECT_GAP_SEC - 1e-9);
    const d = gateDeflect(HIT_GATE_INIT, 2, ROOM);
    expect(gateHit(d.gate, 'grunt', 2 + DEFLECT_DUR_SEC / 2, ROOM)).toMatchObject({ ok: false, why: 'lane' });
    const h = gateHit(HIT_GATE_INIT, 'grunt', 2, ROOM);
    expect(gateDeflect(h.gate, 2, ROOM)).toMatchObject({ ok: false, why: 'lane' });
  });

  it('queues one hit per source and one deflect per tick; tries the deflect, then the least recent source', () => {
    const q: QueuedHit[] = [];
    const add = (h: QueuedHit): void => {
      if (!hasQueued(q, h)) q.push(h);
    };
    add({ blocked: false, source: 'grunt' });
    add({ blocked: false, source: 'grunt' });
    add({ blocked: false, source: 'splime' });
    add({ blocked: true });
    add({ blocked: true });
    add({ blocked: false, source: 'bulwark' });
    expect(q).toHaveLength(4);
    const g: HitGate = { ...HIT_GATE_INIT, last: { grunt: 5, splime: 3 } };
    expect(hitOrder(q, g)).toEqual([{ blocked: true }, { blocked: false, source: 'bulwark' }, { blocked: false, source: 'splime' }, { blocked: false, source: 'grunt' }]);
    // Ties keep queue order.
    expect(hitOrder(q, HIT_GATE_INIT).map((h) => (h.blocked ? 'deflect' : h.source))).toEqual(['deflect', 'grunt', 'splime', 'bulwark']);
  });

  it('is deterministic: the same hits give the same decisions', () => {
    const run = (): boolean[] => {
      let g: HitGate = HIT_GATE_INIT;
      const out: boolean[] = [];
      const order: KillSource[] = ['grunt', 'bulwark', 'splime', 'snake', 'well'];
      for (let i = 0; i < 400; i++) {
        const r = i % 7 === 0 ? gateDeflect(g, i * 0.013, ROOM) : gateHit(g, order[i % order.length] ?? 'grunt', i * 0.013, ROOM);
        g = r.gate;
        out.push(r.ok);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
