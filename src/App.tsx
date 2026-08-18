import { CssBaseline, ThemeProvider } from '@mui/material';
import { Provider } from 'react-redux';
import type { ReactElement } from 'react';
import { store } from './app/store';
import { theme } from './app/theme';
import { AppShell, DashboardGrid } from './components/AppShell';
import { ChartCard } from './components/ChartCard';
import { EmptyState } from './components/EmptyState';

/** Panels in the order they will be built. Placeholders until each lands. */
const PLANNED_PANELS = [
  { title: 'Age distribution', subtitle: 'Histogram with brushable range selection' },
  { title: 'Departments', subtitle: 'Case counts, click a bar to filter' },
  { title: 'Procedure phases', subtitle: 'Anaesthesia and operation intervals' },
  { title: 'Pre-operative albumin', subtitle: 'Binned means against ICU stay' },
] as const;

export function App(): ReactElement {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppShell>
          <DashboardGrid>
            {PLANNED_PANELS.map((panel) => (
              <ChartCard key={panel.title} title={panel.title} subtitle={panel.subtitle}>
                <EmptyState title="Not built yet" description="This panel arrives in phase C." />
              </ChartCard>
            ))}
          </DashboardGrid>
        </AppShell>
      </ThemeProvider>
    </Provider>
  );
}
