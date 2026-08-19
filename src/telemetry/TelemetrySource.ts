export interface Sample {
  /** Seconds from the case origin. */
  time: number;
  value: number;
}

export interface ChannelMeta {
  id: string;
  /** Human-readable, e.g. "Solar8000/HR". */
  name: string;
  unit: string | null;
  /**
   * Nominal rate. Real intervals are irregular — the recorded numerics arrive
   * roughly every two seconds but not exactly — so this sizes buffers and picks
   * a renderer, and is never used to infer a sample's timestamp.
   */
  approximateHz: number;
}

/**
 * What the UI can be told about the feed.
 *
 * `stalled` is distinct from `paused` on purpose: paused is something the
 * operator did, stalled is the data not arriving when it should. Collapsing the
 * two is how an operator console ends up showing a confidently frozen trace.
 */
export type ConnectionState =
  'idle' | 'loading' | 'streaming' | 'paused' | 'stalled' | 'ended' | 'error';

export interface ConnectionStatus {
  state: ConnectionState;
  /** Present when state is 'error'. */
  detail?: string;
}

export type Unsubscribe = () => void;

/**
 * A source of time-series telemetry.
 *
 * Two implementations satisfy this: one replaying recorded VitalDB tracks
 * against a clock, and one reading a WebSocket. The interface exists so the
 * charts never learn which they have — the same reason robotics teams develop
 * operator consoles against recorded bags rather than a live robot.
 *
 * Deliberately push-based. A pull API would make the consumer responsible for
 * choosing a polling rate, which is the wrong place for that decision: the
 * source knows its own cadence, and the renderer already has its own clock in
 * requestAnimationFrame.
 *
 * Batches, not single samples. At 500 Hz a callback per sample is 500 function
 * calls a second per channel, and every consumer would immediately have to
 * coalesce them anyway.
 */
export interface TelemetrySource {
  /** Channels this source can provide. May hit the network. */
  channels(): Promise<readonly ChannelMeta[]>;

  /**
   * Receive samples for a channel. Returns an unsubscribe function.
   *
   * Subscribing may begin loading; unsubscribing the last listener on a channel
   * should release its resources.
   */
  subscribe(channelId: string, onBatch: (batch: readonly Sample[]) => void): Unsubscribe;

  /** Connection state changes, including the current state on subscribe. */
  onStatus(onChange: (status: ConnectionStatus) => void): Unsubscribe;

  /**
   * Fires when the timeline jumps and retained history is no longer contiguous
   * with what follows — a seek, principally.
   *
   * Consumers holding a window of samples must discard it. Buffered samples
   * from after a backward seek are still in the past by timestamp, so a
   * consumer that keeps them ends up drawing a trace that doubles back on
   * itself. This is a push rather than an instruction in a docstring because
   * the obligation is easy to forget and impossible to see at the call site.
   */
  onReset(handler: () => void): Unsubscribe;

  /** rate is a multiple of real time. 1 is wall-clock speed. */
  play(rate?: number): void;
  pause(): void;

  /** Jump to a position in seconds from the case origin. */
  seek(seconds: number): void;

  /** Release every resource. The source is unusable afterwards. */
  close(): void;

  /** Total length in seconds, or null when unbounded — as a live feed is. */
  readonly duration: number | null;

  /** Current playback position in seconds. */
  readonly position: number;
}
