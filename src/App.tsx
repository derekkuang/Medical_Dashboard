import { CssBaseline, ThemeProvider } from '@mui/material';
import { Provider } from 'react-redux';
import type { ReactElement } from 'react';
import { store } from './app/store';
import { theme } from './app/theme';
import { AppShell } from './components/AppShell';
import { DashboardContent } from './containers/DashboardContent';

export function App(): ReactElement {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppShell>
          <DashboardContent />
        </AppShell>
      </ThemeProvider>
    </Provider>
  );
}
