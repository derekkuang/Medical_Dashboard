import { useMemo, type ReactElement } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import type { RiskRow } from '@/transforms/risk';
import type { ProportionEstimate } from '@/transforms/stats';
import { ChartFrame } from './primitives/ChartFrame';
import { AxisBottom } from './primitives/Axis';
import { Grid } from './primitives/Grid';
import { linearTicks } from './primitives/ticks';
import { chartPalette } from './palette';

export interface RiskChartRow extends RiskRow {
  /** Drawn in the accent colour and with the additive marker alongside. */
  isCombination?: boolean;
  /** Only set on the combination row. */
  additivePrediction?: number | null;
}

interface RiskIntervalsProps {
  rows: readonly RiskChartRow[];
  width: number;
  height: number;
  description: string;
}

const MARGIN = { top: 8, right: 44, bottom: 40, left: 176 };

/**
 * Observed mortality per group, drawn as a point estimate inside its 95%
 * interval.
 *
 * The interval is the chart, not an ornament on it. At this prevalence — 0.9%
 * overall — the difference between a cohort of 3,000 and one of 50 is the
 * difference between a usable number and a coin flip, and a bare bar chart
 * renders both identically.
 */
export function RiskIntervals({
  rows,
  width,
  height,
  description,
}: RiskIntervalsProps): ReactElement {
  return (
    <ChartFrame
      width={width}
      height={height}
      margin={MARGIN}
      title="In-hospital mortality by risk factor"
      description={description}
    >
      {({ innerWidth, innerHeight }) => (
        <Body rows={rows} innerWidth={innerWidth} innerHeight={innerHeight} />
      )}
    </ChartFrame>
  );
}

function Body({
  rows,
  innerWidth,
  innerHeight,
}: {
  rows: readonly RiskChartRow[];
  innerWidth: number;
  innerHeight: number;
}): ReactElement {
  // Domain spans the widest upper bound, not the largest point estimate:
  // clipping a whisker would hide exactly the uncertainty this chart exists to
  // show. Floored at 2% so a dataset of tiny rates still fills the axis.
  const maxUpper = useMemo(() => {
    const uppers = rows
      .map((r) => r.estimate?.upper ?? 0)
      .concat(rows.map((r) => r.additivePrediction ?? 0));
    return Math.max(0.02, ...uppers);
  }, [rows]);

  const x = useMemo(
    () => scaleLinear().domain([0, maxUpper]).nice().range([0, innerWidth]),
    [maxUpper, innerWidth],
  );

  const y = useMemo(
    () =>
      scaleBand()
        .domain(rows.map((r) => r.key))
        .range([0, innerHeight])
        .padding(0.4),
    [rows, innerHeight],
  );

  const xTicks = useMemo(
    () =>
      linearTicks(
        x,
        Math.min(6, Math.max(2, Math.floor(innerWidth / 70))),
        (v) => `${(v * 100).toFixed(v < 0.01 ? 1 : 0)}%`,
      ),
    [x, innerWidth],
  );

  return (
    <>
      <Grid
        ticks={xTicks}
        innerWidth={innerWidth}
        innerHeight={innerHeight}
        orientation="vertical"
      />

      {rows.map((row) => {
        const top = y(row.key) ?? 0;
        const mid = top + y.bandwidth() / 2;
        const colour = row.isCombination
          ? chartPalette.categorical[1]
          : chartPalette.categorical[0];

        return (
          <g key={row.key}>
            <text
              x={-10}
              y={mid}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill={row.isCombination ? chartPalette.highlight : chartPalette.axis}
              fontWeight={row.isCombination ? 600 : 400}
            >
              {row.label}
            </text>

            {row.estimate === null ? (
              // No group to estimate from. Saying so beats drawing a point at
              // zero, which reads as "nobody here dies".
              <text x={0} y={mid} dy="0.32em" fontSize={11} fill={chartPalette.unrecorded}>
                No cases in this group
              </text>
            ) : (
              <Estimate estimate={row.estimate} x={x} mid={mid} colour={colour} />
            )}

            {row.additivePrediction != null && (
              <AdditiveMarker
                value={row.additivePrediction}
                x={x}
                top={top}
                height={y.bandwidth()}
              />
            )}
          </g>
        );
      })}

      <AxisBottom
        ticks={xTicks}
        innerWidth={innerWidth}
        innerHeight={innerHeight}
        label="In-hospital mortality (95% interval)"
      />
    </>
  );
}

function Estimate({
  estimate,
  x,
  mid,
  colour,
}: {
  estimate: ProportionEstimate;
  x: (value: number) => number;
  mid: number;
  colour: string;
}): ReactElement {
  const label = `${(estimate.estimate * 100).toFixed(1)}% (${(estimate.lower * 100).toFixed(1)} to ${(estimate.upper * 100).toFixed(1)}%), ${String(estimate.successes)} of ${estimate.total.toLocaleString()}`;

  return (
    <g>
      <title>{label}</title>
      <line
        x1={x(estimate.lower)}
        x2={x(estimate.upper)}
        y1={mid}
        y2={mid}
        stroke={colour}
        strokeWidth={2}
        opacity={0.55}
      />
      {/* End caps make a short interval legible; a bare line of a few pixels
          is indistinguishable from the dot sitting on it. */}
      <line
        x1={x(estimate.lower)}
        x2={x(estimate.lower)}
        y1={mid - 5}
        y2={mid + 5}
        stroke={colour}
        strokeWidth={2}
      />
      <line
        x1={x(estimate.upper)}
        x2={x(estimate.upper)}
        y1={mid - 5}
        y2={mid + 5}
        stroke={colour}
        strokeWidth={2}
      />
      <circle cx={x(estimate.estimate)} cy={mid} r={4} fill={colour} />
      <text x={x(estimate.upper) + 8} y={mid} dy="0.32em" fontSize={10} fill={chartPalette.axis}>
        {`n=${estimate.total.toLocaleString()}`}
      </text>
    </g>
  );
}

/**
 * Where the original's additive model said this combination would land.
 *
 * Drawn as a distinct open marker rather than a second bar, so it reads as a
 * prediction being compared against an observation rather than as another
 * measurement.
 */
function AdditiveMarker({
  value,
  x,
  top,
  height,
}: {
  value: number;
  x: (value: number) => number;
  top: number;
  height: number;
}): ReactElement {
  return (
    <g>
      <title>{`Additive model predicts ${(value * 100).toFixed(1)}%`}</title>
      <line
        x1={x(value)}
        x2={x(value)}
        y1={top - 2}
        y2={top + height + 2}
        stroke={chartPalette.severity.medium}
        strokeWidth={2}
        strokeDasharray="3 2"
      />
    </g>
  );
}
