// Snake: the head seeks the ship with a 120 deg/s turn cap plus a 40 deg, 1.2 Hz sine weave.
// 12 body segments follow the head's path at 18 u spacing from a per snake history buffer.
// Only the head takes damage; segments absorb bullets and kill the ship (docs/01 section 6.4).
// Head: w.a = snake slot, w.rot = drawn heading (base plus weave), w.vx and w.vy = travel
// velocity, w.t = seconds alive (0 = uninitialised).
// Segment: w.a = head id, aux = segment index.
import { wrapAngle } from '../../core/math';
import { removeEntity } from '../remove';
import { enemySpeedScale, gs, SNAKE_PATH, SNAKE_SEGMENTS, SNAKE_SLOTS, spawnFromDef } from '../state';
import { angleToShip, DEG, moveHeading, turnToward } from '../steer';
import { Kind, type World } from '../world';
import type { EnemyDef } from './types';

export const def: EnemyDef = { kind: Kind.SnakeHead, radius: 13, speed: 170, value: 200, colour: 'cyan', hp: 6, geoms: 4 };
export const segmentDef: EnemyDef = { kind: Kind.SnakeBody, radius: 9, speed: 0, value: 0, colour: 'cyan', hp: 0, geoms: 0 };

export const TURN_RATE = 120 * DEG;
export const WEAVE_AMP = 40 * DEG;
export const WEAVE_HZ = 1.2;
export const SPACING = 18;

/** Spawn a head plus 12 segments. Returns the head id, or -1 if no slot or not enough room. */
export function spawnSnake(w: World, x: number, y: number, tele: number): number {
  const g = gs(w);
  let slot = -1;
  for (let s = 0; s < SNAKE_SLOTS; s++) {
    if (g.snakeHead[s] === -1) {
      slot = s;
      break;
    }
  }
  if (slot < 0 || w.freeTop < SNAKE_SEGMENTS + 1) return -1;
  const head = spawnFromDef(w, def, x, y, tele);
  if (head < 0) return -1;
  w.a[head] = slot;
  g.snakeHead[slot] = head;
  const base = slot * SNAKE_PATH;
  for (let i = 0; i < SNAKE_PATH; i++) {
    g.pathX[base + i] = x;
    g.pathY[base + i] = y;
  }
  g.pathTop[slot] = 0;
  for (let s = 0; s < SNAKE_SEGMENTS; s++) {
    const sid = spawnFromDef(w, segmentDef, x, y, tele);
    g.snakeSegs[slot * SNAKE_SEGMENTS + s] = sid;
    if (sid < 0) continue;
    w.a[sid] = head;
    g.aux[sid] = s;
  }
  return head;
}

/** Place the slot's segments along its path history, SPACING apart, starting behind the head. */
export function placeSegments(w: World, head: number, slot: number): void {
  const g = gs(w);
  const base = slot * SNAKE_PATH;
  let idx = g.pathTop[slot] ?? 0;
  let px = g.pathX[base + idx] ?? 0;
  let py = g.pathY[base + idx] ?? 0;
  let walked = 0;
  let seg = 0;
  let want = SPACING;
  for (let n = 1; n < SNAKE_PATH && seg < SNAKE_SEGMENTS; n++) {
    idx = idx === 0 ? SNAKE_PATH - 1 : idx - 1;
    const qx = g.pathX[base + idx] ?? 0;
    const qy = g.pathY[base + idx] ?? 0;
    const dx = qx - px;
    const dy = qy - py;
    const d = Math.sqrt(dx * dx + dy * dy);
    while (seg < SNAKE_SEGMENTS && walked + d >= want) {
      const f = d > 1e-9 ? (want - walked) / d : 0;
      setSeg(w, g.snakeSegs[slot * SNAKE_SEGMENTS + seg] ?? -1, head, px + dx * f, py + dy * f);
      seg++;
      want += SPACING;
    }
    walked += d;
    px = qx;
    py = qy;
  }
  // History too short (fresh spawn): stack the rest on the oldest sample.
  for (; seg < SNAKE_SEGMENTS; seg++) setSeg(w, g.snakeSegs[slot * SNAKE_SEGMENTS + seg] ?? -1, head, px, py);
}

function setSeg(w: World, sid: number, head: number, x: number, y: number): void {
  if (sid <= 0 || w.alive[sid] !== 1 || w.kind[sid] !== Kind.SnakeBody || w.a[sid] !== head) return;
  w.rot[sid] = Math.atan2(y - (w.y[sid] ?? 0), x - (w.x[sid] ?? 0));
  w.x[sid] = x;
  w.y[sid] = y;
}

/** Weave offset in radians at t seconds alive. */
export function weave(t: number): number {
  return WEAVE_AMP * Math.sin(2 * Math.PI * WEAVE_HZ * t);
}

/** Base (seeking) heading from the drawn heading at t seconds alive. */
export function baseHeading(drawn: number, t: number): number {
  return t === 0 ? drawn : wrapAngle(drawn - weave(t));
}

export function step(w: World, id: number, dt: number): void {
  const g = gs(w);
  const slot = w.a[id] ?? -1;
  if (slot < 0 || slot >= SNAKE_SLOTS || g.snakeHead[slot] !== id) return;
  const target = angleToShip(w, id);
  let t = w.t[id] ?? 0;
  // w.rot holds the drawn direction (base heading plus weave); recover the base heading from it.
  let rot = t === 0 ? target : turnToward(baseHeading(w.rot[id] ?? 0, t), target, TURN_RATE * dt);
  t += Math.max(dt, 1e-6);
  w.t[id] = t;
  const dir = wrapAngle(rot + weave(t));
  rot = dir;
  w.rot[id] = rot;
  const speed = def.speed * enemySpeedScale(w);
  w.vx[id] = Math.cos(dir) * speed;
  w.vy[id] = Math.sin(dir) * speed;
  moveHeading(w, id, dir, speed, dt);
  const top = ((g.pathTop[slot] ?? 0) + 1) % SNAKE_PATH;
  g.pathTop[slot] = top;
  g.pathX[slot * SNAKE_PATH + top] = w.x[id] ?? 0;
  g.pathY[slot * SNAKE_PATH + top] = w.y[id] ?? 0;
  placeSegments(w, id, slot);
}

/** Segments are moved by their head; one whose head is gone removes itself. */
export function stepSegment(w: World, id: number, _dt: number): void {
  const head = w.a[id] ?? -1;
  if (head <= 0 || w.alive[head] !== 1 || w.kind[head] !== Kind.SnakeHead) removeEntity(w, id);
}
