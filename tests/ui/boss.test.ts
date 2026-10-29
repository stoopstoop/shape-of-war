// V3-A boss HUD data and pure logic: names, tiers, colours, the bar view, the phase pips, the
// hud:boss throttle gate and the boss bonus line.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOSS_IDS, type BossId } from '../../src/levelgen/leveldef';
import { BASE_PALETTE } from '../../src/render/neon';
import {
  BOSS_BONUS_STEP,
  BOSS_GATE_START,
  BOSS_GLOW_PX,
  BOSS_MAX_PIPS,
  BOSS_MIN_FRACTION,
  BOSS_NAMES,
  BOSS_PALETTE_KEY,
  BOSS_TIER,
  bossBonusFor,
  bossColour,
  bossFill,
  bossGate,
  bossName,
  bossView,
  enterPayload,
  isBossId,
  pipStates,
  prismGradient,
  PRISM_CYCLE_SEC,
  type HudBoss,
} from '../../src/ui/boss';

const p = (over: Partial<HudBoss> = {}): HudBoss => ({ id: 'warden', hp: 3600, maxHp: 3600, phase: 1, phases: 2, mode: 2, ...over });

describe('boss names and tiers', () => {
  it('every boss id has a name, a tier and a palette key, and nothing else is in the tables', () => {
    for (const t of [BOSS_NAMES, BOSS_TIER, BOSS_PALETTE_KEY]) expect(Object.keys(t).sort()).toEqual([...BOSS_IDS].sort());
    for (const id of BOSS_IDS) {
      expect(BOSS_NAMES[id].length).toBeGreaterThan(2);
      expect(BASE_PALETTE[BOSS_PALETTE_KEY[id]]).toBeDefined();
    }
  });

  it('the working names are the plan placeholders, one per id', () => {
    expect(Object.values(BOSS_NAMES)).toEqual(['Warden', 'Brood', 'Spindle', 'Ember', 'Mirage', 'Gravitas', 'Bastion', 'Tempest', 'Twins', 'Prism']);
    expect(new Set(Object.values(BOSS_NAMES)).size).toBe(10);
  });

  it('tiers follow the schedule: three, three, three and one (docs/13)', () => {
    const count = (t: number): number => BOSS_IDS.filter((id) => BOSS_TIER[id] === t).length;
    expect([1, 2, 3, 4].map(count)).toEqual([3, 3, 3, 1]);
    expect(BOSS_TIER.warden).toBe(1);
    expect(BOSS_TIER.ember).toBe(2);
    expect(BOSS_TIER.bastion).toBe(3);
    expect(BOSS_TIER.prism).toBe(4);
  });

  it('colours by tier: blue, green, yellow; orange, magenta, violet; red; prism', () => {
    expect(BOSS_PALETTE_KEY.warden).toBe('bossBlue');
    expect(BOSS_PALETTE_KEY.brood).toBe('bossGreen');
    expect(BOSS_PALETTE_KEY.spindle).toBe('bossYellow');
    expect(BOSS_PALETTE_KEY.ember).toBe('bossOrange');
    expect(BOSS_PALETTE_KEY.mirage).toBe('bossMagenta');
    expect(BOSS_PALETTE_KEY.gravitas).toBe('bossViolet');
    for (const id of ['bastion', 'tempest', 'twins'] as const) expect(BOSS_PALETTE_KEY[id]).toBe('bossRed');
    expect(BOSS_PALETTE_KEY.prism).toBe('bossPrism');
  });

  it('isBossId and bossName guard unknown ids', () => {
    expect(isBossId('prism')).toBe(true);
    expect(isBossId('Prism')).toBe(false);
    expect(isBossId('')).toBe(false);
    expect(bossName('twins')).toBe('Twins');
    expect(bossName('nobody')).toBe('');
  });

  it('colours come from the render palette: no hue is written in boss.ts', () => {
    const [h, s, l] = BASE_PALETTE.bossBlue;
    expect(bossColour('warden')).toBe(`hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`);
    expect(bossColour('warden', 0.5)).toBe(`hsla(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, 0.5)`);
    const src = readFileSync(fileURLToPath(new URL('../../src/ui/boss.ts', import.meta.url)), 'utf8');
    expect(src).toContain("from '../render/neon'");
    expect(src).not.toMatch(/hsla?\(\s*\d/);
  });

  it('the tier 3 reds get the widest glow, the lowest tier the narrowest', () => {
    expect(BOSS_GLOW_PX[3]).toBeGreaterThan(BOSS_GLOW_PX[4]);
    expect(BOSS_GLOW_PX[4]).toBeGreaterThan(BOSS_GLOW_PX[2]);
    expect(BOSS_GLOW_PX[2]).toBeGreaterThan(BOSS_GLOW_PX[1]);
  });
});

describe('boss bar fill', () => {
  it('flat tier colour for nine bosses, with that tier glow', () => {
    for (const id of BOSS_IDS.filter((b) => b !== 'prism')) {
      const f = bossFill(id, 1234);
      expect(f.background).toBe(bossColour(id));
      expect(f.glow).toBe(`0 0 ${BOSS_GLOW_PX[BOSS_TIER[id]]}px ${bossColour(id)}`);
    }
  });

  it('Prism is a rainbow that moves: a full hue cycle every 3 s', () => {
    expect(PRISM_CYCLE_SEC).toBe(3);
    const a = bossFill('prism', 0).background;
    expect(a).toContain('linear-gradient');
    expect(bossFill('prism', 500).background).not.toBe(a);
    expect(bossFill('prism', 3000).background).toBe(a);
    expect(bossFill('prism', 6000).background).toBe(a);
  });

  it('prismGradient wraps any offset into 0 to 360 and spans seven stops', () => {
    expect(prismGradient(360)).toBe(prismGradient(0));
    expect(prismGradient(-60)).toBe(prismGradient(300));
    expect(prismGradient(0).match(/hsl\(/g)).toHaveLength(7);
  });

  it('a non finite clock does not throw', () => {
    expect(bossFill('prism', Number.NaN).background).toBe(bossFill('prism', 0).background);
  });
});

describe('phase pips', () => {
  it('one pip per phase: done before, current lit, the rest hollow', () => {
    expect(pipStates(1, 3)).toEqual(['current', 'next', 'next']);
    expect(pipStates(2, 3)).toEqual(['done', 'current', 'next']);
    expect(pipStates(3, 3)).toEqual(['done', 'done', 'current']);
    expect(pipStates(2, 2)).toEqual(['done', 'current']);
    expect(pipStates(4, 4)).toEqual(['done', 'done', 'done', 'current']);
  });

  it('the roster counts are all drawn: 2, 3 and 4 phases', () => {
    for (const n of [2, 3, 4]) expect(pipStates(1, n)).toHaveLength(n);
  });

  it('fewer than two phases, or garbage, draws none', () => {
    expect(pipStates(1, 1)).toEqual([]);
    expect(pipStates(1, 0)).toEqual([]);
    expect(pipStates(1, -2)).toEqual([]);
    expect(pipStates(1, Number.NaN)).toEqual([]);
    expect(pipStates(1, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it('a phase outside the range clamps into it; the count caps at the pip limit', () => {
    expect(pipStates(0, 3)).toEqual(['current', 'next', 'next']);
    expect(pipStates(9, 3)).toEqual(['done', 'done', 'current']);
    expect(pipStates(Number.NaN, 2)).toEqual(['current', 'next']);
    expect(pipStates(1, 99)).toHaveLength(BOSS_MAX_PIPS);
    expect(BOSS_MAX_PIPS).toBeGreaterThanOrEqual(4);
  });
});

describe('boss bar view', () => {
  it('hit points at full, half and 0 read as 1, 0.5 and 0 of the bar', () => {
    expect(bossView(p({ hp: 3600 })).fraction).toBe(1);
    expect(bossView(p({ hp: 1800 })).fraction).toBe(0.5);
    expect(bossView(p({ hp: 0 })).fraction).toBe(0);
    expect(bossView(p({ hp: 0 })).visible).toBe(true); // 0 hit points is still a bar until the boss is down
  });

  it('only the ratio matters: tenths of a hit, any maximum', () => {
    expect(bossView(p({ hp: 5000, maxHp: 10000 })).fraction).toBe(0.5);
    expect(bossView(p({ hp: 250, maxHp: 1000 })).fraction).toBe(0.25);
  });

  it('a living boss keeps a sliver; hit points above the maximum or below 0 clamp', () => {
    expect(bossView(p({ hp: 1 })).fraction).toBe(BOSS_MIN_FRACTION);
    expect(bossView(p({ hp: 99999 })).fraction).toBe(1);
    expect(bossView(p({ hp: -50 })).fraction).toBe(0);
  });

  it('carries the name, the tier and the pips of the payload', () => {
    const v = bossView(p({ id: 'ember', phase: 2, phases: 3 }));
    expect(v.name).toBe('Ember');
    expect(v.tier).toBe(2);
    expect(v.pips).toEqual(['done', 'current', 'next']);
  });

  it('an unreadable payload is hidden: no maximum, non finite numbers, unknown id', () => {
    expect(bossView(p({ maxHp: 0 })).visible).toBe(false);
    expect(bossView(p({ maxHp: -5 })).visible).toBe(false);
    expect(bossView(p({ hp: Number.NaN })).visible).toBe(false);
    expect(bossView(p({ maxHp: Number.POSITIVE_INFINITY })).visible).toBe(false);
    expect(bossView(p({ id: 'nobody' as BossId })).visible).toBe(false);
    expect(bossView(p({ maxHp: 0 })).pips).toEqual([]);
  });
});

describe('hud:boss throttle gate', () => {
  it('the first payload always draws', () => {
    expect(bossGate(BOSS_GATE_START, p(), 0).draw).toBe(true);
  });

  it('draws at most every 100 ms when nothing else changed', () => {
    let g = bossGate(BOSS_GATE_START, p(), 1000).gate;
    for (const [t, draw] of [
      [1050, false],
      [1099, false],
      [1100, true],
      [1150, false],
      [1200, true],
    ] as const) {
      const r = bossGate(g, p({ hp: 3000 }), t);
      expect(r.draw, `t ${t}`).toBe(draw);
      g = r.gate;
    }
  });

  it('a skipped payload leaves the gate as it was', () => {
    const g = bossGate(BOSS_GATE_START, p(), 1000).gate;
    const r = bossGate(g, p({ hp: 10 }), 1010);
    expect(r.draw).toBe(false);
    expect(r.gate).toEqual(g);
    expect(r.gate).not.toBe(g);
  });

  it('a phase change, a phase count change, a new boss and the move to 0 hit points draw at once', () => {
    const g = bossGate(BOSS_GATE_START, p(), 1000).gate;
    expect(bossGate(g, p({ phase: 2 }), 1001).draw).toBe(true);
    expect(bossGate(g, p({ phases: 3 }), 1001).draw).toBe(true);
    expect(bossGate(g, p({ id: 'brood' }), 1001).draw).toBe(true);
    expect(bossGate(g, p({ hp: 0 }), 1001).draw).toBe(true);
    expect(bossGate(g, p({ hp: 3500 }), 1001).draw).toBe(false);
  });

  it('after the 0 hit points draw, more 0 hit points events wait for the interval', () => {
    const g = bossGate(BOSS_GATE_START, p({ hp: 0 }), 1000).gate;
    expect(bossGate(g, p({ hp: 0 }), 1001).draw).toBe(false);
  });

  it('enterPayload is a full, pip free bar for the named boss', () => {
    const v = bossView(enterPayload('twins'));
    expect(v).toMatchObject({ visible: true, name: 'Twins', fraction: 1, pips: [] });
  });
});

describe('boss bonus line value (docs/13 SPEC 3.6 rule 1)', () => {
  it('is 25 percent of par rounded half up to the nearest 500', () => {
    expect(BOSS_BONUS_STEP).toBe(500);
    expect(bossBonusFor(4000)).toBe(1000);
    expect(bossBonusFor(1000)).toBe(500); // 250 is half a step: rounds up
    expect(bossBonusFor(3000)).toBe(1000); // 750 is 1.5 steps: rounds up
    expect(bossBonusFor(2200)).toBe(500); // 550 rounds down to 500
    expect(bossBonusFor(2800)).toBe(500); // 700 rounds down to 500
    expect(bossBonusFor(2900)).toBe(500); // 725 rounds down to 500
    expect(bossBonusFor(3100)).toBe(1000); // 775 rounds up to 1000
    expect(bossBonusFor(40000)).toBe(10000);
  });

  it('is always a multiple of 500 and never below zero', () => {
    for (let par = 0; par <= 20000; par += 125) {
      const b = bossBonusFor(par);
      expect(b % 500, `par ${par}`).toBe(0);
      expect(b).toBeGreaterThanOrEqual(0);
    }
  });

  it('a par that is not a positive number pays 0', () => {
    expect(bossBonusFor(0)).toBe(0);
    expect(bossBonusFor(-1000)).toBe(0);
    expect(bossBonusFor(Number.NaN)).toBe(0);
    expect(bossBonusFor(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('a par under 1000 rounds the quarter down to 0 once it is under 250', () => {
    expect(bossBonusFor(900)).toBe(0); // 225
    expect(bossBonusFor(999)).toBe(0); // 249.75
  });
});
