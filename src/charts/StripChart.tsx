import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import type { RingBuffer } from '@/telemetry/RingBuffer';
import type { TelemetrySource } from '@/telemetry/TelemetrySource';
import { useTelemetryChannel } from '@/hooks/useTelemetryChannel';
import { drawTrace } from './drawTrace';
import { chartPalette } from './palette';

interface StripChartProps {
  source: TelemetrySource | null;
  channelId: string | null;
  label: string;
  unit: string;
  approximateHz: number;
  /** Seconds of history kept on screen. */
  windowSeconds: number;
  width: number;
  height: number;
  /** Playback position, used to place the visible window. */
  positionSeconds: number;
}

/**
 * One scrolling telemetry trace.
 *
 * The exception to this project's rule that charts take view models rather than
 * live inputs. It takes the source itself, because the whole purpose of the
 * data plane is that samples do not travel through props and re-renders — the
 * moment they did, this would be back to reconciling at the data rate. The
 * boundary that matters still holds: no store, no feature state, no domain
 * types.
 */
export function StripChart({
  source,
  channelId,
  label,
  unit,
  approximateHz,
  windowSeconds,
  width,
  height,
  positionSeconds,
}: StripChartProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  // Written in an effect rather than during render: the draw loop reads this
  // on an animation frame, so it only needs to be current by the next frame,
  // and mutating a ref mid-render is the anti-pattern react-hooks/refs catches.
  const positionRef = useRef(positionSeconds);
  useEffect(() => {
    positionRef.current = positionSeconds;
  }, [positionSeconds]);

  // Enough for the visible window plus a margin, so scrolling never runs off
  // the end of retained history. Bounded by construction: a live feed has no
  // end and an unbounded buffer would be a leak.
  const capacity = Math.max(256, Math.ceil(approximateHz * windowSeconds * 1.5));

  const draw = useCallback(
    (buffer: RingBuffer) => {
      const canvas = canvasRef.current;
      if (canvas === null) return;

      const context = canvas.getContext('2d');
      // jsdom has no 2D context, and a real browser returns null if the canvas
      // has been detached mid-frame.
      if (context === null) return;

      const to = positionRef.current;
      const from = to - windowSeconds;
      const visible = buffer.window(from, to);

      // The numeric readout is written straight to the DOM rather than through
      // state. React renders this span once with no children and never
      // reconciles into it, so it is the same leaf-ownership rule the brush
      // follows — and it keeps the zero-re-render property intact. Routing it
      // through state would re-render the trace on every frame that carried a
      // new sample, which is the thing this whole layer exists to avoid.
      const readout = readoutRef.current;
      if (readout !== null) {
        const latest = visible.values.at(-1);
        readout.textContent = latest === undefined ? '—' : latest.toFixed(1);
      }

      drawTrace(context, visible, {
        width,
        height,
        from,
        to,
        valueRange: null,
        stroke: chartPalette.categorical[0],
        grid: chartPalette.grid,
      });
    },
    [width, height, windowSeconds],
  );

  useTelemetryChannel({ source, channelId, capacity, draw });

  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: chartPalette.axis,
          marginBottom: 2,
        }}
      >
        <span>{label}</span>
        <span>
          {/* Read by a screen reader on navigation rather than announced, which
              at this update rate would be unusable. */}
          <span ref={readoutRef} style={{ color: chartPalette.highlight }} />
          {` ${unit} · `}
          {approximateHz >= 1 ? `${String(Math.round(approximateHz))} Hz` : 'intermittent'}
        </span>
      </figcaption>
      {/* The canvas is a picture with no accessible interior, so it is labelled
          and its contents are described by the surrounding panel rather than
          left as an unlabelled blank to a screen reader. */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        role="img"
        aria-label={`${label} trace, ${unit}`}
        style={{ display: 'block', width: '100%', height }}
      />
    </figure>
  );
}
