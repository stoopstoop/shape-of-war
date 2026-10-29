// Music entry points (SPEC 3.9). Subscribes to the core bus; never imports src/game, src/ui
// or src/render. Nothing here starts music by itself: glue calls startMusic(seed), or
// wireMusic(bus).levelStart(seed), at level start. Pause and a hidden tab suspend scheduling;
// resume lands on the next bar line. Enemy layers (wave D) follow 'sim:enemyEnter' and
// 'sim:enemyExit'; see lifecycle.ts for the timing rules and layers.ts for the registry.
// Kill accents (v2 fixes) follow 'fx:kill' plus 'sfx' explode and 'fx:bomb'; see kills.ts. Hit
// ticks and shield deflects follow 'fx:hit'; see hits.ts. Bus handlers only queue; every Web
// Audio node is made inside the scheduler tick, between frames. Every melodic pitch (motifs,
// entrance phrases, kill notes, resolutions, chord hits) comes from the harmonic plan in
// harmony.ts, so the contributions always agree with the bed.
//
// Tunes (v2.1): a session plays one tune from tunes.ts, chosen from the level seed (select.ts),
// so a level always has its tune and consecutive levels differ. Endless rotates to a new tune
// every 3 segments of play: the switch is booked a few bars ahead on a bar line, a 2 bar fill
// leads into it and the scheduler changes tempo from that step. A threat phase change (the lift
// turning on or off) also earns a 2 bar fill, and every odd pass of the loop ends in one.
//
// Boss music (v3 wave B): 'sim:bossEnter', 'sim:bossPhase' and 'sim:bossDown' drive bossLife.ts.
// The fight moves to the tier's boss bed (A, 120 BPM) on the join bar and back to the level tune
// a bar after the motif stops; the boss motif (boss.ts) plays as class 'boss' voices; the enemy
// motifs duck and only the newest three keep a voice; the threat floor is 0.8 while the boss
// lives. A boss death that ends the level ('game:over' in the same step) rings the defeat
// stinger out before the engine is released.
import { bus as coreBus, type Bus } from '../../core/events';
import type { BossId, BossTier, EnemyKind } from '../../levelgen/leveldef';
import { getAudioGraph } from '../synth';
import { BOSS_MOTIFS, BOSS_TIMBRES, voicesForPhase, type BossMotifNote } from './boss';
import {
  allowedEnemyKinds,
  BOSS_FLOOR,
  bookedPhase,
  bossDone,
  bossDown,
  bossEnter,
  bossEnvAt,
  bossMotifScale,
  bossPhase,
  clipToStop,
  DEFEAT_STING,
  DEFEAT_STING_STEPS,
  duckAt,
  enemyMotifSlots,
  entryStingSteps,
  floorOn,
  PHASE_STING_STEPS,
  phaseAt,
  releaseSteps,
  takeBossStings,
  voiceMayStart,
  type BossLife,
} from './bossLife';
import { BOSS_VOICE_MAX } from './engine';
import { chordToneMidi, harmonyAtStep } from './harmony';
import { createMusicEngine, voiceLength, type MusicContext, type MusicEngine, type NodeLike, type Span, type VoiceTrace } from './engine';
import {
  clamp01,
  clampMusicVolume,
  cutoffChanged,
  masterCutoff,
  mixFor,
  MUSIC_VOLUME_DEFAULT,
  musicMasterGain,
  nextLift,
  smoothThreat,
  sumGains,
  type Mix,
} from './intensity';
import {
  CHORD_STEPS,
  CHORD_TIMBRE,
  chordHit,
  enemyOf,
  gateBomb,
  gateKill,
  isBigSource,
  KILL_GATE_INIT,
  KILL_LEAD_SEC,
  KILL_QUEUE_MAX,
  KILL_SPECS,
  killNoteMidi,
  RESOLVE_GAIN,
  RESOLVE_STEPS,
  RESOLVE_TIMBRE,
  resolveMidi,
  sourceFor,
  type GateResult,
  type KillGate,
  type KillSource,
} from './kills';
import {
  DEFLECT_DROP,
  DEFLECT_DUR_SEC,
  DEFLECT_GAIN,
  DEFLECT_TIMBRE,
  deflectMidi,
  gateDeflect,
  gateHit,
  hasQueued,
  HIT_DUR_SEC,
  HIT_GATE_INIT,
  HIT_QUEUE_MAX,
  hitGain,
  hitMidi,
  hitOrder,
  hitTimbreFor,
  type HitGate,
  type QueuedHit,
} from './hits';
import { brighten, cutMotifs, LAYERS_FULL, stingerPhrase, type LayerRegistry, type MotifNote, type Timbre } from './layers';
import {
  barLineAfter,
  BOSS_STING_GAIN,
  enterLayer,
  envelopeAt,
  exitLayer,
  layerMix,
  motifActive,
  pruneLayers,
  STINGER_GAIN,
  takeStingers,
  type LayerSet,
} from './lifecycle';
import { createScheduler, LOOKAHEAD_SEC, planStep, realTimer, TICK_MS, type Scheduler, type Timer } from './scheduler';
import { endlessBlock, endlessTune, startTune, type RunMode } from './select';
import { buildBar, STEPS_PER_BAR, structuralFill, type BarPattern, type FillBar, type Layer } from './track';
import { bossTuneFor, DEFAULT_TUNE, FILL_BARS, tuneById, type Tune, type TuneId } from './tunes';

/** One scheduled note, reported to `onNote` (tests and debugging). */
export interface NoteLog {
  /** bossEntry, bossPhase and bossDefeat are the boss stingers; boss is the boss motif (v3). */
  readonly role:
    | 'bed'
    | 'stinger'
    | 'motif'
    | 'kill'
    | 'resolve'
    | 'chord'
    | 'hit'
    | 'deflect'
    | 'boss'
    | 'bossEntry'
    | 'bossPhase'
    | 'bossDefeat';
  /** Boss notes only: the boss, and the motif voice (0 main, 1 and 2 added by phases). */
  readonly boss?: BossId;
  readonly voice?: number;
  /** Bed layer, or null for stingers, motifs, kill accents and hits. */
  readonly layer: Layer | null;
  /** Enemy kind, or null for the bed, chords, deflects and non enemy sources (wells, spawners, segments, Mines, Slime). */
  readonly kind: EnemyKind | null;
  /** Kill notes and hit ticks only: what was killed or hit (also wells, spawners, segments, Mines, Slime). */
  readonly source?: KillSource;
  /** Audio clock when the note was handed to the engine. */
  readonly at?: number;
  readonly step: number;
  readonly time: number;
  readonly midi: number | null;
  readonly gain: number;
  /** The tune the note belongs to. */
  readonly tune?: TuneId;
}

export interface MusicGraph {
  readonly ctx: MusicContext;
  /** The synth master gain; the music bus feeds it. */
  readonly master: NodeLike;
}

/** Visibility source, document in the browser. */
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

