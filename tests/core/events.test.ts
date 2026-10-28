import { describe, expect, it } from 'vitest';
import { Kind } from '../../src/game/world';
import { Bus } from '../../src/core/events';

describe('event bus', () => {
  it('delivers typed payloads and unsubscribes', () => {
    const bus = new Bus();
    const got: { x: number; y: number }[] = [];
    const off = bus.on('fx:death', (p) => got.push(p));
    bus.emit('fx:death', { x: 1, y: 2 });
    off();
    bus.emit('fx:death', { x: 3, y: 4 });
    expect(got).toEqual([{ x: 1, y: 2 }]);
  });

  it('supports void events and multiple handlers', () => {
    const bus = new Bus();
    let n = 0;
    bus.on('game:pause', () => n++);
    bus.on('game:pause', () => n++);
    bus.emit('game:pause');
    expect(n).toBe(2);
  });

  it('emit with no handlers is a no-op and clear removes all', () => {
    const bus = new Bus();
    bus.emit('sfx', 'shot');
    let n = 0;
    bus.on('fx:kill', () => n++);
    bus.clear();
    bus.emit('fx:kill', { x: 0, y: 0, colour: 'blue', kind: Kind.Grunt, id: 1 });
    expect(n).toBe(0);
  });
});
