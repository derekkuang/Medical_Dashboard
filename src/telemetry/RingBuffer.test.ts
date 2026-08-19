import { describe, it, expect } from 'vitest';
import { RingBuffer } from './RingBuffer';

describe('RingBuffer', () => {
  it('rejects a nonsensical capacity instead of failing later', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
    expect(() => new RingBuffer(-5)).toThrow(RangeError);
    expect(() => new RingBuffer(1.5)).toThrow(RangeError);
  });

  it('starts empty', () => {
    const buffer = new RingBuffer(4);

    expect(buffer.size).toBe(0);
    expect(buffer.earliest).toBeNull();
    expect(buffer.latest).toBeNull();
  });

  it('retains samples in order', () => {
    const buffer = new RingBuffer(4);
    buffer.push(1, 10);
    buffer.push(2, 20);

    expect([...buffer.toArrays().times]).toEqual([1, 2]);
    expect([...buffer.toArrays().values]).toEqual([10, 20]);
  });

  it('overwrites the oldest sample once full, rather than growing', () => {
    // A live stream has no end. An unbounded buffer is a memory leak with
    // extra steps; overwriting is what a scrolling window wants.
    const buffer = new RingBuffer(3);
    for (const t of [1, 2, 3, 4, 5]) buffer.push(t, t * 10);

    expect(buffer.size).toBe(3);
    expect(buffer.isFull).toBe(true);
    expect([...buffer.toArrays().times]).toEqual([3, 4, 5]);
  });

  it('unwraps the ring in chronological order', () => {
    // The internal head moves as samples wrap; readers must never see that.
    const buffer = new RingBuffer(3);
    for (const t of [1, 2, 3, 4]) buffer.push(t, t);

    const { times } = buffer.toArrays();
    expect([...times]).toEqual([2, 3, 4]);
  });

  it('reports the retained time span', () => {
    const buffer = new RingBuffer(2);
    buffer.push(5, 1);
    buffer.push(9, 1);

    expect(buffer.earliest).toBe(5);
    expect(buffer.latest).toBe(9);

    buffer.push(12, 1);
    expect(buffer.earliest).toBe(9);
    expect(buffer.latest).toBe(12);
  });

  it('extracts a time window', () => {
    const buffer = new RingBuffer(10);
    for (const t of [1, 2, 3, 4, 5]) buffer.push(t, t * 2);

    const window = buffer.window(2, 4);

    expect([...window.times]).toEqual([2, 3, 4]);
    expect([...window.values]).toEqual([4, 6, 8]);
  });

  it('includes both window boundaries', () => {
    const buffer = new RingBuffer(10);
    for (const t of [1, 2, 3]) buffer.push(t, t);

    expect([...buffer.window(1, 3).times]).toEqual([1, 2, 3]);
  });

  it('returns an empty window rather than throwing when nothing matches', () => {
    const buffer = new RingBuffer(4);
    buffer.push(1, 1);

    expect(buffer.window(100, 200).times).toHaveLength(0);
  });

  it('finds samples in a window that straddles the wrap point', () => {
    const buffer = new RingBuffer(3);
    for (const t of [1, 2, 3, 4, 5]) buffer.push(t, t);

    expect([...buffer.window(3, 5).times]).toEqual([3, 4, 5]);
  });

  it('clears without reallocating', () => {
    const buffer = new RingBuffer(3);
    buffer.push(1, 1);
    buffer.clear();

    expect(buffer.size).toBe(0);
    expect(buffer.latest).toBeNull();

    buffer.push(9, 9);
    expect([...buffer.toArrays().times]).toEqual([9]);
  });

  it('accepts a batch', () => {
    const buffer = new RingBuffer(4);
    buffer.pushMany([
      { time: 1, value: 10 },
      { time: 2, value: 20 },
    ]);

    expect(buffer.size).toBe(2);
  });

  it('keeps sub-second time resolution deep into a case', () => {
    // Float32 for time would lose 2 ms spacing within an hour of case time,
    // which is why times are Float64.
    const buffer = new RingBuffer(2);
    buffer.push(10800.002, 1);
    buffer.push(10800.004, 1);

    const { times } = buffer.toArrays();
    expect(times[1]! - times[0]!).toBeCloseTo(0.002, 6);
  });
});
