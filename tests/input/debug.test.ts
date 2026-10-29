import { describe, expect, it } from 'vitest';
import {
  createMoveDebug,
  formatMoveDebug,
  noteClamp,
  noteMoveBegin,
  noteMoveSample,
  noteOffCanvasDown,
  parseDebugFlag,
  RATE_WINDOW_MS,
  targetLabel,
} from '../../src/input/debug';
import { STICK_RADIUS } from '../../src/input/stick';

describe('parseDebugFlag', () => {
  it('is true only for debug=1', () => {
    expect(parseDebugFlag('?debug=1')).toBe(true);
    expect(parseDebugFlag('?level=3&debug=1')).toBe(true);
    expect(parseDebugFlag('?debug=0')).toBe(false);
    expect(parseDebugFlag('?debug')).toBe(false);
    expect(parseDebugFlag('')).toBe(false);
  });
});

describe('move debug accumulator', () => {
  it('tracks reach, peak and magnitude, and resets on begin', () => {
    const d = createMoveDebug();
    noteMoveBegin(d, 0);
    noteMoveSample(d, 30, 40, 0.3, 0.4, 10);
    expect(d.reachPx).toBe(50);
    expect(d.mag).toBeCloseTo(0.5);
    noteMoveSample(d, 6, 8, 0, 0, 20);
    expect(d.reachPx).toBe(10);
    expect(d.peakPx).toBe(50);
    noteMoveBegin(d, 30);
    expect(d.peakPx).toBe(0);
    expect(d.mag).toBe(0);
  });

  it('measures the pointermove rate over the window', () => {
    const d = createMoveDebug();
    noteMoveBegin(d, 0);
    // 60 Hz events for one window.
    for (let t = 1000 / 60; t <= RATE_WINDOW_MS + 1; t += 1000 / 60) noteMoveSample(d, 1, 0, 0, 0, t);
    expect(d.hz).toBeGreaterThan(58);
    expect(d.hz).toBeLessThan(62);
  });

  it('counts off canvas downs with a label', () => {
    const d = createMoveDebug();
    noteOffCanvasDown(d, 'div.sow-screen');
    noteOffCanvasDown(d, 'div.sow-screen');
    expect(d.offCanvasDowns).toBe(2);
    expect(d.lastOffCanvas).toBe('div.sow-screen');
  });
});

describe('formatMoveDebug', () => {
  it('shows magnitude, reach against radius, peak percent, rate and device px radius', () => {
    const d = createMoveDebug();
    noteMoveSample(d, 90, 0, 0.66, 0, 0);
    d.hz = 120;
    const s = formatMoveDebug(d, 2.625, 832, 750);
    expect(s).toContain('move 0.66');
    expect(s).toContain(`reach 90/${STICK_RADIUS}px`);
    expect(s).toContain('peak 75%');
    expect(s).toContain('120Hz');
    expect(s).toContain('dpr 2.625');
    expect(s).toContain('radius 315 device px');
    expect(s).not.toContain('offcanvas');
  });

  it('caps peak at 100 percent and lists off canvas downs', () => {
    const d = createMoveDebug();
    noteMoveSample(d, 400, 0, 1, 0, 0);
    noteOffCanvasDown(d, 'div.sow-screen');
    const s = formatMoveDebug(d, 1, 900, 400);
    expect(s).toContain('peak 100%');
    expect(s).toContain('offcanvas 1 (div.sow-screen)');
  });
});

describe('landing readout', () => {
  it('stores the move thumb landing on begin and prints it on its own line', () => {
    const d = createMoveDebug();
    noteMoveBegin(d, 0, 140.4, 449.6);
    expect([d.landX, d.landY]).toEqual([140.4, 449.6]);
    noteMoveSample(d, 120, 0, 1, 0, 10);
    const s = formatMoveDebug(d, 2.625, 832, 750);
    expect(s.split('\n')).toHaveLength(4);
    expect(s.split('\n')[2]).toBe('land 140,450');
  });
});

describe('anchor clamp readout', () => {
  it('starts at zero for both sticks on the last line', () => {
    const s = formatMoveDebug(createMoveDebug(), 1, 960, 411);
    expect(s.split('\n')[3]).toBe('clamp move 0,0  aim 0,0');
  });

  it('prints both offsets rounded to whole px, with no minus zero', () => {
    const d = createMoveDebug();
    noteClamp(d, -0.3, 0, -41.6, -12.2);
    expect([d.clampMoveX, d.clampAimX, d.clampAimY]).toEqual([-0.3, -41.6, -12.2]);
    expect(formatMoveDebug(d, 2.625, 960, 411).split('\n')[3]).toBe('clamp move 0,0  aim -42,-12');
  });

  it('a new landing replaces the old one', () => {
    const d = createMoveDebug();
    noteMoveBegin(d, 0, 100, 200);
    noteMoveBegin(d, 50, 300, 400);
    expect(formatMoveDebug(d, 1, 900, 400)).toContain('land 300,400');
  });
});

describe('targetLabel', () => {
  it('uses the first class when present', () => {
    expect(targetLabel('DIV', 'sow-screen sow-intro')).toBe('div.sow-screen');
    expect(targetLabel('BUTTON', '  ')).toBe('button');
  });
});
