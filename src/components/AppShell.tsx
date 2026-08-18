import { AppBar, Box, Container, Link, Toolbar, Typography } from '@mui/material';
import type { ReactElement, ReactNode } from 'react';

interface AppShellProps {
  /** Filter controls and status, rendered under the bar and above the panels. */
  toolbar?: ReactNode;
  children: ReactNode;
}

export function AppShell({ toolbar, children }: AppShellProps): ReactElement {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      {/* Lets keyboard users reach the panels without tabbing the whole filter
          bar first. Visually hidden until focused. */}
      <Link
        href="#dashboard"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 8,
          zIndex: 2000,
          px: 2,
          py: 1,
          borderRadius: 1,
          bgcolor: 'background.paper',
          '&:focus': { left: 8 },
        }}
      >
        Skip to dashboard
      </Link>

      <AppBar
        position="sticky"
        elevation={0}
        sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h1" component="h1" sx={{ fontSize: '1.125rem', flexGrow: 1 }}>
            Vitals Unveiled
          </Typography>
          <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' } }}>
            VitalDB &middot; Seoul National University Hospital
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {toolbar !== undefined && <Box sx={{ mb: 3 }}>{toolbar}</Box>}
        <Box id="dashboard" component="main">
          {children}
        </Box>
      </Container>
    </Box>
  );
}

/**
 * Panel grid.
 *
 * Single column below the `md` breakpoint (900px), which is the width the
 * original became unusable at — it pinned slides to 100vh with overflow hidden,
 * so anything past the fold was unreachable. Here panels stack and the page
 * scrolls.
 */
export function DashboardGrid({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
        alignItems: 'start',
      }}
    >
      {children}
    </Box>
  );
}
