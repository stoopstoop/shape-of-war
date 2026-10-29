// V3-A boss HUD data and pure logic: names, tiers, colours, the bar view, the phase pips, the
// hud:boss throttle gate and the boss bonus line.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bus } from '../../src/core/events';
import { bossBonusAwarded, damageBoss } from '../../src/game/bosses/core';
import { bossBonus } from '../../src/game/scoring';
import { gs } from '../../src/game/state';
import { BOSS_IDS, type BossId } from '../../src/levelgen/leveldef';
import { BASE_PALETTE } from '../../src/render/neon';
import {
  BANNER_FADE_IN_SEC,
  BANNER_FADE_OUT_SEC,
  BANNER_HOLD_SEC,
  BANNER_MAX_STEP_SEC,
  BANNER_TOTAL_SEC,
  bannerAdvance,
  bannerAlpha,
  BOSS_GATE_START,
  BOSS_GLOW_PX,
  BOSS_MAX_PIPS,
  BOSS_MIN_FRACTION,
  BOSS_NAMES,
  BOSS_PALETTE_KEY,
  BOSS_TIER,
  bossBannerText,
  bossColour,
  bossFill,
  bossGate,
  bossName,
  bossView,
  enterPayload,
  isBossId,
  needsBossStrip,
  pipStates,
  prismGradient,
  PRISM_CYCLE_SEC,
  TIER_DOT,
  type HudBoss,
} from '../../src/ui/boss';
import { formatInt } from '../../src/ui/format';
import { bossLine } from '../../src/ui/results';
import { bossGame, enter } from '../game/bossHelpers';

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

// G3A: the results line number is scoring.bossBonus and nothing else. The HUD helper that copied the
// rule (bossBonusFor, with its own share and step constants) is gone, so the two cannot drift.
describe('boss kill bonus has one copy: scoring.bossBonus (docs/13 SPEC 3.6 rule 1)', () => {
  const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('boss.ts no longer carries a bonus helper or its constants', () => {
    const src = read('../../src/ui/boss.ts');
    expect(src).not.toMatch(/bossBonusFor|BOSS_BONUS_SHARE|BOSS_BONUS_STEP/);
    expect(src).not.toMatch(/Math\.floor\([^)]*500/); // no second rounding rule either
  });

  it('main.ts imports bossBonus from game/scoring and reports it with (par, adventure, tier)', () => {
    const src = read('../../src/main.ts');
    expect(src).toMatch(/import \{[^}]*\bbossBonus\b[^}]*\} from '\.\/game\/scoring'/);
    expect(src).toMatch(/result\.bossBonus = bossBonus\(level\.par, 'adventure', level\.boss\?\.tier \?\? 0\)/);
    expect(src).not.toMatch(/bossBonusFor/);
    expect(src).not.toMatch(/from '\.\/ui\/boss'[^;]*bossBonus/);
  });

  it('scoring.bossBonus keeps the rule the line reports: 25 percent of par, half up to 500, never multiplied', () => {
    expect(bossBonus(4000, 'adventure', 1)).toBe(1000);
    expect(bossBonus(1000, 'adventure', 1)).toBe(500); // 250 is half a step: rounds up
    expect(bossBonus(3000, 'adventure', 1)).toBe(1000); // 750 is 1.5 steps: rounds up
    expect(bossBonus(2200, 'adventure', 1)).toBe(500); // 550 rounds down to 500
    expect(bossBonus(999, 'adventure', 1)).toBe(0); // 249.75 rounds down
    expect(bossBonus(0, 'adventure', 1)).toBe(0);
    expect(bossBonus(Number.NaN, 'adventure', 1)).toBe(0);
  });

  it('the Adventure number does not depend on the tier, so main.ts passing 0 for an unscheduled boss is safe', () => {
    for (const par of [0, 999, 1000, 2200, 4000, 10000, 23456, 40000]) {
      for (const tier of [0, 1, 2, 3, 4]) expect(bossBonus(par, 'adventure', tier), `par ${par} tier ${tier}`).toBe(bossBonus(par, 'adventure', 0));
    }
  });

  it('the results line text is exactly the sim payout: a real boss kill, then the line, across pars', () => {
    for (const par of [1000, 2200, 3000, 4000, 8999, 10000, 23456]) {
      const w = bossGame('spindle', { par });
      enter(w);
      const g = gs(w);
      const before = g.score;
      expect(damageBoss(w, 99999, 0, 0), `par ${par}`).toBe(true);
      const paid = g.score - before;
      expect(paid, `par ${par}`).toBe(bossBonus(par, 'adventure', BOSS_TIER.spindle));
      expect(bossBonusAwarded(w), `par ${par}`).toBe(paid);
      const line = bossLine({
        mode: 'adventure',
        levelIndex: 5,
        score: g.score,
        stars: 1,
        success: true,
        par,
        best: g.score,
        newBest: false,
        hash: 'abcd1234',
        space: 'low',
        bossBonus: bossBonus(par, 'adventure', 0), // what main.ts computes from level.par
      });
      expect(line, `par ${par}`).toBe(`Boss defeated, bonus ${formatInt(paid)}`);
      bus.clear();
    }
  });
});

