import type {
  ChannelMeta,
  ConnectionStatus,
  Sample,
  TelemetrySource,
  Unsubscribe,
} from './TelemetrySource';
import type { ResolvedChannel } from './trackIndex';
import { streamTrack, type TrackLoader } from './streamTrack';

export interface ReplayOptions {
  channels: readonly ResolvedChannel[];
  /** Injected in tests so the suite never touches the network. */
  loadTrack?: TrackLoader;
  /** How often the clock emits. 100 ms is well under a frame budget at 60 Hz. */
  tickMs?: number;
  /** Injected in tests. Defaults to performance-style monotonic milliseconds. */
  now?: () => number;
}

interface ChannelState {
  meta: ChannelMeta;
  tid: string;
  samples: Sample[];
  /** Index of the next sample to emit. */
  cursor: number;
  listeners: Set<(batch: readonly Sample[]) => void>;
  abort: AbortController | null;
  loaded: boolean;
}

/**
 * Replays recorded VitalDB tracks against a wall clock.
 *
 * The `Time` column is real elapsed seconds from the case origin, so playing it
 * back on a clock is not a simulation of a stream — it is one, carrying genuine
 * irregular intervals, dropouts and missing samples. Faked data is always too
 * clean to exercise the code that has to cope with real data.
 *
 * This is how operator consoles are actually developed: against recorded bags,
 * not a live robot. `WebSocketSource` satisfies the same interface, and nothing
 * downstream can tell which it has.
 */
export class VitalDBReplaySource implements TelemetrySource {
  private readonly states = new Map<string, ChannelState>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private readonly resetListeners = new Set<() => void>();
  private readonly loadTrack: TrackLoader;
  private readonly tickMs: number;
  private readonly now: () => number;

  private status: ConnectionStatus = { state: 'idle' };
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private rate = 1;
  private closed = false;

  private positionSeconds = 0;

  constructor(options: ReplayOptions) {
    this.loadTrack = options.loadTrack ?? streamTrack;
    this.tickMs = options.tickMs ?? 100;
    this.now = options.now ?? (() => Date.now());

    for (const channel of options.channels) {
      this.states.set(channel.tid, {
        meta: {
          id: channel.tid,
          name: channel.label,
          unit: channel.unit,
          approximateHz: channel.approximateHz,
        },
        tid: channel.tid,
        samples: [],
        cursor: 0,
        listeners: new Set(),
        abort: null,
        loaded: false,
      });
    }
  }

  channels(): Promise<readonly ChannelMeta[]> {
    return Promise.resolve([...this.states.values()].map((s) => s.meta));
  }

  get position(): number {
    return this.positionSeconds;
  }

  /**
   * Longest track loaded so far.
   *
   * Grows while data streams in, which is honest: the true length is not known
   * until a track finishes arriving, and claiming one earlier would make the
   * scrubber jump.
   */
  get duration(): number | null {
    let longest = 0;
    for (const state of this.states.values()) {
      const last = state.samples.at(-1);
      if (last !== undefined && last.time > longest) longest = last.time;
    }
    return longest > 0 ? longest : null;
  }

  subscribe(channelId: string, onBatch: (batch: readonly Sample[]) => void): Unsubscribe {
    const state = this.states.get(channelId);
    if (state === undefined) return () => undefined;

    state.listeners.add(onBatch);
    // Loading starts on first interest rather than in the constructor, so
    // opening a case does not fetch six tracks the operator never looks at.
    if (!state.loaded && state.abort === null) void this.beginLoading(state);

    return () => {
      state.listeners.delete(onBatch);
    };
  }

  onReset(handler: () => void): Unsubscribe {
    this.resetListeners.add(handler);
    return () => {
      this.resetListeners.delete(handler);
    };
  }

