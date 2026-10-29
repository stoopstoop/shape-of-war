// Boss weak point cue (src/render/bossExpose.ts): exposure source order, openness targets, the 4 Hz
// pulse and its closing speed up, the ring, the HIT glyph, the bus hook and the boss add look.
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/events';
import { BROOD, STAGGER_SEC, WARDEN } from '../../src/game/bosses/table';
import {
  ADD_GLOW_BASE,
  ADD_GLOW_PULSE,
  ADD_PULSE_SCALE,
  addGlow,
  addPulse,
  addScale,
  advancePhase,
  BOSS_EXPOSED_EVENT,
  EXPOSE_CLOSED,
  EXPOSE_CLOSING_HZ,
  EXPOSE_CLOSING_SEC,
  EXPOSE_MAX_INSTANCES,
  EXPOSE_OPEN,
  EXPOSE_PULSE_HZ,
  EXPOSE_RING_OUT,
  EXPOSE_RING_SEC,
  EXPOSE_SPRITE_CAP,
  EXPOSE_UNKNOWN,
  exposedFromMode,
  exposedOpenTarget,
  exposePulse,
  exposePulseHz,
  exposeRing,
  exposeRingSegments,
  exposeState,
  exposeWindowSec,
  HIT_CAP_U,
  HIT_SETTLED_ALPHA,
  HIT_STROKE_COUNT,
  hitCueAlpha,
  hitGlyphTop,
  onBossExposed,
  payloadExposed,
  planBossExpose,
  resolveExposed,
  type ExposeInput,
  type ExposeRing,
} from '../../src/render/bossExpose';
import {
  BOSS_BROOD,
  BOSS_SPINDLE,
  BOSS_WARDEN,
  MODE_ATTACKING,
  MODE_DYING,
  MODE_ENTERING,
  MODE_GUARDED,
  MODE_PHASE,
  MODE_STUNNED,
  MODE_VULNERABLE,
} from '../../src/render/bossLook';
import { bossCoreFrac } from '../../src/render/bossShapes';
import { countFrame, createSpriteBuf, F_BAR, F_DOT, F_GLOW, type FxHalo } from '../../src/render/fxSprites';

const HALO: FxHalo = { alpha: 0.5, width: 2 };
const NO_HALO: FxHalo = { alpha: 0, width: 0 };

function cue(extra: Partial<ExposeInput> = {}): ExposeInput {
  return { x: 100, y: 200, coreR: 14, bodyR: 56, pulse: 1, age: 0.5, alpha: 1, hot: 0xfff0a0, glyph: 0xfffbe0, ...extra };
}

describe('exposure source', () => {
  it('mode fallback: vulnerable and stunned expose; Spindle is open outside entrance, phase and death', () => {
    for (const id of [BOSS_WARDEN, BOSS_BROOD, 5]) {
      expect(exposedFromMode(id, MODE_VULNERABLE)).toBe(true);
      expect(exposedFromMode(id, MODE_STUNNED)).toBe(true);
      expect(exposedFromMode(id, MODE_GUARDED)).toBe(false);
      expect(exposedFromMode(id, MODE_ATTACKING)).toBe(false);
    }
    expect(exposedFromMode(BOSS_SPINDLE, MODE_ATTACKING)).toBe(true);
    expect(exposedFromMode(BOSS_SPINDLE, MODE_ENTERING)).toBe(false);
    expect(exposedFromMode(BOSS_SPINDLE, MODE_PHASE)).toBe(false);
    expect(exposedFromMode(BOSS_SPINDLE, MODE_DYING)).toBe(false);
  });

  it('the event wins over the sim flag, the sim flag over the mode', () => {
    expect(resolveExposed(EXPOSE_OPEN, EXPOSE_CLOSED, BOSS_WARDEN, MODE_GUARDED)).toBe(true);
    expect(resolveExposed(EXPOSE_CLOSED, EXPOSE_OPEN, BOSS_WARDEN, MODE_VULNERABLE)).toBe(false);
    expect(resolveExposed(EXPOSE_UNKNOWN, EXPOSE_OPEN, BOSS_WARDEN, MODE_GUARDED)).toBe(true);
    expect(resolveExposed(EXPOSE_UNKNOWN, EXPOSE_CLOSED, BOSS_SPINDLE, MODE_ATTACKING)).toBe(false);
    expect(resolveExposed(EXPOSE_UNKNOWN, EXPOSE_UNKNOWN, BOSS_BROOD, MODE_VULNERABLE)).toBe(true);
  });

  it('entering and dying are never exposed, whatever the sources say', () => {
    expect(resolveExposed(EXPOSE_OPEN, EXPOSE_OPEN, BOSS_WARDEN, MODE_ENTERING)).toBe(false);
    expect(resolveExposed(EXPOSE_OPEN, EXPOSE_OPEN, BOSS_WARDEN, MODE_DYING)).toBe(false);
  });

  it('exposeState maps a boolean to the tri state', () => {
    expect(exposeState(true)).toBe(EXPOSE_OPEN);
    expect(exposeState(false)).toBe(EXPOSE_CLOSED);
  });
});

