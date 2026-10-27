import { describe, expect, it } from 'vitest';
import { generateEndless, generateEndlessSegment } from '../../src/levelgen/generator';
import { createGame, stepGame } from '../../src/game/game';
import { ENDLESS_LOOP, ENDLESS_SEGMENTS, endlessLevel, endlessLine } from '../../src/ui/endless';

const gen = { generateEndless, generateEndlessSegment };

describe('Endless adapter', () => {
  it('builds a deterministic, JSON serialisable LevelDef from generateEndless(seed)', () => {
    const a = endlessLevel(gen, 1234);
    const b = endlessLevel(gen, 1234);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.arena.width).toBe(1600);
    expect(a.arena.height).toBe(1000);
    expect(a.drone).toBe('attack');
    expect(a.superType).toBe('turbo');
    expect(a.hazards.wells).toHaveLength(0);
    expect(JSON.stringify(endlessLevel(gen, 99))).not.toBe(JSON.stringify(a));
  });

  it('lays segments end to end and loops the last ones', () => {
    const def = endlessLevel(gen, 77);
    const w = def.waves.waves;
    expect(w.length).toBeGreaterThan(ENDLESS_SEGMENTS);
    for (let i = 1; i < w.length; i++) {
      expect(w[i]?.index).toBe(i);
      expect((w[i]?.atSec ?? 0) >= (w[i - 1]?.atSec ?? 0)).toBe(true);
    }
    expect((w[w.length - 1]?.atSec ?? 0) < ENDLESS_SEGMENTS * 30).toBe(true);
    expect(def.waves.loopPeriodSec).toBe(ENDLESS_LOOP * 30);
    const from = w[def.waves.loopFromIndex];
    expect(from).toBeDefined();
    expect((from?.atSec ?? 0) >= (ENDLESS_SEGMENTS - ENDLESS_LOOP) * 30).toBe(true);
  });

  it('never awards stars', () => {
    const def = endlessLevel(gen, 5);
    expect(def.par).toBe(0);
    expect(def.stars[0]).toBeGreaterThan(1e12);
  });

  it('runs in the sim in endless mode', () => {
    const w = createGame(endlessLevel(gen, 42), { mode: 'endless', vibrate: () => undefined });
    const idle = {
      move: { active: false, x: 0, y: 0 },
      aim: { active: false, x: 0, y: 0 },
      bomb: false,
      superPressed: false,
      pause: false,
    };
    for (let i = 0; i < 120 * 10; i++) stepGame(w, 1 / 120, idle);
    expect(w.time).toBeGreaterThan(9.9);
  });

  it('HUD line', () => {
    expect(endlessLine(42, 270.9)).toBe('Endless  Seed 42  4:30');
    expect(endlessLine(1, -3)).toBe('Endless  Seed 1  0:00');
  });
});
