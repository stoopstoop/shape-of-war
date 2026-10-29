// The exposed contract (G3A: "a small indication of weakness is preferred like change of colour,
// clearer blinking, an alert"). BossState.exposed, BossView.exposed and exposedLeft, and the bus
// event 'sim:bossExposed' { id, exposed } on change, for Glow (colour and blink) and Chorus (alert).
import { afterEach, describe, expect, it } from 'vitest';
import { bus, type Events } from '../../src/core/events';
import { bossExposed, damageBoss, damageBossPart, exposedOf, livePart } from '../../src/game/bosses/core';
import { BROOD, WARDEN } from '../../src/game/bosses/table';
import { BossMode } from '../../src/game/bosses/types';
import { createBossView, readBoss } from '../../src/game/bosses/view';
import { triggerBomb } from '../../src/game/player';
import { stepGame } from '../../src/game/game';
import { bs, bossGame, enter, park, run } from './bossHelpers';
import { DT, idle, makeGame } from './helpers';

afterEach(() => bus.clear());

function listen(): Events['sim:bossExposed'][] {
  const log: Events['sim:bossExposed'][] = [];
  bus.on('sim:bossExposed', (p) => log.push({ ...p }));
  return log;
}

describe('exposedOf', () => {
  it('is the open window of a live boss past its entrance', () => {
    expect(exposedOf('alive', BossMode.Guarded, true)).toBe(true);
    expect(exposedOf('alive', BossMode.Entering, true)).toBe(false);
    expect(exposedOf('alive', BossMode.Vulnerable, false)).toBe(false);
    expect(exposedOf('defeated', BossMode.Vulnerable, true)).toBe(false);
    expect(exposedOf('waiting', BossMode.Vulnerable, true)).toBe(false);
  });
});

describe('sim:bossExposed', () => {
  it('a level without a boss never emits it', () => {
    const log = listen();
    const { w } = makeGame();
    for (let i = 0; i < 240; i++) stepGame(w, DT, idle());
    expect(log).toHaveLength(0);
    expect(bossExposed(w)).toBe(false);
  });

  it('brood: true when its last pod dies, with a 5 s timer in the view, false when the window closes', () => {
    const log = listen();
    const w = bossGame('brood');
    park(w, 0, 0);
    enter(w);
    run(w, 0.5);
    expect(log).toHaveLength(0);
    const s = bs(w);
    for (let k = 0; k < BROOD.podCount; k++) damageBossPart(w, livePart(w, s, k), BROOD.podHp, 0, 0);
    stepGame(w, DT, idle());
    expect(log).toEqual([{ id: 'brood', exposed: true }]);
    const v = readBoss(w, createBossView());
    expect(v.exposed).toBe(true);
    expect(v.exposedLeft).toBeGreaterThan(BROOD.openSec - 0.05);
    expect(v.exposedLeft).toBeLessThanOrEqual(BROOD.openSec);
    run(w, 2);
    expect(readBoss(w, v).exposedLeft).toBeCloseTo(BROOD.openSec - 2 - DT, 1);
    expect(v.exposedT).toBeCloseTo(2, 1);
    run(w, BROOD.openSec - 2 + 0.05);
    expect(log).toEqual([
      { id: 'brood', exposed: true },
      { id: 'brood', exposed: false },
    ]);
    expect(readBoss(w, v).exposed).toBe(false);
    expect(v.exposedLeft).toBe(-1);
  });

  it('warden: one true and one false per ring window, the window lasting openSec', () => {
    const log = listen();
    const w = bossGame('warden');
    park(w, 600, 400);
    enter(w);
    let openFor = 0;
    let t = 0;
    for (let i = 0; i < 120 * 10; i++) {
      stepGame(w, DT, idle());
      if (bossExposed(w)) openFor += DT;
      if (log.length === 2) break;
      t += DT;
    }
    expect(log).toEqual([
      { id: 'warden', exposed: true },
      { id: 'warden', exposed: false },
    ]);
    expect(Math.abs(openFor - WARDEN.openSec)).toBeLessThanOrEqual(DT * 2);
    expect(t).toBeGreaterThan(WARDEN.firstRing);
  });

  it('spindle: always open, so one true at the end of its entrance and an open ended timer', () => {
    const log = listen();
    const w = bossGame('spindle');
    park(w, 600, 400);
    enter(w);
    run(w, 6);
    expect(log).toEqual([{ id: 'spindle', exposed: true }]);
    expect(readBoss(w, createBossView()).exposedLeft).toBe(-1);
  });

  it('a bomb stagger on a closed core emits nothing and leaves it unexposed', () => {
    const log = listen();
    const w = bossGame('warden');
    park(w, 600, 400);
    enter(w);
    triggerBomb(w);
    run(w, 1.4);
    expect(bs(w).stagger).toBeGreaterThan(0);
    expect(log).toHaveLength(0);
    expect(bossExposed(w)).toBe(false);
  });

  it('a kill during the window emits false once', () => {
    const log = listen();
    const w = bossGame('spindle');
    park(w, 600, 400);
    enter(w);
    stepGame(w, DT, idle());
    damageBoss(w, 99999, 0, 0);
    stepGame(w, DT, idle());
    expect(log).toEqual([
      { id: 'spindle', exposed: true },
      { id: 'spindle', exposed: false },
    ]);
  });
});
