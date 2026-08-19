import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { casesWithTelemetry, channelsForCase, parseTrackIndex, trackUrl } from './trackIndex';

const VALID = {
  source: 'https://api.vitaldb.net/trks',
  generatedAt: '2026-08-19',
  channels: [
    { name: 'Solar8000/HR', label: 'Heart rate', unit: 'bpm', approximateHz: 0.5 },
    { name: 'SNUADC/ECG_II', label: 'ECG lead II', unit: 'mV', approximateHz: 500 },
  ],
  cases: [
    {
      caseId: 1,
      department: 'General surgery',
      operationType: 'Colorectal',
      isEmergency: false,
      tracks: ['tid-hr', 'tid-ecg'],
    },
    {
      caseId: 2,
      department: 'Urology',
      operationType: 'Others',
      isEmergency: true,
      tracks: ['tid-hr-2', null],
    },
  ],
};

describe('parseTrackIndex', () => {
  it('accepts a well-formed index', () => {
    const index = parseTrackIndex(VALID);

    expect(index.channels).toHaveLength(2);
    expect(index.cases).toHaveLength(2);
  });

  it('rejects something that is not an index at all', () => {
    // A 404 page or a truncated deploy can still parse as JSON. Failing here
    // beats an undefined track id becoming a silent no-op three layers down.
    expect(() => parseTrackIndex(null)).toThrow(/not an object/);
    expect(() => parseTrackIndex('nope')).toThrow(/not an object/);
    expect(() => parseTrackIndex({})).toThrow(/missing its channels/);
  });

  it('rejects a malformed channel rather than dropping it quietly', () => {
    // Silently omitting one would shift every positional track id after it.
    expect(() => parseTrackIndex({ ...VALID, channels: [{ name: 'x' }] })).toThrow(
      /malformed channel/,
    );
  });

  it('rejects an index with no usable cases', () => {
    expect(() => parseTrackIndex({ ...VALID, cases: [{ nope: true }] })).toThrow(/no usable cases/);
  });

  it('coerces a missing track entry to null rather than keeping a stray value', () => {
    const index = parseTrackIndex({
      ...VALID,
      cases: [{ ...VALID.cases[0], tracks: ['ok', 42] }],
    });

    expect(index.cases[0]?.tracks).toEqual(['ok', null]);
  });
});

describe('channelsForCase', () => {
  const index = parseTrackIndex(VALID);

  it('resolves each channel to the id needed to fetch it', () => {
    const channels = channelsForCase(index, 1);

    expect(channels.map((c) => c.tid)).toEqual(['tid-hr', 'tid-ecg']);
    expect(channels[1]?.approximateHz).toBe(500);
  });

  it('omits channels the case does not have', () => {
    // A caller iterating this should only see channels it can actually fetch.
    const channels = channelsForCase(index, 2);

    expect(channels).toHaveLength(1);
    expect(channels[0]?.name).toBe('Solar8000/HR');
  });

  it('returns nothing for a case outside the demo set', () => {
    expect(channelsForCase(index, 9999)).toEqual([]);
  });
});

describe('casesWithTelemetry', () => {
  it('lists the cases the index covers', () => {
    const ids = casesWithTelemetry(parseTrackIndex(VALID));

    expect(ids.has(1)).toBe(true);
    expect(ids.has(9999)).toBe(false);
  });
});

describe('trackUrl', () => {
  it('builds the samples URL for a track', () => {
    expect(trackUrl('abc123')).toBe('https://api.vitaldb.net/abc123');
  });
});

describe('the shipped track index', () => {
  const index = parseTrackIndex(
    JSON.parse(readFileSync(resolve(process.cwd(), 'public/track-index.json'), 'utf8')),
  );

  it('covers the curated demo set', () => {
    expect(index.cases).toHaveLength(50);
  });

  it('spans every department, so the demo is not one specialty', () => {
    const departments = new Set(index.cases.map((c) => c.department));

    expect(departments).toEqual(
      new Set(['General surgery', 'Thoracic surgery', 'Gynecology', 'Urology']),
    );
  });

  it('includes both elective and emergency cases', () => {
    const emergencies = index.cases.filter((c) => c.isEmergency).length;

    expect(emergencies).toBeGreaterThan(5);
    expect(emergencies).toBeLessThan(index.cases.length - 5);
  });

  it('spans sampling rates so multi-rate rendering is exercised', () => {
    // A demo where every channel ticks at the same rate would never force the
    // canvas path or the downsampler.
    const rates = index.channels.map((c) => c.approximateHz);

    expect(Math.max(...rates)).toBe(500);
    expect(Math.min(...rates)).toBeLessThan(1);
  });

  it('gives every case a heart rate and an ECG trace', () => {
    for (const c of index.cases) {
      const names = channelsForCase(index, c.caseId).map((ch) => ch.name);
      expect(names).toContain('Solar8000/HR');
      expect(names).toContain('SNUADC/ECG_II');
    }
  });

  it('stays small enough to ship alongside the case table', () => {
    const bytes = readFileSync(resolve(process.cwd(), 'public/track-index.json')).length;
    expect(bytes).toBeLessThan(64 * 1024);
  });
});
