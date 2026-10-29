// Pure boss weak point cue (G3A device feedback: "poorly indicated it was weak for shooting"; ED1:
// the HIT glyph was "too obvious"). No pixi.js import. While a boss core takes damage (exposed)
// the shell flickers hot red, the boss shakes a few pixels, and the core breaks into hot fragments
// that drift out, orbit and pulse at 4 Hz (8 Hz in the last 0.6 s of a known window), then
// reassemble when the window shuts. While not exposed the core stays dim and the shell keeps its
// colour (the prebuilt closed openness step). No text, no ring.
// Exposure source, best first: the 'sim:bossExposed' event (Swarm, parallel run), then the sim's
// open flag (bossOpen in src/game/bosses/core.ts, read only), then the render contract mode.
// The fragments are written into a SpriteBuf (fxSprites.ts): one pooled geometry, no allocation.
// The flicker is a tint on the coreless shell (bossShapes.ts exposedBossSpec), the shake a render
// offset on the boss view and the cue; neither touches the sim.
import type { Bus, EventKey } from '../core/events';
import { BROOD, STAGGER_SEC, WARDEN } from '../game/bosses/table';
import {
  BOSS_BROOD,
  BOSS_SPINDLE,
  BOSS_WARDEN,
  bossIndex,
  bossOpenness,
  MODE_DYING,
  MODE_ENTERING,
  MODE_PHASE,
  MODE_STUNNED,
  MODE_VULNERABLE,
} from './bossLook';
import { clampNum } from './color';
import { F_GLOW, pushLine, pushSprite, type FxHalo, type SpriteBuf } from './fxSprites';

/** Tri state of an exposure source: unknown (no data yet), closed or exposed. */
export const EXPOSE_UNKNOWN = -1;
export const EXPOSE_CLOSED = 0;
export const EXPOSE_OPEN = 1;

/** Bus event Swarm adds in a parallel run: { id, exposed }, emitted when the core opens or shuts. */
export const BOSS_EXPOSED_EVENT = 'sim:bossExposed';
/** The event key once it is in Events (core/events.ts); never until then, so this compiles either way. */
type ExposedKey = Extract<EventKey, typeof BOSS_EXPOSED_EVENT>;

/** Pure: the exposed flag of a payload of any shape (false for anything without exposed true). */
export function payloadExposed(p: unknown): boolean {
  return typeof p === 'object' && p !== null && 'exposed' in p && p.exposed === true;
}

/**
 * Subscribe to 'sim:bossExposed'. Coded against the event name: before Swarm's change lands the
 * key is not in Events and nothing emits it, so the handler never runs. Returns the unsubscribe.
 */
export function onBossExposed(b: Bus, h: (exposed: boolean) => void): () => void {
  return b.on<ExposedKey>(BOSS_EXPOSED_EVENT as ExposedKey, (p: unknown) => h(payloadExposed(p)));
}

/** Pure: a tri state from a boolean. */
export function exposeState(exposed: boolean): number {
  return exposed ? EXPOSE_OPEN : EXPOSE_CLOSED;
}

/** Pure: exposure from the render contract mode alone (stress proxies, no event, no sim state). */
export function exposedFromMode(id: number, mode: number): boolean {
  if (mode === MODE_VULNERABLE || mode === MODE_STUNNED) return true;
  if (bossIndex(id) === BOSS_SPINDLE) return mode !== MODE_ENTERING && mode !== MODE_DYING && mode !== MODE_PHASE;
  return false;
}

/**
 * Pure: is the core exposed now. Entering and dying are never exposed (untargetable or already
 * down). Otherwise the event state wins, then the sim open flag, then the mode.
 */
export function resolveExposed(eventState: number, simState: number, id: number, mode: number): boolean {
  if (mode === MODE_ENTERING || mode === MODE_DYING) return false;
  if (eventState === EXPOSE_OPEN || eventState === EXPOSE_CLOSED) return eventState === EXPOSE_OPEN;
  if (simState === EXPOSE_OPEN || simState === EXPOSE_CLOSED) return simState === EXPOSE_OPEN;
  return exposedFromMode(id, mode);
}

/**
 * Pure: target shell or core openness. With a known exposure source the core opens exactly while
 * exposed (so a closed Spindle dims too); a phase change still rattles a closed shell a quarter
 * open and the dying body is open. With no source the mode rule (bossOpenness) is unchanged.
 */
export function exposedOpenTarget(known: boolean, exposed: boolean, id: number, mode: number, modeT: number): number {
  if (!known || mode === MODE_ENTERING) return bossOpenness(id, mode, modeT);
  if (mode === MODE_DYING) return 1;
  if (exposed) return 1;
  return mode === MODE_PHASE ? 0.25 : 0;
}

