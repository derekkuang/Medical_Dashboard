import { useCallback, useMemo, type ReactElement } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import type { AlbuminBin } from '@/transforms/albumin';
import { ChartFrame } from './primitives/ChartFrame';
import { AxisBottom, AxisLeft } from './primitives/Axis';
import { Grid } from './primitives/Grid';
import { bandTicks, linearTicks } from './primitives/ticks';
import { chartPalette } from './palette';

interface AlbuminRiskProps {
  bins: readonly AlbuminBin[];
  width: number;
  height: number;
  description: string;
  /** Boundary to mark, in g/dL. The value the original asserted was a cliff. */
  markBoundary?: number | null;
}

const MARGIN = { top: 12, right: 16, bottom: 52, left: 52 };

/**
 * ICU admission rate by pre-operative albumin, with 95% intervals.
 *
 * A band scale rather than a continuous x-axis: this is binned data, and
 * spacing bins by their midpoints would imply a precision the open tails do not
 * have. The connecting line is drawn through the point estimates only as a
 * reading aid for the trend — it is not a fit, and nothing is extrapolated from
 * it, which is exactly the mistake the original's linear regression made.
 */
export function AlbuminRisk({
  bins,
  width,
  height,
  description,
  markBoundary = null,
}: AlbuminRiskProps): ReactElement {
  return (
    <ChartFrame
      width={width}
      height={height}
      margin={MARGIN}
      title="ICU admission by pre-operative albumin"
      description={description}
    >
      {({ innerWidth, innerHeight }) => (
        <Body
          bins={bins}
          innerWidth={innerWidth}
          innerHeight={innerHeight}
          markBoundary={markBoundary}
        />
      )}
    </ChartFrame>
  );
}

function Body({
  bins,
  innerWidth,
  innerHeight,
  markBoundary,
}: {
  bins: readonly AlbuminBin[];
  innerWidth: number;
  innerHeight: number;
  markBoundary: number | null;
}): ReactElement {
  const x = useMemo(
    () =>
      scaleBand()
        .domain(bins.map((b) => b.label))
        .range([0, innerWidth])
        .padding(0.35),
    [bins, innerWidth],
  );

  const maxUpper = useMemo(() => Math.max(0.1, ...bins.map((b) => b.estimate?.upper ?? 0)), [bins]);

  const y = useMemo(
    () => scaleLinear().domain([0, maxUpper]).nice().range([innerHeight, 0]),
    [maxUpper, innerHeight],
  );

  const yTicks = useMemo(() => linearTicks(y, 5, (v) => `${(v * 100).toFixed(0)}%`), [y]);
  const xTicks = useMemo(() => bandTicks(x), [x]);

  const centre = useCallback((label: string): number => (x(label) ?? 0) + x.bandwidth() / 2, [x]);

  const trend = useMemo(() => {
    // flatMap rather than filter+map: it narrows `estimate` to non-null inside
    // the callback, so no assertion is needed to reach it.
    const points = bins.flatMap<[number, number]>((b) =>
      b.estimate === null ? [] : [[centre(b.label), y(b.estimate.estimate)]],
    );

    return line()
      .x((p) => p[0])
      .y((p) => p[1])(points);
  }, [bins, centre, y]);

  // Only marked when it falls between two bins; a boundary at the very start
  // has nothing on its left to divide from.
  const boundaryIndex =
    markBoundary === null ? -1 : bins.findIndex((b) => b.lower === markBoundary);
  const boundaryBin = boundaryIndex > 0 ? bins[boundaryIndex] : undefined;
  const boundaryX =
    boundaryBin === undefined ? null : (x(boundaryBin.label) ?? 0) - x.step() * 0.175;

  return (
    <>
      <Grid ticks={yTicks} innerWidth={innerWidth} orientation="horizontal" />

      {boundaryX !== null && (
        <g aria-hidden>
          {/* The value the original captioned as a cliff, marked so the chart
              can be read directly against that claim. */}
          <line
            x1={boundaryX}
            x2={boundaryX}
            y1={0}
            y2={innerHeight}
            stroke={chartPalette.severity.medium}
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.7}
          />
        </g>
      )}

      {trend !== null && (
        <path
          d={trend}
          fill="none"
          stroke={chartPalette.categorical[0]}
          strokeWidth={1.5}
          opacity={0.4}
        />
      )}

      {bins.map((bin) => {
        if (bin.estimate === null) return null;
        const cx = centre(bin.label);
        const { estimate, lower, upper, total, successes } = bin.estimate;

        return (
          <g key={bin.label}>
            <title>
              {`Albumin ${bin.label} g/dL: ${(estimate * 100).toFixed(1)}% admitted to ICU (${(lower * 100).toFixed(1)} to ${(upper * 100).toFixed(1)}%), ${String(successes)} of ${total.toLocaleString()}`}
            </title>
            <line
              x1={cx}
              x2={cx}
              y1={y(lower)}
              y2={y(upper)}
              stroke={chartPalette.categorical[0]}
              strokeWidth={2}
              opacity={0.6}
            />
            <line
              x1={cx - 4}
              x2={cx + 4}
              y1={y(lower)}
              y2={y(lower)}
              stroke={chartPalette.categorical[0]}
              strokeWidth={2}
            />
            <line
              x1={cx - 4}
              x2={cx + 4}
              y1={y(upper)}
              y2={y(upper)}
              stroke={chartPalette.categorical[0]}
              strokeWidth={2}
            />
            <circle
              className="albumin-point"
              cx={cx}
              cy={y(estimate)}
              r={4}
              fill={chartPalette.categorical[0]}
            />
          </g>
        );
      })}

      <AxisLeft ticks={yTicks} label="Admitted to ICU" />
      <AxisBottom
        ticks={xTicks}
        innerWidth={innerWidth}
        innerHeight={innerHeight}
        label="Pre-operative albumin (g/dL)"
      />
    </>
  );
}
