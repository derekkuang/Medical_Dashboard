import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type PlaybackRate = 1 | 2 | 4 | 8;

export interface TelemetryState {
  /** Case being replayed, or null when the panel is idle. */
  caseId: number | null;
  playing: boolean;
  rate: PlaybackRate;
  /** Seconds of history visible in each trace. */
  windowSeconds: number;
  /**
   * Playback position, in seconds.
   *
   * Updated about four times a second, not once per frame. The traces read the
   * true cursor from the ring buffer during their own draw; this copy exists
   * only so the scrubber and the clock readout move, and pushing it at frame
   * rate would put 60 dispatches a second through the store for two pieces of
   * text.
   */
  positionSeconds: number;
}

const initialState: TelemetryState = {
  caseId: null,
  playing: false,
  rate: 1,
  windowSeconds: 30,
  positionSeconds: 0,
};

/**
 * The control plane for playback.
 *
 * What the operator has asked for lives here: which case, running or not, how
 * fast, how much history. What the instruments actually measured does not, and
 * never will — samples live in a ring buffer outside React entirely.
 */
const telemetrySlice = createSlice({
  name: 'telemetry',
  initialState,
  reducers: {
    caseSelected(state, action: PayloadAction<number | null>) {
      state.caseId = action.payload;
      // A new case starts from its beginning, stopped. Carrying the previous
      // position over would drop the operator into the middle of an unrelated
      // operation.
      state.positionSeconds = 0;
      state.playing = false;
    },
    playbackStarted(state) {
      state.playing = true;
    },
    playbackPaused(state) {
      state.playing = false;
    },
    playbackToggled(state) {
      state.playing = !state.playing;
    },
    rateSelected(state, action: PayloadAction<PlaybackRate>) {
      state.rate = action.payload;
    },
    windowSecondsSelected(state, action: PayloadAction<number>) {
      state.windowSeconds = action.payload;
    },
    positionReported(state, action: PayloadAction<number>) {
      state.positionSeconds = action.payload;
    },
    scrubbed(state, action: PayloadAction<number>) {
      state.positionSeconds = action.payload;
    },
  },
});

export const {
  caseSelected,
  playbackStarted,
  playbackPaused,
  playbackToggled,
  rateSelected,
  windowSecondsSelected,
  positionReported,
  scrubbed,
} = telemetrySlice.actions;

export const telemetryReducer = telemetrySlice.reducer;
