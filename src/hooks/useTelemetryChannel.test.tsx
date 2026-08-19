import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { RingBuffer } from '@/telemetry/RingBuffer';
import type {
  ChannelMeta,
  ConnectionStatus,
  Sample,
  TelemetrySource,
  Unsubscribe,
} from '@/telemetry/TelemetrySource';
import { useTelemetryChannel } from './useTelemetryChannel';

/** A source tests can push into directly. */
class FakeSource implements TelemetrySource {
  private readonly listeners = new Map<string, Set<(batch: readonly Sample[]) => void>>();
  readonly duration = null;
  position = 0;
  subscribeCount = 0;
  unsubscribeCount = 0;

  channels(): Promise<readonly ChannelMeta[]> {
    return Promise.resolve([]);
  }

  subscribe(channelId: string, onBatch: (batch: readonly Sample[]) => void): Unsubscribe {
    this.subscribeCount += 1;
    const set = this.listeners.get(channelId) ?? new Set();
    set.add(onBatch);
    this.listeners.set(channelId, set);

    return () => {
      this.unsubscribeCount += 1;
      set.delete(onBatch);
    };
  }

  onStatus(onChange: (status: ConnectionStatus) => void): Unsubscribe {
    onChange({ state: 'idle' });
    return () => undefined;
  }

  play(): void {
    // no-op
  }
  pause(): void {
    // no-op
  }
  seek(): void {
    // no-op
  }
  close(): void {
    this.listeners.clear();
  }

  emit(channelId: string, batch: Sample[]): void {
    for (const listener of this.listeners.get(channelId) ?? []) listener(batch);
  }
}

interface HarnessProps {
  source: TelemetrySource | null;
  channelId: string | null;
  onDraw: (buffer: RingBuffer) => void;
  onRender: () => void;
}

function Harness({ source, channelId, onDraw, onRender }: HarnessProps): ReactElement {
  onRender();
  useTelemetryChannel({ source, channelId, capacity: 128, draw: onDraw });
  return <div data-testid="harness" />;
}

/** Runs one animation frame. */
function frame(): void {
  act(() => {
    vi.advanceTimersByTime(17);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTelemetryChannel', () => {
  it('does not re-render React when samples arrive', () => {
    // The architecture claim, as a test. At 500 Hz, routing samples through
    // state would be 500 reconciliations a second for frames the display
    // cannot show. Samples land in a buffer React does not own.
    const source = new FakeSource();
    const onRender = vi.fn();
    render(<Harness source={source} channelId="hr" onDraw={vi.fn()} onRender={onRender} />);

    const rendersAfterMount = onRender.mock.calls.length;

    for (let i = 0; i < 200; i += 1) {
      act(() => {
        source.emit('hr', [{ time: i, value: i }]);
      });
    }
    frame();

    expect(onRender.mock.calls.length).toBe(rendersAfterMount);
  });

  it('draws once per frame regardless of how many batches landed', () => {
    // Coalescing is the point: 200 batches between frames must not become 200
    // draws, because only one of them can be seen.
    const source = new FakeSource();
    const onDraw = vi.fn();
    render(<Harness source={source} channelId="hr" onDraw={onDraw} onRender={vi.fn()} />);

    act(() => {
      for (let i = 0; i < 200; i += 1) source.emit('hr', [{ time: i, value: i }]);
    });
    frame();

    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it('does not draw when nothing has arrived', () => {
    // An idle channel must not burn a draw every frame.
    const source = new FakeSource();
    const onDraw = vi.fn();
    render(<Harness source={source} channelId="hr" onDraw={onDraw} onRender={vi.fn()} />);

    frame();
    frame();

    expect(onDraw).not.toHaveBeenCalled();
  });

  it('accumulates samples into the buffer it hands to draw', () => {
    const source = new FakeSource();
    let seen: number[] = [];
    render(
      <Harness
        source={source}
        channelId="hr"
        onDraw={(buffer) => {
          seen = [...buffer.toArrays().times];
        }}
        onRender={vi.fn()}
      />,
    );

    act(() => {
      source.emit('hr', [
        { time: 1, value: 80 },
        { time: 2, value: 81 },
      ]);
    });
    frame();

    expect(seen).toEqual([1, 2]);
  });

  it('subscribes once and unsubscribes on unmount', () => {
    const source = new FakeSource();
    const { unmount } = render(
      <Harness source={source} channelId="hr" onDraw={vi.fn()} onRender={vi.fn()} />,
    );

    expect(source.subscribeCount).toBe(1);

    unmount();
    expect(source.unsubscribeCount).toBe(1);
  });

  it('stops drawing after unmount', () => {
    // A live rAF loop against a detached canvas is a leak that survives the
    // component.
    const source = new FakeSource();
    const onDraw = vi.fn();
    const { unmount } = render(
      <Harness source={source} channelId="hr" onDraw={onDraw} onRender={vi.fn()} />,
    );

    unmount();
    source.emit('hr', [{ time: 1, value: 1 }]);
    frame();

    expect(onDraw).not.toHaveBeenCalled();
  });

  it('does nothing without a source or a channel', () => {
    const onDraw = vi.fn();
    render(<Harness source={null} channelId={null} onDraw={onDraw} onRender={vi.fn()} />);

    frame();
    expect(onDraw).not.toHaveBeenCalled();
  });

  it('uses the latest draw callback without resubscribing', () => {
    // Re-subscribing on every parent render would discard the buffered history
    // each time, so the callback is held in a ref instead.
    const source = new FakeSource();
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(
      <Harness source={source} channelId="hr" onDraw={first} onRender={vi.fn()} />,
    );
    rerender(<Harness source={source} channelId="hr" onDraw={second} onRender={vi.fn()} />);

    act(() => {
      source.emit('hr', [{ time: 1, value: 1 }]);
    });
    frame();

    expect(source.subscribeCount).toBe(1);
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});
