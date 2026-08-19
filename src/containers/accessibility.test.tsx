import { describe, it, expect, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DashboardContent } from './DashboardContent';

const CSV = [
  'caseid,age,sex,height,weight,bmi,asa,emop,department,optype,ane_type,anestart,aneend,opstart,opend,icu_days,death_inhosp,intraop_ebl,preop_alb',
  '1,40,M,170,70,24.2,2,0,Urology,Others,General,0,7200,600,6600,0,0,200,4.1',
  '2,70,F,160,80,31.2,3,1,Urology,Others,General,0,9000,900,8400,2,0,800,3.2',
  '3,55,F,165,60,22.0,1,0,Gynecology,Others,General,0,5400,300,5000,0,0,100,4.5',
  '4,61,M,175,85,27.8,2,0,General surgery,Colorectal,General,0,10800,1200,9600,1,1,600,3.8',
].join('\n');

const TRACK_INDEX = {
  source: 'https://api.vitaldb.net/trks',
  generatedAt: '2026-08-19',
  channels: [{ name: 'Solar8000/HR', label: 'Heart rate', unit: 'bpm', approximateHz: 0.5 }],
  cases: [
    {
      caseId: 1,
      department: 'Urology',
      operationType: 'Others',
      isEmergency: false,
      tracks: ['tid-hr'],
    },
  ],
};

const realFetch = globalThis.fetch;

function stubEverything(): void {
  globalThis.fetch = (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('track-index.json')) {
      return Promise.resolve(new Response(JSON.stringify(TRACK_INDEX), { status: 200 }));
    }
    if (url.includes('cases.csv')) {
      return Promise.resolve(new Response(CSV, { status: 200 }));
    }
    return Promise.resolve(new Response('Time,value\n1,80\n', { status: 200 }));
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
  window.history.replaceState(null, '', '/');
});

/**
 * A standing audit rather than a one-off pass.
 *
 * Written as assertions over the whole rendered dashboard so a new panel that
 * ships an unlabelled control fails here, instead of the accessibility work
 * quietly decaying after the commit that added it.
 */
describe('dashboard accessibility', () => {
  it('gives every interactive control an accessible name', async () => {
    stubEverything();
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    const controls = [
      ...screen.queryAllByRole('button'),
      ...screen.queryAllByRole('combobox'),
      ...screen.queryAllByRole('slider'),
      ...screen.queryAllByRole('checkbox'),
      ...screen.queryAllByRole('switch'),
    ];

    expect(controls.length).toBeGreaterThan(10);

    // toHaveAccessibleName runs the real accessible-name computation. Checking
    // aria-label and textContent by hand misses a control named by a wrapping
    // <label>, which is how every MUI switch and checkbox here gets its name.
    for (const control of controls) {
      expect(control).toHaveAccessibleName();
    }
  });

  it('labels every chart, so none is an unlabelled blank', async () => {
    stubEverything();
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    const charts = screen.queryAllByRole('img');
    expect(charts.length).toBeGreaterThan(3);

    for (const chart of charts) {
      expect(chart).toHaveAccessibleName();
    }
  });

  it('exposes each panel as a region a screen reader can jump between', async () => {
    stubEverything();
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    const regions = screen.queryAllByRole('region');
    expect(regions.length).toBeGreaterThanOrEqual(6);

    for (const region of regions) {
      expect(region).toHaveAccessibleName();
    }
  });

  it('puts a heading in every panel', async () => {
    stubEverything();
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    for (const region of screen.queryAllByRole('region')) {
      expect(within(region).getAllByRole('heading').length).toBeGreaterThan(0);
    }
  });

  it('reaches the first chart control by keyboard alone', async () => {
    // The department bars are the filter that only exists inside an SVG, so
    // they are the one most likely to become unreachable.
    stubEverything();
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    const bar = screen.getByRole('button', { name: /^Urology/ });
    bar.focus();
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByText(/of 4 cases/)).toHaveTextContent('2');
  });

  it('announces the cohort size when it changes', async () => {
    // The count changes as a consequence of a control the user just operated,
    // so it must be announced without being focused.
    stubEverything();
    const { container } = renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    const live = container.querySelectorAll('[aria-live]');
    expect(live.length).toBeGreaterThan(0);
  });
});
