import {
  Box,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { ChartCard } from '@/components/ChartCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { StripChart } from '@/charts/StripChart';
import { useGetTrackIndexQuery } from '@/data/trackIndexApi';
import {
  caseSelected,
  playbackPaused,
  playbackToggled,
  positionReported,
  rateSelected,
  scrubbed,
  type PlaybackRate,
} from '@/features/telemetry/telemetrySlice';
import { useResizeObserver } from '@/hooks/useResizeObserver';
import { VitalDBReplaySource } from '@/telemetry/VitalDBReplaySource';
import type { ConnectionStatus } from '@/telemetry/TelemetrySource';
import { channelsForCase } from '@/telemetry/trackIndex';

const RATES: PlaybackRate[] = [1, 2, 4, 8];
const TRACE_HEIGHT = 76;

/**
 * How often the position is copied into the store.
 *
 * Four times a second: enough that the scrubber and clock look live, far below
 * the frame rate. The traces read the real cursor from their own buffer while
 * drawing, so this copy only feeds two pieces of text — pushing it per frame
 * would put 60 dispatches a second through the store for no visible gain.
 */
const POSITION_POLL_MS = 250;

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const STATUS_LABEL: Record<ConnectionStatus['state'], string> = {
  idle: 'Ready',
  loading: 'Loading track',
  streaming: 'Replaying',
  paused: 'Paused',
  stalled: 'No data arriving',
  ended: 'End of case',
  error: 'Failed',
};

export function TelemetryPanel(): ReactElement {
  const dispatch = useAppDispatch();
  const { data: index, isLoading, isError, error } = useGetTrackIndexQuery();
  const { caseId, playing, rate, windowSeconds, positionSeconds } = useAppSelector(
    (s) => s.telemetry,
  );

  const [containerRef, { width }] = useResizeObserver();
  const [status, setStatus] = useState<ConnectionStatus>({ state: 'idle' });
  const [duration, setDuration] = useState<number | null>(null);
  const sourceRef = useRef<VitalDBReplaySource | null>(null);

  const channels = useMemo(
    () => (index === undefined || caseId === null ? [] : channelsForCase(index, caseId)),
    [index, caseId],
  );

  // One source per case. Rebuilt when the case changes and closed on the way
  // out, so an abandoned case stops downloading rather than finishing a 61 MB
  // track nobody is watching.
  const source = useMemo(() => {
    if (channels.length === 0) return null;
    return new VitalDBReplaySource({ channels });
  }, [channels]);

  useEffect(() => {
    sourceRef.current = source;
    if (source === null) return;

    const unsubscribe = source.onStatus((next) => {
      setStatus(next);
      // Reaching the end stops the source's clock, so the store has to follow
      // or the button keeps offering to pause something that is not running.
      if (next.state === 'ended') dispatch(playbackPaused());
    });
    return () => {
      unsubscribe();
      source.close();
      sourceRef.current = null;
    };
  }, [source, dispatch]);

  // Store -> source. The store is authoritative for intent; the source is told.
  useEffect(() => {
    if (source === null) return;
    if (playing) source.play(rate);
    else source.pause();
  }, [source, playing, rate]);

  // Source -> store, at a human rate rather than a frame rate.
  useEffect(() => {
    if (source === null) return;

    const timer = setInterval(() => {
      dispatch(positionReported(source.position));
      setDuration(source.duration);
    }, POSITION_POLL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [source, dispatch]);

  if (isLoading) {
    return (
      <ChartCard title="Intraoperative telemetry">
        <LoadingState label="Loading the telemetry index" height={200} />
      </ChartCard>
    );
  }

  if (isError || index === undefined) {
    return (
      <ChartCard title="Intraoperative telemetry">
        <ErrorState
          title="Telemetry unavailable"
          detail={typeof error === 'string' ? error : 'The track index did not load.'}
          height={200}
        />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Intraoperative telemetry"
      subtitle={`Recorded vital signs replayed against a clock. ${String(index.cases.length)} cases carry telemetry.`}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { sm: 'center' }, mb: 1.5 }}
      >
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel id="telemetry-case">Case</InputLabel>
          <Select
            labelId="telemetry-case"
            label="Case"
            value={caseId === null ? '' : String(caseId)}
            onChange={(e) => {
              const value = e.target.value;
              dispatch(caseSelected(value === '' ? null : Number(value)));
            }}
          >
            <MenuItem value="">None selected</MenuItem>
            {index.cases.map((c) => (
              <MenuItem key={c.caseId} value={String(c.caseId)}>
                {`#${String(c.caseId)} · ${c.department} · ${c.operationType}${c.isEmergency ? ' · emergency' : ''}`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <IconButton
          onClick={() => dispatch(playbackToggled())}
          disabled={source === null}
          aria-label={playing ? 'Pause replay' : 'Start replay'}
        >
          {playing ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={rate}
          onChange={(_event, next: PlaybackRate | null) => {
            if (next !== null) dispatch(rateSelected(next));
          }}
          aria-label="Playback speed"
        >
          {RATES.map((r) => (
            <ToggleButton key={r} value={r} sx={{ px: 1, py: 0.25, fontSize: '0.7rem' }}>
              {`${String(r)}×`}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Chip
          size="small"
          label={STATUS_LABEL[status.state]}
          color={
            status.state === 'error' || status.state === 'stalled'
              ? 'warning'
              : status.state === 'streaming'
                ? 'primary'
                : 'default'
          }
        />
      </Stack>

      {source === null ? (
        <EmptyState
          title="No case selected"
          description="Choose a case to replay its recorded vital signs."
          height={220}
        />
      ) : (
        <>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatClock(positionSeconds)}
            </Typography>
            <Slider
              size="small"
              value={Math.min(positionSeconds, duration ?? positionSeconds)}
              min={0}
              max={duration ?? 1}
              disabled={duration === null}
              aria-label="Playback position"
              onChange={(_event, value) => {
                dispatch(scrubbed(value));
                sourceRef.current?.seek(value);
              }}
            />
            <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {duration === null ? '—' : formatClock(duration)}
            </Typography>
          </Stack>

          <div ref={containerRef} style={{ width: '100%' }}>
            {width > 0 && (
              <Stack spacing={1}>
                {channels.map((channel) => (
                  <StripChart
                    key={channel.tid}
                    source={source}
                    channelId={channel.tid}
                    label={channel.label}
                    unit={channel.unit}
                    approximateHz={channel.approximateHz}
                    windowSeconds={windowSeconds}
                    width={width}
                    height={TRACE_HEIGHT}
                  />
                ))}
              </Stack>
            )}
          </div>

          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" component="p">
              Samples never enter Redux. They land in a fixed-capacity ring buffer outside React and
              are drawn on animation frames, so a 500 Hz trace causes no re-renders at all. The
              store holds only which case, whether it is running, and where the cursor is.
            </Typography>
          </Box>
        </>
      )}
    </ChartCard>
  );
}
