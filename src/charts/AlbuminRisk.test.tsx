import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AlbuminBin } from '@/transforms/albumin';
import { wilsonInterval } from '@/transforms/stats';
import { AlbuminRisk } from './AlbuminRisk';

const BINS: AlbuminBin[] = [
  { lower: null, upper: 2, label: 'below 2', estimate: wilsonInterval(11, 13) },
  { lower: 3, upper: 3.5, label: '3.0 to 3.5', estimate: wilsonInterval(143, 394) },
  { lower: 3.5, upper: 4, label: '3.5 to 4.0', estimate: wilsonInterval(264, 1268) },
  { lower: 4, upper: null, label: '4.0 and above', estimate: null },
];

function renderChart(overrides: Partial<Parameters<typeof AlbuminRisk>[0]> = {}) {
  return render(
    <AlbuminRisk
      bins={BINS}
      width={640}
      height={300}
      description="6,016 cases with both measurements."
      {...overrides}
    />,
  );
}

describe('AlbuminRisk', () => {
  it('plots a point per populated bin and skips empty ones', () => {
    const { container } = renderChart();

    expect(container.querySelectorAll('circle.albumin-point')).toHaveLength(3);
  });

  it('states rate, interval and denominator together', () => {
    renderChart();

    expect(
      screen.getByText(/Albumin 3\.0 to 3\.5 g\/dL: 36\.3% admitted to ICU .*143 of 394/),
    ).toBeInTheDocument();
  });

  it('labels every bin on the axis, including the open tails', () => {
    // The original dropped albumin below 2.0 entirely.
    renderChart();

    expect(screen.getByText('below 2')).toBeInTheDocument();
    expect(screen.getByText('4.0 and above')).toBeInTheDocument();
  });

  it('carries the finding in its accessible name', () => {
    renderChart();

    expect(
      screen.getByRole('img', {
        name: /ICU admission by pre-operative albumin.*6,016 cases/,
      }),
    ).toBeInTheDocument();
  });

  it('marks the asserted threshold only when it falls between two bins', () => {
    const { container } = renderChart({ markBoundary: 3.5 });
    const dashed = [...container.querySelectorAll('line')].filter(
      (l) => l.getAttribute('stroke-dasharray') === '4 3',
    );

    expect(dashed).toHaveLength(1);
  });

  it('draws no threshold marker when none is asked for', () => {
    const { container } = renderChart({ markBoundary: null });
    const dashed = [...container.querySelectorAll('line')].filter(
      (l) => l.getAttribute('stroke-dasharray') === '4 3',
    );

    expect(dashed).toHaveLength(0);
  });

  it('renders with no populated bins at all', () => {
    const empty: AlbuminBin[] = [{ lower: null, upper: 2, label: 'below 2', estimate: null }];
    const { container } = renderChart({ bins: empty });

    expect(container.querySelectorAll('circle.albumin-point')).toHaveLength(0);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
