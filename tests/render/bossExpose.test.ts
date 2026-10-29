// Boss weak point cue (src/render/bossExpose.ts): exposure source order, openness targets, the 4 Hz
// pulse and its closing speed up, the shell flicker, the boss shake, the broken core fragments,
// the bus hook and the boss add look. No HIT glyph and no ring any more (ED1).
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
  EXPOSE_SPRITE_CAP,
  EXPOSE_UNKNOWN,
  exposedFromMode,
  exposeAlarm,
  exposedOpenTarget,
  exposePulse,
  exposePulseHz,
  exposeShake,
  exposeShakePx,
  exposeState,
  EXPOSE_SETTLE_FADE_SEC,
  EXPOSE_SETTLE_SEC,
  exposeWindowSec,
  FLICKER_DUTY,
  FLICKER_HZ,
  FLICKER_RED_WHITE,
  flickerOn,
  flickerRedWhite,
  FRAG_CLOSE_SEC,
  FRAG_DRIFT_MAX,
  FRAG_DRIFT_MIN,
  FRAG_MAX,
  FRAG_OPEN_SEC,
  fragmentAngle,
  fragmentCount,
  fragmentDrift,
  fragmentEase,
  fragmentOffset,
  fragmentSizeFrac,
  onBossExposed,
  payloadExposed,
  planBossExpose,
  resolveExposed,
  SHAKE_HZ,
  SHAKE_PX,
  SHAKE_PX_T3,
  SHAKE_PX_TOP,
  shellHot,
  stepSpread,
  type ExposeInput,
  type Offset,
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
import { countFrame, createSpriteBuf, F_BAR, F_DOT, F_GLOW, F_SOFT, type FxHalo } from '../../src/render/fxSprites';

const HALO: FxHalo = { alpha: 0.5, width: 2 };
const NO_HALO: FxHalo = { alpha: 0, width: 0 };

