import type { Sample } from './TelemetrySource';
import { trackUrl } from './trackIndex';

export type TrackLoader = (
  tid: string,
  signal: AbortSignal,
  onSamples: (samples: Sample[]) => void,
) => Promise<void>;

/**
 * Parses one `Time,value` line. Returns null for anything unusable.
 *
 * Blank values are common and meaningful — the ECG tracks open with thousands
 * of empty samples before the electrodes settle — so they are skipped rather
 * than read as zero, which would draw a flat line through the start of every
 * trace.
 */
export function parseSampleLine(line: string): Sample | null {
  const comma = line.indexOf(',');
  if (comma < 0) return null;

  const timeText = line.slice(0, comma).trim();
  const valueText = line.slice(comma + 1).trim();
  if (timeText === '' || valueText === '') return null;

  const time = Number(timeText);
  const value = Number(valueText);
  if (!Number.isFinite(time) || !Number.isFinite(value)) return null;

  return { time, value };
}

/** Emitted per chunk rather than per line; see the note in streamTrack. */
const MAX_BATCH = 2048;

/**
 * Streams a VitalDB track, emitting samples as they arrive.
 *
 * Streaming rather than awaiting the whole body. A 0.5 Hz numeric is 60 kB and
 * would be fine either way, but a 500 Hz waveform is 61 MB — playback can start
 * on the first chunk instead of after the last one.
 *
 * This is also why range requests are not used. The origin stores these objects
 * already gzip-encoded, so a byte range is a slice of the compressed stream and
 * cannot be decompressed alone. `response.body` sidesteps that entirely: the
 * browser decompresses as it reads. See
 * docs/decisions/0001-telemetry-transport.md.
 */
export const streamTrack: TrackLoader = async (tid, signal, onSamples) => {
  const response = await fetch(trackUrl(tid), { signal });
  if (!response.ok) {
    throw new Error(`Could not load track ${tid}: HTTP ${String(response.status)}`);
  }
  if (response.body === null) {
    throw new Error(`Track ${tid} returned no body`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  // A chunk boundary lands mid-line more often than not, so the tail is carried
  // forward rather than parsed and discarded.
  let carry = '';
  let isFirstLine = true;
  let batch: Sample[] = [];

  const flush = (): void => {
    if (batch.length === 0) return;
    onSamples(batch);
    batch = [];
  };

  const consume = (line: string): void => {
    // The header is "Time,<track name>", which parses to NaN and would be
    // dropped anyway; skipping it explicitly is clearer than relying on that.
    if (isFirstLine) {
      isFirstLine = false;
      return;
    }
    const sample = parseSampleLine(line);
    if (sample === null) return;

    batch.push(sample);
    // Bounded batches keep one 61 MB track from arriving as a single callback
    // that blocks the main thread while the consumer copies it.
    if (batch.length >= MAX_BATCH) flush();
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      carry += decoder.decode(value, { stream: true });

      let newline = carry.indexOf('\n');
      while (newline >= 0) {
        consume(carry.slice(0, newline));
        carry = carry.slice(newline + 1);
        newline = carry.indexOf('\n');
      }
      flush();
    }

    // Whatever is left after the final chunk is a complete line with no
    // trailing newline.
    if (carry !== '') consume(carry);
    flush();
  } finally {
    reader.releaseLock();
  }
};
