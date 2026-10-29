// Pure tier 2 boss effect planners (docs/12 wave V3-B Glow items 2 and 4). No pixi.js import. Each
// writes sprite instances into the hazard layer's SpriteBuf (fxSprites.ts): one pooled geometry, no
// allocation and no Graphics.clear per frame. The halo comes from fxHalo (applyNeon's settings), so
// both glow paths follow the neon slider. Line weight is the tier 2 multiplier (x2.0).
import { tierWeight } from './bossLook';
import { BOSS_LINE } from './bossShapes';
import { anchorSpokeAlpha, anchorTetherAlpha, EMBER_LANE_HALF, MIRAGE_ARC_HALF, mirageArcHalf, mirageWindowGlow } from './bossTier2';
import { clampNum } from './color';
import { HAZARD_LINE } from './hazardFx';
import { F_GLOW, pushArc, pushBand, pushLine, pushSprite, type FxHalo, type SpriteBuf } from './fxSprites';

const TIER2 = 2;

/** Ember lane: fill alpha share, rail and centre line thickness before the tier weight. */
export const EMBER_LANE_FILL = 0.14;
export const EMBER_LANE_RAIL = 0.6;

/**
 * Ember wind up lane glow from (x0, y0) along heading rot for len arena units at alpha: a
 * translucent band as wide as the dash sweeps, two rails, a centre line and an end bar where the
 * dash leg stops. Returns the instances written (0 at alpha 0 or a zero length).
 */
export function planEmberLane(
  b: SpriteBuf,
  x0: number,
  y0: number,
  rot: number,
  len: number,
  alpha: number,
  tint: number,
  halo: Readonly<FxHalo>,
): number {
  if (!(alpha > 0) || !(len > 1)) return 0;
  const dx = Math.cos(rot);
  const dy = Math.sin(rot);
  const x1 = x0 + dx * len;
  const y1 = y0 + dy * len;
  const nx = -dy * EMBER_LANE_HALF;
  const ny = dx * EMBER_LANE_HALF;
  const w = HAZARD_LINE * tierWeight(TIER2) * EMBER_LANE_RAIL;
  let n = pushBand(b, x0, y0, x1, y1, 2 * EMBER_LANE_HALF, alpha * EMBER_LANE_FILL, tint);
  n += pushLine(b, x0 + nx, y0 + ny, x1 + nx, y1 + ny, w, alpha * 0.8, tint, halo);
  n += pushLine(b, x0 - nx, y0 - ny, x1 - nx, y1 - ny, w, alpha * 0.8, tint, halo);
  n += pushLine(b, x0, y0, x1, y1, w * 1.3, alpha, tint, halo);
  n += pushLine(b, x1 + nx, y1 + ny, x1 - nx, y1 - ny, w * 1.6, alpha, tint, halo);
  return n;
}

/** Pure: chord count for an arc of radius r over span radians (about 10 u a chord, 2 to 24). */
export function arcChords(r: number, span: number): number {
  if (!(r > 0) || !(span > 0)) return 0;
  return clampNum(Math.ceil((r * span) / 10), 2, 24);
}

/**
 * Mirage open arc over the prebuilt shield ring (bossShapes.ts mirageShield, gap on the view's +x).
 * (x, y) is the drawn centre, r the shield radius, rot the arc centre angle. While the arc is not
 * fully open, the closed share of the gap is drawn in the shield colour (thick), so the ring reads
 * shut. The open share gets a thin bright shimmering window and a glint at each lip, so the opening
 * reads as the bright moving arc. windowTint is the shield colour mixed toward white by the caller.
 */
export function planMirageArc(
  b: SpriteBuf,
  x: number,
  y: number,
  r: number,
  rot: number,
  open: number,
  scale: number,
  tint: number,
  windowTint: number,
  alpha: number,
  timeSec: number,
  halo: Readonly<FxHalo>,
): number {
  if (!(r > 1) || !(alpha > 0)) return 0;
  const full = MIRAGE_ARC_HALF;
  const half = mirageArcHalf(open);
  const s = scale > 0 ? scale : 1;
  const thick = BOSS_LINE * tierWeight(TIER2) * s;
  let n = 0;
  const shut = full - half;
  if (shut > 1e-3) {
    n += pushArc(b, x, y, r, rot + half, shut, arcChords(r, shut), thick, alpha, tint, halo);
    n += pushArc(b, x, y, r, rot - full, shut, arcChords(r, shut), thick, alpha, tint, halo);
  }
  if (half > 1e-3) {
    const g = mirageWindowGlow(timeSec);
    n += pushArc(b, x, y, r, rot - half, 2 * half, arcChords(r, 2 * half), thick * 0.4, alpha * 0.45 * g, windowTint, halo);
    const gs = 16 * s;
    for (let k = -1; k <= 1; k += 2) {
      const a = rot + k * half;
      if (pushSprite(b, F_GLOW, x + Math.cos(a) * r, y + Math.sin(a) * r, 0, gs, gs, alpha * 0.7 * g, windowTint)) n++;
    }
  }
  return n;
}

/** Most anchors the tether planner joins (Gravitas has three; the cap is the part cap, 4). */
export const TETHER_ANCHORS_MAX = 4;

/**
 * Gravitas anchor tethers: a faint line between every pair of live anchors and a dimmer spoke from
 * each anchor to the core at (cx, cy). ax and ay hold n drawn anchor positions (n clamped to
 * TETHER_ANCHORS_MAX). Returns the instances written.
 */
export function planAnchorTethers(
  b: SpriteBuf,
  ax: ArrayLike<number>,
  ay: ArrayLike<number>,
  n: number,
  cx: number,
  cy: number,
  timeSec: number,
  tint: number,
  halo: Readonly<FxHalo>,
): number {
  const count = Math.max(0, Math.min(TETHER_ANCHORS_MAX, Math.floor(n), ax.length, ay.length));
  const ta = anchorTetherAlpha(count, timeSec);
  const sa = anchorSpokeAlpha(count, timeSec);
  const w = HAZARD_LINE * tierWeight(TIER2) * 0.5;
  let written = 0;
  for (let i = 0; i < count; i++) {
    const xi = ax[i] ?? 0;
    const yi = ay[i] ?? 0;
    if (sa > 0) written += pushLine(b, xi, yi, cx, cy, w * 0.7, sa, tint, halo);
    if (ta <= 0) continue;
    for (let j = i + 1; j < count; j++) written += pushLine(b, xi, yi, ax[j] ?? 0, ay[j] ?? 0, w, ta, tint, halo);
  }
  return written;
}
