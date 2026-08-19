export interface TrackChannel {
  /** VitalDB track name, e.g. "Solar8000/HR". */
  name: string;
  label: string;
  unit: string;
  approximateHz: number;
}

export interface TrackCase {
  caseId: number;
  department: string;
  operationType: string;
  isEmergency: boolean;
  /** Positional against `channels`; null where this case lacks that track. */
  tracks: (string | null)[];
}

export interface TrackIndex {
  source: string;
  generatedAt: string;
  channels: TrackChannel[];
  cases: TrackCase[];
}

/** A channel that exists for a particular case, with the id needed to fetch it. */
export interface ResolvedChannel extends TrackChannel {
  tid: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asChannel(value: unknown): TrackChannel | null {
  if (!isRecord(value)) return null;
  const { name, label, unit, approximateHz } = value;
  if (typeof name !== 'string' || typeof label !== 'string') return null;
  if (typeof unit !== 'string' || typeof approximateHz !== 'number') return null;
  return { name, label, unit, approximateHz };
}

function asCase(value: unknown): TrackCase | null {
  if (!isRecord(value)) return null;
  const { caseId, department, operationType, isEmergency, tracks } = value;
  if (typeof caseId !== 'number' || !Array.isArray(tracks)) return null;

  return {
    caseId,
    department: typeof department === 'string' ? department : '',
    operationType: typeof operationType === 'string' ? operationType : '',
    isEmergency: isEmergency === true,
    tracks: tracks.map((t) => (typeof t === 'string' ? t : null)),
  };
}

/**
 * Validates the shipped index rather than trusting it.
 *
 * It is a build artefact fetched at runtime, so it can be stale, truncated by a
 * bad deploy, or replaced by a 404 page that happens to parse. Failing here,
 * with a reason, beats an undefined track id surfacing as a silent no-op three
 * layers down in the replay source.
 */
export function parseTrackIndex(value: unknown): TrackIndex {
  if (!isRecord(value)) throw new Error('Track index is not an object');

  const { source, generatedAt, channels, cases } = value;
  if (!Array.isArray(channels) || !Array.isArray(cases)) {
    throw new Error('Track index is missing its channels or cases');
  }

  const parsedChannels = channels.map(asChannel);
  if (parsedChannels.some((c) => c === null)) {
    throw new Error('Track index contains a malformed channel');
  }

  const parsedCases = cases.map(asCase).filter((c): c is TrackCase => c !== null);
  if (parsedCases.length === 0) throw new Error('Track index contains no usable cases');

  return {
    source: typeof source === 'string' ? source : 'unknown',
    generatedAt: typeof generatedAt === 'string' ? generatedAt : 'unknown',
    channels: parsedChannels.filter((c): c is TrackChannel => c !== null),
    cases: parsedCases,
  };
}

/** Case ids with telemetry, as a set for cheap membership tests. */
export function casesWithTelemetry(index: TrackIndex): Set<number> {
  return new Set(index.cases.map((c) => c.caseId));
}

/**
 * Channels available for one case.
 *
 * Positions whose track id is null are omitted rather than returned as gaps: a
 * caller iterating this should only ever see channels it can actually fetch.
 */
export function channelsForCase(index: TrackIndex, caseId: number): ResolvedChannel[] {
  const entry = index.cases.find((c) => c.caseId === caseId);
  if (entry === undefined) return [];

  return index.channels.flatMap((channel, position) => {
    const tid = entry.tracks[position];
    return tid == null ? [] : [{ ...channel, tid }];
  });
}

/** URL for a track's samples. */
export function trackUrl(tid: string): string {
  return `https://api.vitaldb.net/${tid}`;
}
