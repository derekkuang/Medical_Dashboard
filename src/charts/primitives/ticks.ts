import type { ScaleBand, ScaleLinear } from 'd3-scale';

export interface AxisTick {
  /** Pixel offset along the axis. */
  offset: number;
  label: string;
}

/**
 * Ticks for a continuous scale.
 *
 * d3-scale computes the values and positions; this returns plain numbers and
 * strings for React to render. That split is the whole architecture in one
 * function — D3 does the maths, nothing here touches a DOM node, and the
 * component that consumes this can be tested with a hand-written array.
 */
export function linearTicks(
  scale: ScaleLinear<number, number>,
  count: number,
  format: (value: number) => string = String,
): AxisTick[] {
  return scale.ticks(count).map((value) => ({ offset: scale(value), label: format(value) }));
}

/**
 * Ticks for a categorical scale, centred on each band.
 *
 * Every category gets a tick: a band scale has no notion of "about this many",
 * and dropping some would leave bars unlabelled.
 */
export function bandTicks<T extends string>(
  scale: ScaleBand<T>,
  format: (value: T) => string = String,
): AxisTick[] {
  const half = scale.bandwidth() / 2;
  return scale.domain().map((value) => ({
    offset: (scale(value) ?? 0) + half,
    label: format(value),
  }));
}
