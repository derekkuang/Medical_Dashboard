/**
 * Builds public/track-index.json.
 *
 * VitalDB's track index is one static, unfiltered CSV: 13.9 MB gzipped, 30 MB
 * raw, 486,449 rows. `?caseid=` is accepted and ignored, and there is no
 * per-case endpoint, so a browser wanting six track IDs would otherwise have to
 * read most of that file. Deriving a compact index at build time is what a real
 * product would do; see docs/decisions/0001-telemetry-transport.md.
 *
 *   node scripts/build-track-index.js [--cases N] [--out path]
 *
 * The upstream index is cached under .cache/ after the first run, because it is
 * a 14 MB download and it changes approximately never (last modified 2023).
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TRKS_URL = 'https://api.vitaldb.net/trks';
const CACHE = resolve(ROOT, '.cache/trks.csv');

/**
 * Channels the dashboard can render.
 *
 * Chosen for coverage first — each is present for well over 90% of cases — and
 * then to span sampling rates, so the strip charts demonstrate multi-rate
 * fusion rather than one signal drawn six times. ECG_II is the 500 Hz outlier
 * that forces the canvas renderer.
 */
const CHANNELS = [
  { name: 'Solar8000/HR', label: 'Heart rate', unit: 'bpm', approximateHz: 0.5 },
  { name: 'Solar8000/PLETH_SPO2', label: 'SpO₂', unit: '%', approximateHz: 0.5 },
  { name: 'Solar8000/ETCO2', label: 'End-tidal CO₂', unit: 'mmHg', approximateHz: 0.5 },
  {
    name: 'Solar8000/NIBP_MBP',
    label: 'Mean arterial pressure',
    unit: 'mmHg',
    approximateHz: 0.02,
  },
  { name: 'Primus/MAC', label: 'Anaesthetic depth (MAC)', unit: 'MAC', approximateHz: 0.5 },
  { name: 'SNUADC/ECG_II', label: 'ECG lead II', unit: 'mV', approximateHz: 500 },
];

/** Channels a case must have to be worth including at all. */
const REQUIRED = ['Solar8000/HR', 'SNUADC/ECG_II'];

function parseArgs(argv) {
  const args = { cases: 50, out: resolve(ROOT, 'public/track-index.json') };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--cases') args.cases = Number(argv[i + 1]);
    if (argv[i] === '--out') args.out = resolve(ROOT, String(argv[i + 1]));
  }
  return args;
}

async function ensureTrackIndex() {
  if (existsSync(CACHE)) {
    console.log(`Using cached index at ${CACHE}`);
    return CACHE;
  }

  console.log(`Downloading ${TRKS_URL} (about 14 MB)…`);
  mkdirSync(dirname(CACHE), { recursive: true });

  const response = await fetch(TRKS_URL);
  if (!response.ok || response.body === null) {
    throw new Error(`Could not fetch the track index: HTTP ${String(response.status)}`);
  }

  // Streamed to disk rather than buffered: 30 MB decompressed is not worth
  // holding in memory just to write it straight out again.
  await pipeline(Readable.fromWeb(response.body), createWriteStream(CACHE));
  return CACHE;
}

/** caseid -> { channelName: tid } for the channels we care about. */
function readTracksByCase(path) {
  const wanted = new Set(CHANNELS.map((c) => c.name));
  const byCase = new Map();

  const text = readFileSync(path, 'utf8');
  const start = text.indexOf('\n') + 1;

  for (const line of text.slice(start).split('\n')) {
    if (line === '') continue;
    // Split manually rather than with a CSV parser: this file is 486k rows of
    // three simple fields, and the parse dominates the script's runtime.
    const first = line.indexOf(',');
    const second = line.indexOf(',', first + 1);
    if (first < 0 || second < 0) continue;

    const name = line.slice(first + 1, second);
    if (!wanted.has(name)) continue;

    const caseId = Number(line.slice(0, first));
    const tid = line.slice(second + 1).trim();
    if (!Number.isInteger(caseId) || tid === '') continue;

    const entry = byCase.get(caseId);
    if (entry === undefined) byCase.set(caseId, { [name]: tid });
    else entry[name] = tid;
  }

  return byCase;
}