describe('openness target', () => {
  it('known source: open exactly while exposed, a quarter on a closed phase change, open dying', () => {
    expect(exposedOpenTarget(true, true, BOSS_WARDEN, MODE_GUARDED, 0)).toBe(1);
    expect(exposedOpenTarget(true, false, BOSS_WARDEN, MODE_VULNERABLE, 1)).toBe(0);
    expect(exposedOpenTarget(true, false, BOSS_SPINDLE, MODE_ATTACKING, 3)).toBe(0);
    expect(exposedOpenTarget(true, false, BOSS_WARDEN, MODE_PHASE, 0.1)).toBe(0.25);
    expect(exposedOpenTarget(true, false, BOSS_BROOD, MODE_DYING, 0.1)).toBe(1);
  });

  it('unknown source keeps the mode rule (Spindle always open, Warden opens when vulnerable)', () => {
    expect(exposedOpenTarget(false, false, BOSS_SPINDLE, MODE_ATTACKING, 3)).toBe(1);
    expect(exposedOpenTarget(false, false, BOSS_WARDEN, MODE_GUARDED, 3)).toBe(0);
    expect(exposedOpenTarget(false, false, BOSS_WARDEN, MODE_VULNERABLE, 1)).toBe(1);
  });
});

describe('pulse', () => {
  it('4 Hz while exposed, 8 Hz in the last 0.6 s of a known window', () => {
    expect(EXPOSE_PULSE_HZ).toBe(4);
    expect(exposeWindowSec(BOSS_WARDEN, MODE_VULNERABLE)).toBe(WARDEN.openSec);
    expect(exposeWindowSec(BOSS_BROOD, MODE_VULNERABLE)).toBe(BROOD.openSec);
    expect(exposeWindowSec(BOSS_SPINDLE, MODE_STUNNED)).toBe(STAGGER_SEC);
    expect(exposeWindowSec(BOSS_SPINDLE, MODE_ATTACKING)).toBe(0);
    expect(exposePulseHz(BOSS_WARDEN, MODE_VULNERABLE, 0.5)).toBe(EXPOSE_PULSE_HZ);
    expect(exposePulseHz(BOSS_WARDEN, MODE_VULNERABLE, WARDEN.openSec - EXPOSE_CLOSING_SEC / 2)).toBe(EXPOSE_CLOSING_HZ);
    expect(exposePulseHz(BOSS_BROOD, MODE_STUNNED, STAGGER_SEC - 0.1)).toBe(EXPOSE_CLOSING_HZ);
    expect(exposePulseHz(BOSS_SPINDLE, MODE_ATTACKING, 100)).toBe(EXPOSE_PULSE_HZ);
  });

  it('phase advances by hz x dt and wraps; level is 1 on the beat and 0 half way', () => {
    expect(advancePhase(0, 4, 0.1)).toBeCloseTo(0.4, 9);
    expect(advancePhase(0.9, 4, 0.05)).toBeCloseTo(0.1, 9);
    expect(advancePhase(Number.NaN, 4, 0.1)).toBeCloseTo(0.4, 9);
    expect(advancePhase(0.3, 4, -1)).toBeCloseTo(0.3, 9);
    expect(exposePulse(0)).toBeCloseTo(1, 9);
    expect(exposePulse(0.5)).toBeCloseTo(0, 9);
    // One full cycle at 4 Hz is 0.25 s.
    let p = 0;
    for (let k = 0; k < 25; k++) p = advancePhase(p, EXPOSE_PULSE_HZ, 0.01);
    expect(exposePulse(p)).toBeCloseTo(1, 6);
  });
});

