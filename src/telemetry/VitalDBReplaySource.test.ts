import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConnectionStatus, Sample } from './TelemetrySource';
import type { ResolvedChannel } from './trackIndex';
import type { TrackLoader } from './streamTrack';
import { VitalDBReplaySource, firstIndexAfter } from './VitalDBReplaySource';

const CHANNELS: ResolvedChannel[] = [
  { tid: 'tid-hr', name: 'Solar8000/HR', label: 'Heart rate', unit: 'bpm', approximateHz: 0.5 },
  { tid: 'tid-ecg', name: 'SNUADC/ECG_II', label: 'ECG', unit: 'mV', approximateHz: 500 },
];

/** A loader that delivers a fixed series immediately. No network. */
function loaderFor(samples: Record<string, Sample[]>): TrackLoader {
  return (tid, _signal, onSamples) => {
    const series = samples[tid];
    if (series !== undefined && series.length > 0) onSamples(series);
    return Promise.resolve();
  };
}

const HR: Sample[] = [
  { time: 1, value: 80 },
  { time: 2, value: 81 },
  { time: 3, value: 82 },
  { time: 10, value: 90 },
];

let clock = 0;
const now = () => clock;

function advance(ms: number): void {
  clock += ms;
  vi.advanceTimersByTime(ms);
}