/** Minimal read of the case table for the stratification keys. */
function readCases() {
  const text = readFileSync(resolve(ROOT, 'public/cases.csv'), 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? '').split(',');
  const columns = ['caseid', 'department', 'emop', 'optype'].map((c) => header.indexOf(c));

  return lines.slice(1).flatMap((line) => {
    if (line === '') return [];
    // Quoted fields containing commas appear only in dx/opname, both of which
    // sit after every column read here, so a plain split is safe.
    const cells = line.split(',');
    const [idAt, deptAt, emopAt, typeAt] = columns;
    const caseId = Number(cells[idAt]);
    if (!Number.isInteger(caseId)) return [];

    return [
      {
        caseId,
        department: (cells[deptAt] ?? '').trim(),
        isEmergency: cells[emopAt] === '1',
        operationType: (cells[typeAt] ?? '').trim(),
      },
    ];
  });
}

/**
 * Picks a spread rather than the first N.
 *
 * Round-robins across (department, urgency) strata so the demo set covers all
 * four departments and both urgencies, and takes evenly spaced cases within
 * each stratum. Taking the lowest ids would give an unrepresentative block, and
 * random selection would make the shipped file churn on every rebuild.
 */
function selectCases(cases, tracksByCase, limit) {
  const strata = new Map();

  for (const c of cases.sort((a, b) => a.caseId - b.caseId)) {
    const tracks = tracksByCase.get(c.caseId);
    if (tracks === undefined) continue;
    if (!REQUIRED.every((name) => name in tracks)) continue;

    const key = `${c.department}|${c.isEmergency ? 'emergency' : 'elective'}`;
    const bucket = strata.get(key);
    if (bucket === undefined) strata.set(key, [c]);
    else bucket.push(c);
  }

  const keys = [...strata.keys()].sort();
  const picked = [];

  // Evenly spaced within each stratum, then round-robin across strata until the
  // quota is met, so small strata are represented before large ones are drained.
  const spread = keys.map((key) => {
    const bucket = strata.get(key) ?? [];
    const perStratum = Math.max(1, Math.ceil(limit / keys.length));
    const step = Math.max(1, Math.floor(bucket.length / perStratum));
    return bucket.filter((_, i) => i % step === 0);
  });

  let round = 0;
  while (picked.length < limit && spread.some((b) => b.length > round)) {
    for (const bucket of spread) {
      if (picked.length >= limit) break;
      const c = bucket[round];
      if (c !== undefined) picked.push(c);
    }
    round += 1;
  }

  return picked.sort((a, b) => a.caseId - b.caseId);
}

async function main() {
  const { cases: limit, out } = parseArgs(process.argv.slice(2));

  const indexPath = await ensureTrackIndex();
  const tracksByCase = readTracksByCase(indexPath);
  const cases = readCases();
  const selected = selectCases(cases, tracksByCase, limit);

  const payload = {
    // Provenance, so a stale index is diagnosable rather than mysterious.
    source: TRKS_URL,
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'Derived at build time. See docs/decisions/0001-telemetry-transport.md.',
    channels: CHANNELS,
    cases: selected.map((c) => {
      const tracks = tracksByCase.get(c.caseId) ?? {};
      return {
        caseId: c.caseId,
        department: c.department,
        operationType: c.operationType,
        isEmergency: c.isEmergency,
        // Positional against `channels`, null where the case lacks one. An
        // object per case would roughly double the file for no added meaning.
        tracks: CHANNELS.map((ch) => tracks[ch.name] ?? null),
      };
    }),
  };

  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

  const bytes = readFileSync(out).length;
  console.log(`Wrote ${String(selected.length)} cases to ${out} (${(bytes / 1024).toFixed(1)} kB)`);

  const byDepartment = new Map();
  for (const c of selected)
    byDepartment.set(c.department, (byDepartment.get(c.department) ?? 0) + 1);
  console.log('By department:', Object.fromEntries(byDepartment));
  console.log('Emergency:', selected.filter((c) => c.isEmergency).length);
}

await main();