export interface MusicOptions {
  /** Defaults to the core bus. */
  bus?: Bus;
  /** Defaults to synth getAudioGraph(). */
  graph?: () => MusicGraph | null;
  /** Defaults to setInterval. */
  timer?: Timer;
  /** Defaults to document when present; null disables the hidden tab hook. */
  visibility?: VisibilitySource | null;
  /** Initial music volume 0 to 100, default 50. */
  volume?: number;
  /**
   * Kinds that keep a motif. Default: every kind. Cut 1 passes CUT1_KEEP (grunt, wanderer,
   * weaver); every other kind keeps its stinger and gets an empty motif.
   */
  motifKinds?: readonly EnemyKind[];
  /**
   * Tests and debugging: play this tune on every level instead of the level's own (Endless
   * still rotates from it). Default: selection by level (select.ts).
   */
  tune?: TuneId;
  /** Called for every note handed to the engine. */
  onNote?: (n: NoteLog) => void;
  /** Voice spans from the engine (tests and debugging). */
  trace?: VoiceTrace;
}

type QueuedAccent = { readonly type: 'kill'; readonly source: KillSource } | { readonly type: 'bomb' };

interface KillStats {
  seen: number;
  notes: number;
  chords: number;
}

interface MotifCache {
  bar: number;
  notes: readonly MotifNote[];
}

/** A tune that plays from an absolute bar on; its own bar 0 is `fromBar`. */
interface TuneSpan {
  readonly fromBar: number;
  readonly tune: Tune;
}

interface Session {
  readonly seed: number;
  readonly mode: RunMode;
  readonly engine: MusicEngine;
  /** Tunes in play order; the last span whose fromBar is at or before a bar plays it. */
  readonly tunes: TuneSpan[];
  /** First bar of the last runtime fill (a phase change), or null. */
  fillStart: number | null;
  /** Seconds of music scheduled (play time; pause and a hidden tab do not count). */
  playSec: number;
  /** Endless rotation block of the last tune booked. */
  block: number;
  barIndex: number;
  bar: BarPattern | null;
  lastTick: number | null;
  layers: LayerSet;
  readonly motifs: Map<EnemyKind, MotifCache>;
  /** High threat lift, with hysteresis (intensity.ts nextLift). */
  lift: boolean;
  /** Last cutoff sent to the engine, so near repeats are not sent. */
  lastCutoff: number | null;
  gate: KillGate;
  readonly queue: QueuedAccent[];
  readonly stats: KillStats;
  hitGate: HitGate;
  readonly hits: QueuedHit[];
  /**
   * Steps where the arp rests because a chord hit lands there (B20). The arp now plays from low
   * threat, so on a busy bar line it would take the voice a bomb or big kill chord needs.
   */
  readonly arpYield: Set<number>;
  /** The boss music state (bossLife.ts), or null with no boss. */
  boss: BossLife | null;
  /** The tune a boss fight interrupted, restored after the boss; null with no boss state. */
  preBossTune: Tune | null;
  bossCache: { bar: number; phase: number; id: BossId; notes: readonly BossMotifNote[] } | null;
  /** First step every scheduled phase voice note has ended by (the defeat stinger waits for it). */
  bossExtraEnd: number;
  /** Audio time the defeat stinger ends, or 0 when none played. */
  defeatEnd: number;
}

interface Playing {
  readonly session: Session;
  readonly engine: MusicEngine;
  readonly scheduler: Scheduler;
  readonly ctx: MusicContext;
}

let volume = MUSIC_VOLUME_DEFAULT;
let target = 0;
let level = 0;
let gamePaused = false;
let hidden = false;
let graphSource: () => MusicGraph | null = getAudioGraph;
let timer: Timer = realTimer;
let playing: Playing | null = null;
let registry: LayerRegistry = LAYERS_FULL;
let noteHook: ((n: NoteLog) => void) | null = null;
/** Mode of the last 'game:start' (Next, Retry and Restart keep it). */
let runMode: RunMode = 'adventure';
let forcedTune: TuneId | null = null;
let voiceTrace: VoiceTrace | undefined;
/** Source of the last fx:kill; the 'explode' sfx that follows a scored kill consumes it. */
let pendingKill: KillSource | null = null;
/** Uninstall of the live initMusic install; a new install replaces it. */
let installed: (() => void) | null = null;
let installToken = 0;

function defaultVisibility(): VisibilitySource | null {
  return typeof document === 'undefined' ? null : document;
}

/** The tune span playing an absolute bar. */
function spanAt(s: Session, bar: number): TuneSpan {
  for (let i = s.tunes.length - 1; i >= 0; i--) {
    const t = s.tunes[i];
    if (t && t.fromBar <= bar) return t;
  }
  return s.tunes[0] ?? { fromBar: 0, tune: DEFAULT_TUNE };
}

/** The tune playing an absolute bar. */
function tuneAt(s: Session, bar: number): Tune {
  return spanAt(s, bar).tune;
}

/** The bar inside its tune (the tune's own bar count from where it started). */
function localBar(s: Session, bar: number): number {
  return bar - spanAt(s, bar).fromBar;
}

/** Seconds per step at an absolute step. */
function secAt(s: Session, step: number): number {
  return tuneAt(s, Math.floor(step / STEPS_PER_BAR)).stepSec;
}

/** The tune and local step of an absolute step, for every pitch decision. */
function where(s: Session, step: number): { tune: Tune; step: number; bar: number } {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const span = spanAt(s, bar);
  const local = step - span.fromBar * STEPS_PER_BAR;
  return { tune: span.tune, step: local, bar: Math.floor(local / STEPS_PER_BAR) };
}

/** The fill bar an absolute bar plays, structural or runtime (a lift change, an Endless rotation). */
function fillAt(s: Session, bar: number): FillBar {
  // A runtime fill wins: it leads into a change that is about to happen.
  if (s.fillStart !== null) {
    const k = bar - s.fillStart;
    if (k === 0 || k === 1) return k;
  }
  return structuralFill(tuneAt(s, bar), localBar(s, bar));
}

function makeBar(s: Session, index: number): BarPattern {
  return buildBar(s.seed, localBar(s, index), tuneAt(s, index), fillAt(s, index));
}

function barFor(s: Session, index: number): BarPattern {
  if (s.bar === null || s.barIndex !== index) {
    s.bar = makeBar(s, index);
    s.barIndex = index;
  }
  return s.bar;
}

function logNote(tune: Tune, n: NoteLog): void {
  noteHook?.({ ...n, tune: tune.id });
}

/** Bars after a runtime fill before another may start. */
const FILL_COOLDOWN_BARS = 4;
/** Bars from the first bar past the lookahead to a booked Endless switch (the fill sits in between). */
const SWITCH_LEAD_BARS = FILL_BARS + 1;

/** The first bar no step of which can be scheduled yet: changes are booked from here. */
function freeBar(sched: Scheduler, now: number): number {
  return Math.floor(sched.stepAtOrAfter(now + LOOKAHEAD_SEC + 0.05) / STEPS_PER_BAR) + 1;
}

