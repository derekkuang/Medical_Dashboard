import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { wilsonInterval } from '@/transforms/stats';
import { RiskIntervals, type RiskChartRow } from './RiskIntervals';

const ROWS: RiskChartRow[] = [
  { key: 'baseline', label: 'None of these factors', estimate: wilsonInterval(13, 3183) },
  { key: 'highAsa', label: 'ASA 3 or above', estimate: wilsonInterval(29, 764) },
  { key: 'empty', label: 'Never happens', estimate: null },
];

function renderChart(rows: readonly RiskChartRow[] = ROWS) {
  return render(
    <RiskIntervals rows={rows} width={640} height={220} description="Baseline 0.41%." />,
  );
}

describe('RiskIntervals', () => {
  it('labels every group', () => {
    renderChart();

    expect(screen.getByText('None of these factors')).toBeInTheDocument();
    expect(screen.getByText('ASA 3 or above')).toBeInTheDocument();
  });

  it('states the rate, its interval and the group size together', () => {
    // A rate without its denominator invites exactly the over-reading this
    // panel exists to prevent.
    renderChart();

    expect(screen.getByText(/3\.8% \(2\.7 to 5\.4%\), 29 of 764/)).toBeInTheDocument();
  });

  it('shows the group size beside each interval', () => {
    renderChart();
    expect(screen.getByText('n=3,183')).toBeInTheDocument();
  });

  it('says so when a group is empty rather than plotting zero', () => {
    // A point at zero reads as "nobody in this group dies", which is a claim.
    renderChart();

    expect(screen.getByText('No cases in this group')).toBeInTheDocument();
  });

  it('draws the additive prediction only where one is supplied', () => {
    const withCombination: RiskChartRow[] = [
      ...ROWS,
      {
        key: 'combination',
        label: 'All 4 selected together',
        estimate: wilsonInterval(10, 51),
        isCombination: true,
        additivePrediction: 0.1172,
      },
    ];

    renderChart(withCombination);

    expect(screen.getByText('Additive model predicts 11.7%')).toBeInTheDocument();
  });

  it('sizes the axis to the widest interval, not the largest point estimate', () => {
    // Clipping a whisker would hide precisely the uncertainty being reported.
    const wide: RiskChartRow[] = [
      { key: 'tiny', label: 'Tiny group', estimate: wilsonInterval(10, 51) },
    ];
    renderChart(wide);

    // 10/51 spans up to ~32.5%, so the axis must reach at least 30%.
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('carries the finding in its accessible name', () => {
    renderChart();

    expect(
      screen.getByRole('img', { name: /In-hospital mortality by risk factor.*Baseline 0\.41%/ }),
    ).toBeInTheDocument();
  });

  it('renders without rows', () => {
    const { container } = renderChart([]);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
