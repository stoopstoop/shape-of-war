// Tier 3 render and sim contract (src/game/bosses/bastion.ts, tempest.ts, twins.ts, types.ts): the
// Twins second body is Kind.BossPart with PartType.Twin (3) and draws as a full red boss body with
// the exposed look; Bastion's turrets are the part type and radius the render draws; the Tempest dash
// is far over the 320 u/s ghost threshold and the lap and catch up speeds are under it.
import { describe, expect, it } from 'vitest';
import { BASTION, BOSS_TABLE, TEMPEST } from '../../src/game/bosses/table';
import { PartType } from '../../src/game/bosses/types';
import { BOSS_COLOUR_BY_ID, BOSS_OPEN_STEPS, BOSS_TWINS } from '../../src/render/bossLook';
import {
  BOSS_SPECS,
  EXPOSED_BOSS_SPECS,
  PART_ANCHOR,
  PART_POD,
  PART_R,
  PART_SPECS,
  PART_TURRET,
  PART_TWIN,
  bossBodyR,
  isTwinPart,
  partR,
  partType,
} from '../../src/render/bossShapes';
import { TEMPEST_DASH_MIN_SPEED, TEMPEST_LAP_SPEED, tempestDashing } from '../../src/render/bossTier3';
import { bossSlot, exposedBossSlot, isBossSlot, isExposedBossSlot, partSlot, partVisualSlot, specForSlot } from '../../src/render/shapeSpecs';

describe('part types match the sim', () => {
  it('render part constants are the sim PartType values', () => {
    expect(PART_POD).toBe(PartType.Pod);
    expect(PART_ANCHOR).toBe(PartType.Anchor);
    expect(PART_TURRET).toBe(PartType.Turret);
    expect(PART_TWIN).toBe(PartType.Twin);
    expect(PART_TWIN).toBe(3);
  });
});

describe('Twins second body', () => {
  it('is recognised as the twin body, not a pod, a turret or an anchor', () => {
    expect(isTwinPart(3)).toBe(true);
    for (const a of [PART_POD, PART_ANCHOR, PART_TURRET, -1, 4]) expect(isTwinPart(a)).toBe(false);
  });

  it('is drawn at the Twins body radius (44 u), so a w.radius of 44 draws at scale 1', () => {
    expect(BOSS_TABLE.twins.radius).toBe(44);
    expect(partR(PART_TWIN)).toBe(bossBodyR(BOSS_TWINS));
    expect(partR(PART_TWIN)).toBe(BOSS_TABLE.twins.radius);
    expect(BOSS_TABLE.twins.radius / partR(PART_TWIN)).toBe(1);
  });

  it('takes the Twins boss body slot at the same openness step: a full red body', () => {
    for (let s = 0; s < BOSS_OPEN_STEPS; s++) {
      const slot = partVisualSlot(PART_TWIN, 3, s, false);
      expect(slot).toBe(bossSlot(BOSS_TWINS, s));
      expect(isBossSlot(slot)).toBe(true);
      expect(specForSlot(slot)).toBe(BOSS_SPECS[BOSS_TWINS * BOSS_OPEN_STEPS + s]);
    }
    expect(BOSS_COLOUR_BY_ID[BOSS_TWINS]).toBe('bossRed');
    const layer = specForSlot(partVisualSlot(PART_TWIN, 3, 0, false)).layers[0];
    expect(layer?.colour).toBe('bossRed');
  });

  it('takes the exposed (coreless white shell) slot while the boss shows it: the same exposed look', () => {
    for (let s = 0; s < BOSS_OPEN_STEPS; s++) {
      const slot = partVisualSlot(PART_TWIN, 3, s, true);
      expect(slot).toBe(exposedBossSlot(BOSS_TWINS, s));
      expect(isExposedBossSlot(slot)).toBe(true);
      expect(specForSlot(slot)).toBe(EXPOSED_BOSS_SPECS[BOSS_TWINS * BOSS_OPEN_STEPS + s]);
      expect(specForSlot(slot).layers.some((l) => l.colour === 'white')).toBe(false);
    }
  });

  it('every other part keeps its per type and tier slot, whatever the step or exposure', () => {
    for (const a of [PART_POD, PART_ANCHOR, PART_TURRET]) {
      for (const tier of [1, 2, 3, 4]) {
        expect(partVisualSlot(a, tier, 2, true)).toBe(partSlot(a, tier));
        expect(partVisualSlot(a, tier, 0, false)).toBe(partSlot(a, tier));
      }
    }
  });

  it('the twin body is not a small pod: the pod spec is far smaller than the twin body', () => {
    expect(partType(PART_TWIN)).toBe(PART_POD);
    expect(PART_R[PART_POD] ?? 0).toBeLessThan(partR(PART_TWIN) / 3);
    expect(PART_SPECS).toHaveLength(16);
  });
});

describe('Bastion turrets', () => {
  it('are the Turret part type, drawn at the radius the sim gives them (16 u)', () => {
    expect(PartType.Turret).toBe(PART_TURRET);
    expect(BASTION.turretRadius).toBe(16);
    expect(partR(PART_TURRET)).toBe(BASTION.turretRadius);
    expect(PART_R[PART_TURRET]).toBe(BASTION.turretRadius);
    expect(BASTION.turretRadius / partR(PART_TURRET)).toBe(1);
  });
});

describe('Tempest dash ghost threshold', () => {
  it('the dash speed is above 320 u/s, so the drawn dash always reads as dashing', () => {
    expect(TEMPEST.dashSpeed).toBeGreaterThan(TEMPEST_DASH_MIN_SPEED);
    expect(TEMPEST_DASH_MIN_SPEED).toBe(320);
    expect(tempestDashing(TEMPEST.dashSpeed)).toBe(true);
  });

  it('the lap speed matches the render constant and the lap and catch up stay below the threshold', () => {
    expect(TEMPEST.lapSpeed).toBe(TEMPEST_LAP_SPEED);
    expect(tempestDashing(TEMPEST.lapSpeed)).toBe(false);
    expect(tempestDashing(TEMPEST.lapSpeed * TEMPEST.catchUp)).toBe(false);
  });
});
