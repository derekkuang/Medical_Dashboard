import { useMemo, type ReactElement } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import type { PhaseRow } from '@/transforms/phases';
import { ChartFrame } from './primitives/ChartFrame';
import { AxisBottom } from './primitives/Axis';
import { Grid } from './primitives/Grid';
import { linearTicks } from './primitives/ticks';
import { chartPalette } from './palette';

interface PhaseDurationsProps {
  rows: readonly PhaseRow[];
  width: number;
  height: number;
  phaseLabel: string;
  description: string;
}

const MARGIN = { top: 8, right: 52, bottom: 40, left: 132 };

/**
 * Median duration per group with its interquartile range.
 *
 * Median and IQR rather than mean: these distributions are right-skewed, so the
 * mean sits above the typical case. The IQR also answers the question a single
 * average cannot — how much the procedure varies — which for someone preparing
 * a theatre list is the more useful number.
 */
export function PhaseDurations({
  rows,
  width,
  height,
  phaseLabel,
  description,
}: PhaseDurationsProps): ReactElement {
  return (
    <ChartFrame
      width={width}
      height={height}
      margin={MARGIN}
      title={`${phaseLabel} by procedure`}
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
  rows: readonly PhaseRow[];
  innerWidth: number;
  innerHeight: number;
}): ReactElement {
  const maxValue = useMemo(() => Math.max(10, ...rows.map((r) => r.summary?.q3 ?? 0)), [rows]);

  const x = useMemo(
    () => scaleLinear().domain([0, maxValue]).nice().range([0, innerWidth]),
    [maxValue, innerWidth],
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
        (v) => `${v.toFixed(0)}m`,
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
        // The all-cases row is a reference line for the others, so it is drawn
        // in the accent colour to separate it from the procedures.
        const isAll = row.key === '__all__';
        const colour = isAll ? chartPalette.categorical[1] : chartPalette.categorical[0];

        return (
          <g key={row.key}>
            <text
              x={-10}
              y={mid}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill={isAll ? chartPalette.highlight : chartPalette.axis}
              fontWeight={isAll ? 600 : 400}
            >
              {row.label}
            </text>

            {row.summary === null ? (
              <text x={0} y={mid} dy="0.32em" fontSize={11} fill={chartPalette.unrecorded}>
                No timed cases
              </text>
            ) : (
              <g>
                <title>
                  {`${row.label}: median ${row.summary.median.toFixed(0)} min, middle half ${row.summary.q1.toFixed(0)}–${row.summary.q3.toFixed(0)} min, ${row.summary.count.toLocaleString()} cases`}
                </title>
                <rect
                  className="phase-iqr"
                  x={x(row.summary.q1)}
                  y={top + y.bandwidth() * 0.25}
                  width={Math.max(1, x(row.summary.q3) - x(row.summary.q1))}
                  height={y.bandwidth() * 0.5}
                  fill={colour}
                  opacity={0.3}
                  rx={2}
                />
                <line
                  x1={x(row.summary.median)}
                  x2={x(row.summary.median)}
                  y1={top + y.bandwidth() * 0.15}
                  y2={top + y.bandwidth() * 0.85}
                  stroke={colour}
                  strokeWidth={3}
                />
                <text
                  x={x(row.summary.q3) + 8}
                  y={mid}
                  dy="0.32em"
                  fontSize={10}
                  fill={chartPalette.axis}
                >
                  {`${row.summary.median.toFixed(0)}m`}
                </text>
              </g>
            )}
          </g>
        );
      })}

      <AxisBottom
        ticks={xTicks}
        innerWidth={innerWidth}
        innerHeight={innerHeight}
        label="Minutes (bar spans the middle half of cases)"
      />
    </>
  );
}