function makeSource(overrides: Partial<ConstructorParameters<typeof VitalDBReplaySource>[0]> = {}) {
  return new VitalDBReplaySource({
    channels: CHANNELS,
    loadTrack: loaderFor({ 'tid-hr': HR }),
    tickMs: 100,
    now,
    ...overrides,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VitalDBReplaySource', () => {
  it('advertises the channels it was given', async () => {
    const source = makeSource();
    const channels = await source.channels();

    expect(channels.map((c) => c.id)).toEqual(['tid-hr', 'tid-ecg']);
    expect(channels[1]?.approximateHz).toBe(500);
    source.close();
  });

  it('loads a track only when something subscribes to it', async () => {
    // Opening a case must not fetch six tracks the operator never looks at.
    const loadTrack = vi.fn(loaderFor({ 'tid-hr': HR }));
    const source = makeSource({ loadTrack });

    expect(loadTrack).not.toHaveBeenCalled();

    source.subscribe('tid-hr', () => undefined);
    await vi.waitFor(() => {
      expect(loadTrack).toHaveBeenCalledTimes(1);
    });
    expect(loadTrack.mock.calls[0]?.[0]).toBe('tid-hr');

    source.close();
  });

  it('emits samples as the clock passes their timestamps', async () => {
    const source = makeSource();
    const batches: Sample[][] = [];
    source.subscribe('tid-hr', (b) => batches.push([...b]));
    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    source.play();
    advance(1500);

    // Only the samples at t=1 have been reached at 1.5 s of playback.
    expect(batches.flat().map((s) => s.time)).toEqual([1]);

    advance(1000);
    expect(batches.flat().map((s) => s.time)).toEqual([1, 2]);

    source.close();
  });

  it('honours the playback rate', async () => {
    const source = makeSource();
    const seen: number[] = [];
    source.subscribe('tid-hr', (b) => seen.push(...b.map((s) => s.time)));
    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    source.play(4);
    advance(1000); // four seconds of case time

    expect(seen).toEqual([1, 2, 3]);
    source.close();
  });

  it('stops advancing when paused', async () => {
    const source = makeSource();
    source.subscribe('tid-hr', () => undefined);
    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    source.play();
    advance(1500);
    const atPause = source.position;

    source.pause();
    advance(5000);

    expect(source.position).toBe(atPause);
    source.close();
  });

  it('never replays a sample twice', async () => {
    const source = makeSource();
    const seen: number[] = [];
    source.subscribe('tid-hr', (b) => seen.push(...b.map((s) => s.time)));
    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    source.play();
    advance(12000);

    expect(seen).toEqual([1, 2, 3, 10]);
    source.close();
  });

  it('does not re-emit history after seeking forward', async () => {
    const source = makeSource();
    const seen: number[] = [];
    source.subscribe('tid-hr', (b) => seen.push(...b.map((s) => s.time)));
    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    source.seek(5);
    source.play();
    advance(6000);

    expect(seen).toEqual([10]);
    source.close();
  });

  it('replays from the new position after seeking backward', async () => {
    const source = makeSource();
    const seen: number[] = [];
    source.subscribe('tid-hr', (b) => seen.push(...b.map((s) => s.time)));
    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    source.play();
    advance(4000);
    seen.length = 0;

    source.seek(0);
    advance(4000);

    expect(seen).toEqual([1, 2, 3]);
    source.close();
  });

  it('reports the longest loaded track as its duration', async () => {
    const source = makeSource({
      loadTrack: loaderFor({ 'tid-hr': HR, 'tid-ecg': [{ time: 42, value: 1 }] }),
    });
    source.subscribe('tid-hr', () => undefined);
    source.subscribe('tid-ecg', () => undefined);

    await vi.waitFor(() => {
      expect(source.duration).toBe(42);
    });
    source.close();
  });

  it('has no duration before anything has loaded', () => {
    const source = makeSource();
    expect(source.duration).toBeNull();
    source.close();
  });

  it('ends when playback passes the last sample', async () => {
    const source = makeSource();
    const states: ConnectionStatus[] = [];
    source.onStatus((s) => states.push(s));
    source.subscribe('tid-hr', () => undefined);
    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    source.play();
    advance(11000);

    expect(states.at(-1)?.state).toBe('ended');
    source.close();
  });

  it('gives a late status subscriber the current state immediately', async () => {
    // Otherwise it waits forever for a transition that already happened.
    const source = makeSource();
    source.subscribe('tid-hr', () => undefined);
    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    const states: ConnectionStatus[] = [];
    source.onStatus((s) => states.push(s));

    expect(states).toHaveLength(1);
    source.close();
  });

  it('does not claim to be streaming when a track loads while paused', async () => {
    const source = makeSource();
    const states: ConnectionStatus[] = [];
    source.onStatus((s) => states.push(s));
    source.subscribe('tid-hr', () => undefined);

    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    expect(states.map((s) => s.state)).not.toContain('streaming');
    source.close();
  });

  it('reports a load failure with its reason', async () => {
    const source = makeSource({
      loadTrack: () => Promise.reject(new Error('HTTP 503')),
    });
    const states: ConnectionStatus[] = [];
    source.onStatus((s) => states.push(s));
    source.subscribe('tid-hr', () => undefined);

    await vi.waitFor(() => {
      expect(states.at(-1)?.state).toBe('error');
    });
    expect(states.at(-1)?.detail).toContain('503');
    source.close();
  });

  it('stops delivering after close', async () => {
    const source = makeSource();
    const seen: Sample[] = [];
    source.subscribe('tid-hr', (b) => seen.push(...b));
    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    source.play();
    source.close();
    advance(20000);

    expect(seen).toHaveLength(0);
  });

  it('ignores a subscription to a channel it does not have', () => {
    const source = makeSource();
    const unsubscribe = source.subscribe('nope', () => undefined);

    expect(() => {
      unsubscribe();
    }).not.toThrow();
    source.close();
  });

  it('stops delivering to an unsubscribed listener', async () => {
    const source = makeSource();
    const seen: Sample[] = [];
    const unsubscribe = source.subscribe('tid-hr', (b) => seen.push(...b));
    await vi.waitFor(() => {
      expect(source.duration).toBe(10);
    });

    unsubscribe();
    source.play();
    advance(12000);

    expect(seen).toHaveLength(0);
    source.close();
  });
});

describe('firstIndexAfter', () => {
  const samples: Sample[] = [1, 2, 3, 5, 8].map((time) => ({ time, value: 0 }));

  it('finds the first sample strictly after the time', () => {
    expect(firstIndexAfter(samples, 2)).toBe(2);
    expect(firstIndexAfter(samples, 4)).toBe(3);
  });

  it('returns zero before the first sample', () => {
    expect(firstIndexAfter(samples, 0)).toBe(0);
  });

  it('returns the length past the last sample', () => {
    expect(firstIndexAfter(samples, 99)).toBe(5);
  });

  it('handles an empty series', () => {
    expect(firstIndexAfter([], 5)).toBe(0);
  });
});
