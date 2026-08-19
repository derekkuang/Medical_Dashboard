import type { SurgeryCase } from '@/data/schema';

export interface DepartmentBar {
  department: string;
  /** Cases in the whole table. Fixes the bar length so it does not move. */
  total: number;
  /** Cases surviving the current filters. Drawn over the total. */
  matched: number;
}

/**
 * Case counts per department, showing the cohort against the whole.
 *
 * Each row carries both numbers so the bar can be drawn twice: a muted full
 * length, with the matched count over it. The original redrew bars from the
 * filtered data alone, which meant the axis rescaled on every interaction and
 * a department that had been filtered out simply vanished — you could not see
 * that the filter had removed it, only that it was gone.
 *
 * Ordered by total, descending, so rows keep their position under filtering.
 * Reordering by matched count would make bars jump between rows as the user
 * types, which is disorienting and makes clicking a moving target.
 */
export function departmentBars(
  allCases: readonly SurgeryCase[],
  matchedCases: readonly SurgeryCase[],
): DepartmentBar[] {
  const totals = new Map<string, number>();
  for (const c of allCases) {
    if (c.department === null) continue;
    totals.set(c.department, (totals.get(c.department) ?? 0) + 1);
  }

  const matched = new Map<string, number>();
  for (const c of matchedCases) {
    if (c.department === null) continue;
    matched.set(c.department, (matched.get(c.department) ?? 0) + 1);
  }

  return [...totals]
    .map(([department, total]) => ({
      department,
      total,
      matched: matched.get(department) ?? 0,
    }))
    .sort((a, b) => b.total - a.total || a.department.localeCompare(b.department));
}

/** Longest bar, used to fix the x domain. Zero when there are no departments. */
export function maxDepartmentTotal(bars: readonly DepartmentBar[]): number {
  return bars.reduce((max, b) => (b.total > max ? b.total : max), 0);
}

/**
 * Share of the whole table each department holds, as a percentage.
 *
 * Used for the accessible description. The real distribution is extreme — two
 * departments hold 94.6% of cases — and that concentration is the single most
 * important caveat on every other statistic in the dashboard.
 */
export function departmentShares(
  bars: readonly DepartmentBar[],
): { department: string; share: number }[] {
  const grandTotal = bars.reduce((sum, b) => sum + b.total, 0);
  if (grandTotal === 0) return [];

  return bars.map((b) => ({ department: b.department, share: (b.total / grandTotal) * 100 }));
}
