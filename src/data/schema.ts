/** Patient sex as recorded in VitalDB. Anything else parses to null. */
export type Sex = 'M' | 'F';

/**
 * One surgical case from the VitalDB clinical table.
 *
 * The source CSV has 74 columns; 23 are modelled here. Narrowing is deliberate:
 * the original implementation carried every column untyped so that "components
 * will pick what they need", which is how empty strings ended up sitting in
 * numeric fields. Adding a column here is a one-line change, and the compiler
 * then points at every site that needs to handle it.
 *
 * Units are part of the field names. That is a direct response to a bug in the
 * original composite risk score, which added a raw percentage (0–3) to two
 * 0–100 normalised values and so weighted mortality at roughly a tenth of its
 * stated importance. A name like `intraopBloodLossMl` makes that class of
 * mistake visible at the call site rather than in a comment.
 *
 * Every clinical field is nullable. Missing data is common and real: albumin is
 * absent for 372 cases and estimated blood loss for 2,401. `null` means "not
 * recorded" and must never be silently coerced to 0.
 */
export interface SurgeryCase {
  /** Primary key, and the key used to fetch this case's telemetry tracks. */
  readonly caseId: number;
  readonly subjectId: number | null;

  // Demographics
  readonly age: number | null;
  readonly sex: Sex | null;
  readonly heightCm: number | null;
  readonly weightKg: number | null;
  readonly bmi: number | null;

  // Classification
  /** ASA physical status, 1–6. Out-of-range values parse to null. */
  readonly asa: number | null;
  /** Source column `emop`, 0/1. */
  readonly isEmergency: boolean | null;
  readonly department: string | null;
  readonly operationType: string | null;
  readonly anesthesiaType: string | null;

  // Timing. Seconds, relative to a per-case origin that is not itself zero —
  // intervals between these values are meaningful, absolute values are not.
  readonly caseStartSec: number | null;
  readonly caseEndSec: number | null;
  readonly anesthesiaStartSec: number | null;
  readonly anesthesiaEndSec: number | null;
  readonly operationStartSec: number | null;
  readonly operationEndSec: number | null;

  // Outcomes
  readonly icuDays: number | null;
  /** Source column `death_inhosp`, 0/1. */
  readonly diedInHospital: boolean | null;
  readonly intraopBloodLossMl: number | null;

  // Pre-operative labs
  readonly preopAlbuminGdl: number | null;
  readonly preopHemoglobinGdl: number | null;
}
