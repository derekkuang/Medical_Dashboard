import { CssBaseline, ThemeProvider } from '@mui/material';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactElement, ReactNode } from 'react';
import { makeStore, type AppStore } from '@/app/store';
import { theme } from '@/app/theme';

interface Options {
  /** Pass an existing store to assert on dispatched state after interaction. */
  store?: AppStore;
}

/**
 * Renders inside the same providers the app uses, with a fresh store per test
 * unless one is supplied. Tests that share a store share an RTK Query cache,
 * which makes their results depend on the order they happen to run in.
 */
export function renderWithProviders(ui: ReactElement, { store = makeStore() }: Options = {}) {
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper }) };
}

/** Stubs the case-table fetch with the given CSV text. */
export function stubCasesCsv(csv: string): void {
  globalThis.fetch = () => Promise.resolve(new Response(csv, { status: 200 }));
}

/** Stubs the case-table fetch with an HTTP failure. */
export function stubCasesFailure(status: number): void {
  globalThis.fetch = () => Promise.resolve(new Response('', { status }));
}
