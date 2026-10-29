// Shared fixtures for the move symmetry tests: arenas symmetric about the y axis and an input mirror.
import type { InputState } from '../../src/input/types';
import type { ArenaDef } from '../../src/levelgen/leveldef';

function arena(shape: ArenaDef['shape'], width: number, height: number, cornerRadius = 0, obstacles: ArenaDef['obstacles'] = []): ArenaDef {
  return { shape, width, height, cornerRadius, obstacles, spawnPoint: { x: 0, y: 0 } };
}

/** Every arena shape, laid out mirror symmetric about x = 0. */
export const SYMMETRIC_ARENAS: ReadonlyArray<readonly [string, ArenaDef]> = [
  ['rect', arena('rect', 1400, 900)],
  ['roundRect', arena('roundRect', 1300, 950, 180)],
  ['circle', arena('circle', 1100, 1100)],
  ['hexagon', arena('hexagon', 1200, 1040)],
  [
    'rectObstacles',
    arena('rectObstacles', 1400, 900, 0, [
      { cx: -350, cy: 120, w: 160, h: 90 },
      { cx: 350, cy: 120, w: 160, h: 90 },
      { cx: 0, cy: -260, w: 220, h: 60 },
    ]),
  ],
];

export function moveInput(mx: number, my: number): InputState {
  return {
    move: { active: mx !== 0 || my !== 0, x: mx, y: my },
    aim: { active: false, x: 0, y: 0 },
    bomb: false,
    superPressed: false,
    pause: false,
  };
}

/** The same input with the move stick x negated. */
export function mirrorInput(i: InputState): InputState {
  return {
    move: { active: i.move.active, x: -i.move.x, y: i.move.y },
    aim: { active: i.aim.active, x: -i.aim.x, y: i.aim.y },
    bomb: i.bomb,
    superPressed: i.superPressed,
    pause: i.pause,
  };
}