/** Book a 2 bar fill from the first free bar, unless one played recently. */
function bookFill(s: Session, sched: Scheduler, now: number): void {
  const from = freeBar(sched, now);
  if (s.fillStart !== null && from < s.fillStart + FILL_BARS + FILL_COOLDOWN_BARS) return;
  s.fillStart = from;
}

/** Endless: book the next tune when the play time reaches the next rotation block. */
function maybeRotate(s: Session, sched: Scheduler, now: number): void {
  // A boss fight holds its boss bed; the rotation books its next tune after the boss state ends.
  if (s.mode !== 'endless' || s.boss !== null) return;
  const last = s.tunes[s.tunes.length - 1];
  const cur = last?.tune ?? DEFAULT_TUNE;
  // Lead time: the fill bars plus the lookahead, so the switch lands on the segment line.
  const lead = (SWITCH_LEAD_BARS + 1) * STEPS_PER_BAR * cur.stepSec;
  const block = endlessBlock(s.playSec + lead);
  if (block <= s.block || (last !== undefined && last.fromBar >= freeBar(sched, now))) return;
  const fromBar = freeBar(sched, now) + FILL_BARS;
  const tune = endlessTune(s.seed, block);
  s.block = block;
  s.fillStart = fromBar - FILL_BARS;
  // Consecutive blocks always differ; only a forced start tune can match its successor.
  if (tune.id === cur.id) return;
  s.tunes.push({ fromBar, tune });
  sched.setStepSec(tune.stepSec, fromBar * STEPS_PER_BAR);
}

function onTick(s: Session, now: number, sched: Scheduler): void {
  const dt = s.lastTick === null ? 0 : now - s.lastTick;
  s.lastTick = now;
  // While a boss lives the threat never falls under the floor; after it dies the floor goes and
  // the smoother's release (3 s) brings the level down.
  level = smoothThreat(level, floorOn(s.boss) ? Math.max(target, BOSS_FLOOR) : target, dt);
  const lift = nextLift(s.lift, level);
  // A threat phase change (the lift turning on or off) earns a 2 bar fill.
  if (lift !== s.lift) bookFill(s, sched, now);
  s.lift = lift;
  maybeRotate(s, sched, now);
  const hz = masterCutoff(level, s.lift);
  // Only meaningful changes reach the AudioParam: 40 setTargetAtTime calls a second grew the
  // automation list for nothing.
  if (cutoffChanged(s.lastCutoff, hz)) {
    s.engine.setCutoff(hz);
    s.lastCutoff = hz;
  }
  // A kill pair ('fx:kill' then 'explode') is emitted synchronously inside one sim step, so a
  // source still pending at a tick never pairs.
  pendingKill = null;
  drainAccents(s, now, sched);
  drainHits(s, now, sched);
}

/**
 * Bed and motif notes that will start before `until` but are not scheduled yet. The track and
 * the motifs are composed, so the voice budget can count them before they exist.
 */
/**
 * True when the arp rests at this step: a chord hit starting at `yieldAt` asks for its voice, or
 * one already took it. The arp rests for the whole chord (CHORD_STEPS), since its notes follow
 * one another in a single voice that would otherwise count against the chord at every step.
 */
function arpRests(s: Session, step: number, yieldAt: number | null): boolean {
  return (yieldAt !== null && step >= yieldAt && step < yieldAt + CHORD_STEPS) || s.arpYield.has(step);
}

function upcomingSpans(s: Session, sched: Scheduler, until: number, yieldAt: number | null = null): Span[] {
  const out: Span[] = [];
  const mix = mixFor(level, s.lift);
  for (let step = sched.nextStep; sched.timeOf(step) < until; step++) {
    const time = sched.timeOf(step);
    const barIndex = Math.floor(step / STEPS_PER_BAR);
    const inBar = step % STEPS_PER_BAR;
    const sec = secAt(s, step);
    const bar = s.bar !== null && s.barIndex === barIndex ? s.bar : makeBar(s, barIndex);
    for (const n of planStep(bar, inBar, mix, time, sec)) {
      if (n.layer === 'arp' && arpRests(s, step, yieldAt)) continue;
      out.push({ start: time, end: time + voiceLength(n.layer, n.dur) });
    }
    for (const l of s.layers) {
      if (!motifActive(l, step) || envelopeAt(l, step) <= 0) continue;
      for (const n of motifBar(s, l.kind, barIndex)) {
        if (n.step === inBar) out.push({ start: time, end: time + n.durSteps * sec });
      }
    }
    const b = s.boss;
    if (b !== null) {
      for (const n of bossBar(s, b, barIndex)) {
        if (n.step !== inBar || !voiceMayStart(b, n.voice, step)) continue;
        const d = clipToStop(b, step, n.durSteps);
        if (d > 0) out.push({ start: time, end: time + d * sec });
      }
    }
  }
  return out;
}

/** The boss motif notes of an absolute bar (empty before the join), cached per bar and phase. */
function bossBar(s: Session, b: BossLife, bar: number): readonly BossMotifNote[] {
  const local = bar - Math.floor(b.joinStep / STEPS_PER_BAR);
  if (local < 0) return [];
  const phase = phaseAt(b, bar * STEPS_PER_BAR);
  const c = s.bossCache;
  if (c && c.bar === bar && c.phase === phase && c.id === b.id) return c.notes;
  const notes = BOSS_MOTIFS[b.id].motif(phase, local);
  s.bossCache = { bar, phase, id: b.id, notes };
  return notes;
}

/**
 * Book `tune` from the bar line `fromBar`: tune spans that have not started yet (a pending
 * Endless rotation, a pending boss bed) are dropped first, so the scheduler's single tempo change
 * always belongs to the last span. Booking the tune already playing only cancels what was pending.
 */
function bookTune(s: Session, sched: Scheduler, fromBar: number, tune: Tune): void {
  while (s.tunes.length > 1) {
    const last = s.tunes[s.tunes.length - 1];
    if (!last || last.fromBar * STEPS_PER_BAR < sched.nextStep) break;
    s.tunes.pop();
  }
  // Bars and motifs built ahead with the old plan are rebuilt.
  s.motifs.clear();
  s.bossCache = null;
  if (s.bar !== null && s.barIndex >= fromBar) s.bar = null;
  const cur = s.tunes[s.tunes.length - 1]?.tune ?? DEFAULT_TUNE;
  if (cur === tune) {
    sched.setStepSec(cur.stepSec, sched.nextStep);
    return;
  }
  s.tunes.push({ fromBar, tune });
  sched.setStepSec(tune.stepSec, fromBar * STEPS_PER_BAR);
}

/**
 * Free accent voices for `steps` sixteenths from `step`. A chord asks with `arpYields`: the arp
 * note on its own step (not yet scheduled) gives way, so it does not count against the chord.
 */
