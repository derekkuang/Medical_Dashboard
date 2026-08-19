export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface InnerDimensions {
  innerWidth: number;
  innerHeight: number;
}

/**
 * Left margin is sized for a four-character y label plus a rotated axis title;
 * bottom for one row of tick labels. Kept here rather than in ChartFrame so
 * that file exports only its component — a constant alongside a component
 * breaks React Fast Refresh for the whole module.
 */
export const DEFAULT_MARGIN: Margin = { top: 8, right: 16, bottom: 36, left: 48 };

/**
 * Shrinks horizontal margins so a chart still has room to draw.
 *
 * Margins are sized for a desktop label column — 176px on the risk chart — and
 * on a 200px-wide phone that leaves a negative drawing area, at which point
 * ChartFrame correctly refuses to render and the panel goes blank. Scaling them
 * down keeps the chart present and merely cramped, which is the right failure
 * for a responsive layout.
 *
 * Vertical margins are untouched: they hold the axis and its title, whose
 * heights do not depend on the viewport.
 */
export function fitMargin(width: number, base: Margin, minimumInnerWidth = 72): Margin {
  const horizontal = base.left + base.right;
  const available = width - minimumInnerWidth;

  if (horizontal <= available) return base;
  if (available <= 0) return { ...base, left: 0, right: 0 };

  const scale = available / horizontal;
  return { ...base, left: Math.floor(base.left * scale), right: Math.floor(base.right * scale) };
}

/**
 * Characters that fit in a margin at the chart label size.
 *
 * Roughly 5.5px per character at 11px in the interface font. Approximate on
 * purpose — measuring text properly means a canvas context or a layout pass,
 * and neither is worth it to decide where to put an ellipsis.
 */
export function fitLabel(text: string, availablePx: number): string {
  const maxChars = Math.floor(availablePx / 5.5);
  if (maxChars <= 1) return '';
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}
