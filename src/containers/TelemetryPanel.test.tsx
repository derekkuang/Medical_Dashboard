import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { TelemetryPanel } from './TelemetryPanel';

const INDEX = {
  source: 'https://api.vitaldb.net/trks',
  generatedAt: '2026-08-19',
  channels: [
    { name: 'Solar8000/HR', label: 'Heart rate', unit: 'bpm', approximateHz: 0.5 },
    { name: 'SNUADC/ECG_II', label: 'ECG lead II', unit: 'mV', approximateHz: 500 },
  ],
  cases: [
    {
      caseId: 13,
      department: 'Thoracic surgery',
      operationType: 'Minor resection',
      isEmergency: false,
      tracks: ['tid-hr', 'tid-ecg'],
    },
    {
      caseId: 40,
      department: 'Urology',
      operationType: 'Others',
      isEmergency: true,
      tracks: ['tid-hr-40', null],
    },
  ],
};

const realFetch = globalThis.fetch;

/** Routes the index and any track id, so nothing reaches the network. */
function stubTelemetry(indexBody: unknown = INDEX, indexStatus = 200): void {
  globalThis.fetch = (input: RequestInfo | URL) => {
    // Request and URL both carry the address on a different property, and
    // stringifying a Request yields "[object Object]".
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('track-index.json')) {
      return Promise.resolve(
        new Response(indexStatus === 200 ? JSON.stringify(indexBody) : '', {
          status: indexStatus,
        }),
      );
    }
    return Promise.resolve(new Response('Time,value\n1,80\n2,81\n', { status: 200 }));
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('TelemetryPanel', () => {
  it('says how many cases carry telemetry', async () => {
    // The demo set is a subset, and pretending otherwise would leave a user
    // hunting for a case that was never included.
    stubTelemetry();
    renderWithProviders(<TelemetryPanel />);

    expect(await screen.findByText(/2 cases carry telemetry/)).toBeInTheDocument();
  });

  it('surfaces a failed index without taking the panel down', async () => {
    stubTelemetry(null, 503);
    renderWithProviders(<TelemetryPanel />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('503');
  });

  it('prompts for a case before showing any transport', async () => {
    stubTelemetry();
    renderWithProviders(<TelemetryPanel />);

    expect(await screen.findByText('No case selected')).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Playback position' })).not.toBeInTheDocument();
  });

  it('offers every case in the index, labelled with its context', async () => {
    stubTelemetry();
    renderWithProviders(<TelemetryPanel />);
    await screen.findByText(/2 cases carry telemetry/);

    await userEvent.click(screen.getByLabelText('Case'));

    expect(screen.getByRole('option', { name: /#13 · Thoracic surgery/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /#40 .* emergency/ })).toBeInTheDocument();
  });

  it('shows a trace per available channel once a case is chosen', async () => {
    stubTelemetry();
    renderWithProviders(<TelemetryPanel />);
    await screen.findByText(/2 cases carry telemetry/);

    await userEvent.click(screen.getByLabelText('Case'));
    await userEvent.click(screen.getByRole('option', { name: /#13/ }));

    expect(await screen.findByRole('img', { name: /Heart rate trace/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /ECG lead II trace/ })).toBeInTheDocument();
  });

  it('omits a channel the case does not have', async () => {
    // Case 40 has no ECG. Drawing an empty trace for it would imply a flat
    // signal rather than an absent one.
    stubTelemetry();
    renderWithProviders(<TelemetryPanel />);
    await screen.findByText(/2 cases carry telemetry/);

    await userEvent.click(screen.getByLabelText('Case'));
    await userEvent.click(screen.getByRole('option', { name: /#40/ }));

    expect(await screen.findByRole('img', { name: /Heart rate trace/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /ECG/ })).not.toBeInTheDocument();
  });

  it('exposes play and pause as one labelled control', async () => {
    stubTelemetry();
    const { store } = renderWithProviders(<TelemetryPanel />);
    await screen.findByText(/2 cases carry telemetry/);

    await userEvent.click(screen.getByLabelText('Case'));
    await userEvent.click(screen.getByRole('option', { name: /#13/ }));

    await userEvent.click(await screen.findByRole('button', { name: 'Start replay' }));
    expect(store.getState().telemetry.playing).toBe(true);

    await userEvent.click(await screen.findByRole('button', { name: 'Pause replay' }));
    expect(store.getState().telemetry.playing).toBe(false);
  });

  it('changes the playback rate', async () => {
    stubTelemetry();
    const { store } = renderWithProviders(<TelemetryPanel />);
    await screen.findByText(/2 cases carry telemetry/);

    await userEvent.click(screen.getByRole('button', { name: '4×' }));

    expect(store.getState().telemetry.rate).toBe(4);
  });

  it('rewinds and stops when the case changes', async () => {
    stubTelemetry();
    const { store } = renderWithProviders(<TelemetryPanel />);
    await screen.findByText(/2 cases carry telemetry/);

    await userEvent.click(screen.getByLabelText('Case'));
    await userEvent.click(screen.getByRole('option', { name: /#13/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start replay' }));

    await userEvent.click(screen.getByLabelText('Case'));
    await userEvent.click(screen.getByRole('option', { name: /#40/ }));

    await waitFor(() => {
      expect(store.getState().telemetry.playing).toBe(false);
      expect(store.getState().telemetry.positionSeconds).toBe(0);
    });
  });

  it('stops playing when the case ends', async () => {
    // The source stops its own clock at the end; if the store does not follow,
    // the button keeps offering to pause something that is not running and
    // pressing play does nothing.
    stubTelemetry();
    const { store } = renderWithProviders(<TelemetryPanel />);
    await screen.findByText(/2 cases carry telemetry/);

    await userEvent.click(screen.getByLabelText('Case'));
    await userEvent.click(screen.getByRole('option', { name: /#13/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start replay' }));

    // The stubbed track ends at t=2s, so playback runs past it quickly.
    await waitFor(
      () => {
        expect(store.getState().telemetry.playing).toBe(false);
      },
      { timeout: 8000 },
    );
    expect(await screen.findByRole('button', { name: 'Start replay' })).toBeInTheDocument();
  }, 12000);

  it('keeps samples out of the store', async () => {
    // The architecture claim, asserted at the panel level: whatever the traces
    // are drawing, none of it is in Redux.
    stubTelemetry();
    const { store } = renderWithProviders(<TelemetryPanel />);
    await screen.findByText(/2 cases carry telemetry/);

    await userEvent.click(screen.getByLabelText('Case'));
    await userEvent.click(screen.getByRole('option', { name: /#13/ }));
    await screen.findByRole('img', { name: /Heart rate trace/ });

    const serialised = JSON.stringify(store.getState().telemetry);
    expect(serialised).not.toContain('80');
    expect(Object.keys(store.getState().telemetry)).toEqual([
      'caseId',
      'playing',
      'rate',
      'windowSeconds',
      'positionSeconds',
    ]);
  });
});
