// Space physics: thrust based ship motion (docs/11 "Space physics", docs/10 "Wave V2-A").
// Pure, no allocation per call, no PRNG. Every tuning number lives in SPACE_TABLE so the GA
// retune is a one file edit.

export type SpaceLevel = 'off' | 'low' | 'medium' | 'high';
export type ThrustLevel = Exclude<SpaceLevel, 'off'>;

export interface ThrustRow {
  /** Acceleration at the start of a hold, u/s^2. */
  readonly aMin: number;
  /** Growth time constant of the acceleration, s. */
  readonly tau: number;
  /** Acceleration ceiling, u/s^2. */
  readonly aMax: number;
  /** Speed cap, u/s. */
  readonly vMax: number;
  /** Drag rate while the stick is released, 1/s. */
  readonly drag: number;
  /** Acceleration multiplier while thrusting against the velocity. */
  readonly brake: number;
}

export const SPACE_TABLE: Readonly<Record<ThrustLevel, ThrustRow>> = {
  low: { aMin: 1200, tau: 0.6, aMax: 2400, vMax: 420, drag: 4, brake: 2.5 },
  medium: { aMin: 800, tau: 0.8, aMax: 2000, vMax: 460, drag: 2.5, brake: 2.0 },
  high: { aMin: 500, tau: 1.0, aMax: 1800, vMax: 520, drag: 1.2, brake: 1.6 },
};

/** Below this speed a released (drifting) ship stops dead, u/s. */
export const COAST_SNAP_SPEED = 3;

export interface ThrustOut {
  vx: number;
  vy: number;
  holdT: number;
}

export function createThrustOut(): ThrustOut {
  return { vx: 0, vy: 0, holdT: 0 };
}

/** Thrust acceleration magnitude after holdT seconds of continuous hold, before brake assist. */
export function thrustAccel(row: ThrustRow, holdT: number): number {
  const a = row.aMin * Math.exp(holdT / row.tau);
  return a < row.aMax ? a : row.aMax;
}

/**
 * One sim step of thrust physics. dir is the stick vector with magnitude already capped at 1
 * (not normalised below 1, so half deflection gives half thrust). slowFactor scales the speed
 * cap (1 when no slow is active). Level 'off' passes the velocity through and clears holdT;
 * the ship owns the v1 path for off. Writes vx, vy and holdT into out and returns out.
 */
export function stepThrust(
  level: SpaceLevel,
  vx: number,
  vy: number,
  dirX: number,
  dirY: number,
  held: boolean,
  holdT: number,
  dt: number,
  slowFactor: number,
  out: ThrustOut,
): ThrustOut {
  if (level === 'off') {
    out.vx = vx;
    out.vy = vy;
    out.holdT = 0;
    return out;
  }
  const row = SPACE_TABLE[level];
  if (held) {
    const t = holdT + dt;
    let a = thrustAccel(row, t);
    if (dirX * vx + dirY * vy < 0) a *= row.brake;
    let nx = vx + a * dirX * dt;
    let ny = vy + a * dirY * dt;
    const cap = row.vMax * slowFactor;
    const s2 = nx * nx + ny * ny;
    if (s2 > cap * cap) {
      const k = cap > 0 ? cap / Math.sqrt(s2) : 0;
      nx *= k;
      ny *= k;
    }
    out.vx = nx;
    out.vy = ny;
    out.holdT = t;
    return out;
  }
  const k = Math.exp(-row.drag * dt);
  let nx = vx * k;
  let ny = vy * k;
  if (nx * nx + ny * ny < COAST_SNAP_SPEED * COAST_SNAP_SPEED) {
    nx = 0;
    ny = 0;
  }
  out.vx = nx;
  out.vy = ny;
  out.holdT = 0;
  return out;
}