describe('cover boss strip rule', () => {
  it('a boss level, Endless and the ?boss= debug hook reserve it; a plain Adventure level does not', () => {
    const boss = { boss: { id: 'warden', tier: 1, atSec: 20, hpMul: 1 } } as const;
    expect(needsBossStrip('adventure', boss, false)).toBe(true);
    expect(needsBossStrip('adventure', {}, false)).toBe(false);
    expect(needsBossStrip('adventure', {}, true)).toBe(true);
    expect(needsBossStrip('endless', {}, false)).toBe(true);
    expect(needsBossStrip('endless', boss, false)).toBe(true);
  });

  it('every boss id reserves it on its level', () => {
    for (const id of BOSS_IDS) {
      expect(needsBossStrip('adventure', { boss: { id, tier: BOSS_TIER[id], atSec: 20, hpMul: 1 } }, false), id).toBe(true);
    }
  });
});

describe('boss banner text', () => {
  it('is the upper case name then one dot', () => {
    expect(TIER_DOT).toBe('●');
    expect(bossBannerText('warden')).toBe('WARDEN ●');
    expect(bossBannerText('prism')).toBe('PRISM ●');
  });

  it('every boss id has a one line banner built from BOSS_NAMES, with exactly one dot and no newline', () => {
    for (const id of BOSS_IDS) {
      const t = bossBannerText(id);
      expect(t, id).toBe(`${BOSS_NAMES[id].toUpperCase()} ${TIER_DOT}`);
      expect(t.split(TIER_DOT), id).toHaveLength(2);
      expect(t, id).not.toContain('\n');
    }
  });

  it('an unknown id has no banner', () => {
    expect(bossBannerText('nobody')).toBe('');
    expect(bossBannerText('')).toBe('');
  });
});

describe('boss banner timing: fades in over 1.2 s', () => {
  it('the constants: 1.2 s in, then a hold and a short fade out', () => {
    expect(BANNER_FADE_IN_SEC).toBe(1.2);
    expect(BANNER_HOLD_SEC).toBeGreaterThan(0);
    expect(BANNER_FADE_OUT_SEC).toBeGreaterThan(0);
    expect(BANNER_TOTAL_SEC).toBeCloseTo(BANNER_FADE_IN_SEC + BANNER_HOLD_SEC + BANNER_FADE_OUT_SEC, 12);
  });

  it('opacity is 0 at the start and 1 at exactly 1.2 s, a straight ramp between', () => {
    expect(bannerAlpha(0)).toBe(0);
    expect(bannerAlpha(0.3)).toBeCloseTo(0.25, 12);
    expect(bannerAlpha(0.6)).toBeCloseTo(0.5, 12);
    expect(bannerAlpha(0.9)).toBeCloseTo(0.75, 12);
    expect(bannerAlpha(BANNER_FADE_IN_SEC)).toBe(1);
    let prev = -1;
    for (let t = 0; t <= BANNER_FADE_IN_SEC; t += 0.05) {
      const a = bannerAlpha(t);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });

  it('holds at 1, then ramps down to 0 at the total and stays 0', () => {
    expect(bannerAlpha(BANNER_FADE_IN_SEC + BANNER_HOLD_SEC / 2)).toBe(1);
    expect(bannerAlpha(BANNER_FADE_IN_SEC + BANNER_HOLD_SEC + BANNER_FADE_OUT_SEC / 2)).toBeCloseTo(0.5, 12);
    expect(bannerAlpha(BANNER_TOTAL_SEC)).toBe(0);
    expect(bannerAlpha(BANNER_TOTAL_SEC + 5)).toBe(0);
  });

  it('a negative or non finite time is 0', () => {
    for (const t of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(bannerAlpha(t)).toBe(0);
  });

  it('opacity always stays inside 0 to 1', () => {
    for (let t = -1; t < BANNER_TOTAL_SEC + 1; t += 0.013) {
      const a = bannerAlpha(t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('the clock adds the step, caps one step so a pause cannot skip the fade, and stops at the total', () => {
    expect(bannerAdvance(0, 0.1)).toBeCloseTo(0.1, 12);
    expect(bannerAdvance(0.5, 0.1)).toBeCloseTo(0.6, 12);
    expect(bannerAdvance(0, 30)).toBe(BANNER_MAX_STEP_SEC); // a 30 s pause is one capped step
    expect(bannerAdvance(BANNER_TOTAL_SEC - 0.01, 0.2)).toBe(BANNER_TOTAL_SEC);
    expect(bannerAdvance(BANNER_TOTAL_SEC, 0.2)).toBe(BANNER_TOTAL_SEC);
    expect(bannerAdvance(1, -5)).toBe(1);
    expect(bannerAdvance(1, Number.NaN)).toBe(1);
    expect(bannerAdvance(1, Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('100 ms hud:score steps take about 12 ticks to reach full opacity', () => {
    let t = 0;
    let ticks = 0;
    while (bannerAlpha(t) < 1) {
      t = bannerAdvance(t, 0.1);
      ticks++;
    }
    expect(ticks).toBe(12);
  });
});