function roomAt(s: Session, sched: Scheduler, step: number, steps: number, arpYields = false): number {
  const t = sched.timeOf(step);
  const len = steps * secAt(s, step);
  return s.engine.accentRoom(t, len, upcomingSpans(s, sched, t + len, arpYields ? step : null));
}

function applyGate(s: Session, sched: Scheduler, r: GateResult, source: KillSource | null, at: number, arpYields = false): void {
  s.gate = r.gate;
  const a = r.action;
  if (a.type === 'note' && source !== null) {
    const spec = KILL_SPECS[source];
    const w = where(s, a.step);
    // The kind's voice, the chord's arpeggio: climbing with the kill count in the bar.
    const midi = killNoteMidi(w.bar, a.index, w.tune);
    const time = sched.timeOf(a.step);
    const gain = spec.noteGain * (0.8 + 0.2 * level);
    s.engine.playVoice({ time, dur: a.dur * w.tune.stepSec, midi, fromMidi: null, gain, timbre: spec.noteTimbre }, 'accent');
    s.stats.notes++;
    if (noteHook) logNote(w.tune, { role: 'kill', layer: null, kind: enemyOf(source), source, step: a.step, time, midi, gain, at });
    if (a.resolveAt !== null) {
      // The third kill note of the bar: the run resolves to the next chord's root on the bar line.
      const r = where(s, a.resolveAt);
      const rTime = sched.timeOf(a.resolveAt);
      const rMidi = resolveMidi(r.bar, r.tune);
      s.engine.playVoice({ time: rTime, dur: RESOLVE_STEPS * r.tune.stepSec, midi: rMidi, fromMidi: null, gain: RESOLVE_GAIN, timbre: RESOLVE_TIMBRE }, 'accent');
      if (noteHook) logNote(r.tune, { role: 'resolve', layer: null, kind: null, step: a.resolveAt, time: rTime, midi: rMidi, gain: RESOLVE_GAIN, at });
    }
  } else if (a.type === 'chord') {
    const w = where(s, a.step);
    const time = sched.timeOf(a.step);
    const hit = chordHit(w.bar, a.big, a.withResolve, w.tune);
    const all = hit.midis;
    const room = roomAt(s, sched, a.step, CHORD_STEPS, arpYields);
    // Fewer free voices than notes: drop from the bottom (the big chord's low note goes first).
    const notes = all.slice(Math.max(0, all.length - room));
    // The arp rests under a bomb's chord (only while its steps are ahead). Kill chords do not
    // move it, so they stay as rare as before the arp came in early.
    if (arpYields && notes.length > 0) {
      for (let k = Math.max(a.step, sched.nextStep); k < a.step + CHORD_STEPS; k++) s.arpYield.add(k);
    }
    const gain = hit.gain / Math.max(1, notes.length);
    for (const midi of notes) {
      s.engine.playVoice({ time, dur: CHORD_STEPS * w.tune.stepSec, midi, fromMidi: null, gain, timbre: CHORD_TIMBRE }, 'accent');
      if (noteHook) logNote(w.tune, { role: 'chord', layer: null, kind: null, step: a.step, time, midi, gain, at });
    }
    s.stats.chords++;
  }
}

/** Decide and schedule queued kills and bombs on the 16th grid. Runs inside the tick only. */
function drainAccents(s: Session, now: number, sched: Scheduler): void {
  if (s.queue.length === 0) return;
  if (volume === 0) {
    s.queue.length = 0;
    return;
  }
  const step = sched.stepAtOrAfter(now + KILL_LEAD_SEC);
  // Every queued kill lands on the same step, so voice room is computed once per (start,
  // length) and only recomputed after an accent is actually scheduled.
  const cache = new Map<string, number>();
  const roomFor = (at: number, steps: number, arpYields: boolean): number => {
    const key = `${at}:${steps}:${arpYields ? 1 : 0}`;
    let r = cache.get(key);
    if (r === undefined) {
      r = roomAt(s, sched, at, steps, arpYields);
      cache.set(key, r);
    }
    return r;
  };
  const room = (at: number, steps: number): number => roomFor(at, steps, false);
  // A bomb's chord counts the arp as resting (applyGate rests it); kill chords do not.
  const bombChordRoom = (at: number): number => roomFor(at, CHORD_STEPS, true);
  const chordRoom = (at: number): number => roomFor(at, CHORD_STEPS, false);
  const resolveRoom = (at: number): number => room(at, RESOLVE_STEPS);
  for (const q of s.queue) {
    let r: GateResult;
    let source: KillSource | null = null;
    if (q.type === 'bomb') {
      r = gateBomb(s.gate, step, bombChordRoom);
    } else {
      source = q.source;
      const spec = KILL_SPECS[q.source];
      r = gateKill(s.gate, {
        step,
        level,
        big: isBigSource(q.source),
        // A head's segment burst lands in one tick; it must not turn into a streak chord that
        // would absorb the head's big chord.
        streaks: q.source !== 'segment',
        durSteps: spec.durSteps,
        noteRoom: room,
        chordRoom,
        resolveRoom,
      });
    }
    applyGate(s, sched, r, source, now, q.type === 'bomb');
    if (r.action.type !== 'none') cache.clear();
  }
  s.queue.length = 0;
}

function queueAccent(q: QueuedAccent): void {
  const p = playing;
  if (!p || p.scheduler.paused) return;
  if (q.type === 'kill') p.session.stats.seen++;
  // Over the cap the kill keeps its sfx only.
  if (p.session.queue.length < KILL_QUEUE_MAX) p.session.queue.push(q);
}

/** The grid step whose sixteenth contains time t (for the bar a hit's pitch follows). */
function stepContaining(sched: Scheduler, t: number): number {
  const s = sched.stepAtOrAfter(t);
  return sched.timeOf(s) > t ? s - 1 : s;
}

/** Free accent voices over [t, t + len), seconds. */
function roomAtTime(s: Session, sched: Scheduler, t: number, len: number): number {
  return s.engine.accentRoom(t, len, upcomingSpans(s, sched, t + len));
}

/**
 * Decide and schedule queued hit ticks and deflects. Runs inside the tick only, after the kill
 * accents, so a kill note on this tick has already taken its voice. Hits play as accents and
 * only into free room, so they never steal a bed or motif voice.
 */