describe('expanding ring', () => {
  it('starts at the core, grows to EXPOSE_RING_OUT body radii, fades, and repeats', () => {
    const r: ExposeRing = { r: 0, alpha: 0 };
    exposeRing(0, 14, 56, r);
    expect(r.r).toBeCloseTo(14, 6);
    const a0 = r.alpha;
    exposeRing(EXPOSE_RING_SEC * 0.999, 14, 56, r);
    expect(r.r).toBeCloseTo(56 * EXPOSE_RING_OUT, 0);
    expect(r.alpha).toBeLessThan(0.01);
    exposeRing(EXPOSE_RING_SEC * 1.0001, 14, 56, r);
    expect(r.alpha).toBeCloseTo(a0, 2);
  });

  it('ring segments stay in bounds', () => {
    expect(exposeRingSegments(0)).toBe(0);
    expect(exposeRingSegments(5)).toBe(12);
    expect(exposeRingSegments(10000)).toBe(32);
  });
});

describe('HIT glyph', () => {
  it('full at first, then settles to a low alpha on a long exposure', () => {
    expect(hitCueAlpha(0)).toBe(0);
    expect(hitCueAlpha(0.5)).toBe(1);
    expect(hitCueAlpha(5)).toBe(1);
    expect(hitCueAlpha(60)).toBeCloseTo(HIT_SETTLED_ALPHA, 9);
  });

  it('sits wholly above the body rim (y down)', () => {
    const top = hitGlyphTop(200, 56);
    expect(top).toBeLessThan(200 - 56 * 1.18 - 1.65 * HIT_CAP_U + 1);
    expect(top + 1.65 * HIT_CAP_U).toBeLessThan(200 - 56 * 1.18);
  });
});

describe('planBossExpose', () => {
  it('writes the hot glow, the hot disc, the ring and the glyph strokes in the hot colours', () => {
    const b = createSpriteBuf(EXPOSE_SPRITE_CAP);
    const e = cue();
    const n = planBossExpose(e, b, HALO);
    expect(n).toBe(b.count);
    expect(countFrame(b, F_GLOW)).toBe(1);
    expect(countFrame(b, F_DOT)).toBe(1);
    // Ring segments plus HIT strokes, as core bars.
    expect(countFrame(b, F_BAR)).toBeGreaterThanOrEqual(12 + HIT_STROKE_COUNT);
    for (let i = 0; i < b.count; i++) expect([e.hot, e.glyph]).toContain(b.tint[i]);
    // The glyph strokes (glyph colour) all sit above the body rim.
    let above = 0;
    for (let i = 0; i < b.count; i++) if (b.frame[i] === F_BAR && b.tint[i] === e.glyph) {
      expect(b.y[i] ?? 0).toBeLessThan(e.y - e.bodyR * 1.18);
      above++;
    }
    expect(above).toBe(HIT_STROKE_COUNT);
  });

  it('never exceeds EXPOSE_MAX_INSTANCES, which fits the layer cap', () => {
    expect(EXPOSE_MAX_INSTANCES).toBeLessThanOrEqual(EXPOSE_SPRITE_CAP);
    for (const bodyR of [20, 56, 90, 400]) {
      const b = createSpriteBuf(1024);
      const n = planBossExpose(cue({ bodyR, coreR: bossCoreFrac(BOSS_WARDEN, 1) * bodyR, age: 0.01 }), b, HALO);
      expect(n).toBeLessThanOrEqual(EXPOSE_MAX_INSTANCES);
    }
  });

  it('the pulse drives the disc: brighter and larger on the beat', () => {
    const on = createSpriteBuf(64);
    const off = createSpriteBuf(64);
    planBossExpose(cue({ pulse: 1 }), on, NO_HALO);
    planBossExpose(cue({ pulse: 0 }), off, NO_HALO);
    const dot = (b: ReturnType<typeof createSpriteBuf>): number => {
      for (let i = 0; i < b.count; i++) if (b.frame[i] === F_DOT) return i;
      return -1;
    };
    expect(on.alpha[dot(on)] ?? 0).toBeGreaterThan(off.alpha[dot(off)] ?? 0);
    expect(on.w[dot(on)] ?? 0).toBeGreaterThan(off.w[dot(off)] ?? 0);
  });

  it('writes nothing for an invisible body or a zero core', () => {
    const b = createSpriteBuf(64);
    expect(planBossExpose(cue({ alpha: 0 }), b, HALO)).toBe(0);
    expect(planBossExpose(cue({ coreR: 0 }), b, HALO)).toBe(0);
    expect(planBossExpose(cue({ alpha: Number.NaN }), b, HALO)).toBe(0);
    expect(b.count).toBe(0);
  });
});

