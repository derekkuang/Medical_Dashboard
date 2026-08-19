import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Sample } from './TelemetrySource';
import { parseSampleLine, streamTrack } from './streamTrack';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Serves the given chunks verbatim, so mid-line boundaries can be forced. */
function stubChunks(chunks: readonly string[], status = 200): void {
  globalThis.fetch = () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return Promise.resolve(new Response(status === 200 ? body : null, { status }));
  };
}

async function collect(chunks: readonly string[]): Promise<Sample[]> {
  const samples: Sample[] = [];
  stubChunks(chunks);
  await streamTrack('tid', new AbortController().signal, (batch) => samples.push(...batch));
  return samples;
}

describe('parseSampleLine', () => {
  it('reads a time and value pair', () => {
    expect(parseSampleLine('1.818,88')).toEqual({ time: 1.818, value: 88 });
  });

  it('skips a blank value rather than reading it as zero', () => {
    // The ECG tracks open with thousands of empty samples before the
    // electrodes settle. Zero would draw a flat line through the start of
    // every trace.
    expect(parseSampleLine('0.002,')).toBeNull();
    expect(parseSampleLine(',88')).toBeNull();
  });

  it('rejects a line with no separator', () => {
    expect(parseSampleLine('nonsense')).toBeNull();
  });

  it('rejects non-numeric text instead of yielding NaN', () => {
    expect(parseSampleLine('abc,88')).toBeNull();
    expect(parseSampleLine('1.0,def')).toBeNull();
  });
});

describe('streamTrack', () => {
  it('parses a whole track', async () => {
    const samples = await collect(['Time,Solar8000/HR\n1.818,88\n3.817,87\n']);

    expect(samples).toEqual([
      { time: 1.818, value: 88 },
      { time: 3.817, value: 87 },
    ]);
  });

  it('skips the header row', async () => {
    const samples = await collect(['Time,Solar8000/HR\n1,80\n']);
    expect(samples).toHaveLength(1);
  });

  it('reassembles a line split across chunk boundaries', async () => {
    // A chunk boundary lands mid-line more often than not. Losing the tail
    // would silently drop a sample on every chunk.
    const samples = await collect(['Time,HR\n1.8', '18,8', '8\n3.817,87\n']);

    expect(samples).toEqual([
      { time: 1.818, value: 88 },
      { time: 3.817, value: 87 },
    ]);
  });

  it('reads a final line with no trailing newline', async () => {
    const samples = await collect(['Time,HR\n1,80\n2,81']);
    expect(samples.at(-1)).toEqual({ time: 2, value: 81 });
  });

  it('drops blank samples but keeps what follows', async () => {
    const samples = await collect(['Time,ECG\n0,\n0.002,\n0.004,0.5\n']);

    expect(samples).toEqual([{ time: 0.004, value: 0.5 }]);
  });

  it('delivers progressively rather than only at the end', async () => {
    // The reason for streaming at all: a 61 MB waveform must not wait for its
    // last byte before anything can be drawn.
    stubChunks(['Time,HR\n1,80\n', '2,81\n', '3,82\n']);
    const batches: number[] = [];

    await streamTrack('tid', new AbortController().signal, (batch) => batches.push(batch.length));

    expect(batches.length).toBeGreaterThan(1);
  });

  it('reports an HTTP failure with its status', async () => {
    stubChunks([], 503);

    await expect(streamTrack('tid', new AbortController().signal, () => undefined)).rejects.toThrow(
      /503/,
    );
  });

  it('handles an empty track without emitting anything', async () => {
    const onSamples = vi.fn();
    stubChunks(['Time,HR\n']);

    await streamTrack('tid', new AbortController().signal, onSamples);

    expect(onSamples).not.toHaveBeenCalled();
  });
});
