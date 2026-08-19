import type { SampleWindow } from './RingBuffer';

/**
 * Largest Triangle Three Buckets downsampling.
 *
 * A 500 Hz waveform over a 30-second window is 15,000 points into perhaps 800
 * pixels. Something has to go, and the choice of *what* matters: naive
 * decimation (keep every nth sample) will happily drop the peak of a QRS
 * complex, silently flattening the feature a clinician is looking at. Averaging
 * is worse — it smooths transients out of existence.
 *
 * LTTB keeps the points that preserve the visual shape. It divides the series
 * into buckets and, from each, keeps the sample forming the largest triangle
 * with the previously kept point and the mean of the next bucket, which
 * preferentially retains extremes and inflection points.
 *
 * First and last samples are always kept so the window's extent never shifts.
 */
export function lttb(window: SampleWindow, threshold: number): SampleWindow {
  const n = window.times.length;

  // Nothing to gain, and the bucket arithmetic below divides by zero at
  // threshold 2. Returning the input unchanged is correct in both cases.
  if (threshold >= n || threshold <= 2) return window;

  const times = new Float64Array(threshold);
  const values = new Float32Array(threshold);

  times[0] = window.times[0] ?? 0;
  values[0] = window.values[0] ?? 0;

  // Buckets cover everything between the fixed first and last samples.
  const bucketSize = (n - 2) / (threshold - 2);

  let previousIndex = 0;

  for (let i = 0; i < threshold - 2; i += 1) {
    // Mean of the *next* bucket forms the far vertex of the triangle.
    const nextStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);

    let meanTime = 0;
    let meanValue = 0;
    const nextCount = Math.max(1, nextEnd - nextStart);
    for (let j = nextStart; j < nextEnd; j += 1) {
      meanTime += window.times[j] ?? 0;
      meanValue += window.values[j] ?? 0;
    }
    meanTime /= nextCount;
    meanValue /= nextCount;

    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n - 1);

    const anchorTime = window.times[previousIndex] ?? 0;
    const anchorValue = window.values[previousIndex] ?? 0;

    let bestArea = -1;
    let bestIndex = rangeStart;

    for (let j = rangeStart; j < rangeEnd; j += 1) {
      const t = window.times[j] ?? 0;
      const v = window.values[j] ?? 0;
      // Twice the triangle's area; the factor of two is constant so it does not
      // affect which point wins, and skipping it avoids a division per sample.
      const area = Math.abs(
        (anchorTime - meanTime) * (v - anchorValue) - (anchorTime - t) * (meanValue - anchorValue),
      );
      if (area > bestArea) {
        bestArea = area;
        bestIndex = j;
      }
    }

    times[i + 1] = window.times[bestIndex] ?? 0;
    values[i + 1] = window.values[bestIndex] ?? 0;
    previousIndex = bestIndex;
  }

  times[threshold - 1] = window.times[n - 1] ?? 0;
  values[threshold - 1] = window.values[n - 1] ?? 0;

  return { times, values };
}

/**
 * Points worth drawing for a given pixel width.
 *
 * Two samples per pixel: enough to render a vertical stroke where the signal
 * spans a column, without asking the renderer to place marks it cannot
 * distinguish.
 */
export function targetPointCount(pixelWidth: number): number {
  return Math.max(2, Math.floor(pixelWidth * 2));
}
