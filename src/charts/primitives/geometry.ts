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
