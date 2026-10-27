// Unscored removal of any non ship entity, keeping Swarm's side tables consistent: a snake head
// takes its segments with it and frees its path slot, a well leaves the well list, the drone
// clears droneId.
import { gs, SNAKE_SEGMENTS } from './state';
import { Kind, kill, type World } from './world';

export function removeEntity(w: World, id: number): void {
  if (id <= 0 || id >= w.cap || w.alive[id] !== 1) return;
  const g = gs(w);
  const k = w.kind[id] ?? 0;
  if (k === Kind.SnakeHead) {
    const slot = w.a[id] ?? -1;
    if (slot >= 0 && slot < g.snakeHead.length && g.snakeHead[slot] === id) {
      for (let s = 0; s < SNAKE_SEGMENTS; s++) {
        const sid = g.snakeSegs[slot * SNAKE_SEGMENTS + s] ?? -1;
        if (sid > 0 && w.alive[sid] === 1 && w.kind[sid] === Kind.SnakeBody && w.a[sid] === id) kill(w, sid);
        g.snakeSegs[slot * SNAKE_SEGMENTS + s] = -1;
      }
      g.snakeHead[slot] = -1;
    }
  } else if (k === Kind.GravityWell) {
    let n = 0;
    for (let i = 0; i < g.wellCount; i++) {
      const wid = g.wellIds[i] ?? -1;
      if (wid !== id) g.wellIds[n++] = wid;
    }
    for (let i = n; i < g.wellIds.length; i++) g.wellIds[i] = -1;
    g.wellCount = n;
  } else if (k === Kind.Drone) {
    if (g.droneId === id) g.droneId = -1;
  }
  g.tele[id] = 0;
  kill(w, id);
}
