import { describe, expect, it } from 'vitest';
import { planFx } from '../../../src/render/fx';
import {
  KICK_BOMB,
  KICK_DEATH,
  KICK_KILL,
  KICK_KILL_BIG,
  KICK_WELL,
  latticeKickFor,
  WAKE_MIN_SPEED,
  wakeAccel,
  WELL_PULL_ACCEL,
  wellPullRadius,
} from '../../../src/render/lattice/kicks';

describe('lattice kicks', () => {
  it('kills are small, deaths large, bombs large and expanding', () => {
    expect(latticeKickFor('kill', planFx({ type: 'kill', colour: 'blue' }).ripple)).toBe(KICK_KILL);
    expect(latticeKickFor('kill', planFx({ type: 'kill', colour: 'cyan' }).ripple)).toBe(KICK_KILL_BIG);
    expect(latticeKickFor('kill', planFx({ type: 'kill', colour: 'red' }).ripple)).toBe(KICK_WELL);
    expect(latticeKickFor('death', planFx({ type: 'death' }).ripple)).toBe(KICK_DEATH);
    expect(latticeKickFor('bomb', planFx({ type: 'bomb' }).ripple)).toBe(KICK_BOMB);
    expect(latticeKickFor('geom', 0)).toBeNull();
    expect(KICK_BOMB.t).toBe('ring');
    expect(KICK_DEATH.strength).toBeGreaterThan(KICK_KILL.strength * 2);
    expect(KICK_DEATH.radius).toBeGreaterThan(KICK_KILL.radius * 2);
  });

  it('wake is zero at or under 120 u/s and grows with speed, bounded', () => {
    expect(WAKE_MIN_SPEED).toBe(120);
    expect(wakeAccel(0)).toBe(0);
    expect(wakeAccel(120)).toBe(0);
    expect(wakeAccel(200)).toBeGreaterThan(0);
    expect(wakeAccel(400)).toBeGreaterThan(wakeAccel(200));
    expect(wakeAccel(5000)).toBe(wakeAccel(100000));
    expect(wakeAccel(Number.NaN)).toBe(0);
  });

  it('wells pull inward and grow their reach with their size', () => {
    expect(WELL_PULL_ACCEL).toBeLessThan(0);
    expect(wellPullRadius(48)).toBeGreaterThan(wellPullRadius(24));
    expect(wellPullRadius(-5)).toBe(wellPullRadius(0));
  });
});
