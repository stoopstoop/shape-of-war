// Bus payloads for audio and fx (docs/10 plan, Chorus and Glow requests): 'fx:kill' carries the
// kind and id of whatever died, 'fx:hit' reports damage that did not kill and Bulwark shield
// blocks. Additive only: x, y and colour keep their meaning.
import { afterEach, describe, expect, it } from 'vitest';
import { bus, type Events } from '../../src/core/events';
import { armPierce, spawnBullet } from '../../src/game/bullets';
import { bulletHits, damage, killEnemy, orbitHits } from '../../src/game/combat';
import * as blink from '../../src/game/enemies/blink';
import * as bulwark from '../../src/game/enemies/bulwark';
import * as charger from '../../src/game/enemies/charger';
import * as dart from '../../src/game/enemies/dart';
import * as grunt from '../../src/game/enemies/grunt';
import * as well from '../../src/game/enemies/gravitywell';
import * as mine from '../../src/game/enemies/mine';
import * as pinwheel from '../../src/game/enemies/pinwheel';
import * as snake from '../../src/game/enemies/snake';
import * as sower from '../../src/game/enemies/sower';
import * as spawnerEnemy from '../../src/game/enemies/spawner';
import * as splime from '../../src/game/enemies/splime';
import * as swirl from '../../src/game/enemies/swirl';
import type { EnemyDef } from '../../src/game/enemies/types';
import * as wanderer from '../../src/game/enemies/wanderer';
import * as weaver from '../../src/game/enemies/weaver';
import { createGame, stepGame } from '../../src/game/game';
import { triggerBomb } from '../../src/game/player';
import { gs, SNAKE_SEGMENTS } from '../../src/game/state';
import { BLADE_COOLDOWN, equipWeapon, ORBIT_RADIUS } from '../../src/game/weapons';
import { Kind, type World } from '../../src/game/world';
import type { InputState } from '../../src/input/types';
import type { EnemyKind, LevelDef, SpawnEntry, WaveDef } from '../../src/levelgen/leveldef';
import { DT, idle, makeGame, put, quietLevel } from './helpers';

afterEach(() => bus.clear());

type KillRec = Events['fx:kill'];
type HitRec = Events['fx:hit'];

/** Subscribe to both events, copying fields because the sim reuses the payload objects. */
function record(): { kills: KillRec[]; hits: HitRec[] } {
  const kills: KillRec[] = [];
  const hits: HitRec[] = [];
  bus.on('fx:kill', (p) => kills.push({ x: p.x, y: p.y, colour: p.colour, kind: p.kind, id: p.id }));
  bus.on('fx:hit', (p) => hits.push({ x: p.x, y: p.y, kind: p.kind, id: p.id, blocked: p.blocked }));
  return { kills, hits };
}

function addWell(w: World, x: number, y: number): number {
  const id = put(w, well.def, x, y);
  const g = gs(w);
  g.wellIds[g.wellCount++] = id;
  return id;
}

