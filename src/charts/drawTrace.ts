import type { SampleWindow } from '@/telemetry/RingBuffer';
import { lttb, targetPointCount } from '@/telemetry/downsample';

export interface TraceGeometry {
  width: number;
  height: number;
  /** Visible time span, in seconds. */
  from: number;
  to: number;
  /** Value range. Null asks for an automatic fit. */
  valueRange: [number, number] | null;
  stroke: string;
  grid: string;
}

/** Padding as a share of the value range, so the trace never touches the edge. */
const HEADROOM = 0.08;

export function valueExtent(window: SampleWindow): [number, number] | null {
  if (window.values.length === 0) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const value of window.values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  // A dead-flat signal has zero range, which would divide by zero when scaling.
  // Give it a nominal band so the line renders centred rather than vanishing.
  if (min === max) return [min - 1, max + 1];

  const pad = (max - min) * HEADROOM;
  return [min - pad, max + pad];
}

/**
 * Draws one trace onto a 2D context.
 *
 * Separated from the component so it can be tested against a recording context
 * with no DOM, and so the hot path is a plain function rather than a render.
 *
 * Canvas rather than SVG for this chart alone. A 500 Hz waveform across a
 * 30-second window is 15,000 points; as SVG that is 15,000 nodes for React to
 * reconcile every frame, which it cannot do at 60 Hz. The other five charts in
 * this project are React-rendered SVG precisely because they are not this.
 */
export function drawTrace(
  context: CanvasRenderingContext2D,
  window: SampleWindow,
  geometry: TraceGeometry,
): void {
  const { width, height, from, to, stroke, grid } = geometry;

  context.clearRect(0, 0, width, height);

  context.strokeStyle = grid;
  context.lineWidth = 1;
  context.beginPath();
  for (let i = 1; i < 4; i += 1) {
    const y = Math.round((height / 4) * i) + 0.5;
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.stroke();

  if (window.times.length === 0 || to <= from) return;

  const range = geometry.valueRange ?? valueExtent(window);
  if (range === null) return;

  const [low, high] = range;
  const valueSpan = high - low;
  if (valueSpan <= 0) return;

  // Reduced to roughly two points per pixel before drawing. Beyond that the
  // renderer is being asked to place marks it cannot distinguish, and LTTB
  // keeps the extremes that naive decimation would drop.
  const reduced = lttb(window, targetPointCount(width));

  const toX = (time: number): number => ((time - from) / (to - from)) * width;
  const toY = (value: number): number => height - ((value - low) / valueSpan) * height;

  context.strokeStyle = stroke;
  context.lineWidth = 1.5;
  context.lineJoin = 'round';
  context.beginPath();

  for (let i = 0; i < reduced.times.length; i += 1) {
    const time = reduced.times[i] ?? 0;
    const value = reduced.values[i] ?? 0;
    const x = toX(time);
    const y = toY(value);
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }

  context.stroke();
}
