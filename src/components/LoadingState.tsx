import { Box, CircularProgress, Typography } from '@mui/material';
import type { ReactElement } from 'react';

interface LoadingStateProps {
  /** Say what is loading. "Loading…" alone tells a screen reader nothing. */
  label: string;
  /** Fills its container rather than the viewport when inside a panel. */
  height?: number | string;
}

export function LoadingState({ label, height = 240 }: LoadingStateProps): ReactElement {
  return (
    <Box
      // role="status" with aria-live="polite" announces the label without
      // interrupting whatever the user is currently reading.
      role="status"
      aria-live="polite"
      sx={{
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <CircularProgress size={32} aria-hidden />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}
