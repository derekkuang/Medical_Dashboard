import { useId, type ReactElement, type ReactNode } from 'react';
import { DEFAULT_MARGIN, type InnerDimensions, type Margin } from './geometry';

interface ChartFrameProps {
  width: number;
  height: number;
  margin?: Margin;
  /** Accessible name. Required — an unlabelled chart is invisible to a screen reader. */
  title: string;
  /**
   * The finding, in words. A screen reader gets far more from one accurate
   * sentence than from forty unlabelled rects, so this is where the actual
   * summary of the data belongs.
   */
  description?: string;
  /**
   * role="img" by default, which hides the interior from assistive technology
   * in favour of title + description. Charts that expose real keyboard targets
   * pass "group" instead so those children stay reachable.
   */
  role?: 'img' | 'group';
  children: (dims: InnerDimensions) => ReactNode;
}

/**
 * The SVG wrapper every chart sits in: margin convention, accessible labelling,
 * and the inner drawing area handed to children.
 *
 * A render prop rather than context, because the inner dimensions are the only
 * thing shared and passing them explicitly keeps each chart's data flow visible
 * in one place.
 */
export function ChartFrame({
  width,
  height,
  margin = DEFAULT_MARGIN,
  title,
  description,
  role = 'img',
  children,
}: ChartFrameProps): ReactElement | null {
  const titleId = useId();
  const descId = useId();

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Before the container has been measured, or when it is too narrow to draw
  // into, render nothing rather than build a scale over a negative range.
  if (innerWidth <= 0 || innerHeight <= 0) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role={role}
      aria-labelledby={description === undefined ? titleId : `${titleId} ${descId}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <title id={titleId}>{title}</title>
      {description !== undefined && <desc id={descId}>{description}</desc>}
      <g transform={`translate(${String(margin.left)},${String(margin.top)})`}>
        {children({ innerWidth, innerHeight })}
      </g>
    </svg>
  );
}
