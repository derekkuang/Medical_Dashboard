import { quantile } from 'd3-array';
import type { SurgeryCase } from '@/data/schema';

export type PhaseKey = 'preIncision' | 'operation' | 'anaesthesia';

export interface PhaseDefinition {
  key: PhaseKey;
  label: string;
  /** Both ends in seconds from the case's own origin. */
  from: (c: SurgeryCase) => number | null;
  to: (c: SurgeryCase) => number | null;
}

export const PHASES: readonly PhaseDefinition[] = [
  {
    key: 'preIncision',
    label: 'Anaesthesia to incision',
    from: (c) => c.anesthesiaStartSec,
    to: (c) => c.operationStartSec,
  },
  {
    key: 'operation',
    label: 'Incision to close',
    from: (c) => c.operationStartSec,
    to: (c) => c.operationEndSec,
  },
  {
    key: 'anaesthesia',
    label: 'Anaesthesia, total',
    from: (c) => c.anesthesiaStartSec,
    to: (c) => c.anesthesiaEndSec,
  },
];

/** Longer than this and the record is a data error, not a long operation. */
const MAX_PLAUSIBLE_MINUTES = 24 * 60;

/**
 * Duration of a phase in minutes, or null when it cannot be computed.
 *
 * Timestamps are seconds from a per-case origin which is not itself zero, so
 * only differences are meaningful — an absolute value says nothing. Negative
 * and implausibly long intervals are dropped as record errors rather than
 * clamped, which would pile them onto the boundary and create a fake spike.
 */
export function phaseDuration(c: SurgeryCase, phase: PhaseDefinition): number | null {
  const from = phase.from(c);
  const to = phase.to(c);
  if (from === null || to === null) return null;

  const minutes = (to - from) / 60;
  if (minutes <= 0 || minutes > MAX_PLAUSIBLE_MINUTES) return null;

  return minutes;
}

export interface DurationSummary {
  count: number;
  median: number;
  q1: number;
  q3: number;
}

/**
 * Median and interquartile range.
 *
 * Median rather than mean: these distributions are right-skewed — a handful of
 * very long cases pull the mean above the typical one. The original reported
 * means, and its own headline figures show the gap: breast surgery averages
 * 33.9 minutes to incision but the median case takes 30.5.
 */
export function summariseDurations(values: readonly number[]): DurationSummary | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  if (median === undefined || q1 === undefined || q3 === undefined) return null;

  return { count: sorted.length, median, q1, q3 };
}

export interface PhaseRow {
  key: string;
  label: string;
  summary: DurationSummary | null;
}

/**
 * One row per operation type, ordered by case count, plus an "All cases" row.
 *
 * Ordered by frequency rather than by duration so rows keep their position as
 * filters change. Limited to the commonest types because the tail is a long
 * list of single-case procedures whose quartiles mean nothing.
 */
export function phaseByOperationType(
  cases: readonly SurgeryCase[],
  phase: PhaseDefinition,
  limit = 8,
  minimumCases = 20,
): PhaseRow[] {
  const groups = new Map<string, number[]>();
  const all: number[] = [];

  for (const c of cases) {
    const duration = phaseDuration(c, phase);
    if (duration === null) continue;

    all.push(duration);
    if (c.operationType === null) continue;

    const bucket = groups.get(c.operationType);
    if (bucket === undefined) groups.set(c.operationType, [duration]);
    else bucket.push(duration);
  }

  const rows = [...groups]
    .filter(([, values]) => values.length >= minimumCases)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([operationType, values]) => ({
      key: operationType,
      label: operationType,
      summary: summariseDurations(values),
    }));

  return [{ key: '__all__', label: 'All cases', summary: summariseDurations(all) }, ...rows];
}
