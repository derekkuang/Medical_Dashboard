import { useEffect, useRef } from 'react';
import { RingBuffer } from '@/telemetry/RingBuffer';
import type { TelemetrySource } from '@/telemetry/TelemetrySource';

export interface UseTelemetryChannelOptions {
  source: TelemetrySource | null;
  channelId: string | null;
  /** Samples retained. Sized from rate × window in the caller. */
  capacity: number;
  /**
   * Called on an animation frame when new samples have landed, and never
   * otherwise. Receives the buffer directly so nothing has to be copied.
   */
  draw: (buffer: RingBuffer) => void;
}

/**
 * The single bridge between the telemetry data plane and React.
 *
 * This hook returns nothing and sets no state. That is the entire point.
 *
 * At 500 Hz, routing samples through `useState` or `dispatch` is 500 updates a
 * second, each waking every subscriber and forcing a reconciliation pass for a
 * frame the display cannot show anyway. Instead samples land in a ring buffer
 * that React does not own, a dirty flag is set, and a requestAnimationFrame
 * loop calls `draw` at most once per frame — so the render rate is the
 * display's, not the data's, and the component never re-renders at all.
 *
 * Redux still holds which case and channel are selected, whether playback is
 * running, and where the cursor is. Control plane in the store, data plane out
 * here.
 */
export function useTelemetryChannel({
  source,
  channelId,
  capacity,
  draw,
}: UseTelemetryChannelOptions): void {
  const bufferRef = useRef<RingBuffer | null>(null);
  const dirtyRef = useRef(false);

  // Held in a ref so a new closure from the parent does not tear down the
  // subscription and lose the buffered history with it.
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });

  useEffect(() => {
    if (source === null || channelId === null) return;

    const buffer = new RingBuffer(capacity);
    bufferRef.current = buffer;

    const unsubscribe = source.subscribe(channelId, (batch) => {
      for (const sample of batch) buffer.push(sample.time, sample.value);
      // Coalesced: a 2,048-sample batch marks the buffer dirty once, not 2,048
      // times, and the next frame draws whatever has accumulated.
      dirtyRef.current = true;
    });

    let frame = 0;
    const loop = (): void => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        drawRef.current(buffer);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      bufferRef.current = null;
    };
  }, [source, channelId, capacity]);
}
