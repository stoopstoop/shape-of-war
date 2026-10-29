// Pure boss weak point cue (G3A device feedback: "poorly indicated it was weak for shooting"). No
// pixi.js import. While a boss core takes damage (exposed) the core shifts to a hot white yellow,
// pulses at 4 Hz (8 Hz in the last 0.6 s of a known window), sheds a thin expanding ring, and a
// small "HIT" glyph with a chevron sits just above the body, pointing at the core. While not
// exposed the core stays dim and the shell keeps its colour (the prebuilt closed openness step).
// Exposure source, best first: the 'sim:bossExposed' event (Swarm, parallel run), then the sim's
// open flag (bossOpen in src/game/bosses/core.ts, read only), then the render contract mode.
// Everything is written into a SpriteBuf (fxSprites.ts): one pooled geometry, no allocation.
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
import { F_DOT, F_GLOW, pushArc, pushLine, pushSprite, type FxHalo, type SpriteBuf } from './fxSprites';

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

/** Expanding ring: one every EXPOSE_RING_SEC, from the core out to EXPOSE_RING_OUT body radii. */
export const EXPOSE_RING_SEC = 0.75;
export const EXPOSE_RING_OUT = 1.4;
export const EXPOSE_RING_ALPHA = 0.75;

export interface ExposeRing {
  r: number;
  alpha: number;
}

/** Pure: the ring at an exposure age, eased out, fading as it grows. */
export function exposeRing(age: number, coreR: number, bodyR: number, out: ExposeRing): ExposeRing {
  const t = Number.isFinite(age) && age > 0 ? age : 0;
  const u = (t % EXPOSE_RING_SEC) / EXPOSE_RING_SEC;
  const ease = 1 - (1 - u) * (1 - u);
  const r0 = Math.max(1, coreR);
  const r1 = Math.max(r0, bodyR * EXPOSE_RING_OUT);
  out.r = r0 + (r1 - r0) * ease;
  out.alpha = EXPOSE_RING_ALPHA * (1 - u);
  return out;
}

/** HIT cue: fades in fast, full for the first HIT_FULL_SEC of an exposure, then settles low. */
export const HIT_FADE_IN_SEC = 0.12;
export const HIT_FULL_SEC = 6;
export const HIT_SETTLE_SEC = 1;
export const HIT_SETTLED_ALPHA = 0.35;

/**
 * Pure: HIT cue alpha at an exposure age. An always open core (Spindle) keeps its pulsing core but
 * the glyph settles to HIT_SETTLED_ALPHA, so the cue stays news, not wallpaper.
 */
export function hitCueAlpha(age: number): number {
  const t = Number.isFinite(age) && age > 0 ? age : 0;
  const fadeIn = clampNum(t / HIT_FADE_IN_SEC, 0, 1);
  const settle = clampNum((t - HIT_FULL_SEC) / HIT_SETTLE_SEC, 0, 1);
  return fadeIn * (1 - (1 - HIT_SETTLED_ALPHA) * settle);
}

/**
 * HIT glyph strokes in letter units (cap height 1, y down), centred on x: H, I, T, then a chevron
 * below the letters pointing down at the core. Flat x0, y0, x1, y1 quadruples.
 */
export const HIT_STROKES: readonly number[] = [
  -0.95, 0, -0.95, 1, // H left
  -0.35, 0, -0.35, 1, // H right
  -0.95, 0.5, -0.35, 0.5, // H bar
  0, 0, 0, 1, // I
  0.35, 0, 0.95, 0, // T top
  0.65, 0, 0.65, 1, // T stem
  -0.3, 1.35, 0, 1.65, // chevron left
  0, 1.65, 0.3, 1.35, // chevron right
];
export const HIT_STROKE_COUNT = HIT_STROKES.length / 4;
/** Glyph cap height and stroke in arena units (readable on the cover screen at fit scale 0.3). */
export const HIT_CAP_U = 30;
export const HIT_STROKE_U = 4.5;
/** Gap between the body rim and the chevron tip, arena units. */
export const HIT_GAP_U = 10;
/** Lowest glyph point (the chevron tip) in letter units. */
export const HIT_TIP = 1.65;

