// Contract stub (docs/03-architecture.md section 1). Forge replaces every body in W1.
export type Rng = () => number; // uniform [0,1)

export function mulberry32(seed: number): Rng {
  throw new Error('stub');
}

// 32-bit mix, deterministic.
export function deriveSeed(runSeed: number, index: number): number {
  throw new Error('stub');
}

export function rngInt(r: Rng, minIncl: number, maxIncl: number): number {
  throw new Error('stub');
}

export function rngPick<T>(r: Rng, items: readonly T[], weights?: readonly number[]): T {
  throw new Error('stub');
}
