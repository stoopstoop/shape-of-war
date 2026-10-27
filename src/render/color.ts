// Pure colour helpers for the renderer. A local copy of hslToRgbInt so src/render compiles
// before Forge's src/core/math.ts merges. Fable may point neon.ts at core/math after W1.

/** Clamp v into [lo, hi]. */
export function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Linear interpolation. */
export function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** HSL (h in degrees, s and l in [0, 1]) to 0xRRGGBB. Channels are rounded. */
export function hslToRgbInt(h: number, s: number, l: number): number {
  const hh = (((h % 360) + 360) % 360) / 60;
  const ss = clampNum(s, 0, 1);
  const ll = clampNum(l, 0, 1);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to8 = (v: number): number => clampNum(Math.round((v + m) * 255), 0, 255);
  return (to8(r) << 16) | (to8(g) << 8) | to8(b);
}

/** Stateless hash of an integer to [0, 1). Visual variation only, never gameplay. */
export function hash01(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
