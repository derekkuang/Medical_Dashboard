import { csvParse } from 'd3-dsv';
import type { Sex, SurgeryCase } from './schema';

/** Row-level outcome of a parse, surfaced so the UI can report data quality. */
export interface ParseReport {
  readonly rowsRead: number;
  readonly casesParsed: number;
  /** Rows dropped for want of a usable caseId. */
  readonly rowsSkipped: number;
}

export interface ParsedCases {
  readonly cases: readonly SurgeryCase[];
  readonly report: ParseReport;
}

/**
 * The published file is UTF-8 with a BOM. Left in place, the BOM becomes part
 * of the first header name (U+FEFF is prefixed to "caseid"), so every lookup
 * of `caseid` silently misses and the primary key reads as absent for every row.
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Empty means absent. The original coerced '' to '' and left it in numeric
 * fields, which is why its call sites are littered with `typeof x === 'number'`
 * guards. Converting once, here, is what lets the rest of the codebase trust
 * its own types.
 *
 * Note this rejects NaN and Infinity rather than passing them through: a NaN
 * propagates silently through means and scales, and surfaces as a blank chart
 * far from its cause.
 */
function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** 0/1 columns. Any other value is treated as unrecorded rather than false. */
function toBoolean01(raw: string | undefined): boolean | null {
  const value = toNumber(raw);
  if (value === null) return null;
  if (value === 0) return false;
  if (value === 1) return true;
  return null;
}

function toText(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function toSex(raw: string | undefined): Sex | null {
  const text = toText(raw)?.toUpperCase();
  return text === 'M' || text === 'F' ? text : null;
}

/**
 * ASA physical status is an ordinal 1–6 classification, not a free number.
 * Values outside that range are data errors, and admitting them would let the
 * cohort matcher treat a nonsense score as a real neighbour.
 */
function toAsa(raw: string | undefined): number | null {
  const value = toNumber(raw);
  if (value === null || !Number.isInteger(value) || value < 1 || value > 6) return null;
  return value;
}

/**
 * Parses the VitalDB case table.
 *
 * Uses d3-dsv rather than splitting on commas: 951 of the 6,388 rows (15%)
 * contain a quoted field with an embedded comma, such as
 * "Abnormal chest CT, lung nodule". Naive splitting shifts every subsequent
 * column on those rows.
 */
export function parseCases(csvText: string): ParsedCases {
  const rows = csvParse(stripBom(csvText));

  const cases: SurgeryCase[] = [];
  let rowsSkipped = 0;

  for (const row of rows) {
    const caseId = toNumber(row.caseid);

    // Without a case id the row cannot be keyed, joined to telemetry, or
    // referenced in a URL. Drop it and report it rather than inventing an id.
    if (caseId === null) {
      rowsSkipped += 1;
      continue;
    }

    cases.push({
      caseId,
      subjectId: toNumber(row.subjectid),

      age: toNumber(row.age),
      sex: toSex(row.sex),
      heightCm: toNumber(row.height),
      weightKg: toNumber(row.weight),
      bmi: toNumber(row.bmi),

      asa: toAsa(row.asa),
      isEmergency: toBoolean01(row.emop),
      department: toText(row.department),
      operationType: toText(row.optype),
      anesthesiaType: toText(row.ane_type),

      caseStartSec: toNumber(row.casestart),
      caseEndSec: toNumber(row.caseend),
      anesthesiaStartSec: toNumber(row.anestart),
      anesthesiaEndSec: toNumber(row.aneend),
      operationStartSec: toNumber(row.opstart),
      operationEndSec: toNumber(row.opend),

      icuDays: toNumber(row.icu_days),
      diedInHospital: toBoolean01(row.death_inhosp),
      intraopBloodLossMl: toNumber(row.intraop_ebl),

      preopAlbuminGdl: toNumber(row.preop_alb),
      preopHemoglobinGdl: toNumber(row.preop_hb),
    });
  }

  return {
    cases,
    report: { rowsRead: rows.length, casesParsed: cases.length, rowsSkipped },
  };
}
