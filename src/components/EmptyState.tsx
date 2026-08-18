import { Box, Button, Typography } from '@mui/material';
import type { ReactElement } from 'react';

interface EmptyStateProps {
  title: string;
  /** What the user can do about it. An empty state without a way out is a dead end. */
  description?: string;
  action?: { label: string; onClick: () => void };
  height?: number | string;
}

/**
 * Shown when a filter combination matches nothing.
 *
 * This is a normal outcome, not an error, and is styled as such — the original
 * rendered an axis with no marks, which reads as a broken chart rather than an
 * over-narrow cohort.
 */
export function EmptyState({
  title,
  description,
  action,
  height = 240,
}: EmptyStateProps): ReactElement {
  return (
    <Box
      sx={{
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        textAlign: 'center',
        px: 2,
      }}
    >
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {description !== undefined && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '40ch' }}>
          {description}
        </Typography>
      )}
      {action !== undefined && (
        <Button size="small" variant="outlined" onClick={action.onClick} sx={{ mt: 1 }}>
          {action.label}
        </Button>
      )}
    </Box>
  );
}
