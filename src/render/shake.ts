// Pure screen shake (docs/01-game-design.md section 12). offset = amp x (remaining / dur)^2 in
// a direction from hash01(frame). Concurrent shakes take the max amplitude, never the sum.
// Hard cap 16 CSS px. Applied to the arena container only, never to the HUD.
import { hash01 } from './color';

export const SHAKE_CAP_PX = 16;
const MAX_SHAKES = 8;

export interface Shake {
  amp: number;
  dur: number;
  remaining: number;
}

export interface ShakeState {
  readonly list: Shake[];
  frame: number;
}

export function createShake(): ShakeState {
  return { list: [], frame: 0 };
}

function shakeAmp(k: Shake | undefined): number {
  if (!k || k.remaining <= 0) return 0;
  const f = k.remaining / k.dur;
  return k.amp * f * f;
}

/** Start a shake. When the list is full the weakest entry is replaced. */
export function addShake(s: ShakeState, amp: number, dur: number): void {
  if (!(amp > 0) || !(dur > 0)) return;
  const fresh: Shake = { amp, dur, remaining: dur };
  if (s.list.length < MAX_SHAKES) {
    s.list.push(fresh);
    return;
  }
  let weakest = 0;
  for (let i = 1; i < s.list.length; i++) {
    if (shakeAmp(s.list[i]) < shakeAmp(s.list[weakest])) weakest = i;
  }
  s.list[weakest] = fresh;
}

/** Pure: the current amplitude, max over active shakes, capped. */
export function currentAmplitude(s: ShakeState): number {
  let a = 0;
  for (const k of s.list) a = Math.max(a, shakeAmp(k));
  return Math.min(a, SHAKE_CAP_PX);
}

/** Advance by dt seconds and write this frame's offset in CSS px into out. */
export function stepShake(s: ShakeState, dt: number, out: { x: number; y: number }): void {
  for (let i = s.list.length - 1; i >= 0; i--) {
    const k = s.list[i];
    if (!k) continue;
    k.remaining -= Math.max(0, dt);
    if (k.remaining <= 0) s.list.splice(i, 1);
  }
  s.frame = (s.frame + 1) | 0;
  const a = currentAmplitude(s);
  if (a <= 0) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const ang = hash01(s.frame) * Math.PI * 2;
  out.x = Math.cos(ang) * a;
  out.y = Math.sin(ang) * a;
}