describe('fx:kill payload', () => {
  const defs: readonly EnemyDef[] = [
    grunt.def,
    wanderer.def,
    weaver.def,
    pinwheel.def,
    dart.def,
    spawnerEnemy.def,
    charger.def,
    bulwark.def,
    blink.def,
    swirl.def,
    sower.def,
    splime.def,
    well.def,
  ];

  it('every scored kill carries the def kind, the entity id, its colour and position', () => {
    for (const def of defs) {
      const { w } = makeGame();
      const { kills, hits } = record();
      const id = put(w, def, 240, -130);
      killEnemy(w, id, true);
      expect(kills, 'kind ' + String(def.kind)).toEqual([{ x: 240, y: -130, colour: def.colour, kind: def.kind, id }]);
      expect(hits).toEqual([]);
      bus.clear();
    }
  });

  it('a shot Mine pop is Kind.Mine, so it no longer hides behind the Sower colour', () => {
    const { w } = makeGame();
    const { kills } = record();
    const m = put(w, mine.def, 200, 0);
    const s = put(w, sower.def, -200, 0);
    spawnBullet(w.bullets, 200, 0, 0, 0, 1);
    bulletHits(w);
    killEnemy(w, s, true);
    expect(kills).toHaveLength(2);
    expect(kills[0]).toEqual({ x: 200, y: 0, colour: 'sower', kind: Kind.Mine, id: m });
    expect(kills[1]).toEqual({ x: -200, y: 0, colour: 'sower', kind: Kind.Sower, id: s });
    expect(kills[0]?.colour).toBe(kills[1]?.colour);
    expect(kills[0]?.kind).not.toBe(kills[1]?.kind);
  });

  it('a Snake head death bursts one SnakeBody kill per segment, then the head kill', () => {
    const { w } = makeGame();
    const { kills } = record();
    const head = snake.spawnSnake(w, 400, 300, 0);
    const g = gs(w);
    const slot = w.a[head] ?? -1;
    const segs: number[] = [];
    for (let s = 0; s < SNAKE_SEGMENTS; s++) segs.push(g.snakeSegs[slot * SNAKE_SEGMENTS + s] ?? -1);
    const at = segs.map((sid) => ({ x: w.x[sid] ?? 0, y: w.y[sid] ?? 0 }));
    killEnemy(w, head, true);
    expect(kills).toHaveLength(SNAKE_SEGMENTS + 1);
    kills.slice(0, SNAKE_SEGMENTS).forEach((k, i) => {
      expect(k).toEqual({ x: at[i]?.x, y: at[i]?.y, colour: 'cyan', kind: Kind.SnakeBody, id: segs[i] });
    });
    expect(kills[SNAKE_SEGMENTS]).toEqual({ x: 400, y: 300, colour: 'cyan', kind: Kind.SnakeHead, id: head });
  });

  it('a Gravity well shot down and a Gravity well exploding both report Kind.GravityWell and the well id', () => {
    const shot = makeGame().w;
    const a = record();
    const wa = addWell(shot, 400, 0);
    shot.hp[wa] = 1;
    spawnBullet(shot.bullets, 400, 0, 0, 0, 1);
    well.stepWells(shot, DT);
    expect(a.kills).toEqual([{ x: 400, y: 0, colour: 'red', kind: Kind.GravityWell, id: wa }]);
    bus.clear();

    const boom = makeGame().w;
    const b = record();
    const wb = addWell(boom, -400, 100);
    put(boom, grunt.def, -380, 100); // cleared without score: no kill event of its own
    well.explode(boom, wb);
    expect(b.kills).toEqual([{ x: -400, y: 100, colour: 'red', kind: Kind.GravityWell, id: wb }]);
  });

  it('unscored removal (bomb, killEnemy false) emits neither event', () => {
    const { w } = makeGame();
    const { kills, hits } = record();
    const id = put(w, grunt.def, 300, 0);
    put(w, sower.def, -300, 0);
    put(w, mine.def, 0, 300);
    killEnemy(w, id, false);
    expect(triggerBomb(w)).toBe(true);
    expect(kills).toEqual([]);
    expect(hits).toEqual([]);
  });

  it('still fires the explode sfx after the kill, as audio and render expect', () => {
    const { w } = makeGame();
    const order: string[] = [];
    bus.on('fx:kill', () => order.push('kill'));
    bus.on('sfx', (n) => order.push(n));
    killEnemy(w, put(w, grunt.def, 200, 0), true);
    expect(order).toEqual(['kill', 'explode']);
  });
});

