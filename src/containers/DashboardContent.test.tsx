import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