function drainHits(s: Session, now: number, sched: Scheduler): void {
  if (s.hits.length === 0) return;
  if (volume === 0) {
    s.hits.length = 0;
    return;
  }
  const t = now + KILL_LEAD_SEC;
  const step = stepContaining(sched, t);
  const w = where(s, Math.max(0, step));
  for (const q of hitOrder(s.hits, s.hitGate)) {
    if (q.blocked) {
      const r = gateDeflect(s.hitGate, t, () => roomAtTime(s, sched, t, DEFLECT_DUR_SEC));
      s.hitGate = r.gate;
      if (!r.ok) continue;
      const midi = deflectMidi(w.bar, w.tune);
      s.engine.playVoice({ time: t, dur: DEFLECT_DUR_SEC, midi, fromMidi: midi + DEFLECT_DROP, gain: DEFLECT_GAIN, timbre: DEFLECT_TIMBRE }, 'accent');
      if (noteHook) logNote(w.tune, { role: 'deflect', layer: null, kind: null, step, time: t, midi, gain: DEFLECT_GAIN, at: now });
    } else {
      const source = q.source;
      const r = gateHit(s.hitGate, source, t, () => roomAtTime(s, sched, t, HIT_DUR_SEC));
      s.hitGate = r.gate;
      if (!r.ok) continue;
      const midi = hitMidi(source, w.bar, w.tune);
      const gain = hitGain(source);
      s.engine.playVoice({ time: t, dur: HIT_DUR_SEC, midi, fromMidi: null, gain, timbre: hitTimbreFor(source) }, 'accent');
      if (noteHook) logNote(w.tune, { role: 'hit', layer: null, kind: enemyOf(source), source, step, time: t, midi, gain, at: now });
    }
  }
  s.hits.length = 0;
}

function queueHit(h: QueuedHit): void {
  const p = playing;
  if (!p || p.scheduler.paused) return;
  const q = p.session.hits;
  if (q.length < HIT_QUEUE_MAX && !hasQueued(q, h)) q.push(h);
}

function motifBar(s: Session, kind: EnemyKind, bar: number): readonly MotifNote[] {
  const c = s.motifs.get(kind);
  if (c && c.bar === bar) return c.notes;
  const notes = registry[kind].motif(s.seed, localBar(s, bar), tuneAt(s, bar));
  s.motifs.set(kind, { bar, notes });
  return notes;
}

const leadTimbres = new Map<Timbre, Timbre>();

/** The brightened timbre for an entrance phrase (cached; the same object every call). */
function leadTimbre(t: Timbre): Timbre {
  let b = leadTimbres.get(t);
  if (b === undefined) {
    b = brighten(t);
    leadTimbres.set(t, b);
  }
  return b;
}

function scaleMix(m: Mix, k: number): Mix {
  if (k >= 1) return m;
  const g = m.gains;
  return { ...m, gains: { bass: g.bass * k, pad: g.pad * k, kick: g.kick * k, perc: g.perc * k, hat: g.hat * k, arp: g.arp * k } };
}

function onStep(p: Session, step: number, time: number): void {
  // Layer state advances even at volume 0, so turning the volume up finds the right layers.
  p.layers = pruneLayers(p.layers, step);
  const take = takeStingers(p.layers, step);
  p.layers = take.set;
  // Boss stingers are taken (and the boss state pruned) at volume 0 too, so none plays late.
  let stings = { entry: false, phase: false, defeat: false };
  let b = p.boss;
  if (b !== null) {
    const t = takeBossStings(b, step, p.bossExtraEnd <= step);
    stings = t;
    b = t.life;
    p.boss = bossDone(b, step) ? null : b;
    if (p.boss === null) {
      p.preBossTune = null;
      p.bossCache = null;
    }
  }
  const w = where(p, step);
  const sec = w.tune.stepSec;
  p.playSec += sec;
  if (volume === 0) return;
  const barIndex = Math.floor(step / STEPS_PER_BAR);
  const inBar = step % STEPS_PER_BAR;
  const mix = mixFor(level, p.lift);
  // Beside a boss only the newest enemy motifs keep a voice, ducked; the boss motif is budgeted.
  const live = p.boss;
  const duck = duckAt(live, step);
  const allowed = live === null ? null : allowedEnemyKinds(p.layers, step, enemyMotifSlots(live));
  const enemies = allowed === null ? p.layers : p.layers.filter((l) => allowed.has(l.kind));
  const bossSpec = b === null ? null : BOSS_MOTIFS[b.id];
  const bossVoices = b === null || bossSpec === null ? 0 : voicesForPhase(bossSpec, phaseAt(b, step));
  const bossScale = bossSpec === null ? 1 : bossMotifScale(bossSpec.gain, bossVoices);
  const bossEnv = b === null ? 0 : bossEnvAt(b, step);
  // The budget counts a booked phase's voices from the moment it is booked (as enemy layers count
  // at full gain from their entry), so the bed makes room before the new voice joins.
  const booked = b === null || bossSpec === null ? 0 : voicesForPhase(bossSpec, bookedPhase(b));
  const bossTotal = bossSpec === null ? 0 : bossSpec.gain * booked * bossMotifScale(bossSpec.gain, booked) * bossEnv;
  const lm = layerMix(sumGains(mix.gains), enemies, registry, step, live === null ? null : { duck, total: bossTotal });
  const arpYields = p.arpYield.delete(step);
  for (const n of planStep(barFor(p, barIndex), inBar, scaleMix(mix, lm.bedScale), time, sec)) {
    if (arpYields && n.layer === 'arp') continue;
    p.engine.play(n, w.tune.bed);
    if (noteHook) logNote(w.tune, { role: 'bed', layer: n.layer, kind: null, step, time, midi: n.midi, gain: n.gain });
  }
  for (const kind of take.due) {
    // The kind's entrance phrase, whole, from this step: the same shape every time, each note
    // in the chord of its own bar, in the active tune's key. Monophonic, so it holds one voice
    // at a time.
    const spec = registry[kind];
    const timbre = leadTimbre(spec.timbre);
    const offset = step - w.step;
    for (const n of stingerPhrase(spec, w.step, w.tune)) {
      const t = time + (n.step - w.step) * sec;
      const gain = STINGER_GAIN * n.vel;
      p.engine.playVoice({ time: t, dur: n.dur * sec, midi: n.midi, fromMidi: null, gain, timbre });
      if (noteHook) logNote(w.tune, { role: 'stinger', layer: null, kind, step: n.step + offset, time: t, midi: n.midi, gain });
    }
  }
  for (const l of enemies) {
    // The duck multiplies the layer's own fade, so a motif fading out when a boss enters keeps
    // falling and a motif fading in rises only to the duck.
    const env = envelopeAt(l, step) * duck;
    if (env <= 0) continue;
    const spec = registry[l.kind];
    for (const n of motifBar(p, l.kind, barIndex)) {
      if (n.step !== inBar) continue;
      const gain = spec.gain * lm.motifScale * env * n.vel;
      p.engine.playVoice({ time, dur: n.durSteps * sec, midi: n.midi, fromMidi: n.fromMidi, gain, timbre: spec.timbre });
      if (noteHook) logNote(w.tune, { role: 'motif', layer: null, kind: l.kind, step, time, midi: n.midi, gain });
    }
  }
  if (b !== null && bossSpec !== null) {
    if (stings.entry) playEntrySting(p, b, step, time);
    if (stings.phase && voicesForPhase(bossSpec, phaseAt(b, step)) < BOSS_VOICE_MAX) playPhaseSting(p, b, step, time);
    if (stings.defeat) playDefeatSting(p, b, step, time);
    for (const n of bossBar(p, b, barIndex)) {
      if (n.step !== inBar || !voiceMayStart(b, n.voice, step)) continue;
      const dur = clipToStop(b, step, n.durSteps);
      if (dur <= 0) continue;
      const gain = bossSpec.gain * bossScale * bossEnv * n.vel;
      p.engine.playVoice({ time, dur: dur * sec, midi: n.midi, fromMidi: n.fromMidi, gain, timbre: bossSpec.timbre }, 'boss');
      if (n.voice > 0) p.bossExtraEnd = Math.max(p.bossExtraEnd, step + dur);
      if (noteHook) logNote(w.tune, { role: 'boss', layer: null, kind: null, boss: b.id, voice: n.voice, step, time, midi: n.midi, gain });
    }
  }
}

