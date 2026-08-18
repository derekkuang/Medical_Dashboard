import { useMemo, type ReactElement } from 'react';
import { scaleLinear } from 'd3-scale';
import type { AgeBin } from '@/transforms/histogram';
import { ChartFrame } from './primitives/ChartFrame';
import { AxisBottom, AxisLeft } from './primitives/Axis';
import { Grid } from './primitives/Grid';
import { linearTicks } from './primitives/ticks';
import { chartPalette } from './palette';

interface AgeHistogramProps {
  bins: readonly AgeBin[];
  /** Fixed across filter changes so the axis does not rescale on interaction. */
  domain: [number, number];
  maxCount: number;
  width: number;
  height: number;
  splitBySex: boolean;
  /** One sentence of finding, read out in place of the marks. */
  description: string;
}

/**
 * Age distribution.
 *
 * Presentational: it receives bins, not cases, and knows nothing about the
 * store, the filters, or SurgeryCase. That is what lets the binning be tested
 * without React and this component be tested with a hand-written array.
 */
export function AgeHistogram({
  bins,
  domain,
  maxCount,
  width,
  height,
  splitBySex,
  description,
}: AgeHistogramProps): ReactElement {
  return (
    <ChartFrame width={width} height={height} title="Age distribution" description={description}>
      {({ innerWidth, innerHeight }) => (
        <AgeHistogramBody
          bins={bins}
          domain={domain}
          maxCount={maxCount}
          innerWidth={innerWidth}
          innerHeight={innerHeight}
          splitBySex={splitBySex}
        />
      )}
    </ChartFrame>
  );
}

interface BodyProps {
  bins: readonly AgeBin[];
  domain: [number, number];
  maxCount: number;
  innerWidth: number;
  innerHeight: number;
  splitBySex: boolean;
}

function AgeHistogramBody({
  bins,
  domain,
  maxCount,
  innerWidth,
  innerHeight,
  splitBySex,
}: BodyProps): ReactElement {
  const x = useMemo(
    () => scaleLinear().domain(domain).range([0, innerWidth]),
    [domain, innerWidth],
  );

  const y = useMemo(
    // nice() rounds the top of the axis to a readable number. Falling back to 1
    // for an empty cohort avoids a degenerate [0, 0] domain, which maps every
    // value to the same pixel.
    () =>
      scaleLinear()
        .domain([0, maxCount > 0 ? maxCount : 1])
        .nice()
        .range([innerHeight, 0]),
    [maxCount, innerHeight],
  );

  const xTicks = useMemo(
    () => linearTicks(x, Math.min(10, Math.floor(innerWidth / 60))),
    [x, innerWidth],
  );
  const yTicks = useMemo(() => linearTicks(y, 5), [y]);

  return (
    <>
      <Grid ticks={yTicks} innerWidth={innerWidth} orientation="horizontal" />

      {bins.map((b) => {
        const left = x(b.x0);
        // One pixel of gap, but never below one pixel of bar: with 20 bins on a
        // narrow panel the subtraction can otherwise go negative, and a negative
        // width silently drops the rect.
        const barWidth = Math.max(1, x(b.x1) - left - 1);
        if (b.count === 0) return null;

        const label = `Ages ${String(Math.round(b.x0))} to ${String(Math.round(b.x1))}: ${String(b.count)} cases`;

        if (!splitBySex) {
          return (
            <rect
              key={b.x0}
              x={left}
              y={y(b.count)}
              width={barWidth}
              height={innerHeight - y(b.count)}
              fill={chartPalette.categorical[0]}
            >
              <title>{label}</title>
            </rect>
          );
        }

        // Stacked, not overlaid. The original drew both series semi-transparent
        // on top of each other, which makes neither readable and invents a third
        // colour where they overlap.
        const unrecorded = b.count - b.male - b.female;
        const segments = [
          { key: 'male', value: b.male, fill: chartPalette.male, name: 'male' },
          { key: 'female', value: b.female, fill: chartPalette.female, name: 'female' },
          {
            key: 'unrecorded',
            value: unrecorded,
            fill: chartPalette.unrecorded,
            name: 'sex not recorded',
          },
        ];

        let cumulative = 0;
        return (
          <g key={b.x0}>
            {segments.map((segment) => {
              if (segment.value <= 0) return null;
              const top = cumulative + segment.value;
              const rect = (
                <rect
                  key={segment.key}
                  x={left}
                  y={y(top)}
                  width={barWidth}
                  height={y(cumulative) - y(top)}
                  fill={segment.fill}
                >
                  <title>{`${label} — ${String(segment.value)} ${segment.name}`}</title>
                </rect>
              );
              cumulative = top;
              return rect;
            })}
          </g>
        );
      })}

      <AxisLeft ticks={yTicks} label="Cases" />
      <AxisBottom
        ticks={xTicks}
        innerWidth={innerWidth}
        innerHeight={innerHeight}
        label="Age (years)"
      />
    </>
  );
}
