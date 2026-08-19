import { describe, it, expect, vi } from 'vitest';
import type { ChannelMeta, ConnectionStatus, Sample } from './TelemetrySource';
import { WebSocketSource } from './WebSocketSource';

const CHANNELS: ChannelMeta[] = [{ id: 'hr', name: 'Heart rate', unit: 'bpm', approximateHz: 1 }];

/** Minimal stand-in exposing the handlers so tests can drive them. */
class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  emit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<unknown>);
  }

  emitRaw(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }
}

function makeSource() {
  const socket = new FakeSocket();
  const source = new WebSocketSource({
    url: 'wss://example.test/telemetry',
    channels: CHANNELS,
    createSocket: () => socket as unknown as WebSocket,
  });
  return { source, socket };
}

describe('WebSocketSource', () => {
  it('satisfies the same interface the replay source does', async () => {
    // The point of this class. If it drifts from TelemetrySource the seam is
    // decorative, and swapping recorded playback for a live feed stops being a
    // constructor change.
    const { source } = makeSource();

    expect(await source.channels()).toEqual(CHANNELS);
    expect(typeof source.play).toBe('function');
    expect(typeof source.seek).toBe('function');
    source.close();
  });

  it('has no duration, because a live feed has no end', () => {
    const { source } = makeSource();
    expect(source.duration).toBeNull();
    source.close();
  });

  it('connects lazily, on first subscription', () => {
    const createSocket = vi.fn(() => new FakeSocket() as unknown as WebSocket);
    const source = new WebSocketSource({
      url: 'wss://example.test/telemetry',
      channels: CHANNELS,
      createSocket,
    });

    expect(createSocket).not.toHaveBeenCalled();
    source.subscribe('hr', () => undefined);
    expect(createSocket).toHaveBeenCalledTimes(1);

    source.close();
  });

  it('delivers samples to the matching channel', () => {
    const { source, socket } = makeSource();
    const seen: Sample[] = [];
    source.subscribe('hr', (b) => seen.push(...b));

    socket.emit({ channel: 'hr', samples: [{ time: 1, value: 80 }] });

    expect(seen).toEqual([{ time: 1, value: 80 }]);
    source.close();
  });

  it('tracks position from the newest sample', () => {
    const { source, socket } = makeSource();
    source.subscribe('hr', () => undefined);

    socket.emit({
      channel: 'hr',
      samples: [
        { time: 5, value: 1 },
        { time: 9, value: 1 },
      ],
    });

    expect(source.position).toBe(9);
    source.close();
  });

  it('discards a malformed frame instead of throwing on the socket thread', () => {
    // A parse error here would take down the message handler and silently kill
    // the feed for every channel.
    const { source, socket } = makeSource();
    const seen: Sample[] = [];
    source.subscribe('hr', (b) => seen.push(...b));

    socket.emitRaw('not json at all');
    socket.emitRaw(42);
    socket.emit({ channel: 'hr', samples: [{ time: 'soon', value: 80 }] });
    socket.emit({ nope: true });

    expect(seen).toHaveLength(0);
    source.close();
  });

  it('drops individual bad samples but keeps the good ones in a frame', () => {
    const { source, socket } = makeSource();
    const seen: Sample[] = [];
    source.subscribe('hr', (b) => seen.push(...b));

    socket.emit({
      channel: 'hr',
      samples: [{ time: 1, value: 80 }, { time: 2 }, { time: 3, value: 82 }],
    });

    expect(seen.map((s) => s.time)).toEqual([1, 3]);
    source.close();
  });

  it('reports connection state transitions', () => {
    const { source, socket } = makeSource();
    const states: ConnectionStatus[] = [];
    source.onStatus((s) => states.push(s));
    source.subscribe('hr', () => undefined);

    socket.onopen?.();
    expect(states.at(-1)?.state).toBe('streaming');

    socket.onerror?.();
    expect(states.at(-1)?.state).toBe('error');
    expect(states.at(-1)?.detail).toContain('example.test');

    source.close();
  });

  it('keeps the socket open when the view is paused', () => {
    // Pausing pauses the view, not the source. Dropping the socket would
    // silently lose everything that happened while paused.
    const { source, socket } = makeSource();
    source.subscribe('hr', () => undefined);

    source.pause();

    expect(socket.closed).toBe(false);
    source.close();
  });

  it('ignores seek rather than pretending to support it', () => {
    const { source } = makeSource();
    expect(() => {
      source.seek(100);
    }).not.toThrow();
    source.close();
  });

  it('closes the socket and stops delivering', () => {
    const { source, socket } = makeSource();
    const seen: Sample[] = [];
    source.subscribe('hr', (b) => seen.push(...b));

    source.close();
    socket.emit({ channel: 'hr', samples: [{ time: 1, value: 80 }] });

    expect(socket.closed).toBe(true);
    expect(seen).toHaveLength(0);
  });
});
