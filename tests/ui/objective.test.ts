import { describe, expect, it } from 'vitest';
import type { ObjectiveDef } from '../../src/levelgen/leveldef';
import { formatClock, formatInt, iconRun, starGlyphs } from '../../src/ui/format';
import {
  bossHolds,
  fallbackStatus,
  goalMet,
  HOLD_LABEL,
  levelSuccess,
  objectiveProgress,
  objectiveStatus,
  objectiveText,
  type ObjectiveSnapshot,
} from '../../src/ui/objective';

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

// V3-A boss hold (docs/13 boss rule 9 and section 8). The success test passing while a boss lives
// holds the level; the label then reads "Defeat the boss".
describe('boss hold label', () => {
  const sit: ObjectiveDef = { kind: 'scoreInTime', target: 5000, timeLimitSec: 90 };
  const surv: ObjectiveDef = { kind: 'survive', durationSec: 60 };
  const destroy: ObjectiveDef = { kind: 'destroy', count: 40 };
  // Each objective with a snapshot where its success test passes, and one where it has not yet.
  const cases: Array<[string, ObjectiveDef, ObjectiveSnapshot, ObjectiveSnapshot]> = [
    ['scoreInTime', sit, snap({ score: 6000, elapsedSec: 90 }), snap({ score: 6000, elapsedSec: 40 })],
    ['survive', surv, snap({ elapsedSec: 60 }), snap({ elapsedSec: 59 })],
    ['destroy', destroy, snap({ kills: 40 }), snap({ kills: 39 })],
  ];

  it('the label text is "Defeat the boss"', () => {
    expect(HOLD_LABEL).toBe('Defeat the boss');
  });

  for (const [name, obj, passed, running] of cases) {
    it(`${name}: reads "Defeat the boss" with a full bar once the test passes while the boss lives`, () => {
      expect(objectiveProgress(obj, passed, true)).toEqual({ label: 'Defeat the boss', fraction: 1 });
      expect(bossHolds(obj, passed, true)).toBe(true);
    });

    it(`${name}: the normal label before the test passes, boss alive or not`, () => {
      expect(objectiveProgress(obj, running, true)).toEqual(objectiveProgress(obj, running));
      expect(objectiveProgress(obj, running, true).label).not.toBe(HOLD_LABEL);
      expect(bossHolds(obj, running, true)).toBe(false);
    });

    it(`${name}: no boss alive means no hold, so the label is the v2 label`, () => {
      expect(objectiveProgress(obj, passed, false)).toEqual(objectiveProgress(obj, passed));
      expect(objectiveProgress(obj, passed).label).not.toBe(HOLD_LABEL);
      expect(bossHolds(obj, passed, false)).toBe(false);
    });
  }

  it('no hold once the lives are gone: that is a loss, not a wait', () => {
    expect(bossHolds(surv, snap({ elapsedSec: 60, lives: 0 }), true)).toBe(false);
    expect(bossHolds(sit, snap({ score: 6000, elapsedSec: 90, lives: 0 }), true)).toBe(false);
  });

  it('the timer label of a survive or scoreInTime level never shows a negative clock under the hold', () => {
    // The HUD label is replaced, but the unheld label must still clamp at 0:00 if the boss dies late.
    expect(objectiveProgress(surv, snap({ elapsedSec: 75 })).label).toBe('Survive 0:00');
    expect(objectiveProgress(sit, snap({ score: 6000, elapsedSec: 120 })).label).toBe('Target met  0:00');
  });

  it('boss absent is the default, so every existing call is unchanged', () => {
    expect(objectiveProgress(surv, snap({ elapsedSec: 15 }))).toEqual({ label: 'Survive 0:45', fraction: 0.25 });
    expect(objectiveProgress(destroy, snap({ kills: 50 }))).toEqual({ label: 'Destroy 40 / 40', fraction: 1 });
  });
});

describe('boss level end check and verdict', () => {
  const surv: ObjectiveDef = { kind: 'survive', durationSec: 60 };
  const sit: ObjectiveDef = { kind: 'scoreInTime', target: 5000, timeLimitSec: 90 };
  const destroy: ObjectiveDef = { kind: 'destroy', count: 40 };

  it('fallbackStatus on a boss level reads a success as running: only the sim ends it, after the boss', () => {
    expect(fallbackStatus(surv, snap({ elapsedSec: 60 }), true)).toBe('running');
    expect(fallbackStatus(sit, snap({ score: 6000, elapsedSec: 90 }), true)).toBe('running');
    expect(fallbackStatus(destroy, snap({ kills: 40 }), true)).toBe('running');
  });

  it('fallbackStatus on a boss level still ends on a failure', () => {
    expect(fallbackStatus(surv, snap({ elapsedSec: 10, lives: 0 }), true)).toBe('failure');
    expect(fallbackStatus(sit, snap({ score: 10, elapsedSec: 90 }), true)).toBe('failure');
    expect(fallbackStatus(destroy, snap({ kills: 3, lives: 0 }), true)).toBe('failure');
  });

  it('fallbackStatus on every other level is objectiveStatus, unchanged', () => {
    for (const [obj, s] of [
      [surv, snap({ elapsedSec: 60 })],
      [surv, snap({ elapsedSec: 5 })],
      [sit, snap({ score: 6000, elapsedSec: 90 })],
      [destroy, snap({ kills: 40 })],
      [destroy, snap({ kills: 3, lives: 0 })],
    ] as const) {
      expect(fallbackStatus(obj, s, false)).toBe(objectiveStatus(obj, s));
    }
  });

  it('levelSuccess on a boss level is the sim verdict: a win, and never a loss that met its target in the hold', () => {
    expect(levelSuccess(surv, snap({ elapsedSec: 60 }), 'won', true)).toBe(true);
    // Target met, then every life lost while holding for the boss: goalMet would say success.
    expect(goalMet(surv, snap({ elapsedSec: 70, lives: 0 }))).toBe(true);
    expect(levelSuccess(surv, snap({ elapsedSec: 70, lives: 0 }), 'lost', true)).toBe(false);
    expect(levelSuccess(destroy, snap({ kills: 40, lives: 0 }), 'lost', true)).toBe(false);
    expect(levelSuccess(sit, snap({ score: 6000, elapsedSec: 90, lives: 0 }), 'lost', true)).toBe(false);
  });

  it('levelSuccess on a boss level with no verdict yet is not a win', () => {
    expect(levelSuccess(surv, snap({ elapsedSec: 60 }), 'running', true)).toBe(false);
  });

  it('levelSuccess on every other level is goalMet, whatever the outcome says (v1 behaviour kept)', () => {
    for (const outcome of ['running', 'won', 'lost'] as const) {
      expect(levelSuccess(destroy, snap({ kills: 40, lives: 0 }), outcome, false)).toBe(true);
      expect(levelSuccess(surv, snap({ elapsedSec: 12 }), outcome, false)).toBe(false);
    }
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
