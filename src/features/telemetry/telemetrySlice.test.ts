import { describe, it, expect } from 'vitest';
import {
  caseSelected,
  playbackToggled,
  positionReported,
  rateSelected,
  scrubbed,
  telemetryReducer,
} from './telemetrySlice';

const initial = telemetryReducer(undefined, { type: '@@INIT' });

describe('telemetryReducer', () => {
  it('starts idle with nothing selected', () => {
    expect(initial).toEqual({
      caseId: null,
      playing: false,
      rate: 1,
      windowSeconds: 30,
      positionSeconds: 0,
    });
  });

  it('rewinds and stops when a new case is chosen', () => {
    // Carrying the previous position over would drop the operator into the
    // middle of an unrelated operation.
    const midPlayback = [positionReported(900), playbackToggled()].reduce(
      telemetryReducer,
      initial,
    );
    expect(midPlayback.playing).toBe(true);

    const switched = telemetryReducer(midPlayback, caseSelected(42));

    expect(switched.caseId).toBe(42);
    expect(switched.positionSeconds).toBe(0);
    expect(switched.playing).toBe(false);
  });

  it('toggles playback', () => {
    const playing = telemetryReducer(initial, playbackToggled());
    expect(playing.playing).toBe(true);
    expect(telemetryReducer(playing, playbackToggled()).playing).toBe(false);
  });

  it('keeps the rate across a pause', () => {
    const state = [rateSelected(4), playbackToggled(), playbackToggled()].reduce(
      telemetryReducer,
      initial,
    );

    expect(state.rate).toBe(4);
    expect(state.playing).toBe(false);
  });

  it('moves the cursor when scrubbed', () => {
    expect(telemetryReducer(initial, scrubbed(120)).positionSeconds).toBe(120);
  });

  it('does not disturb playback when the position is reported', () => {
    // The poll that keeps the clock moving must not toggle anything else.
    const playing = telemetryReducer(initial, playbackToggled());
    const reported = telemetryReducer(playing, positionReported(5));

    expect(reported.playing).toBe(true);
    expect(reported.positionSeconds).toBe(5);
  });

  it('clearing the case leaves nothing selected', () => {
    const selected = telemetryReducer(initial, caseSelected(7));
    expect(telemetryReducer(selected, caseSelected(null)).caseId).toBeNull();
  });
});
