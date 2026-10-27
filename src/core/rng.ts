// Seeded randomness for Shape of War. The only file allowed to touch Math.random or crypto.
// Level content uses mulberry32 streams (docs/02 section 2). Cosmetic runtime variation uses
// the stateless hash01. Everything here except freshSeed is pure.
export type Rng = () => number; // uniform [0,1)

/** mulberry32: returns a function yielding floats in [0, 1). Integer only, exact across engines. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** murmur3 finaliser: avalanche a 32-bit integer. Returns a uint32. */
export function fmix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * 32-bit mix, deterministic. SPEC 3.2: level n seed derives from the run seed plus n.
 * Same formula as levelSeed in docs/02 section 2, so deriveSeed(0x4E464F4C, 1) === 0x229578A8.
 */
export function deriveSeed(runSeed: number, index: number): number {
  return fmix32((runSeed + index) >>> 0);
}

/** Independent stream per generator stage (docs/02 section 2). */
export function streamSeed(seed: number, salt: number): number {
  return fmix32((seed ^ salt) >>> 0);
}

/** Stateless hash to [0, 1) for runtime cosmetic variation (docs/01 section 6.1, docs/02 section 2). */
export function hash01(a: number, b = 0): number {
  return fmix32(Math.imul(a >>> 0, 0x9e3779b1) ^ fmix32((b + 0x7f4a7c15) >>> 0)) / 4294967296;
}

/** Inclusive integer range. Assumes minIncl <= maxIncl, both integers. */
export function rngInt(r: Rng, minIncl: number, maxIncl: number): number {
  return minIncl + Math.floor(r() * (maxIncl - minIncl + 1));
}

/**
 * Pick one item. Uniform without weights, otherwise proportional to weights (non negative,
 * same length as items; missing or negative weights count as 0). Throws on an empty list.
 */
export function rngPick<T>(r: Rng, items: readonly T[], weights?: readonly number[]): T {
  const n = items.length;
  if (n === 0) throw new Error('rngPick: empty items');
  if (weights === undefined) {
    return items[Math.min(n - 1, Math.floor(r() * n))] as T;
  }
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.max(0, weights[i] ?? 0);
  let x = r() * total;
  for (let i = 0; i < n; i++) {
    x -= Math.max(0, weights[i] ?? 0);
    if (x < 0) return items[i] as T;
  }
  return items[n - 1] as T;
}

/** The only entropy source in the codebase: new run seeds and Endless seeds (docs/01 section 2.2). */
export function freshSeed(): number {
  try {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return (buf[0] ?? 0) >>> 0;
  } catch {
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }
}
