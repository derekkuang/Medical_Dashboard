export interface SampleWindow {
  /** Seconds from the case origin, chronological. */
  times: Float64Array;
  values: Float32Array;
}

/**
 * Fixed-capacity circular buffer for one telemetry channel.
 *
 * Two decisions worth stating.
 *
 * Parallel typed arrays rather than an array of `{ time, value }` objects. At
 * 500 Hz an object per sample is half a million short-lived allocations a
 * minute, and the resulting garbage collection shows up as visible stutter in
 * the render loop. Two flat arrays allocate once and never again.
 *
 * Float64 for time, Float32 for value. Time needs the precision — at 2 ms
 * spacing, Float32 starts losing sub-sample resolution within an hour of case
 * time — while the values are physiological readings whose instruments do not
 * resolve anywhere near seven significant figures.
 *
 * Fixed capacity is the point, not a limitation: a live stream has no end, and
 * an unbounded buffer is a memory leak with extra steps. Old samples are
 * overwritten, which is exactly what a scrolling window wants.
 */
export class RingBuffer {
  private readonly times: Float64Array;
  private readonly values: Float32Array;
  /** Index of the oldest sample. */
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(
        `RingBuffer capacity must be a positive integer, got ${String(capacity)}`,
      );
    }
    this.times = new Float64Array(capacity);
    this.values = new Float32Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /** O(1). Overwrites the oldest sample once full. */
  push(time: number, value: number): void {
    const index = (this.head + this.count) % this.capacity;
    this.times[index] = time;
    this.values[index] = value;

    if (this.count < this.capacity) this.count += 1;
    else this.head = (this.head + 1) % this.capacity;
  }

  pushMany(samples: readonly { time: number; value: number }[]): void {
    for (const s of samples) this.push(s.time, s.value);
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  /** Oldest retained timestamp, or null when empty. */
  get earliest(): number | null {
    return this.count === 0 ? null : (this.times[this.head] ?? null);
  }

  /** Newest timestamp, or null when empty. */
  get latest(): number | null {
    if (this.count === 0) return null;
    return this.times[(this.head + this.count - 1) % this.capacity] ?? null;
  }

  /**
   * Copies out in chronological order, unwrapping the ring.
   *
   * Two bulk copies rather than an element loop: TypedArray.set is a memmove,
   * which matters when this runs once per animation frame over a buffer holding
   * tens of thousands of samples. It also sidesteps the per-element bounds
   * fallbacks that noUncheckedIndexedAccess would otherwise force.
   */
  toArrays(): SampleWindow {
    const times = new Float64Array(this.count);
    const values = new Float32Array(this.count);

    // Everything from head to the end of the backing array, then the wrapped
    // remainder from the start.
    const firstRun = Math.min(this.count, this.capacity - this.head);
    times.set(this.times.subarray(this.head, this.head + firstRun), 0);
    values.set(this.values.subarray(this.head, this.head + firstRun), 0);

    if (firstRun < this.count) {
      const remainder = this.count - firstRun;
      times.set(this.times.subarray(0, remainder), firstRun);
      values.set(this.values.subarray(0, remainder), firstRun);
    }

    return { times, values };
  }

  /**
   * Samples with a timestamp in [from, to].
   *
   * Scans rather than binary-searching. Samples arrive in order, so a search
   * would be possible, but a replay can seek backwards and a live stream can
   * deliver out of order after a reconnect — and at these capacities a linear
   * scan costs less than the correctness risk of assuming sorted data.
   */
  window(from: number, to: number): SampleWindow {
    const all = this.toArrays();
    const times: number[] = [];
    const values: number[] = [];

    for (let i = 0; i < all.times.length; i += 1) {
      const time = all.times[i] ?? 0;
      if (time < from || time > to) continue;
      times.push(time);
      values.push(all.values[i] ?? 0);
    }

    return { times: Float64Array.from(times), values: Float32Array.from(values) };
  }
}
