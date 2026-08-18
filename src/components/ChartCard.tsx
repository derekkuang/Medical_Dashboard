import { Box, Paper, Stack, Typography } from '@mui/material';
import { useId, type ReactElement, type ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  /** One line on what the panel shows, or the caveat that applies to it. */
  subtitle?: string;
  /** Controls that belong to this panel only. */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * The frame every panel sits in.
 *
 * Rendered as a landmark region labelled by its own heading, so screen-reader
 * users can jump between panels instead of reading the dashboard as one
 * undifferentiated block. useId keeps that association correct when the same
 * panel type appears more than once.
 */
export function ChartCard({ title, subtitle, action, children }: ChartCardProps): ReactElement {
  const headingId = useId();

  return (
    <Paper component="section" aria-labelledby={headingId} sx={{ p: 2, height: '100%' }}>
      {/* Alignment goes through sx: recent MUI no longer forwards these as
          standalone props, and they leak onto the DOM node if passed directly. */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography id={headingId} variant="h3" component="h2">
            {title}
          </Typography>
          {subtitle !== undefined && (
            <Typography variant="caption" component="p" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}