  onStatus(onChange: (status: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(onChange);
    // Emit current state immediately: a subscriber that arrives after loading
    // finished would otherwise wait forever for a transition that already
    // happened.
    onChange(this.status);
    return () => {
      this.statusListeners.delete(onChange);
    };
  }

  play(rate = 1): void {
    if (this.closed) return;

    // Rate is applied before the early return, so changing speed mid-playback
    // takes effect. Returning first made the speed control a no-op whenever it
    // mattered — which is to say, whenever something was actually playing.
    this.rate = rate;
    // Rebasing the clock stops the elapsed time since the last tick being
    // re-scaled by the new rate, which would jump the cursor forward.
    this.lastTickAt = this.now();

    if (this.timer !== null) return;
    this.setStatus({ state: 'streaming' });
    this.timer = setInterval(() => {
      this.tick();
    }, this.tickMs);
  }

  pause(): void {
    this.stopTimer();
    if (!this.closed) this.setStatus({ state: 'paused' });
  }

  /**
   * Jumps to a position.
   *
   * Cursors are rebuilt by binary search rather than replayed forward, so
   * seeking to the end of a 5.7 million sample track is not O(n). Consumers are
   * then told to discard their buffers through onReset — an earlier version put
   * that obligation in this comment and nothing honoured it.
   */
  seek(seconds: number): void {
    this.positionSeconds = Math.max(0, seconds);
    for (const state of this.states.values()) {
      state.cursor = firstIndexAfter(state.samples, this.positionSeconds);
    }
    this.lastTickAt = this.now();

    // Tell consumers their buffered window is no longer contiguous. Without
    // this a backward seek leaves older samples sitting after newer ones by
    // timestamp, and the trace visibly doubles back.
    for (const handler of this.resetListeners) handler();
  }

  close(): void {
    this.closed = true;
    this.stopTimer();
    for (const state of this.states.values()) {
      state.abort?.abort();
      state.abort = null;
      state.listeners.clear();
      state.samples = [];
    }
    this.statusListeners.clear();
    this.resetListeners.clear();
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private async beginLoading(state: ChannelState): Promise<void> {
    const controller = new AbortController();
    state.abort = controller;
    this.setStatus({ state: 'loading' });

    try {
      await this.loadTrack(state.tid, controller.signal, (samples) => {
        state.samples.push(...samples);
      });
      state.loaded = true;

      // Only speak for the whole source once every subscribed track has
      // arrived. A 60 kB heart rate track finishing first must not report
      // "ready" while a 61 MB ECG is still downloading, and it must not
      // overwrite an error raised by another channel.
      if (this.status.state === 'error') return;
      if (!this.everyTrackLoaded()) return;
      // A track that finishes while paused must not claim to be live.
      this.setStatus({ state: this.timer === null ? 'idle' : 'streaming' });
    } catch (error) {
      if (controller.signal.aborted) return;
      this.setStatus({
        state: 'error',
        detail: error instanceof Error ? error.message : 'Track failed to load',
      });
    }
  }

  private tick(): void {
    const now = this.now();
    const elapsedSeconds = ((now - this.lastTickAt) / 1000) * this.rate;
    this.lastTickAt = now;
    this.positionSeconds += elapsedSeconds;

    let delivered = false;

    for (const state of this.states.values()) {
      if (state.listeners.size === 0) continue;

      const batch: Sample[] = [];
      while (state.cursor < state.samples.length) {
        const sample = state.samples[state.cursor];
        if (sample === undefined || sample.time > this.positionSeconds) break;
        batch.push(sample);
        state.cursor += 1;
      }

      if (batch.length === 0) continue;
      delivered = true;
      for (const listener of state.listeners) listener(batch);
    }

    const duration = this.duration;
    if (duration !== null && this.positionSeconds >= duration && this.everyTrackLoaded()) {
      this.stopTimer();
      this.setStatus({ state: 'ended' });
      return;
    }

    // Distinguishes "the operator paused" from "data is not arriving". A track
    // still downloading is loading, not stalled; a loaded track with nothing to
    // emit has genuinely run dry.
    if (!delivered && this.everyTrackLoaded() && this.status.state === 'streaming') {
      this.setStatus({ state: 'stalled' });
    } else if (delivered && this.status.state === 'stalled') {
      this.setStatus({ state: 'streaming' });
    }
  }

  private everyTrackLoaded(): boolean {
    for (const state of this.states.values()) {
      if (state.listeners.size > 0 && !state.loaded) return false;
    }
    return true;
  }
}

/**
 * Index of the first sample strictly after `time`.
 *
 * Binary search: a seek to the end of a 500 Hz track would otherwise walk 5.7
 * million entries on the main thread.
 */
export function firstIndexAfter(samples: readonly Sample[], time: number): number {
  let low = 0;
  let high = samples.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    const sample = samples[mid];
    if (sample !== undefined && sample.time <= time) low = mid + 1;
    else high = mid;
  }

  return low;
}
