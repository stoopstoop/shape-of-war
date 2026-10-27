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
    expect(p.ring).toBe(true);
    expect(p.ripple).toBeGreaterThanOrEqual(planFx({ type: 'death' }).ripple);
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