describe('sim:bossExposed hook', () => {
  it('reads the exposed flag of any payload shape', () => {
    expect(payloadExposed({ id: 'warden', exposed: true })).toBe(true);
    expect(payloadExposed({ id: 3, exposed: false })).toBe(false);
    expect(payloadExposed({ exposed: 'yes' })).toBe(false);
    expect(payloadExposed(null)).toBe(false);
    expect(payloadExposed(undefined)).toBe(false);
  });

  it('subscribes under the event name and unsubscribes', () => {
    const b = new Bus();
    const seen: boolean[] = [];
    const off = onBossExposed(b, (on) => seen.push(on));
    const emit = b.emit as unknown as (this: Bus, k: string, p: unknown) => void;
    emit.call(b, BOSS_EXPOSED_EVENT, { id: 'warden', exposed: true });
    emit.call(b, BOSS_EXPOSED_EVENT, { id: 'warden', exposed: false });
    off();
    emit.call(b, BOSS_EXPOSED_EVENT, { id: 'warden', exposed: true });
    expect(seen).toEqual([true, false]);
  });
});

describe('boss add hostile look', () => {
  it('angry pulse is a sharp 0 to 1 beat', () => {
    let lo = 1;
    let hi = 0;
    for (let k = 0; k < 400; k++) {
      const p = addPulse(k / 400, 0.3);
      lo = Math.min(lo, p);
      hi = Math.max(hi, p);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(0.99);
    expect(addPulse(Number.NaN, Number.NaN)).toBe(0);
  });

  it('scale and glow multipliers grow with the pulse and stay above the normal look', () => {
    expect(addScale(0)).toBe(1);
    expect(addScale(1)).toBeCloseTo(1 + ADD_PULSE_SCALE, 9);
    expect(addGlow(0)).toBe(ADD_GLOW_BASE);
    expect(addGlow(1)).toBeCloseTo(ADD_GLOW_BASE + ADD_GLOW_PULSE, 9);
    expect(addGlow(0)).toBeGreaterThan(1);
  });
});

describe('core size helper', () => {
  it('matches the white core radius the boss specs draw (closed and open)', () => {
    expect(bossCoreFrac(BOSS_WARDEN, 0)).toBeCloseTo(0.16, 9);
    expect(bossCoreFrac(BOSS_WARDEN, 1)).toBeCloseTo(0.24, 9);
    expect(bossCoreFrac(BOSS_BROOD, 1)).toBeCloseTo(0.28, 9);
    expect(bossCoreFrac(BOSS_SPINDLE, 1)).toBeCloseTo(0.17, 9);
    expect(bossCoreFrac(7, 0.5)).toBeCloseTo(0.2, 9);
    expect(bossCoreFrac(BOSS_WARDEN, Number.NaN)).toBeCloseTo(0.16, 9);
  });
});