/** Core pulse rate while exposed, and the faster rate in the last EXPOSE_CLOSING_SEC of a window. */
export const EXPOSE_PULSE_HZ = 4;
export const EXPOSE_CLOSING_HZ = 8;
export const EXPOSE_CLOSING_SEC = 0.6;

/**
 * Pure: length of the exposure window for a mode, from the sim table (the bomb stagger, the Warden
 * and Brood open windows), or 0 when it is open ended or unknown (Spindle, later bosses).
 */
export function exposeWindowSec(id: number, mode: number): number {
  if (mode === MODE_STUNNED) return STAGGER_SEC;
  if (mode !== MODE_VULNERABLE) return 0;
  const b = bossIndex(id);
  if (b === BOSS_WARDEN) return WARDEN.openSec;
  if (b === BOSS_BROOD) return BROOD.openSec;
  return 0;
}

/** Pure: pulse rate now; doubles when a known window has less than EXPOSE_CLOSING_SEC left. */
export function exposePulseHz(id: number, mode: number, modeT: number): number {
  const win = exposeWindowSec(id, mode);
  if (win > 0 && Number.isFinite(modeT) && win - modeT < EXPOSE_CLOSING_SEC) return EXPOSE_CLOSING_HZ;
  return EXPOSE_PULSE_HZ;
}

/** Pure: advance a pulse phase (cycles) by hz x dt, kept in [0, 1) so the rate can change smoothly. */
export function advancePhase(phase: number, hz: number, dt: number): number {
  const p = (Number.isFinite(phase) ? phase : 0) + Math.max(0, hz) * Math.max(0, Number.isFinite(dt) ? dt : 0);
  return p - Math.floor(p);
}

/** Pure: pulse level 0 to 1 at a phase (1 at phase 0, the bright beat). */
export function exposePulse(phase: number): number {
  return 0.5 + 0.5 * Math.cos((Number.isFinite(phase) ? phase : 0) * Math.PI * 2);
}

// ED1 device feedback: the HIT glyph read "too obvious", so the cue is now the boss itself. While
// exposed the shell flickers hot red, the whole boss shakes a little (a render offset, never the
// sim position) and the core breaks into a few fragments that drift out and slowly orbit, then
// reassemble when the window closes. The 4 Hz core pulse stays.

/** Shell flicker: rate and the share of each cycle spent hot red. */
export const FLICKER_HZ = 5;
export const FLICKER_DUTY = 0.3;

/** Pure: is the shell hot red at t seconds into an exposure (hot at the start of each cycle). */
export function flickerOn(t: number): boolean {
  if (!Number.isFinite(t) || t < 0) return false;
  const u = t * FLICKER_HZ;
  return u - Math.floor(u) < FLICKER_DUTY;
}

/** White share mixed into the palette red for the hot shell; tier 3 bosses are red already. */
export const FLICKER_RED_WHITE = 0.15;
export const FLICKER_RED_WHITE_HOT = 0.45;

/** Pure: white share of the hot red for a boss tier (more white on tier 3 and up so it still reads). */
export function flickerRedWhite(tier: number): number {
  return tier >= 3 ? FLICKER_RED_WHITE_HOT : FLICKER_RED_WHITE;
}

/**
 * Long exposures (Spindle is open for most of its fight): the flicker and shake are news, not
 * wallpaper, so after EXPOSE_SETTLE_SEC of one exposure they fade out over EXPOSE_SETTLE_FADE_SEC.
 * Warden (2 s) and Brood (5 s) windows close before this; the fragments and pulse never settle.
 */
export const EXPOSE_SETTLE_SEC = 6;
export const EXPOSE_SETTLE_FADE_SEC = 1;

/** Pure: flicker and shake strength 0 to 1 at an exposure age (1 until EXPOSE_SETTLE_SEC). */
export function exposeAlarm(age: number): number {
  const t = Number.isFinite(age) && age > 0 ? age : 0;
  return 1 - clampNum((t - EXPOSE_SETTLE_SEC) / EXPOSE_SETTLE_FADE_SEC, 0, 1);
}

/** Pure: is the shell hot red now, with the settle applied (no flicker once settled past half). */
export function shellHot(age: number): boolean {
  return exposeAlarm(age) > 0.5 && flickerOn(age);
}

/** Boss shake: rate, and the amplitude in screen pixels per tier (tier 3 and the top boss a touch more). */
export const SHAKE_HZ = 12;
export const SHAKE_PX = 2.2;
export const SHAKE_PX_T3 = 2.6;
export const SHAKE_PX_TOP = 3;
/** Second axis frequency ratio and phase, so the shake is a jitter, not a circle. */
const SHAKE_Y_RATIO = 1.31;
const SHAKE_Y_PHASE = 1.1;

