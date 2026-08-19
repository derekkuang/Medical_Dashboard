import type {
  ChannelMeta,
  ConnectionStatus,
  Sample,
  TelemetrySource,
  Unsubscribe,
} from './TelemetrySource';

export interface WebSocketSourceOptions {
  url: string;
  channels: readonly ChannelMeta[];
  /** Injected for tests, and so a Node consumer can supply its own client. */
  createSocket?: (url: string) => WebSocket;
}

interface Frame {
  channel: string;
  samples: Sample[];
}

function parseFrame(data: unknown): Frame | null {
  if (typeof data !== 'string') return null;

  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { channel, samples } = parsed as { channel?: unknown; samples?: unknown };
    if (typeof channel !== 'string' || !Array.isArray(samples)) return null;

    const clean = samples.flatMap((s): Sample[] => {
      if (typeof s !== 'object' || s === null) return [];
      const { time, value } = s as { time?: unknown; value?: unknown };
      if (typeof time !== 'number' || typeof value !== 'number') return [];
      if (!Number.isFinite(time) || !Number.isFinite(value)) return [];
      return [{ time, value }];
    });

    return { channel, samples: clean };
  } catch {
    return null;
  }
}

/**
 * Live telemetry over a WebSocket.
 *
 * Deliberately minimal and not wired into the UI. It exists to prove the
 * `TelemetrySource` seam is real rather than a shape invented to look like one:
 * the charts, the ring buffer and the transport controls work against the
 * interface, so swapping recorded playback for a live feed is a constructor
 * change and nothing else.
 *
 * What a production version would add, and why each is absent here rather than
 * forgotten: reconnection with backoff; a heartbeat to tell a silent link from
 * a healthy idle one; sequence numbers to detect gaps a reconnect papered over;
 * and backpressure, since a socket delivering faster than the renderer drains
 * will grow an unbounded queue. The ring buffer already bounds memory, which
 * covers the last of those by construction.
 */
export class WebSocketSource implements TelemetrySource {
  private readonly listeners = new Map<string, Set<(batch: readonly Sample[]) => void>>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private readonly channelMetas: readonly ChannelMeta[];
  private readonly createSocket: (url: string) => WebSocket;
  private readonly url: string;

  private socket: WebSocket | null = null;
  private status: ConnectionStatus = { state: 'idle' };
  private latestTime = 0;

  constructor(options: WebSocketSourceOptions) {
    this.url = options.url;
    this.channelMetas = options.channels;
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
  }

  channels(): Promise<readonly ChannelMeta[]> {
    return Promise.resolve(this.channelMetas);
  }

  /** A live feed has no end, which is what `null` means on this interface. */
  readonly duration: number | null = null;

  get position(): number {
    return this.latestTime;
  }

  subscribe(channelId: string, onBatch: (batch: readonly Sample[]) => void): Unsubscribe {
    const existing = this.listeners.get(channelId);
    if (existing === undefined) this.listeners.set(channelId, new Set([onBatch]));
    else existing.add(onBatch);

    this.ensureSocket();

    return () => {
      this.listeners.get(channelId)?.delete(onBatch);
    };
  }

  onStatus(onChange: (status: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(onChange);
    onChange(this.status);
    return () => {
      this.statusListeners.delete(onChange);
    };
  }

  /** A live feed runs at the rate the source sends. Rate is not meaningful. */
  play(): void {
    this.ensureSocket();
  }

  pause(): void {
    // Pausing a live feed pauses the *view*, not the source — the data keeps
    // being produced whether or not anyone is watching. Dropping the socket
    // here would silently lose everything that happened while paused.
    this.setStatus({ state: 'paused' });
  }

  seek(_seconds: number): void {
    // Unsupported by design: there is no future to seek into, and the past
    // beyond the ring buffer was never retained. Accepting the argument keeps
    // the signature interchangeable with the replay source.
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.listeners.clear();
    this.statusListeners.clear();
  }

  private ensureSocket(): void {
    if (this.socket !== null) return;

    this.setStatus({ state: 'loading' });
    const socket = this.createSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.setStatus({ state: 'streaming' });
    };

    socket.onmessage = (event: MessageEvent<unknown>) => {
      const frame = parseFrame(event.data);
      if (frame === null || frame.samples.length === 0) return;

      const last = frame.samples.at(-1);
      if (last !== undefined) this.latestTime = last.time;

      const targets = this.listeners.get(frame.channel);
      if (targets === undefined) return;
      for (const listener of targets) listener(frame.samples);
    };

    socket.onerror = () => {
      this.setStatus({ state: 'error', detail: `Connection to ${this.url} failed` });
    };

    socket.onclose = () => {
      this.socket = null;
      this.setStatus({ state: 'ended' });
    };
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