/** Notes of the entry stinger, the base chord tones it is built from (root, third, fifth). */
const ENTRY_DEGREES: readonly number[] = [0, 1, 2];
/** The entry chord is voiced from the root nearest A3. */
const ENTRY_BASE = 57;

/** The entry stinger: one chord hit on the chord sounding now, ending by the join bar line. */
function playEntrySting(p: Session, b: BossLife, step: number, time: number): void {
  const w = where(p, step);
  const h = harmonyAtStep(w.step, w.tune.key);
  const dur = entryStingSteps(b, step) * w.tune.stepSec;
  const gain = BOSS_STING_GAIN / ENTRY_DEGREES.length;
  for (const deg of ENTRY_DEGREES) {
    const midi = chordToneMidi(h, deg, ENTRY_BASE);
    p.engine.playVoice({ time, dur, midi, fromMidi: null, gain, timbre: BOSS_TIMBRES.bossSting }, 'boss');
    if (noteHook) logNote(w.tune, { role: 'bossEntry', layer: null, kind: null, boss: b.id, step, time, midi, gain });
  }
}

/** The phase sting: the chord root then its fifth, one voice, ending by the bar line the new voice joins on. */
function playPhaseSting(p: Session, b: BossLife, step: number, time: number): void {
  const w = where(p, step);
  const h = harmonyAtStep(w.step, w.tune.key);
  const left = barLineAfter(step) - step;
  const base = BOSS_MOTIFS[b.id].register + 12;
  const notes = [
    { at: 0, midi: chordToneMidi(h, 0, base) },
    { at: PHASE_STING_STEPS, midi: chordToneMidi(h, 2, base) },
  ];
  for (const n of notes) {
    const len = Math.min(PHASE_STING_STEPS, left - n.at);
    if (len <= 0) continue;
    const t = time + n.at * w.tune.stepSec;
    p.engine.playVoice({ time: t, dur: len * w.tune.stepSec, midi: n.midi, fromMidi: null, gain: BOSS_STING_GAIN, timbre: BOSS_TIMBRES.bossSting }, 'boss');
    if (noteHook) logNote(w.tune, { role: 'bossPhase', layer: null, kind: null, boss: b.id, step: step + n.at, time: t, midi: n.midi, gain: BOSS_STING_GAIN });
  }
}

/** Root of the defeat stinger: A4. */
const DEFEAT_ROOT = 69;

/** The defeat stinger: A, C sharp, E rising from A4 (an A major resolution), one voice. */
function playDefeatSting(p: Session, b: BossLife, step: number, time: number): void {
  const w = where(p, step);
  const sec = w.tune.stepSec;
  for (const n of DEFEAT_STING) {
    const t = time + n.at * sec;
    const midi = DEFEAT_ROOT + n.semis;
    p.engine.playVoice({ time: t, dur: n.dur * sec, midi, fromMidi: null, gain: BOSS_STING_GAIN, timbre: BOSS_TIMBRES.bossSting }, 'boss');
    if (noteHook) logNote(w.tune, { role: 'bossDefeat', layer: null, kind: null, boss: b.id, step: step + n.at, time: t, midi, gain: BOSS_STING_GAIN });
  }
  p.defeatEnd = time + DEFEAT_STING_STEPS * sec;
}

function onBossEnter(id: BossId, tier: BossTier): void {
  const p = playing;
  if (!p || !(id in BOSS_MOTIFS)) return;
  const s = p.session;
  const sched = p.scheduler;
  const prev = s.boss;
  const next = bossEnter(prev, id, tier, sched.nextStep);
  if (next === prev) return;
  // The tune the level plays (a pending Endless rotation included), unless a boss already
  // interrupted it: a second boss restores the same tune afterwards.
  if (s.preBossTune === null) s.preBossTune = s.tunes[s.tunes.length - 1]?.tune ?? DEFAULT_TUNE;
  s.boss = next;
  s.bossCache = null;
  s.bossExtraEnd = 0;
  s.defeatEnd = 0;
  bookTune(s, sched, Math.floor(next.joinStep / STEPS_PER_BAR), bossTuneFor(tier, s.preBossTune));
}

function onBossPhase(id: BossId, phase: number): void {
  const p = playing;
  const b = p?.session.boss ?? null;
  if (!p || b === null) return;
  p.session.boss = bossPhase(b, id, phase, p.scheduler.nextStep);
}

/** Bars of the boss bed after the motif stops, under the defeat stinger, before the level tune returns. */
const RESTORE_BARS = 1;

function onBossDown(id: BossId): void {
  const p = playing;
  const s = p?.session;
  const b = s?.boss ?? null;
  if (!p || !s || b === null) return;
  const sched = p.scheduler;
  const next = bossDown(b, id, sched.nextStep, releaseSteps(secAt(s, sched.nextStep)));
  if (next === b) return;
  s.boss = next;
  const stop = next.stopStep ?? barLineAfter(sched.nextStep);
  if (s.preBossTune !== null) bookTune(s, sched, Math.floor(stop / STEPS_PER_BAR) + RESTORE_BARS, s.preBossTune);
}

function onEnter(kind: EnemyKind): void {
  const p = playing;
  if (!p || !(kind in registry)) return;
  p.session.layers = enterLayer(p.session.layers, kind, p.scheduler.nextStep);
}

function onExit(kind: EnemyKind): void {
  const p = playing;
  if (!p || !(kind in registry)) return;
  p.session.layers = exitLayer(p.session.layers, kind, p.scheduler.nextStep);
}

function suspend(): void {
  const p = playing;
  if (!p || p.scheduler.paused) return;
  p.scheduler.pause();
  p.engine.silence();
  p.session.queue.length = 0;
  p.session.hits.length = 0;
  // Chord hits and resolutions booked ahead were just silenced: forget them, so a bomb after
  // the resume is not absorbed by a chord that never sounds.
  p.session.gate = KILL_GATE_INIT;
  pendingKill = null;
}

function maybeResume(): void {
  const p = playing;
  if (!p || !p.scheduler.paused || gamePaused || hidden) return;
  p.session.lastTick = null;
  p.scheduler.resume();
}

/**
 * Wire music to the bus and the visibility hook. Returns an uninstall function that also
 * stops any music. Calling it again replaces the previous install, so handlers never double.
 */
