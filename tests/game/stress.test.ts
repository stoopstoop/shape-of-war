import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { hash01 } from '../../src/core/rng';
import * as dart from '../../src/game/enemies/dart';
import * as grunt from '../../src/game/enemies/grunt';
import * as well from '../../src/game/enemies/gravitywell';
import * as pinwheel from '../../src/game/enemies/pinwheel';
import * as wanderer from '../../src/game/enemies/wanderer';
import * as weaver from '../../src/game/enemies/weaver';
import type { EnemyDef } from '../../src/game/enemies/types';
import { stepGame } from '../../src/game/game';
import { gs, spawnFromDef } from '../../src/game/state';
import { liveEnemies } from '../../src/game/world';
import { DT, idle, makeGame } from './helpers';

afterEach(() => bus.clear());

describe('400 live entities', () => {
  it('steps with bounded heap growth and stays fast', () => {
    const { w } = makeGame({ arena: { shape: 'rect', width: 1600, height: 1000, cornerRadius: 0, obstacles: [], spawnPoint: { x: 0, y: 0 } } });
    w.ship.invuln = 1e9;
    const defs: EnemyDef[] = [grunt.def, wanderer.def, weaver.def, pinwheel.def, dart.def];
    // Two wells far in corners: their direct loops run every step, but they barely feed.
    for (let i = 0; i < 2; i++) {
      const id = spawnFromDef(w, well.def, i === 0 ? -770 : 770, 470, 0);
      gs(w).wellIds[gs(w).wellCount++] = id;
    }
    for (let i = 0; i < 398; i++) {
      const d = defs[i % defs.length] ?? grunt.def;
      const x = (hash01(i, 1) - 0.5) * 1500;
      const y = (hash01(i, 2) - 0.5) * 900;
      const id = spawnFromDef(w, d, x, y, 0);
      if (d === wanderer.def) wanderer.init(w, id, i * 37);
      if (d === pinwheel.def) pinwheel.init(w, id, i * 53);
    }
    expect(liveEnemies(w)).toBe(400);
    const input = idle();
    for (let i = 0; i < 240; i++) stepGame(w, DT, input); // warm up the JIT
    const heap0 = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const steps = 1200;
    for (let i = 0; i < steps; i++) stepGame(w, DT, input);
    const ms = (performance.now() - t0) / steps;
    const grew = process.memoryUsage().heapUsed - heap0;
    console.log(`[stress] live ${liveEnemies(w)}, ${ms.toFixed(3)} ms/step, heap +${(grew / 1024).toFixed(0)} KiB`);
    expect(liveEnemies(w)).toBeGreaterThan(200); // wells eat some and may explode
    // Per entity allocation would be about 400 x 1200 x 32 bytes = 15 MB; allow GC noise.
    expect(grew).toBeLessThan(6 * 1024 * 1024);
    expect(ms).toBeLessThan(4);
  });
});