describe('fx:hit payload', () => {
  it('a multi HP enemy taking a bullet emits one non blocked hit at the bullet, then dies with a kill and no hit', () => {
    const { w } = makeGame();
    const { kills, hits } = record();
    const id = put(w, pinwheel.def, 200, 0);
    spawnBullet(w.bullets, 203, 4, 0, 0, 1);
    bulletHits(w);
    expect(w.hp[id]).toBe(1);
    expect(hits).toEqual([{ x: 203, y: 4, kind: Kind.Pinwheel, id, blocked: false }]);
    expect(kills).toEqual([]);
    spawnBullet(w.bullets, 198, -3, 0, 0, 1);
    bulletHits(w);
    expect(hits).toHaveLength(1);
    expect(kills).toEqual([{ x: 200, y: 0, colour: 'magenta', kind: Kind.Pinwheel, id }]);
  });

  it('a one HP enemy dies on the first bullet: a kill and no hit', () => {
    const { w } = makeGame();
    const { kills, hits } = record();
    put(w, grunt.def, 200, 0);
    spawnBullet(w.bullets, 200, 0, 0, 0, 1);
    bulletHits(w);
    expect(hits).toEqual([]);
    expect(kills).toHaveLength(1);
  });

  it('a Snake head (6 HP) reports hits with its own kind', () => {
    const { w } = makeGame();
    const { hits } = record();
    const head = snake.spawnSnake(w, 400, 0, 0);
    put(w, grunt.def, 900, 900); // put() refreshes the grid so the bullet finds the head
    spawnBullet(w.bullets, 400, 0, 0, 0, 1);
    bulletHits(w);
    expect(w.hp[head]).toBe(5);
    expect(hits).toEqual([{ x: 400, y: 0, kind: Kind.SnakeHead, id: head, blocked: false }]);
  });

  it('a Bulwark shield block is blocked true at the bullet with no damage; side and rear hits are not blocked', () => {
    const { w } = makeGame();
    const { kills, hits } = record();
    const id = put(w, bulwark.def, 300, 0);
    w.rot[id] = Math.PI; // shield faces the ship
    spawnBullet(w.bullets, 280, 0, 1400, 0, 1);
    bulletHits(w);
    expect(w.hp[id]).toBe(3);
    expect(hits).toEqual([{ x: 280, y: 0, kind: Kind.Bulwark, id, blocked: true }]);
    spawnBullet(w.bullets, 300, -20, 0, 1400, 1);
    bulletHits(w);
    spawnBullet(w.bullets, 320, 0, -1400, 0, 1);
    bulletHits(w);
    expect(w.hp[id]).toBe(1);
    expect(hits.slice(1)).toEqual([
      { x: 300, y: -20, kind: Kind.Bulwark, id, blocked: false },
      { x: 320, y: 0, kind: Kind.Bulwark, id, blocked: false },
    ]);
    expect(kills).toEqual([]);
    spawnBullet(w.bullets, 322, 0, -1400, 0, 1);
    bulletHits(w);
    expect(kills).toHaveLength(1);
    expect(kills[0]?.kind).toBe(Kind.Bulwark);
    expect(hits).toHaveLength(3);
  });

  it('a pierce bullet reports a hit per enemy it damages and a block when the shield stops it', () => {
    const { w } = makeGame();
    const { hits } = record();
    const a = put(w, pinwheel.def, 200, 0);
    const b = put(w, pinwheel.def, 206, 0);
    const bl = spawnBullet(w.bullets, 203, 0, 0, 0, 1);
    armPierce(w.bullets, bl);
    bulletHits(w);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.id).sort((p, q) => p - q)).toEqual([a, b].sort((p, q) => p - q));
    expect(hits.every((h) => h.kind === Kind.Pinwheel && !h.blocked)).toBe(true);

    bus.clear();
    const { w: w2 } = makeGame();
    const r2 = record();
    const shield = put(w2, bulwark.def, 300, 0);
    w2.rot[shield] = Math.PI;
    const pb = spawnBullet(w2.bullets, 282, 0, 0, 0, 1);
    armPierce(w2.bullets, pb);
    bulletHits(w2);
    expect(r2.hits).toEqual([{ x: 282, y: 0, kind: Kind.Bulwark, id: shield, blocked: true }]);
  });

  it('an orbit blade on the shield is blocked at the blade; on the back it is a plain hit', () => {
    const { w } = makeGame();
    equipWeapon(w, 'orbit'); // blade 0 sits at (ORBIT_RADIUS, 0)
    const { hits } = record();
    const id = put(w, bulwark.def, ORBIT_RADIUS + 20, 0);
    w.rot[id] = Math.PI;
    orbitHits(w, DT);
    expect(w.hp[id]).toBe(3);
    expect(hits).toEqual([{ x: ORBIT_RADIUS, y: 0, kind: Kind.Bulwark, id, blocked: true }]);
    w.rot[id] = 0; // turned away: the blade now meets the rear
    orbitHits(w, BLADE_COOLDOWN + 0.01);
    expect(w.hp[id]).toBe(2);
    expect(hits).toHaveLength(2);
    expect(hits[1]).toEqual({ x: ORBIT_RADIUS, y: 0, kind: Kind.Bulwark, id, blocked: false });
  });

  it('a Gravity well taking bullets reports a hit per bullet, with no rate limit in the sim', () => {
    const { w } = makeGame();
    const { kills, hits } = record();
    const id = addWell(w, 400, 0);
    for (let i = 0; i < 6; i++) spawnBullet(w.bullets, 400 + i, 0, 0, 0, 1);
    well.stepWells(w, DT);
    expect(w.hp[id]).toBe(34);
    expect(hits).toHaveLength(6);
    expect(hits.map((h) => h.x)).toEqual([400, 401, 402, 403, 404, 405]);
    expect(hits.every((h) => h.kind === Kind.GravityWell && h.id === id && !h.blocked && h.y === 0)).toBe(true);
    expect(kills).toEqual([]);
  });

  it('damage() (drone ram path) hits at the target centre and a lethal call kills with no hit', () => {
    const { w } = makeGame();
    const { kills, hits } = record();
    const id = put(w, pinwheel.def, 150, 90);
    expect(damage(w, id, 1)).toBe(false);
    expect(hits).toEqual([{ x: 150, y: 90, kind: Kind.Pinwheel, id, blocked: false }]);
    expect(damage(w, id, 5)).toBe(true);
    expect(hits).toHaveLength(1);
    expect(kills).toHaveLength(1);
  });

  it('snake segments and the ship emit nothing from damage()', () => {
    const { w } = makeGame();
    const { kills, hits } = record();
    const head = snake.spawnSnake(w, 400, 300, 0);
    const seg = gs(w).snakeSegs[(w.a[head] ?? 0) * SNAKE_SEGMENTS] ?? -1;
    expect(damage(w, seg, 3)).toBe(false);
    expect(damage(w, 0, 3)).toBe(false);
    expect(hits).toEqual([]);
    expect(kills).toEqual([]);
  });

  it('listening changes nothing: hp, score and kills match a run with no listeners', () => {
    const run = (listen: boolean): [number, number, number] => {
      const { w } = makeGame();
      if (listen) record();
      const id = put(w, bulwark.def, 300, 0);
      w.rot[id] = Math.PI;
      for (const [x, y] of [[280, 0], [300, -20], [320, 0], [321, 0]] as const) {
        spawnBullet(w.bullets, x, y, 0, 0, 1);
        bulletHits(w);
      }
      return [w.hp[id] ?? 0, gs(w).score, gs(w).kills];
    };
    expect(run(true)).toEqual(run(false));
  });
});

