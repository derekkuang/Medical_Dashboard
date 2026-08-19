import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, stubCasesCsv, stubCasesFailure } from '@/test/renderWithProviders';
import { DashboardContent } from './DashboardContent';

const HEADER = 'caseid,age,sex,department,emop';
const CSV = [
  HEADER,
  '1,40,M,Urology,0',
  '2,70,F,Urology,1',
  '3,55,F,Gynecology,0',
  '4,61,M,General surgery,0',
].join('\n');

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  // The URL is real global state in jsdom; leaving a query string behind would
  // hydrate the next test's filters.
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('DashboardContent', () => {
  it('announces what is loading before the data arrives', async () => {
    stubCasesCsv(CSV);
    renderWithProviders(<DashboardContent />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);

    // Settle so the pending query does not resolve after the test ends.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('reports the cohort size once loaded', async () => {
    stubCasesCsv(CSV);
    renderWithProviders(<DashboardContent />);

    expect(await screen.findByText(/of 4 cases/)).toBeInTheDocument();
  });

  it('surfaces the real failure rather than a generic message', async () => {
    // A 404 and a 503 call for different responses from whoever is looking.
    stubCasesFailure(503);
    renderWithProviders(<DashboardContent />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('503');
  });

  it('narrows the cohort when a filter is applied', async () => {
    stubCasesCsv(CSV);
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    await userEvent.click(screen.getByLabelText('Department'));
    await userEvent.click(screen.getByRole('option', { name: /Urology/ }));

    expect(await screen.findByText(/of 4 cases/)).toHaveTextContent('2');
  });

  it('offers a way out when the cohort is empty', async () => {
    stubCasesCsv(CSV);
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    // Gynecology has one case, and it is elective — so this pair matches none.
    await userEvent.click(screen.getByLabelText('Department'));
    await userEvent.click(screen.getByRole('option', { name: /Gynecology/ }));
    await userEvent.click(screen.getByLabelText('Emergency only'));

    expect(await screen.findByText('No cases match these filters')).toBeInTheDocument();

    // The empty state must be an exit, not a dead end.
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText(/of 4 cases/)).toHaveTextContent('4');
  });

  it('puts the selection in the address bar so the view can be shared', async () => {
    stubCasesCsv(CSV);
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    expect(window.location.search).toBe('');

    await userEvent.click(screen.getByLabelText('Department'));
    await userEvent.click(screen.getByRole('option', { name: /Urology/ }));

    await waitFor(() => {
      expect(window.location.search).toBe('?dept=Urology');
    });
  });

  it('restores the selection from a shared link on load', async () => {
    // The other half of the round trip: a pasted URL must reproduce the cohort.
    window.history.replaceState(null, '', '/?dept=Gynecology');
    stubCasesCsv(CSV);
    renderWithProviders(<DashboardContent />);

    expect(await screen.findByText(/of 4 cases/)).toHaveTextContent('1');
  });

  it('clears the query string when filters are cleared', async () => {
    window.history.replaceState(null, '', '/?dept=Urology');
    stubCasesCsv(CSV);
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      expect(window.location.search).toBe('');
    });
  });

  it('filters by age from the keyboard, without the brush', async () => {
    // d3-brush is pointer-only, so the slider is the accessible path to the
    // same filter. Ages in the fixture are 40, 55, 61 and 70, giving a domain
    // of 40-70; nudging the lower thumb up by one year drops the 40-year-old.
    stubCasesCsv(CSV);
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    const [minThumb] = screen.getAllByRole('slider');
    // focus() is a raw DOM call, so the state update MUI makes in response is
    // outside React's batching unless it is wrapped.
    act(() => {
      minThumb!.focus();
    });
    await userEvent.keyboard('{ArrowRight}');

    expect(await screen.findByText(/of 4 cases/)).toHaveTextContent('3');
    expect(screen.getByText('Ages 41 to 70')).toBeInTheDocument();
  });

  it('labels each slider thumb distinctly', async () => {
    stubCasesCsv(CSV);
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    expect(screen.getByRole('slider', { name: 'Minimum age' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Maximum age' })).toBeInTheDocument();
  });

  it('keeps every department selectable after one is chosen', async () => {
    // Facets come from the full table, not the filtered cohort. Deriving them
    // from the cohort would make the other options disappear on first use.
    stubCasesCsv(CSV);
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    await userEvent.click(screen.getByLabelText('Department'));
    await userEvent.click(screen.getByRole('option', { name: /Urology/ }));
    await userEvent.click(screen.getByLabelText('Department'));

    expect(screen.getByRole('option', { name: /Gynecology/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /General surgery/ })).toBeInTheDocument();
  });
});
