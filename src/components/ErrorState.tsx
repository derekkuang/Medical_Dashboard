import { Alert, AlertTitle, Box, Button } from '@mui/material';
import type { ReactElement } from 'react';

interface ErrorStateProps {
  title: string;
  /** The actual failure. Never swallow it — "something went wrong" is unactionable. */
  detail?: string;
  onRetry?: () => void;
  height?: number | string;
}

export function ErrorState({
  title,
  detail,
  onRetry,
  height = 240,
}: ErrorStateProps): ReactElement {
  return (
    <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      {/* role="alert" so the failure is announced immediately, unlike a loading
          state which should wait its turn. */}
      <Alert
        severity="error"
        role="alert"
        sx={{ width: '100%' }}
        action={
          onRetry !== undefined ? (
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          ) : undefined
        }
      >
        <AlertTitle>{title}</AlertTitle>
        {detail}
      </Alert>
    </Box>
  );
}
