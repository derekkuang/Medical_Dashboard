import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { setStubbedElementSize } from '@/test/resizeObserverStub';
import { DashboardContent } from './DashboardContent';

const CSV = [
  'caseid,age,sex,height,weight,bmi,asa,emop,department,optype,ane_type,anestart,aneend,opstart,opend,icu_days,death_inhosp,intraop_ebl,preop_alb',
  '1,40,M,170,70,24.2,2,0,General surgery,Colorectal,General,0,7200,600,6600,0,0,200,4.1',
  '2,70,F,160,80,31.2,3,1,Thoracic surgery,Minor resection,General,0,9000,900,8400,2,0,800,3.2',
  '3,55,F,165,60,22.0,1,0,Gynecology,Others,General,0,5400,300,5000,0,0,100,4.5',
  '4,61,M,175,85,27.8,2,0,Urology,Others,General,0,10800,1200,9600,1,1,600,3.8',
].join('\n');

const realFetch = globalThis.fetch;

function stubData(): void {
  globalThis.fetch = (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('cases.csv')) return Promise.resolve(new Response(CSV, { status: 200 }));
    return Promise.resolve(new Response('{}', { status: 404 }));
  };
}

/** A small phone, minus the card and container padding. */
const NARROW = 288;

beforeEach(() => {
  stubData();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  window.history.replaceState(null, '', '/');
});

/**
 * The width the original became unusable at.
 *
 * It pinned each slide to 100vh with overflow hidden on body, so narrow screens
 * did not merely crowd the content — they made it unreachable. These assertions
 * exist so that cannot come back unnoticed.
 */
describe('narrow viewports', () => {
  it('still draws every chart at phone width', async () => {
    setStubbedElementSize({ width: NARROW, height: 300 });
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    // Fixed pixel margins are the failure mode here: a left margin sized for a
    // desktop label column can exceed the whole width, at which point the chart
    // frame refuses to draw and the panel goes blank.
    const charts = screen.queryAllByRole('img');
    console.log(
      'NARROW:',
      charts.map((c) => c.querySelector('title')?.textContent),
    );
    expect(charts.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the department bars operable at phone width', async () => {
    setStubbedElementSize({ width: NARROW, height: 300 });
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    expect(screen.getByRole('button', { name: /^Urology/ })).toBeInTheDocument();
  });

  it('draws bars with a positive width rather than collapsing them', async () => {
    setStubbedElementSize({ width: NARROW, height: 300 });
    const { container } = renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    const widths = [...container.querySelectorAll('rect.age-bar')].map((r) =>
      Number(r.getAttribute('width')),
    );

    expect(widths.length).toBeGreaterThan(0);
    expect(widths.every((w) => w >= 1)).toBe(true);
  });

  it('survives a width narrower than any desktop label column', async () => {
    // 200px is below the left margin the risk and department charts use on a
    // wide screen, so this is the case that must not produce a blank panel.
    setStubbedElementSize({ width: 200, height: 260 });
    renderWithProviders(<DashboardContent />);
    await screen.findByText(/of 4 cases/);

    console.log(
      'VERY NARROW:',
      screen.queryAllByRole('img').map((c) => c.querySelector('title')?.textContent),
    );
    expect(screen.queryAllByRole('img').length).toBeGreaterThanOrEqual(4);
  });
});
