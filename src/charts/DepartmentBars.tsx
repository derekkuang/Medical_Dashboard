import { useMemo, type KeyboardEvent, type ReactElement } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import type { DepartmentBar } from '@/transforms/departments';
import { ChartFrame } from './primitives/ChartFrame';
import { fitLabel, fitMargin } from './primitives/geometry';
import { AxisBottom } from './primitives/Axis';
import { Grid } from './primitives/Grid';
import { linearTicks } from './primitives/ticks';
import { chartPalette } from './palette';

interface DepartmentBarsProps {
  bars: readonly DepartmentBar[];
  maxTotal: number;
  selected: string | null;
  onSelect: (department: string) => void;
  width: number;
  height: number;
  description: string;
}

const MARGIN = { top: 8, right: 56, bottom: 36, left: 132 };

/**
 * Departments as horizontal bars.
 *
 * Horizontal rather than vertical because the category names are long
 * ("General surgery", "Thoracic surgery") and would otherwise need rotating,
 * which is markedly harder to read.
 *
 * role="group" rather than the default "img": every bar is a real focusable
 * control, and role="img" would hide them from assistive technology entirely.
 */
export function DepartmentBars({
  bars,
  maxTotal,
  selected,
  onSelect,
  width,
  height,
  description,
}: DepartmentBarsProps): ReactElement {
  return (
    <ChartFrame
      width={width}
      height={height}
      margin={fitMargin(width, MARGIN)}
      title="Cases by department"
      description={description}
      role="group"
    >
      {({ innerWidth, innerHeight }) => (
        <Body
          bars={bars}
          maxTotal={maxTotal}
          selected={selected}
          onSelect={onSelect}
          innerWidth={innerWidth}
          innerHeight={innerHeight}
          labelWidth={fitMargin(width, MARGIN).left}
        />
      )}
    </ChartFrame>
  );
}

interface BodyProps {
  bars: readonly DepartmentBar[];
  maxTotal: number;
  selected: string | null;
  onSelect: (department: string) => void;
  innerWidth: number;
  innerHeight: number;
  labelWidth: number;
}

function Body({
  bars,
  maxTotal,
  selected,
  onSelect,
  innerWidth,
  innerHeight,
  labelWidth,
}: BodyProps): ReactElement {
  const x = useMemo(
    () =>
      scaleLinear()
        .domain([0, maxTotal > 0 ? maxTotal : 1])
        .range([0, innerWidth]),
    [maxTotal, innerWidth],
  );

  const y = useMemo(
    () =>
      scaleBand()
        .domain(bars.map((b) => b.department))
        .range([0, innerHeight])
        .padding(0.25),
    [bars, innerHeight],
  );

  const xTicks = useMemo(
    () => linearTicks(x, Math.min(6, Math.max(2, Math.floor(innerWidth / 80)))),
    [x, innerWidth],
  );

  function handleKeyDown(event: KeyboardEvent<SVGGElement>, department: string): void {
    // Enter and Space are what a button responds to, so a bar acting as one
    // must respond to both. preventDefault stops Space scrolling the page.
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(department);
    }
  }

  return (
    <>
      <Grid
        ticks={xTicks}
        innerWidth={innerWidth}
        innerHeight={innerHeight}
        orientation="vertical"
      />

      {bars.map((bar) => {
        const top = y(bar.department) ?? 0;
        const bandHeight = y.bandwidth();
        const isSelected = selected === bar.department;

        return (
          <g
            key={bar.department}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={`${bar.department}: ${bar.matched.toLocaleString()} of ${bar.total.toLocaleString()} cases`}
            onClick={() => {
              onSelect(bar.department);
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, bar.department);
            }}
            style={{ cursor: 'pointer' }}
          >
            {/* Full-width hit area. Without it only the drawn bar is clickable,
                so a department with two cases is a one-pixel target. */}
            <rect x={0} y={top} width={innerWidth} height={bandHeight} fill="transparent" />

            {/* The whole table, muted. Keeps the row's extent visible even when
                the filter has excluded every case in it. */}
            <rect
              x={0}
              y={top}
              width={x(bar.total)}
              height={bandHeight}
              fill={chartPalette.unrecorded}
              opacity={0.35}
              pointerEvents="none"
            />

            <rect
              className="dept-bar"
              x={0}
              y={top}
              width={x(bar.matched)}
              height={bandHeight}
              fill={isSelected ? chartPalette.categorical[1] : chartPalette.categorical[0]}
              pointerEvents="none"
            />

            <text
              x={-8}
              y={top + bandHeight / 2}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill={isSelected ? chartPalette.highlight : chartPalette.axis}
              fontWeight={isSelected ? 600 : 400}
              pointerEvents="none"
            >
              {/* The full name stays in the button's aria-label, so truncating
                  here costs a pointer user nothing and a screen reader nothing. */}
              {fitLabel(bar.department, labelWidth - 12)}
            </text>

            <text
              x={Math.max(x(bar.matched), x(bar.total)) + 6}
              y={top + bandHeight / 2}
              dy="0.32em"
              fontSize={11}
              fill={chartPalette.axis}
              pointerEvents="none"
            >
              {bar.matched.toLocaleString()}
            </text>
          </g>
        );
      })}

      <AxisBottom ticks={xTicks} innerWidth={innerWidth} innerHeight={innerHeight} label="Cases" />
    </>
  );
}
