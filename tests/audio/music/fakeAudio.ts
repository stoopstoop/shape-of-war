// Minimal fake Web Audio graph and timer for node tests. Records calls; never makes sound.
import type {
  BufferLike,
  BufferSourceLike,
  CompressorLike,
  FilterLike,
  GainLike,
  MusicContext,
  NodeLike,
  OscLike,
  ParamLike,
  SourceLike,
} from '../../../src/audio/music/engine';
import type { Timer } from '../../../src/audio/music/scheduler';

export class FakeParam implements ParamLike {
  value = 0;
  calls: { fn: string; v: number; t: number }[] = [];
  setValueAtTime(v: number, t: number): void {
    this.calls.push({ fn: 'set', v, t });
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.calls.push({ fn: 'lin', v, t });
  }
  exponentialRampToValueAtTime(v: number, t: number): void {
    this.calls.push({ fn: 'exp', v, t });
  }
  setTargetAtTime(v: number, t: number): void {
    this.calls.push({ fn: 'target', v, t });
  }
  cancelScheduledValues(t: number): void {
    this.calls.push({ fn: 'cancel', v: 0, t });
  }
}

export class FakeNode implements NodeLike {
  connected: (NodeLike | ParamLike)[] = [];
  disconnected = false;
  connect(dest: NodeLike | ParamLike): void {
    this.connected.push(dest);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode implements GainLike {
  readonly gain = new FakeParam();
}

export class FakeFilter extends FakeNode implements FilterLike {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

export class FakeSource extends FakeNode implements SourceLike {
  startAt: number | null = null;
  stops: number[] = [];
  onended: ((ev: Event) => unknown) | null = null;
  start(t: number): void {
    this.startAt = t;
  }
  stop(t: number): void {
    this.stops.push(t);
  }
  end(): void {
    this.onended?.(new Event('ended'));
  }
}

export class FakeOsc extends FakeSource implements OscLike {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
}

export class FakeBufferSource extends FakeSource implements BufferSourceLike {
  buffer: BufferLike | null = null;
  loop = false;
}

export class FakeCompressor extends FakeNode implements CompressorLike {
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
}

/** A context without createDynamicsCompressor (an old browser): the engine runs with no limiter. */
export class FakeContextNoLimiter implements MusicContext {
  currentTime = 0;
  readonly sampleRate = 8000;
  createGain(): FakeGain {
    return new FakeGain();
  }
  createOscillator(): FakeOsc {
    return new FakeOsc();
  }
  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource();
  }
  createBuffer(_channels: number, length: number): BufferLike {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

export class FakeContext implements MusicContext {
  currentTime = 0;
  readonly sampleRate = 8000;
  compressors: FakeCompressor[] = [];
  createDynamicsCompressor(): FakeCompressor {
    const c = new FakeCompressor();
    this.compressors.push(c);
    return c;
  }
  gains: FakeGain[] = [];
  oscs: FakeOsc[] = [];
  filters: FakeFilter[] = [];
  bufferSources: FakeBufferSource[] = [];
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createOscillator(): FakeOsc {
    const o = new FakeOsc();
    this.oscs.push(o);
    return o;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createBufferSource(): FakeBufferSource {
    const s = new FakeBufferSource();
    this.bufferSources.push(s);
    return s;
  }
  createBuffer(_channels: number, length: number): BufferLike {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

/** Timer driven by hand: fire() runs every live callback once. */
export class FakeTimer implements Timer {
  private fns = new Set<() => void>();
  intervals: number[] = [];
  every(fn: () => void, ms: number): () => void {
    this.fns.add(fn);
    this.intervals.push(ms);
    return () => {
      this.fns.delete(fn);
    };
  }
  fire(): void {
    for (const fn of [...this.fns]) fn();
  }
  get live(): number {
    return this.fns.size;
  }
}
