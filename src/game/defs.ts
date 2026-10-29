// Enemy def lookup by Kind and behaviour registration with Forge's world (registerBehaviour).
// Every registered step is wrapped so telegraphing entities only count down their telegraph.
import type { EnemyKind } from '../levelgen/leveldef';
import { registerBossBehaviours } from './bosses/index';
import * as blink from './enemies/blink';
import * as bulwark from './enemies/bulwark';
import * as charger from './enemies/charger';
import * as dart from './enemies/dart';
import * as grunt from './enemies/grunt';
import * as gravitywell from './enemies/gravitywell';
import * as mine from './enemies/mine';
import * as pinwheel from './enemies/pinwheel';
import * as snake from './enemies/snake';
import * as sower from './enemies/sower';
import * as spawnerEnemy from './enemies/spawner';
import * as swirl from './enemies/swirl';
import type { EnemyDef } from './enemies/types';
import * as wanderer from './enemies/wanderer';
import * as weaver from './enemies/weaver';
// Splime and Slime are imported last on purpose: cut 6 removes these lines cleanly.
import * as slime from './enemies/slime';
import * as splime from './enemies/splime';
import * as geoms from './geoms';
import * as pickup from './pickup';
import { gs } from './state';
import { Kind, registerBehaviour, type EntityStep, type World } from './world';

export function defOf(k: Kind): EnemyDef | null {
  switch (k) {
    case Kind.Grunt:
      return grunt.def;
    case Kind.Wanderer:
      return wanderer.def;
    case Kind.Weaver:
      return weaver.def;
    case Kind.Pinwheel:
      return pinwheel.def;
    case Kind.Dart:
      return dart.def;
    case Kind.SnakeHead:
      return snake.def;
    case Kind.SnakeBody:
      return snake.segmentDef;
    case Kind.GravityWell:
      return gravitywell.def;
    case Kind.Spawner:
      return spawnerEnemy.def;
    case Kind.Geom:
      return geoms.def;
    case Kind.Charger:
      return charger.def;
    case Kind.Bulwark:
      return bulwark.def;
    case Kind.Blink:
      return blink.def;
    case Kind.Swirl:
      return swirl.def;
    case Kind.Sower:
      return sower.def;
    case Kind.Mine:
      return mine.def;
    case Kind.Splime:
      return splime.def;
    case Kind.Slime:
      return slime.def;
    // V3 contract stubs (docs/12 V3-W0): no EnemyDef for a boss, its parts and hazards, a drone
    // pickup or the twin drone. Explicit so a later wave replaces a visible line, not the default.
    case Kind.Boss:
    case Kind.BossPart:
    case Kind.BossHazard:
    case Kind.DronePickup:
    case Kind.DroneTwin:
      return null;
    default:
      return null;
  }
}

export function kindOf(k: EnemyKind): Kind {
  switch (k) {
    case 'grunt':
      return Kind.Grunt;
    case 'wanderer':
      return Kind.Wanderer;
    case 'weaver':
      return Kind.Weaver;
    case 'pinwheel':
      return Kind.Pinwheel;
    case 'dart':
      return Kind.Dart;
    case 'snake':
      return Kind.SnakeHead;
    // V2 enemies (docs/10 wave C). Mine and Slime are hazards with no EnemyKind.
    case 'charger':
      return Kind.Charger;
    case 'bulwark':
      return Kind.Bulwark;
    case 'blink':
      return Kind.Blink;
    case 'swirl':
      return Kind.Swirl;
    case 'sower':
      return Kind.Sower;
    case 'splime':
      return Kind.Splime;
  }
}

function withTelegraph(fn: EntityStep): EntityStep {
  return (w: World, id: number, dt: number): void => {
    const g = gs(w);
    const tl = g.tele[id] ?? 0;
    if (tl > 0) {
      g.tele[id] = tl - dt > 0 ? tl - dt : 0;
      return;
    }
    fn(w, id, dt);
  };
}

/** Register every Swarm behaviour with the world. Idempotent; call once at boot. */
export function registerSwarmBehaviours(): void {
  registerBehaviour(Kind.Grunt, withTelegraph(grunt.step));
  registerBehaviour(Kind.Wanderer, withTelegraph(wanderer.step));
  registerBehaviour(Kind.Weaver, withTelegraph(weaver.step));
  registerBehaviour(Kind.Pinwheel, withTelegraph(pinwheel.step));
  registerBehaviour(Kind.Dart, withTelegraph(dart.step));
  registerBehaviour(Kind.SnakeHead, withTelegraph(snake.step));
  registerBehaviour(Kind.SnakeBody, withTelegraph(snake.stepSegment));
  registerBehaviour(Kind.GravityWell, withTelegraph(gravitywell.step));
  registerBehaviour(Kind.Spawner, withTelegraph(spawnerEnemy.step));
  registerBehaviour(Kind.Charger, withTelegraph(charger.step));
  registerBehaviour(Kind.Bulwark, withTelegraph(bulwark.step));
  registerBehaviour(Kind.Blink, withTelegraph(blink.step));
  registerBehaviour(Kind.Swirl, withTelegraph(swirl.step));
  registerBehaviour(Kind.Sower, withTelegraph(sower.step));
  registerBehaviour(Kind.Mine, withTelegraph(mine.step));
  registerBehaviour(Kind.Splime, withTelegraph(splime.step));
  registerBehaviour(Kind.Slime, withTelegraph(slime.step));
  registerBehaviour(Kind.Geom, geoms.step);
  registerBehaviour(Kind.WeaponPickup, pickup.step);
  // The drone is moved by stepDrone after stepWorld; a no op keeps the default drift off it.
  registerBehaviour(Kind.Drone, noop);
  // V3 bosses: the boss, its parts and its hazards (none of them telegraph through withTelegraph).
  registerBossBehaviours();
}

function noop(): void {
  // Intentionally empty.
}
