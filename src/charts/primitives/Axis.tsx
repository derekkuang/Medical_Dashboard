import type { ReactElement } from 'react';
import type { AxisTick } from './ticks';

const AXIS_COLOUR = '#94a3b8';
const LABEL_SIZE = 11;

interface AxisBottomProps {
  ticks: AxisTick[];
  innerWidth: number;
  innerHeight: number;
  /** Axis title. Omit only when the unit is unambiguous from the panel heading. */
  label?: string;
}

/**
 * Horizontal axis, rendered entirely by React.
 *
 * d3-axis is banned in this codebase (see eslint.config.js). It appends and
 * mutates nodes inside an element React also owns, which is the shared-ownership
 * problem the whole architecture is built to avoid — and it is why the original
 * had to clear its SVG and rebuild from scratch on every update. Here the ticks
 * are data, the marks are JSX, and React's reconciler diffs them.
 */
export function AxisBottom({
  ticks,
  innerWidth,
  innerHeight,
  label,
}: AxisBottomProps): ReactElement {
  return (
    <g transform={`translate(0,${String(innerHeight)})`} aria-hidden>
      <line x1={0} x2={innerWidth} y1={0} y2={0} stroke={AXIS_COLOUR} strokeWidth={1} />
      {ticks.map((tick) => (
        <g
          key={`${tick.label}-${String(tick.offset)}`}
          transform={`translate(${String(tick.offset)},0)`}
        >
          <line y1={0} y2={5} stroke={AXIS_COLOUR} strokeWidth={1} />
          <text y={9} dy="0.71em" textAnchor="middle" fontSize={LABEL_SIZE} fill={AXIS_COLOUR}>
            {tick.label}
          </text>
        </g>
      ))}
      {label !== undefined && (
        <text
          x={innerWidth / 2}
          y={30}
          textAnchor="middle"
          fontSize={LABEL_SIZE}
          fill={AXIS_COLOUR}
        >
          {label}
        </text>
      )}
    </g>
  );
}

interface AxisLeftProps {
  ticks: AxisTick[];
  label?: string;
}

export function AxisLeft({ ticks, label }: AxisLeftProps): ReactElement {
  return (
    <g aria-hidden>
      {ticks.map((tick) => (
        <g
          key={`${tick.label}-${String(tick.offset)}`}
          transform={`translate(0,${String(tick.offset)})`}
        >
          <line x1={-5} x2={0} stroke={AXIS_COLOUR} strokeWidth={1} />
          <text x={-8} dy="0.32em" textAnchor="end" fontSize={LABEL_SIZE} fill={AXIS_COLOUR}>
            {tick.label}
          </text>
        </g>
      ))}
      {label !== undefined && (
        // Rotated rather than wrapped: a horizontal y-axis title would force the
        // left margin wide enough to eat the drawing area on narrow screens.
        <text
          transform="rotate(-90)"
          x={0}
          y={-38}
          textAnchor="end"
          fontSize={LABEL_SIZE}
          fill={AXIS_COLOUR}
        >
          {label}
        </text>
      )}
    </g>
  );
}
