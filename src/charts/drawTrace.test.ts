import { describe, it, expect, vi } from 'vitest';
import type { SampleWindow } from '@/telemetry/RingBuffer';
import { drawTrace, valueExtent } from './drawTrace';

function makeWindow(values: readonly number[], step = 1): SampleWindow {
  return {
    times: Float64Array.from(values.map((_, i) => i * step)),
    values: Float32Array.from(values),
  };
}

/**
 * Records the calls a real 2D context would receive. jsdom provides none.
 *
 * Points are tagged with the stroke style in force when they were issued, so a
 * test can separate the trace from the gridlines drawn in the same pass.
 */
function recordingContext(traceColour = '#fff') {
  const all: { x: number; y: number; style: string }[] = [];
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn((x: number, y: number) => {
      all.push({ x, y, style: context.strokeStyle });
    }),
    lineTo: vi.fn((x: number, y: number) => {
      all.push({ x, y, style: context.strokeStyle });
    }),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '' as CanvasLineJoin,
  };

  return {
    context: context as unknown as CanvasRenderingContext2D,
    calls: context,
    /** Trace geometry only. */
    get points(): [number, number][] {
      return all.filter((p) => p.style === traceColour).map((p) => [p.x, p.y]);
    },
  };
}

const GEOMETRY = {
  width: 200,
  height: 100,
  from: 0,
  to: 10,
  valueRange: null,
  stroke: '#fff',
  grid: '#333',
};

describe('valueExtent', () => {
  it('spans the data with headroom so the trace never touches the edge', () => {
    const [low, high] = valueExtent(makeWindow([10, 20]))!;

    expect(low).toBeLessThan(10);
    expect(high).toBeGreaterThan(20);
  });

  it('gives a flat signal a nominal band rather than a zero range', () => {
    // Zero range divides by zero when scaling, and the line vanishes.
    expect(valueExtent(makeWindow([5, 5, 5]))).toEqual([4, 6]);
  });

  it('returns null for an empty window', () => {
    expect(valueExtent(makeWindow([]))).toBeNull();
  });
});

describe('drawTrace', () => {
  it('clears before drawing, so frames do not accumulate', () => {
    const { context, calls } = recordingContext();
    drawTrace(context, makeWindow([1, 2, 3]), GEOMETRY);

    expect(calls.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
  });

  it('draws gridlines even with no data', () => {
    // An empty trace should still read as a chart awaiting data rather than a
    // blank rectangle.
    const { context, calls } = recordingContext();
    drawTrace(context, makeWindow([]), GEOMETRY);

    expect(calls.stroke).toHaveBeenCalled();
  });

  it('maps time across the full width', () => {
    // The recorder exposes points through a getter, so it is read after the
    // draw rather than destructured before it.
    const recorder = recordingContext();
    drawTrace(recorder.context, makeWindow([0, 1], 10), { ...GEOMETRY, from: 0, to: 10 });

    expect(recorder.points[0]?.[0]).toBeCloseTo(0);
    expect(recorder.points.at(-1)?.[0]).toBeCloseTo(200);
  });

  it('puts higher values nearer the top', () => {
    // Canvas y grows downward; getting this backwards inverts every trace.
    const recorder = recordingContext();
    drawTrace(recorder.context, makeWindow([0, 100]), { ...GEOMETRY, valueRange: [0, 100] });

    expect(recorder.points[0]?.[1]).toBeGreaterThan(recorder.points[1]?.[1] ?? 0);
  });

  it('downsamples rather than asking the renderer for more points than pixels', () => {
    // 15,000 points into 200 pixels is the case this exists for.
    const recorder = recordingContext();
    const dense = makeWindow(
      Array.from({ length: 15000 }, (_, i) => Math.sin(i / 50)),
      0.002,
    );

    drawTrace(recorder.context, dense, { ...GEOMETRY, from: 0, to: 30 });

    expect(recorder.points.length).toBeLessThanOrEqual(400);
    expect(recorder.points.length).toBeGreaterThan(100);
  });

  it('keeps the extremes of a downsampled signal', () => {
    const recorder = recordingContext();
    const spiky = Array.from({ length: 5000 }, () => 0);
    spiky[2500] = 1;

    drawTrace(recorder.context, makeWindow(spiky, 0.002), {
      ...GEOMETRY,
      from: 0,
      to: 10,
      valueRange: [0, 1],
    });

    // The spike maps to y = 0; naive decimation would have dropped it.
    expect(Math.min(...recorder.points.map((p) => p[1]))).toBeCloseTo(0, 1);
  });

  it('draws nothing but the grid when the window has no width in time', () => {
    const recorder = recordingContext();
    drawTrace(recorder.context, makeWindow([1, 2, 3]), { ...GEOMETRY, from: 5, to: 5 });

    expect(recorder.points).toHaveLength(0);
  });
});
