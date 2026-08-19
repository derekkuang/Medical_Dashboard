import { describe, it, expect } from 'vitest';
import type { SampleWindow } from './RingBuffer';
import { lttb, targetPointCount } from './downsample';

function makeWindow(values: readonly number[]): SampleWindow {
  return {
    times: Float64Array.from(values.map((_, i) => i)),
    values: Float32Array.from(values),
  };
}

describe('lttb', () => {
  it('returns the input untouched when there is nothing to drop', () => {
    const window = makeWindow([1, 2, 3]);
    expect(lttb(window, 10)).toBe(window);
  });

  it('returns the input untouched at a degenerate threshold', () => {
    // The bucket arithmetic divides by threshold - 2.
    const window = makeWindow([1, 2, 3, 4, 5]);
    expect(lttb(window, 2)).toBe(window);
    expect(lttb(window, 0)).toBe(window);
  });

  it('reduces to exactly the requested number of points', () => {
    const window = makeWindow(Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10)));
    const reduced = lttb(window, 50);

    expect(reduced.times).toHaveLength(50);
    expect(reduced.values).toHaveLength(50);
  });

  it('always keeps the first and last sample so the window does not shift', () => {
    const values = Array.from({ length: 500 }, (_, i) => i);
    const window = makeWindow(values);
    const reduced = lttb(window, 20);

    expect(reduced.times[0]).toBe(0);
    expect(reduced.times.at(-1)).toBe(499);
  });

  it('keeps a spike that naive decimation would drop', () => {
    // The whole reason for LTTB. Every 10th sample misses index 137 entirely,
    // and a clinician looking for that transient would never see it.
    const values = Array.from({ length: 400 }, () => 0);
    values[137] = 100;

    const reduced = lttb(makeWindow(values), 40);

    expect([...reduced.values]).toContain(100);
  });

  it('preserves both extremes of an oscillation', () => {
    const values = Array.from({ length: 600 }, (_, i) => Math.sin(i / 3));
    const reduced = lttb(makeWindow(values), 60);

    expect(Math.max(...reduced.values)).toBeGreaterThan(0.95);
    expect(Math.min(...reduced.values)).toBeLessThan(-0.95);
  });

  it('emits timestamps in order', () => {
    const window = makeWindow(Array.from({ length: 300 }, (_, i) => Math.cos(i)));
    const reduced = lttb(window, 30);

    for (let i = 1; i < reduced.times.length; i += 1) {
      expect(reduced.times[i]!).toBeGreaterThan(reduced.times[i - 1]!);
    }
  });

  it('only ever returns samples that were in the input', () => {
    // LTTB selects points; it must never interpolate a value that was not
    // measured, which is what makes it safe for clinical traces.
    const values = [0, 5, 1, 9, 2, 8, 3, 7, 4, 6, 0, 5, 1, 9, 2, 8];
    const reduced = lttb(makeWindow(values), 6);

    for (const v of reduced.values) {
      expect(values).toContain(v);
    }
  });

  it('handles a flat signal without collapsing', () => {
    const reduced = lttb(makeWindow(Array.from({ length: 200 }, () => 42)), 20);

    expect(reduced.values).toHaveLength(20);
    expect([...reduced.values].every((v) => v === 42)).toBe(true);
  });
});

describe('targetPointCount', () => {
  it('asks for about two points per pixel', () => {
    expect(targetPointCount(400)).toBe(800);
  });

  it('never drops below a drawable pair', () => {
    expect(targetPointCount(0)).toBe(2);
    expect(targetPointCount(-10)).toBe(2);
  });
});
