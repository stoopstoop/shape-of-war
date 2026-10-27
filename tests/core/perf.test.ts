import { describe, expect, it } from 'vitest';
import { initialDivisorState, nextDivisor, type DivisorInput } from '../../src/core/perf';

const cover: DivisorInput = { avgWorkMs: 4, avgFrameMs: 8.33, samples: 120, aspect: 2.33, bloomOn: true, nowSec: 0 };

describe('render divisor policy', () => {
  it('stays at 1 on the cover screen under light load', () => {
    expect(nextDivisor(initialDivisorState(), cover).divisor).toBe(1);
  });

  it('drops to 2 on the main screen with bloom on', () => {
    expect(nextDivisor(initialDivisorState(), { ...cover, aspect: 1.11 }).divisor).toBe(2);
  });

  it('drops to 2 when average work exceeds 9.5 ms over a full window', () => {
    expect(nextDivisor(initialDivisorState(), { ...cover, avgWorkMs: 10 }).divisor).toBe(2);
    expect(nextDivisor(initialDivisorState(), { ...cover, avgWorkMs: 10, samples: 30 }).divisor).toBe(1);
  });

  it('returns to 1 on the cover screen only after 5 s below 6.5 ms', () => {
    let s = { divisor: 2 as const, lowSince: -1 };
    let st = nextDivisor(s, { ...cover, avgWorkMs: 5, nowSec: 10 });
    expect(st.divisor).toBe(2);
    st = nextDivisor(st, { ...cover, avgWorkMs: 5, nowSec: 14.9 });
    expect(st.divisor).toBe(2);
    st = nextDivisor(st, { ...cover, avgWorkMs: 5, nowSec: 15 });
    expect(st.divisor).toBe(1);
    // A spike resets the streak.
    s = { divisor: 2, lowSince: -1 };
    st = nextDivisor(s, { ...cover, avgWorkMs: 5, nowSec: 0 });
    st = nextDivisor(st, { ...cover, avgWorkMs: 7, nowSec: 3 });
    st = nextDivisor(st, { ...cover, avgWorkMs: 5, nowSec: 6 });
    expect(nextDivisor(st, { ...cover, avgWorkMs: 5, nowSec: 10 }).divisor).toBe(2);
  });

  it('never returns to 1 on the main screen without bloom once dropped', () => {
    const st = nextDivisor({ divisor: 2, lowSince: 0 }, { ...cover, aspect: 1.1, bloomOn: false, avgWorkMs: 2, nowSec: 100 });
    expect(st.divisor).toBe(2);
  });

  it('forces 1 when the display itself runs at 60 Hz', () => {
    expect(nextDivisor({ divisor: 2, lowSince: -1 }, { ...cover, aspect: 1.1, avgFrameMs: 16.7 }).divisor).toBe(1);
  });
});