export function initMusic(opts: MusicOptions = {}): () => void {
  installed?.();
  const token = ++installToken;
  const b = opts.bus ?? coreBus;
  graphSource = opts.graph ?? getAudioGraph;
  timer = opts.timer ?? realTimer;
  registry = opts.motifKinds === undefined ? LAYERS_FULL : cutMotifs(opts.motifKinds);
  noteHook = opts.onNote ?? null;
  voiceTrace = opts.trace;
  forcedTune = opts.tune ?? null;
  runMode = 'adventure';
  pendingKill = null;
  if (opts.volume !== undefined) volume = clampMusicVolume(opts.volume);
  const vis = opts.visibility === undefined ? defaultVisibility() : opts.visibility;
  hidden = vis?.hidden ?? false;
  const offs = [
    b.on('sim:threat', (p) => {
      target = clamp01(p.level);
    }),
    b.on('sim:enemyEnter', (p) => onEnter(p.kind)),
    b.on('sim:enemyExit', (p) => onExit(p.kind)),
    // A scored kill, a Mine or Slime pop and a well going down emit 'fx:kill' then 'sfx'
    // explode, so their source waits for the explode. Snake segments in a head's death burst
    // emit 'fx:kill' alone (kind SnakeBody) and queue at once. The kind decides the source; the
    // colour is read only when the kind is missing. The payload object is reused by the sim:
    // read the fields here.
    b.on('fx:kill', (p) => {
      const source = sourceFor(p.kind, p.colour);
      if (source === 'segment') {
        queueAccent({ type: 'kill', source });
        return;
      }
      pendingKill = source;
    }),
    b.on('sfx', (name) => {
      const source = pendingKill;
      pendingKill = null;
      if (name !== 'explode') return;
      if (source !== null) queueAccent({ type: 'kill', source });
    }),
    // Damage that did not kill. A shield block is a deflect whatever the kind.
    b.on('fx:hit', (p) => {
      if (p.blocked === true) {
        queueHit({ blocked: true });
        return;
      }
      const source = sourceFor(p.kind, undefined);
      if (source !== null) queueHit({ blocked: false, source });
    }),
    b.on('fx:bomb', () => queueAccent({ type: 'bomb' })),
    // Boss music (v3). The payload objects are reused by the sim: read the fields here.
    b.on('sim:bossEnter', (p) => onBossEnter(p.id, p.tier)),
    b.on('sim:bossPhase', (p) => onBossPhase(p.id, p.phase)),
    b.on('sim:bossDown', (p) => onBossDown(p.id)),
    // The run mode picks the selection rule (a level's tune, or the Endless rotation). Next,
    // Retry and Restart keep the mode, so only 'game:start' carries it. Glue may start the music
    // inside this same emit, before this handler runs: a session still in its first bar with the
    // other mode restarts with the right tune.
    b.on('game:start', (p) => {
      runMode = p.mode;
      const cur = playing;
      if (cur && cur.session.mode !== p.mode && cur.scheduler.nextStep <= STEPS_PER_BAR) startMusic(cur.session.seed);
    }),
    b.on('game:pause', () => {
      gamePaused = true;
      suspend();
    }),
    b.on('game:resume', () => {
      gamePaused = false;
      maybeResume();
    }),
    // A boss death completes an Adventure level (docs/13 boss rule 9) in the same sim step, so
    // the defeat stinger rings out before the music stops.
    b.on('game:over', () => endMusic()),
    b.on('game:quit', () => stopMusic()),
  ];
  const onVisibility = (): void => {
    hidden = vis?.hidden ?? false;
    if (hidden) suspend();
    else maybeResume();
  };
  vis?.addEventListener('visibilitychange', onVisibility);
  let done = false;
  const uninstall = (): void => {
    if (done) return;
    done = true;
    for (const off of offs) off();
    vis?.removeEventListener('visibilitychange', onVisibility);
    if (installToken === token) {
      installed = null;
      noteHook = null;
      voiceTrace = undefined;
    }
    stopMusic();
  };
  installed = uninstall;
  return uninstall;
}

/** True while the install made by `token` is the live one. */
function isLive(token: number): boolean {
  return installed !== null && installToken === token;
}

export interface MusicWiring {
  readonly bus: Bus;
  /** Start the loop from bar 0 for this level seed (start, restart, retry, next). */
  levelStart(seed: number): boolean;
  /** Remove every subscription and stop the music. */
  unwire(): void;
}

let wiring: { w: MusicWiring; token: number } | null = null;

/**
 * Single idempotent entry point for main.ts glue. The first call installs the music on `b`
 * (sim:threat, sim:enemyEnter, sim:enemyExit, game:pause, game:resume, game:over and game:quit,
 * plus the hidden tab hook); later calls with the same bus return the same wiring and ignore
 * `opts`. Level start is a call, not a bus event, because restart, retry and next level do
 * not emit 'game:start' and 'game:start' carries no seed:
 *   wireMusic(bus).levelStart(seed)
 */
export function wireMusic(b: Bus = coreBus, opts: Omit<MusicOptions, 'bus'> = {}): MusicWiring {
  if (wiring && wiring.w.bus === b && isLive(wiring.token)) return wiring.w;
  const off = initMusic({ ...opts, bus: b });
  const token = installToken;
  const w: MusicWiring = {
    bus: b,
    levelStart: (seed) => startMusic(seed),
    unwire: () => {
      off();
      if (wiring?.w === w) wiring = null;
    },
  };
  wiring = { w, token };
  return w;
}

/**
 * Start the base track from bar 0 for a level seed. Returns false (and stays silent) when
 * audio is not unlocked yet. Restarts cleanly if music is already playing.
 */
export function startMusic(seed: number): boolean {
  stopMusic();
  const g = graphSource();
  if (!g) return false;
  const ctx = g.ctx;
  const engine = createMusicEngine(ctx, g.master, musicMasterGain(volume), voiceTrace ? { trace: voiceTrace } : {});
  // A new level starts calm; the next 'sim:threat' sets the target.
  level = 0;
  target = 0;
  gamePaused = false;
  pendingKill = null;
  // Layers start empty: a new or restarted level re-announces its kinds through the sim.
  const s32 = seed >>> 0;
  const tune = forcedTune === null ? startTune(s32, runMode) : tuneById(forcedTune);
  const session: Session = {
    seed: s32,
    mode: runMode,
    engine,
    tunes: [{ fromBar: 0, tune }],
    fillStart: null,
    playSec: 0,
    block: 0,
    barIndex: -1,
    bar: null,
    lastTick: null,
    layers: [],
    motifs: new Map(),
    lift: false,
    lastCutoff: null,
    gate: KILL_GATE_INIT,
    queue: [],
    stats: { seen: 0, notes: 0, chords: 0 },
    hitGate: HIT_GATE_INIT,
    hits: [],
    arpYield: new Set(),
    // A new or restarted level has no boss: the sim announces it again when it enters.
    boss: null,
    preBossTune: null,
    bossCache: null,
    bossExtraEnd: 0,
    defeatEnd: 0,
  };
  const scheduler: Scheduler = createScheduler({
    clock: { now: () => ctx.currentTime },
    timer,
    stepSec: tune.stepSec,
    onStep: (step, time) => onStep(session, step, time),
    onTick: (now) => onTick(session, now, scheduler),
  });
  playing = { session, engine, scheduler, ctx };
  session.lastCutoff = masterCutoff(level);
  engine.setCutoff(session.lastCutoff);
  scheduler.start();
  if (hidden) suspend();
  return true;
}