/** Pure: shake amplitude in screen pixels for a boss tier. */
export function exposeShakePx(tier: number): number {
  if (tier >= 4) return SHAKE_PX_TOP;
  if (tier >= 3) return SHAKE_PX_T3;
  return SHAKE_PX;
}

export interface Offset {
  x: number;
  y: number;
}

/**
 * Pure: shake offset at t seconds for amplitude amp (any unit). The x axis runs at SHAKE_HZ, the y
 * axis a little faster; the result is clamped so its length never exceeds amp.
 */
export function exposeShake(t: number, amp: number, out: Offset): Offset {
  const a = Number.isFinite(amp) && amp > 0 ? amp : 0;
  if (a === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const tt = Number.isFinite(t) ? t : 0;
  const w = Math.PI * 2 * SHAKE_HZ * tt;
  let x = a * Math.sin(w);
  let y = a * Math.sin(w * SHAKE_Y_RATIO + SHAKE_Y_PHASE);
  const m = Math.sqrt(x * x + y * y);
  if (m > a && m > 0) {
    x *= a / m;
    y *= a / m;
  }
  out.x = x;
  out.y = y;
  return out;
}

/** Core fragments: count per tier, drift distance range (arena units), orbit rate and spread times. */
export const FRAG_COUNT = 3;
export const FRAG_COUNT_T3 = 4;
export const FRAG_COUNT_TOP = 5;
export const FRAG_MAX = FRAG_COUNT_TOP;
export const FRAG_DRIFT_MIN = 8;
export const FRAG_DRIFT_MAX = 14;
/** Orbit, cycles per second (slow). */
export const FRAG_ORBIT_HZ = 0.3;
/** Shard spin on top of the orbit, radians per orbit cycle. */
const FRAG_SPIN = 3;
/** Seconds to drift fully out when the core opens, and to reassemble when it shuts. */
export const FRAG_OPEN_SEC = 0.2;
export const FRAG_CLOSE_SEC = 0.3;
/** Golden ratio step: spreads the per fragment drift through the range without a PRNG. */
const GOLDEN = 0.6180339887;

/** Pure: fragment count for a boss tier. */
export function fragmentCount(tier: number): number {
  if (tier >= 4) return FRAG_COUNT_TOP;
  if (tier >= 3) return FRAG_COUNT_T3;
  return FRAG_COUNT;
}

/** Pure: fully spread drift distance of fragment k, in [FRAG_DRIFT_MIN, FRAG_DRIFT_MAX). */
export function fragmentDrift(k: number): number {
  const u = (Number.isFinite(k) ? k : 0) * GOLDEN + 0.25;
  return FRAG_DRIFT_MIN + (FRAG_DRIFT_MAX - FRAG_DRIFT_MIN) * (u - Math.floor(u));
}

/** Pure: fragment radius as a share of the core radius, so the pieces add up to about the core. */
export function fragmentSizeFrac(n: number): number {
  return 0.85 / Math.sqrt(Math.max(1, Number.isFinite(n) ? n : 1));
}

/**
 * Pure: advance the spread (0 assembled, 1 fully out): up over FRAG_OPEN_SEC while exposed, down
 * over FRAG_CLOSE_SEC after. Linear in time; fragmentEase shapes it.
 */
export function stepSpread(spread: number, exposed: boolean, dt: number): number {
  const s = Number.isFinite(spread) ? spread : 0;
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  return clampNum(exposed ? s + d / FRAG_OPEN_SEC : s - d / FRAG_CLOSE_SEC, 0, 1);
}

/** Pure: smoothstep of the spread, so the pieces leave and return without a jolt. */
export function fragmentEase(spread: number): number {
  const s = clampNum(Number.isFinite(spread) ? spread : 0, 0, 1);
  return s * s * (3 - 2 * s);
}

/** Pure: angle of fragment k of n at an orbit phase (cycles): evenly spaced, turning together. */
export function fragmentAngle(k: number, n: number, orbit: number): number {
  const u = k / Math.max(1, n) + (Number.isFinite(orbit) ? orbit : 0);
  return (u - Math.floor(u)) * Math.PI * 2;
}

/** Pure: offset of fragment k of n from the core centre at an eased spread and orbit phase. */
export function fragmentOffset(k: number, n: number, ease: number, orbit: number, out: Offset): Offset {
  const a = fragmentAngle(k, n, orbit);
  const r = fragmentDrift(k) * clampNum(Number.isFinite(ease) ? ease : 0, 0, 1);
  out.x = Math.cos(a) * r;
  out.y = Math.sin(a) * r;
  return out;
}

/** Everything the planner needs for one frame of the cue. */
export interface ExposeInput {
  /** Core centre, shake already applied. */
  x: number;
  y: number;
  /** Drawn core radius, arena units. */
  coreR: number;
  /** Pulse level 0 to 1 (exposePulse). */
  pulse: number;
  /** Spread 0 to 1 (stepSpread); the centre glow fades with it as the core reassembles. */
  spread: number;
  /** Orbit phase in cycles. */
  orbit: number;
  /** Fragment count (fragmentCount), clamped to 1 to FRAG_MAX. */
  count: number;
  /** Body alpha (fades the cue with the body). */
  alpha: number;
  /** Fragment and glow colour, 0xRRGGBB. */
  hot: number;
}

const frag: Offset = { x: 0, y: 0 };

/** Most instances one cue writes: the centre glow, then per fragment a glow, a halo and a shard. */
export const EXPOSE_MAX_INSTANCES = 1 + 3 * FRAG_MAX;

/** Pure on the buffer: write the broken core cue. Returns the number of instances written. */
export function planBossExpose(e: ExposeInput, b: SpriteBuf, halo: Readonly<FxHalo>): number {
  const a = clampNum(Number.isFinite(e.alpha) ? e.alpha : 0, 0, 1);
  if (!(a > 0) || !(e.coreR > 0)) return 0;
  const p = clampNum(Number.isFinite(e.pulse) ? e.pulse : 0, 0, 1);
  const s = clampNum(Number.isFinite(e.spread) ? e.spread : 0, 0, 1);
  const orbit = Number.isFinite(e.orbit) ? e.orbit : 0;
  const ease = fragmentEase(s);
  const n = clampNum(Math.round(Number.isFinite(e.count) ? e.count : FRAG_COUNT), 1, FRAG_MAX);
  const d = 2 * e.coreR;
  let w = 0;
  // Centre glow breathing at the pulse rate where the core was, so the target still reads.
  const gd = d * (1.8 + 0.8 * p);
  if (pushSprite(b, F_GLOW, e.x, e.y, 0, gd, gd, a * (0.25 + 0.5 * p) * (0.4 + 0.6 * s), e.hot)) w++;
  // Shards: a soft glow and a short spinning bar each, throbbing with the pulse.
  const rf = e.coreR * fragmentSizeFrac(n) * (1 + 0.15 * p);
  const half = rf * 1.1;
  const thick = rf * 1.2;
  const fa = a * (0.75 + 0.25 * p);
  for (let k = 0; k < n; k++) {
    fragmentOffset(k, n, ease, orbit, frag);
    const cx = e.x + frag.x;
    const cy = e.y + frag.y;
    if (pushSprite(b, F_GLOW, cx, cy, 0, rf * 3, rf * 3, fa * 0.5, e.hot)) w++;
    const spin = fragmentAngle(k, n, orbit) + orbit * FRAG_SPIN + k;
    const hx = Math.cos(spin) * half;
    const hy = Math.sin(spin) * half;
    w += pushLine(b, cx - hx, cy - hy, cx + hx, cy + hy, thick, fa, e.hot, halo);
  }
  return w;
}

/** White share mixed into the palette yellow for the hot core fragments. */
export const EXPOSE_HOT_WHITE = 0.45;

/** Sprite capacity of the cue layer (one boss at a time, with headroom). */
export const EXPOSE_SPRITE_CAP = 32;

// Boss adds (summoned through spawnAdd): a hostile look so they read as a threat, not scenery.

/** Share of the hostile hue mixed into an add's own colour. */
export const ADD_HUE_MIX = 0.6;
/** Angry pulse: rate, scale amplitude and glow boost. */
export const ADD_PULSE_HZ = 3.2;
export const ADD_PULSE_SCALE = 0.16;
export const ADD_GLOW_BASE = 1.25;
export const ADD_GLOW_PULSE = 0.6;

/** Pure: angry pulse level 0 to 1 at a time, a sharp beat (squared sine) with a per add phase. */
export function addPulse(timeSec: number, seed: number): number {
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  const s = Math.sin((t * ADD_PULSE_HZ + (Number.isFinite(seed) ? seed : 0)) * Math.PI * 2);
  return s > 0 ? s * s : 0;
}

/** Pure: add scale multiplier at a pulse level. */
export function addScale(pulse: number): number {
  return 1 + ADD_PULSE_SCALE * clampNum(pulse, 0, 1);
}

/** Pure: add glow multiplier at a pulse level. */
export function addGlow(pulse: number): number {
  return ADD_GLOW_BASE + ADD_GLOW_PULSE * clampNum(pulse, 0, 1);
}
