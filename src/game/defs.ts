// Enemy def lookup by Kind and behaviour registration with Forge's world (registerBehaviour).
// Every registered step is wrapped so telegraphing entities only count down their telegraph.
import type { EnemyKind } from '../levelgen/leveldef';
import * as dart from './enemies/dart';
import * as grunt from './enemies/grunt';
import * as gravitywell from './enemies/gravitywell';
import * as pinwheel from './enemies/pinwheel';
import * as snake from './enemies/snake';
import * as spawnerEnemy from './enemies/spawner';
import type { EnemyDef } from './enemies/types';
import * as wanderer from './enemies/wanderer';
import * as weaver from './enemies/weaver';
import * as geoms from './geoms';
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
  registerBehaviour(Kind.Geom, geoms.step);
  // The drone is moved by stepDrone after stepWorld; a no op keeps the default drift off it.
  registerBehaviour(Kind.Drone, noop);
}

function noop(): void {
  // Intentionally empty.
}
