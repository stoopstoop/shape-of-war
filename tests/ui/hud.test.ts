import { describe, expect, it } from 'vitest';
import { aspectClass, due, hudLayout, hudText, levelLine, playRect } from '../../src/ui/hud';

describe('hud', () => {
  it('aspect class switches at 1.8', () => {
    expect(aspectClass(1176, 504)).toBe('cover'); // about 21:9
    expect(aspectClass(900, 500)).toBe('cover');
    expect(aspectClass(899, 500)).toBe('main');
    expect(aspectClass(1092, 984)).toBe('main'); // about 10:9
  });

  it('play rect removes insets and the HUD band', () => {
    const ins = { top: 10, right: 20, bottom: 5, left: 30 };
    expect(playRect(1200, 500, ins, 'cover')).toEqual({ x: 30, y: 62, w: 1150, h: 433 });
    expect(playRect(1000, 900, ins, 'main')).toEqual({ x: 30, y: 86, w: 950, h: 809 });
    expect(hudLayout('cover').band).toBe(52);
    expect(hudLayout('main').band).toBe(76);
  });

  it('formats the hud:score payload', () => {
    const t = hudText({ score: 123456, multiplier: 12, lives: 3, bombs: 7, superCharge: 1.4 });
    expect(t.score).toBe('123,456');
    expect(t.mult).toBe('x12');
    expect(t.lives).toBe('▲▲▲');
    expect(t.bombs).toBe('● x 7');
    expect(t.bombCount).toBe('7');
    expect(t.charge).toBe(1);
  });

  it('throttles to 100 ms', () => {
    expect(due(0, 99)).toBe(false);
    expect(due(0, 100)).toBe(true);
  });

  it('level line carries index, par and hash', () => {
    expect(levelLine(3, 1500, 'abcd1234')).toBe('L3  Par 1,500  #abcd1234');
  });
});
