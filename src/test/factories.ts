import type { SurgeryCase } from '@/data/schema';

/**
 * Every field defaults to null, so a test states only what it depends on and a
 * reader can see the whole relevant input in one line. Defaulting to plausible
 * values instead would hide which fields a given assertion actually rests on.
 */
const EMPTY_CASE: SurgeryCase = {
  caseId: 0,
  subjectId: null,
  age: null,
  sex: null,
  heightCm: null,
  weightKg: null,
  bmi: null,
  asa: null,
  isEmergency: null,
  department: null,
  operationType: null,
  anesthesiaType: null,
  caseStartSec: null,
  caseEndSec: null,
  anesthesiaStartSec: null,
  anesthesiaEndSec: null,
  operationStartSec: null,
  operationEndSec: null,
  icuDays: null,
  diedInHospital: null,
  intraopBloodLossMl: null,
  preopAlbuminGdl: null,
  preopHemoglobinGdl: null,
};

let nextCaseId = 1;

export function makeCase(overrides: Partial<SurgeryCase> = {}): SurgeryCase {
  return { ...EMPTY_CASE, caseId: nextCaseId++, ...overrides };
}
