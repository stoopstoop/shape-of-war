import { describe, expect, it } from 'vitest';
import type { ObjectiveDef } from '../../src/levelgen/leveldef';
import { formatClock, formatInt, iconRun, starGlyphs } from '../../src/ui/format';
import { goalMet, objectiveProgress, objectiveStatus, objectiveText, type ObjectiveSnapshot } from '../../src/ui/objective';

const snap = (p: Partial<ObjectiveSnapshot>): ObjectiveSnapshot => ({ elapsedSec: 0, score: 0, kills: 0, lives: 3, ...p });

describe('objectives', () => {
  const sit: ObjectiveDef = { kind: 'scoreInTime', target: 5000, timeLimitSec: 90 };
  const surv: ObjectiveDef = { kind: 'survive', durationSec: 60 };
  const destroy: ObjectiveDef = { kind: 'destroy', count: 40 };

  it('scoreInTime runs the full timer; target decides at the end (docs/01 section 8)', () => {
    expect(objectiveStatus(sit, snap({ score: 4999, elapsedSec: 10 }))).toBe('running');
    expect(objectiveStatus(sit, snap({ score: 5000, elapsedSec: 10 }))).toBe('running');
    expect(objectiveStatus(sit, snap({ score: 5000, elapsedSec: 90 }))).toBe('success');
    expect(objectiveStatus(sit, snap({ score: 10, elapsedSec: 90 }))).toBe('failure');
    expect(objectiveStatus(sit, snap({ score: 10, lives: 0 }))).toBe('failure');
  });

  it('survive succeeds when the timer runs out with lives left', () => {
    expect(objectiveStatus(surv, snap({ elapsedSec: 59.9 }))).toBe('running');
    expect(objectiveStatus(surv, snap({ elapsedSec: 60 }))).toBe('success');
    expect(objectiveStatus(surv, snap({ elapsedSec: 60, lives: 0 }))).toBe('failure');
  });

  it('destroy succeeds at N kills, unknown lives never fail', () => {
    expect(objectiveStatus(destroy, snap({ kills: 39, lives: null }))).toBe('running');
    expect(objectiveStatus(destroy, snap({ kills: 40 }))).toBe('success');
    expect(objectiveStatus(destroy, snap({ kills: 3, lives: 0 }))).toBe('failure');
  });

  it('goalMet ignores lives (used to infer success on game:over)', () => {
    expect(goalMet(destroy, snap({ kills: 40, lives: 0 }))).toBe(true);
    expect(goalMet(surv, snap({ elapsedSec: 12 }))).toBe(false);
  });

  it('progress labels and fractions', () => {
    expect(objectiveProgress(sit, snap({ score: 2500, elapsedSec: 30 }))).toEqual({ label: '2,500 / 5,000  1:00', fraction: 0.5 });
    expect(objectiveProgress(surv, snap({ elapsedSec: 15 }))).toEqual({ label: 'Survive 0:45', fraction: 0.25 });
    expect(objectiveProgress(destroy, snap({ kills: 50 }))).toEqual({ label: 'Destroy 40 / 40', fraction: 1 });
    expect(objectiveText(destroy)).toBe('Destroy 40 enemies');
  });
});

describe('format', () => {
  it('formatInt', () => {
    expect(formatInt(0)).toBe('0');
    expect(formatInt(999)).toBe('999');
    expect(formatInt(1234567)).toBe('1,234,567');
    expect(formatInt(-5)).toBe('0');
  });
  it('formatClock rounds up', () => {
    expect(formatClock(59.2)).toBe('1:00');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(-3)).toBe('0:00');
  });
  it('iconRun caps at 5 icons', () => {
    expect(iconRun('o', 3)).toBe('ooo');
    expect(iconRun('o', 7)).toBe('o x 7');
    expect(iconRun('o', 0)).toBe('');
  });
  it('starGlyphs', () => {
    expect(starGlyphs(2)).toBe('★★☆');
  });
});