/** Stop the music and release every node. Safe to call when nothing plays. */
export function stopMusic(): void {
  endRingOut();
  const p = playing;
  if (!p) return;
  playing = null;
  p.scheduler.stop();
  p.engine.dispose();
}

/** An engine left sounding after the music stopped, until the defeat stinger ends. */
let ringing: { readonly engine: MusicEngine; readonly cancel: () => void } | null = null;

function endRingOut(): void {
  const r = ringing;
  if (!r) return;
  ringing = null;
  r.cancel();
  r.engine.dispose();
}

/** Seconds after the defeat stinger's last note before its engine is released (its release tail). */
const RING_TAIL_SEC = 0.4;

/**
 * 'game:over': stop the music. If the boss just died the defeat stinger still plays (it is
 * scheduled now if its step has not come yet) and the engine is released after it; the bed
 * stops scheduling at once.
 */
function endMusic(): void {
  const p = playing;
  const s = p?.session;
  const b = s?.boss ?? null;
  if (!p || !s || b === null || b.downStep === null || volume === 0 || p.scheduler.paused) {
    stopMusic();
    return;
  }
  const sched = p.scheduler;
  if (b.defeatStep !== null) {
    const step = Math.max(sched.nextStep, s.bossExtraEnd);
    playDefeatSting(s, b, step, sched.timeOf(step));
    s.boss = { ...b, defeatStep: null };
  }
  const until = s.defeatEnd + RING_TAIL_SEC;
  if (!(until > p.ctx.currentTime)) {
    stopMusic();
    return;
  }
  endRingOut();
  playing = null;
  sched.stop();
  const ctx = p.ctx;
  const engine = p.engine;
  const cancel = timer.every(() => {
    if (ringing?.engine === engine && ctx.currentTime >= until) endRingOut();
  }, TICK_MS);
  ringing = { engine, cancel };
}

/** Music volume 0 to 100 (clamped, default 50). 0 is silence. Returns the applied value. */
export function setMusicVolume(v: number): number {
  volume = clampMusicVolume(v);
  if (volume === 0) endRingOut();
  if (playing) {
    playing.engine.setMaster(musicMasterGain(volume));
    if (volume === 0) playing.engine.silence();
  }
  return volume;
}

export function getMusicVolume(): number {
  return volume;
}

export interface MusicState {
  readonly playing: boolean;
  readonly suspended: boolean;
  /** Smoothed threat 0 to 1. */
  readonly level: number;
  readonly voices: number;
  /** Voices that are motifs or stingers. */
  readonly motifVoices: number;
  /** Bed voices cut short by the voice cap this session (0 when the budget holds). */
  readonly bedSteals: number;
  readonly nextStep: number;
  /** Kinds with a layer (live, fading or in the 2 bar tail), in entry order. */
  readonly layers: readonly EnemyKind[];
  /** High threat lift on (perc, arp octave up, lowpass opened). */
  readonly lift: boolean;
  /** Steps lost to stalls longer than the lookahead this session (0 when it holds). */
  readonly skippedSteps: number;
  /** Motif voices stolen this session. */
  readonly motifSteals: number;
  /** Kills seen (scored kills, pops, wells and burst segments), kill notes and chords played this session. */
  readonly kills: Readonly<KillStats>;
  /** The tune at the next step to be scheduled, or null when nothing plays. */
  readonly tune: TuneId | null;
  /** That tune's tempo, or 0 when nothing plays. */
  readonly bpm: number;
  /** The boss with a music state (alive, or releasing after its death), or null. */
  readonly boss: BossId | null;
  /** The boss bed's tier when the next step plays one, else null. */
  readonly bossTier: BossTier | null;
  /** Most boss voices that will sound at once from now on. */
  readonly bossVoices: number;
  /** Boss voices stolen this session (0 when the budget holds). */
  readonly bossSteals: number;
  /** Enemy motif duck at the next step (1 with no boss, 0.4 during a fight). */
  readonly duck: number;
  /** True while the boss intensity floor holds. */
  readonly floor: boolean;
  /** True while a defeat stinger rings out after the music stopped. */
  readonly ringing: boolean;
}

/** Read only snapshot for tests and the debug overlay. */
export function musicState(): MusicState {
  const p = playing;
  const steals = p?.engine.steals;
  const tune = p ? tuneAt(p.session, Math.floor(p.scheduler.nextStep / STEPS_PER_BAR)) : null;
  return {
    tune: tune?.id ?? null,
    bpm: tune?.bpm ?? 0,
    playing: p !== null,
    suspended: p?.scheduler.paused ?? false,
    level,
    voices: p?.engine.voiceCount ?? 0,
    motifVoices: p?.engine.motifVoiceCount ?? 0,
    bedSteals: steals?.bed ?? 0,
    nextStep: p?.scheduler.nextStep ?? 0,
    layers: p?.session.layers.map((l) => l.kind) ?? [],
    lift: p?.session.lift ?? false,
    skippedSteps: p?.scheduler.skipped ?? 0,
    motifSteals: steals?.motif ?? 0,
    kills: { ...(p?.session.stats ?? { seen: 0, notes: 0, chords: 0 }) },
    boss: p?.session.boss?.id ?? null,
    bossTier: tune?.bossTier ?? null,
    bossVoices: p?.engine.bossVoiceCount ?? 0,
    bossSteals: steals?.boss ?? 0,
    duck: p ? duckAt(p.session.boss, p.scheduler.nextStep) : 1,
    floor: p ? floorOn(p.session.boss) : false,
    ringing: ringing !== null,
  };
}
export { CUT1_KEEP, LAYER_KINDS } from './layers';
export { TUNE_IDS, TUNES, type Tune, type TuneId } from './tunes';

export { BOSS_MOTIFS } from './boss';

/**
 * The tune a boss fight of `tier` plays over (docs/12 "Design: boss music"): the tier's boss bed
 * in A at 120 BPM (tunes.ts BOSS_TUNES), whatever the active tune. The music switches to it by
 * itself on 'sim:bossEnter'; this is for tests and the debug overlay.
 */
export function selectBossTune(tier: BossTier): Tune {
  const p = playing;
  const active = p ? tuneAt(p.session, Math.floor(p.scheduler.nextStep / STEPS_PER_BAR)) : DEFAULT_TUNE;
  return bossTuneFor(tier, active);
}
