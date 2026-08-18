import type { Sex } from '@/data/schema';
import { NO_FILTERS, type CaseFilters } from '@/transforms/filterCases';

/**
 * Short, stable parameter names. They are part of every shared link, so
 * renaming one silently breaks URLs that are already in circulation.
 */
const PARAM = {
  department: 'dept',
  ageRange: 'age',
  sex: 'sex',
  operationType: 'op',
  emergencyOnly: 'emg',
} as const;

/**
 * Encodes the selection, omitting anything at its default.
 *
 * Omitting defaults keeps an unfiltered dashboard at a bare URL, so the
 * presence of a query string means something was actually selected.
 */
export function encodeFilters(filters: CaseFilters): string {
  const params = new URLSearchParams();

  if (filters.department !== null) params.set(PARAM.department, filters.department);
  if (filters.sex !== null) params.set(PARAM.sex, filters.sex);
  if (filters.operationType !== null) params.set(PARAM.operationType, filters.operationType);
  if (filters.emergencyOnly) params.set(PARAM.emergencyOnly, '1');
  if (filters.ageRange !== null) {
    const [lo, hi] = filters.ageRange;
    params.set(PARAM.ageRange, `${String(lo)}-${String(hi)}`);
  }

  return params.toString();
}

function parseAgeRange(raw: string | null): [number, number] | null {
  if (raw === null) return null;

  const parts = raw.split('-');
  if (parts.length !== 2) return null;

  const [loRaw, hiRaw] = parts;

  // Number('') is 0, so an empty half would decode "age=-" as the range [0, 0]
  // — a filter that looks deliberate, matches almost nothing, and no control
  // can explain. Reject empty parts before coercing.
  if (loRaw === undefined || hiRaw === undefined) return null;
  if (loRaw.trim() === '' || hiRaw.trim() === '') return null;

  const lo = Number(loRaw);
  const hi = Number(hiRaw);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;

  // Tolerate a reversed range rather than rejecting it — the intent is
  // unambiguous and a shared link should not silently lose a filter.
  return lo <= hi ? [lo, hi] : [hi, lo];
}

function parseSex(raw: string | null): Sex | null {
  return raw === 'M' || raw === 'F' ? raw : null;
}

/**
 * Decodes a query string into a complete selection.
 *
 * Every field is validated and anything unrecognised falls back to its default.
 * A URL is user-editable input arriving from outside the application, so a
 * hand-mangled or truncated link must degrade to a wider cohort rather than
 * crash the dashboard or produce a filter no control can clear.
 */
export function decodeFilters(search: string | URLSearchParams): CaseFilters {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;

  return {
    department: params.get(PARAM.department) ?? null,
    ageRange: parseAgeRange(params.get(PARAM.ageRange)),
    sex: parseSex(params.get(PARAM.sex)),
    operationType: params.get(PARAM.operationType) ?? null,
    emergencyOnly: params.get(PARAM.emergencyOnly) === '1',
  };
}

export { NO_FILTERS };
