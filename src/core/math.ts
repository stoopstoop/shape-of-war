// Small pure math helpers shared by sim, render and input.

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Angle of the vector in radians, atan2 convention. Arena y points down, so positive is clockwise on screen. */
export function angle(x: number, y: number): number {
  return Math.atan2(y, x);
}

const TAU = Math.PI * 2;

/** Wrap to the half open range (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  else if (r > Math.PI) r -= TAU;
  return r;
}

/** h in degrees (any value, wrapped), s and l in [0, 1]. Returns 0xRRGGBB. */
export function hslToRgbInt(h: number, s: number, l: number): number {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return (v << 16) | (v << 8) | v;
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const r = Math.round(hueToChannel(p, q, hh + 1 / 3) * 255);
  const g = Math.round(hueToChannel(p, q, hh) * 255);
  const b = Math.round(hueToChannel(p, q, hh - 1 / 3) * 255);
  return (r << 16) | (g << 8) | b;
}

function hueToChannel(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