function cue(extra: Partial<ExposeInput> = {}): ExposeInput {
  return { x: 100, y: 200, coreR: 14, pulse: 1, spread: 1, orbit: 0, count: 3, alpha: 1, hot: 0xfff0a0, ...extra };
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

describe('shell flicker', () => {
  it('runs at FLICKER_HZ with a 30 percent hot duty, hot at the start of each cycle', () => {
    expect(FLICKER_HZ).toBe(5);
    expect(FLICKER_DUTY).toBeCloseTo(0.3, 9);
    expect(flickerOn(0)).toBe(true);
    expect(flickerOn(0.05)).toBe(true); // 0.25 of a 0.2 s cycle
    expect(flickerOn(0.07)).toBe(false); // 0.35 of a cycle
    expect(flickerOn(0.19)).toBe(false);
    expect(flickerOn(0.2001)).toBe(true);
  });

  it('measured duty over many cycles is 0.3 and the rate is 5 rising edges a second', () => {
    const steps = 100000;
    const sec = 10;
    let on = 0;
    let rises = 0;
    let prev = false;
    for (let k = 0; k < steps; k++) {
      const now = flickerOn(((k + 0.5) / steps) * sec);
      if (now) on++;
      if (now && !prev) rises++;
      prev = now;
    }
    expect(on / steps).toBeCloseTo(0.3, 2);
    expect(rises).toBe(sec * FLICKER_HZ);
  });

  it('is off for a negative or non finite time; tier 3 and up mix more white', () => {
    expect(flickerOn(-0.01)).toBe(false);
    expect(flickerOn(Number.NaN)).toBe(false);
    expect(flickerOn(Number.POSITIVE_INFINITY)).toBe(false);
    expect(flickerRedWhite(1)).toBe(FLICKER_RED_WHITE);
    expect(flickerRedWhite(2)).toBe(FLICKER_RED_WHITE);
    expect(flickerRedWhite(3)).toBeGreaterThan(FLICKER_RED_WHITE);
    expect(flickerRedWhite(4)).toBeGreaterThan(FLICKER_RED_WHITE);
  });
});

describe('long exposure settle', () => {
  it('flicker and shake run at full strength through the Warden and Brood windows', () => {
    expect(EXPOSE_SETTLE_SEC).toBeGreaterThan(WARDEN.openSec);
    expect(EXPOSE_SETTLE_SEC).toBeGreaterThan(BROOD.openSec);
    for (let t = 0; t < EXPOSE_SETTLE_SEC; t += 0.01) {
      expect(exposeAlarm(t)).toBe(1);
      expect(shellHot(t)).toBe(flickerOn(t));
    }
  });

  it('fades out over EXPOSE_SETTLE_FADE_SEC, and the shell stops flickering once settled', () => {
    expect(exposeAlarm(EXPOSE_SETTLE_SEC + EXPOSE_SETTLE_FADE_SEC / 2)).toBeCloseTo(0.5, 9);
    expect(exposeAlarm(EXPOSE_SETTLE_SEC + EXPOSE_SETTLE_FADE_SEC)).toBe(0);
    expect(exposeAlarm(600)).toBe(0);
    expect(exposeAlarm(Number.NaN)).toBe(1);
    for (let t = EXPOSE_SETTLE_SEC + EXPOSE_SETTLE_FADE_SEC; t < 60; t += 0.013) expect(shellHot(t)).toBe(false);
  });
});

describe('boss shake', () => {
  it('amplitude is 2 to 3 screen px, a touch more on tier 3 and the top boss', () => {
    for (const t of [1, 2, 3, 4]) {
      expect(exposeShakePx(t)).toBeGreaterThanOrEqual(2);
      expect(exposeShakePx(t)).toBeLessThanOrEqual(3);
    }
    expect(exposeShakePx(1)).toBe(SHAKE_PX);
    expect(exposeShakePx(3)).toBeGreaterThan(exposeShakePx(2));
    expect(exposeShakePx(4)).toBeGreaterThan(exposeShakePx(3));
  });

  it('the offset never leaves the amplitude circle, and reaches close to it', () => {
    const o: Offset = { x: 0, y: 0 };
    for (const amp of [SHAKE_PX, SHAKE_PX_T3, SHAKE_PX_TOP, 7.5]) {
      let peak = 0;
      for (let k = 0; k < 5000; k++) {
        exposeShake(k * 0.00137, amp, o);
        const m = Math.hypot(o.x, o.y);
        expect(m).toBeLessThanOrEqual(amp + 1e-9);
        if (m > peak) peak = m;
      }
      expect(peak).toBeGreaterThan(amp * 0.95);
    }
  });

  it('x runs at SHAKE_HZ; zero or bad amplitude gives no offset', () => {
    const o: Offset = { x: 0, y: 0 };
    // x is 0 at the start and after each full x period (a clamp only scales, never moves a zero).
    expect(exposeShake(0, 2, o).x).toBeCloseTo(0, 9);
    expect(exposeShake(1 / SHAKE_HZ, 2, o).x).toBeCloseTo(0, 9);
    exposeShake(0.3, 0, o);
    expect(o.x).toBe(0);
    expect(o.y).toBe(0);
    exposeShake(0.3, Number.NaN, o);
    expect(o.x).toBe(0);
    expect(o.y).toBe(0);
  });
});

describe('core fragments', () => {
  it('3 fragments on tiers 1 and 2, more on tier 3 and the top boss, never past FRAG_MAX', () => {
    expect(fragmentCount(1)).toBe(3);
    expect(fragmentCount(2)).toBe(3);
    expect(fragmentCount(3)).toBe(4);
    expect(fragmentCount(4)).toBe(5);
    expect(FRAG_MAX).toBe(5);
  });

  it('each drift sits in 8 to 14 u, and the drifts differ', () => {
    const seen = new Set<number>();
    for (let k = 0; k < FRAG_MAX; k++) {
      const d = fragmentDrift(k);
      expect(d).toBeGreaterThanOrEqual(FRAG_DRIFT_MIN);
      expect(d).toBeLessThanOrEqual(FRAG_DRIFT_MAX);
      seen.add(Math.round(d * 100));
    }
    expect(FRAG_DRIFT_MIN).toBe(8);
    expect(FRAG_DRIFT_MAX).toBe(14);
    expect(seen.size).toBe(FRAG_MAX);
  });

  it('fragments are evenly spaced and the orbit turns them together', () => {
    for (const n of [3, 4, 5]) {
      for (let k = 0; k < n; k++) expect(fragmentAngle(k, n, 0)).toBeCloseTo((k / n) * Math.PI * 2, 9);
      const step = fragmentAngle(1, n, 0.1) - fragmentAngle(0, n, 0.1);
      expect(step).toBeCloseTo((Math.PI * 2) / n, 9);
    }
    expect(fragmentAngle(0, 3, 0.25)).toBeCloseTo(Math.PI / 2, 9);
    expect(fragmentAngle(0, 3, 1.25)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('offset length is drift x ease: 0 when assembled, the full drift when spread', () => {
    const o: Offset = { x: 0, y: 0 };
    for (let k = 0; k < 5; k++) {
      fragmentOffset(k, 5, 0, 0.37, o);
      expect(Math.hypot(o.x, o.y)).toBeCloseTo(0, 9);
      fragmentOffset(k, 5, 1, 0.37, o);
      expect(Math.hypot(o.x, o.y)).toBeCloseTo(fragmentDrift(k), 9);
      fragmentOffset(k, 5, 0.5, 0.37, o);
      const a = fragmentAngle(k, 5, 0.37);
      expect(o.x).toBeCloseTo(Math.cos(a) * fragmentDrift(k) * 0.5, 9);
      expect(o.y).toBeCloseTo(Math.sin(a) * fragmentDrift(k) * 0.5, 9);
    }
  });

  it('spread opens over FRAG_OPEN_SEC, reassembles over 0.3 s, and the ease is a smoothstep', () => {
    expect(FRAG_CLOSE_SEC).toBeCloseTo(0.3, 9);
    expect(stepSpread(0, true, FRAG_OPEN_SEC / 2)).toBeCloseTo(0.5, 9);
    expect(stepSpread(0, true, 10)).toBe(1);
    expect(stepSpread(1, false, FRAG_CLOSE_SEC / 2)).toBeCloseTo(0.5, 9);
    // 60 fps frames: fully reassembled by about 0.3 s, not before 0.28 s.
    let s = 1;
    let frames = 0;
    while (s > 0 && frames < 100) {
      s = stepSpread(s, false, 1 / 60);
      frames++;
    }
    expect(frames / 60).toBeGreaterThan(0.28);
    expect(frames / 60).toBeLessThanOrEqual(0.3 + 1 / 60);
    expect(stepSpread(Number.NaN, true, Number.NaN)).toBe(0);
    expect(fragmentEase(0)).toBe(0);
    expect(fragmentEase(1)).toBe(1);
    expect(fragmentEase(0.5)).toBeCloseTo(0.5, 9);
    expect(fragmentEase(0.25)).toBeLessThan(0.25);
  });

  it('pieces roughly add up to the core: n x frac squared is the same for every count', () => {
    for (const n of [3, 4, 5]) expect(n * fragmentSizeFrac(n) ** 2).toBeCloseTo(0.7225, 6);
  });
});

describe('planBossExpose', () => {
  it('writes the centre glow, then a glow and a shard per fragment, all in the hot colour', () => {
    for (const count of [3, 4, 5]) {
      const b = createSpriteBuf(EXPOSE_SPRITE_CAP);
      const e = cue({ count });
      const n = planBossExpose(e, b, HALO);
      expect(n).toBe(b.count);
      expect(countFrame(b, F_GLOW)).toBe(1 + count);
      expect(countFrame(b, F_BAR)).toBe(count);
      expect(countFrame(b, F_SOFT)).toBe(count);
      expect(countFrame(b, F_DOT)).toBe(0);
      for (let i = 0; i < b.count; i++) expect(b.tint[i]).toBe(e.hot);
    }
  });

  it('no text and no ring: every instance sits within the fragment reach of the core', () => {
    const b = createSpriteBuf(EXPOSE_SPRITE_CAP);
    const e = cue({ count: 5 });
    planBossExpose(e, b, HALO);
    for (let i = 0; i < b.count; i++) {
      const d = Math.hypot((b.x[i] ?? 0) - e.x, (b.y[i] ?? 0) - e.y);
      expect(d).toBeLessThanOrEqual(FRAG_DRIFT_MAX + 1e-3);
    }
  });

  it('the shards sit at the fragment offsets: on the core when assembled, out when spread', () => {
    const o: Offset = { x: 0, y: 0 };
    const shut = createSpriteBuf(EXPOSE_SPRITE_CAP);
    planBossExpose(cue({ spread: 0 }), shut, NO_HALO);
    for (let i = 0; i < shut.count; i++) {
      expect(shut.x[i] ?? 0).toBeCloseTo(100, 3);
      expect(shut.y[i] ?? 0).toBeCloseTo(200, 3);
    }
    const open = createSpriteBuf(EXPOSE_SPRITE_CAP);
    planBossExpose(cue({ spread: 1, orbit: 0.2 }), open, NO_HALO);
    let k = 0;
    for (let i = 0; i < open.count; i++) {
      if (open.frame[i] !== F_BAR) continue;
      fragmentOffset(k, 3, 1, 0.2, o);
      expect(open.x[i] ?? 0).toBeCloseTo(100 + o.x, 3);
      expect(open.y[i] ?? 0).toBeCloseTo(200 + o.y, 3);
      k++;
    }
    expect(k).toBe(3);
  });

  it('never exceeds EXPOSE_MAX_INSTANCES, which fits the layer cap', () => {
    expect(EXPOSE_MAX_INSTANCES).toBeLessThanOrEqual(EXPOSE_SPRITE_CAP);
    for (const count of [0, 1, 3, 5, 99, Number.NaN]) {
      const b = createSpriteBuf(1024);
      expect(planBossExpose(cue({ count }), b, HALO)).toBeLessThanOrEqual(EXPOSE_MAX_INSTANCES);
    }
  });

  it('the 4 Hz pulse drives the core: centre glow and shards brighter and larger on the beat', () => {
    const on = createSpriteBuf(64);
    const off = createSpriteBuf(64);
    planBossExpose(cue({ pulse: 1 }), on, NO_HALO);
    planBossExpose(cue({ pulse: 0 }), off, NO_HALO);
    expect(on.alpha[0] ?? 0).toBeGreaterThan(off.alpha[0] ?? 0);
    expect(on.w[0] ?? 0).toBeGreaterThan(off.w[0] ?? 0);
    const bar = (b: ReturnType<typeof createSpriteBuf>): number => {
      for (let i = 0; i < b.count; i++) if (b.frame[i] === F_BAR) return i;
      return -1;
    };
    expect(on.alpha[bar(on)] ?? 0).toBeGreaterThan(off.alpha[bar(off)] ?? 0);
    expect(on.h[bar(on)] ?? 0).toBeGreaterThan(off.h[bar(off)] ?? 0);
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
