import type { ReactElement } from 'react';
import type { AxisTick } from './ticks';

interface GridProps {
  ticks: AxisTick[];
  innerWidth: number;
  orientation: 'horizontal' | 'vertical';
  innerHeight?: number;
}

/**
 * Gridlines at the given tick offsets.
 *
 * aria-hidden throughout: gridlines are a reading aid for sighted users and
 * carry no information a screen reader needs — the chart's description does
 * that work instead.
 */
export function Grid({ ticks, innerWidth, innerHeight = 0, orientation }: GridProps): ReactElement {
  return (
    <g aria-hidden>
      {ticks.map((tick) =>
        orientation === 'horizontal' ? (
          <line
            key={tick.offset}
            x1={0}
            x2={innerWidth}
            y1={tick.offset}
            y2={tick.offset}
            stroke="#334155"
            strokeWidth={1}
          />
        ) : (
          <line
            key={tick.offset}
            x1={tick.offset}
            x2={tick.offset}
            y1={0}
            y2={innerHeight}
            stroke="#334155"
            strokeWidth={1}
          />
        ),
      )}
    </g>
  );
}