/** Pure: top y of the HIT glyph above a body of radius bodyR centred at y (y down). */
export function hitGlyphTop(y: number, bodyR: number): number {
  return y - bodyR * 1.18 - HIT_GAP_U - HIT_TIP * HIT_CAP_U;
}

/** Everything the planner needs for one frame of the cue. */
export interface ExposeInput {
  x: number;
  y: number;
  /** Drawn core radius and body radius, arena units. */
  coreR: number;
  bodyR: number;
  /** Pulse level 0 to 1 (exposePulse). */
  pulse: number;
  /** Seconds since the core became exposed. */
  age: number;
  /** Body alpha (fades the cue with the body). */
  alpha: number;
  /** Hot core colour and the glyph colour, 0xRRGGBB. */
  hot: number;
  glyph: number;
}

const ring: ExposeRing = { r: 0, alpha: 0 };

/** Cue ring segment target length (arena units) and bounds, so a small ring stays round and cheap. */
export const EXPOSE_SEG_U = 24;
export const EXPOSE_SEG_MIN = 12;
export const EXPOSE_SEG_MAX = 32;

/** Pure: segments for the cue ring of radius r. */
export function exposeRingSegments(r: number): number {
  if (!(r > 0)) return 0;
  return clampNum(Math.ceil((r * Math.PI * 2) / EXPOSE_SEG_U), EXPOSE_SEG_MIN, EXPOSE_SEG_MAX);
}

/** Most instances one cue writes: glow, dot, ring (halo and core per segment), glyph strokes. */
export const EXPOSE_MAX_INSTANCES = 2 + 2 * EXPOSE_SEG_MAX + 2 * HIT_STROKE_COUNT;

/** Pure on the buffer: write the exposed core cue. Returns the number of instances written. */
export function planBossExpose(e: ExposeInput, b: SpriteBuf, halo: Readonly<FxHalo>): number {
  const a = clampNum(Number.isFinite(e.alpha) ? e.alpha : 0, 0, 1);
  if (!(a > 0) || !(e.coreR > 0)) return 0;
  const p = clampNum(e.pulse, 0, 1);
  const d = 2 * e.coreR;
  let n = 0;
  // Hot halo and disc over the white core: the halo breathes with the pulse, the disc throbs.
  const gd = d * (2.2 + 0.8 * p);
  if (pushSprite(b, F_GLOW, e.x, e.y, 0, gd, gd, a * (0.35 + 0.65 * p), e.hot)) n++;
  const dd = d * (1 + 0.15 * p);
  if (pushSprite(b, F_DOT, e.x, e.y, 0, dd, dd, a * (0.7 + 0.3 * p), e.hot)) n++;
  // Thin expanding ring.
  exposeRing(e.age, e.coreR, e.bodyR, ring);
  if (ring.alpha > 0.01) n += pushArc(b, e.x, e.y, ring.r, 0, Math.PI * 2, exposeRingSegments(ring.r), 1.8, a * ring.alpha, e.hot, halo);
  // HIT glyph and chevron above the body, pointing at the core.
  const ga = a * hitCueAlpha(e.age) * (0.7 + 0.3 * p);
  if (ga > 0.01) {
    const top = hitGlyphTop(e.y, e.bodyR);
    for (let k = 0; k < HIT_STROKE_COUNT; k++) {
      const x0 = HIT_STROKES[k * 4] ?? 0;
      const y0 = HIT_STROKES[k * 4 + 1] ?? 0;
      const x1 = HIT_STROKES[k * 4 + 2] ?? 0;
      const y1 = HIT_STROKES[k * 4 + 3] ?? 0;
      n += pushLine(b, e.x + x0 * HIT_CAP_U, top + y0 * HIT_CAP_U, e.x + x1 * HIT_CAP_U, top + y1 * HIT_CAP_U, HIT_STROKE_U, ga, e.glyph, halo);
    }
  }
  return n;
}

/** White share mixed into the palette yellow for the hot core, and for the HIT glyph. */
export const EXPOSE_HOT_WHITE = 0.45;
export const EXPOSE_GLYPH_WHITE = 0.7;

/** Sprite capacity of the cue layer (one boss at a time, with headroom). */
export const EXPOSE_SPRITE_CAP = 160;

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