const KINDS: EnemyKind[] = ['pinwheel', 'bulwark', 'charger', 'snake', 'grunt', 'sower', 'splime'];

function fxLevel(seed: number): LevelDef {
  const waves: WaveDef[] = [];
  for (let i = 0; i < 12; i++) {
    const entries: SpawnEntry[] = [];
    for (let j = 0; j < 4; j++) {
      const ring = j % 2 === 0;
      entries.push({
        kind: KINDS[(i + j) % KINDS.length] ?? 'grunt',
        tOffsetSec: j * 0.25,
        mode: ring ? 'ring' : 'fixed',
        x: ring ? 0 : -300 + j * 200,
        y: ring ? 0 : (i % 2 === 0 ? -250 : 250),
        angleDeg: ring ? (i * 47 + j * 90) % 360 : 0,
        radius: ring ? 320 : 0,
        headingDeg: (i * 31) % 360,
      });
    }
    waves.push({ index: i, atSec: 1 + i * 4, pattern: 'ring', entries });
  }
  const base = quietLevel();
  return {
    ...base,
    seed,
    lives: 99,
    roster: KINDS.map((kind) => ({ kind, weight: 1 })),
    objective: { kind: 'survive', durationSec: 600 },
    waves: { ...base.waves, maxLiveEnemies: 40, waves, loopFromIndex: 0, loopPeriodSec: 48 },
  };
}

function inputAt(i: number, out: InputState): InputState {
  const t = i * DT;
  out.move.active = true;
  out.move.x = Math.cos(t * 0.7) * 0.9;
  out.move.y = Math.sin(t * 1.1) * 0.9;
  out.aim.active = true;
  out.aim.x = Math.cos(t * 2.3);
  out.aim.y = Math.sin(t * 2.3);
  out.bomb = false;
  out.superPressed = false;
  return out;
}

function playLog(seed: number): string[] {
  const log: string[] = [];
  bus.on('fx:kill', (e) => log.push(['kill', e.x.toFixed(3), e.y.toFixed(3), e.colour, e.kind, e.id].join(' ')));
  bus.on('fx:hit', (e) => log.push(['hit', e.x.toFixed(3), e.y.toFixed(3), e.kind, e.id, e.blocked].join(' ')));
  const w = createGame(fxLevel(seed), { vibrate: () => undefined });
  const input = idle();
  for (let i = 0; i < 40 * 120; i++) stepGame(w, DT, inputAt(i, input));
  bus.clear();
  return log;
}

describe('determinism', () => {
  it('the same LevelDef and input log give an identical kill and hit log, kinds and ids included', () => {
    const a = playLog(42);
    const b = playLog(42);
    expect(a.filter((e) => e.startsWith('kill')).length).toBeGreaterThan(10);
    expect(a.filter((e) => e.startsWith('hit')).length).toBeGreaterThan(10);
    expect(a).toEqual(b);
    // The run exercises both Bulwark outcomes and a kill for more than one kind.
    const bulwarkHit = (blocked: boolean): boolean =>
      a.some((e) => e.startsWith('hit') && e.split(' ')[3] === String(Kind.Bulwark) && e.endsWith(String(blocked)));
    expect(bulwarkHit(true)).toBe(true);
    expect(bulwarkHit(false)).toBe(true);
    const killKinds = new Set(a.filter((e) => e.startsWith('kill')).map((e) => e.split(' ')[4]));
    expect(killKinds.size).toBeGreaterThan(3);
  });
});
