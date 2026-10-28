// Shared arenas for the lattice tests.
import type { ArenaDef, ArenaShape } from '../../../src/levelgen/leveldef';

export function arena(shape: ArenaShape, width: number, height: number, extra: Partial<ArenaDef> = {}): ArenaDef {
  return {
    shape,
    width,
    height,
    cornerRadius: shape === 'roundRect' ? 160 : 0,
    obstacles: [],
    spawnPoint: { x: 0, y: 0 },
    ...extra,
  };
}

/** Every arena shape at the two sizes the brief names, 1800 x 1100 and 2400 x 2400. */
export function sweepArenas(): { name: string; a: ArenaDef }[] {
  const out: { name: string; a: ArenaDef }[] = [];
  for (const [w, h] of [
    [1800, 1100],
    [2400, 2400],
  ] as const) {
    out.push({ name: `rect ${w}x${h}`, a: arena('rect', w, h) });
    out.push({ name: `roundRect ${w}x${h}`, a: arena('roundRect', w, h) });
    out.push({ name: `hexagon ${w}x${h}`, a: arena('hexagon', w, h) });
    out.push({ name: `circle ${h}`, a: arena('circle', h, h) });
    out.push({
      name: `rectObstacles ${w}x${h}`,
      a: arena('rectObstacles', w, h, {
        obstacles: [
          { cx: -300, cy: 0, w: 120, h: 300 },
          { cx: 330, cy: -120, w: 260, h: 90 },
          { cx: 0, cy: 260, w: 75, h: 75 },
        ],
      }),
    });
  }
  return out;
}
