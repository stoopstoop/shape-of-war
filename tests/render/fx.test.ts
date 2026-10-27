import { describe, expect, it } from 'vitest';
import { planFx } from '../../src/render/fx';
import type { PaletteKey } from '../../src/render/neon';

describe('fx event to burst mapping (docs/01 section 12)', () => {
  it('standard kills spray 24 in the enemy colour with no shake', () => {
    for (const colour of ['blue', 'purple', 'green', 'orange'] as PaletteKey[]) {
      const p = planFx({ type: 'kill', colour });
      expect(p.burst.count).toBe(24);
      expect(p.burst.colour).toBe(colour);
      expect(p.burst.speedMin).toBe(200);
      expect(p.burst.speedMax).toBe(600);
      expect(p.shake).toBeNull();
    }
  });

  it('big kills map by colour', () => {
    expect(planFx({ type: 'kill', colour: 'magenta' }).burst.count).toBe(28);
    expect(planFx({ type: 'kill', colour: 'cyan' }).burst.count).toBe(48);
    expect(planFx({ type: 'kill', colour: 'yellow' }).burst.count).toBe(40);
    expect(planFx({ type: 'kill', colour: 'cyan' }).shake?.amp).toBe(4);
    const well = planFx({ type: 'kill', colour: 'red' });
    expect(well.burst.count).toBe(120);
    expect(well.burst.colour2).toBe('white');
    expect(well.shake?.amp).toBe(12);
    expect(well.ripple).toBeGreaterThan(0);
  });

  it('ship death: 120 particles, shake 14 for 0.5 s, grid ripple', () => {
    const p = planFx({ type: 'death' });
    expect(p.burst.count).toBe(120);
    expect(p.burst.colour).toBe('ship');
    expect(p.shake).toEqual({ amp: 14, dur: 0.5 });
    expect(p.ripple).toBeGreaterThan(0);
  });

  it('bomb: 200 particles, shake 10, ring and the strongest ripple', () => {
    const p = planFx({ type: 'bomb' });
    expect(p.burst.count).toBe(200);
    expect(p.burst.speedMax).toBe(1200);
    expect(p.shake).toEqual({ amp: 10, dur: 0.4 });
    expect(p.ring).toBe('bomb');
    expect(p.ripple).toBeGreaterThanOrEqual(planFx({ type: 'death' }).ripple);
  });

  it('every kill ripples the grid a little; the bomb ripple is the largest of all', () => {
    const colours: PaletteKey[] = ['blue', 'purple', 'green', 'orange', 'magenta', 'cyan', 'yellow', 'red'];
    const bomb = planFx({ type: 'bomb' }).ripple;
    for (const colour of colours) {
      const r = planFx({ type: 'kill', colour }).ripple;
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(bomb);
      if (colour !== 'red') expect(r).toBeLessThan(bomb / 4); // the well is a big kill
    }
    for (const type of ['death', 'super'] as const) expect(planFx({ type }).ripple).toBeLessThan(bomb);
    expect(planFx({ type: 'kill', colour: 'blue' }).ring).toBeNull();
  });

  it('super: a ring burst with particles, small shake and a ripple', () => {
    const p = planFx({ type: 'super' });
    expect(p.ring).not.toBeNull();
    expect(p.burst.count).toBeGreaterThan(0);
    expect(p.shake?.amp).toBeLessThan(planFx({ type: 'bomb' }).shake?.amp ?? 0);
    expect(p.ripple).toBeGreaterThan(0);
  });

  it('geom pickup: 4 short lived sparkles, no shake or ripple', () => {
    const p = planFx({ type: 'geom' });
    expect(p.burst.count).toBe(4);
    expect(p.burst.lifeMax).toBe(0.2);
    expect(p.burst.colour).toBe('geom');
    expect(p.shake).toBeNull();
    expect(p.ripple).toBe(0);
  });
});
