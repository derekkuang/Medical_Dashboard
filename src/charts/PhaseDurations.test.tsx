import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PhaseRow } from '@/transforms/phases';
import { PhaseDurations } from './PhaseDurations';

const ROWS: PhaseRow[] = [
  { key: '__all__', label: 'All cases', summary: { count: 6387, median: 48, q1: 35, q3: 60 } },
  { key: 'Breast', label: 'Breast', summary: { count: 434, median: 30.5, q1: 24, q3: 40 } },
  { key: 'Untimed', label: 'Untimed', summary: null },
];

function renderChart(rows: readonly PhaseRow[] = ROWS) {
  return render(
    <PhaseDurations
      rows={rows}
      width={640}
      height={200}
      phaseLabel="Anaesthesia to incision"
      description="6,387 timed cases. Median 48 minutes."
    />,
  );
}

describe('PhaseDurations', () => {
  it('draws an interquartile bar per summarised row', () => {
    const { container } = renderChart();
    expect(container.querySelectorAll('rect.phase-iqr')).toHaveLength(2);
  });

  it('states median, spread and denominator together', () => {
    // A median without its spread hides exactly what a theatre list needs.
    renderChart();

    expect(
      screen.getByText(/All cases: median 48 min, middle half 35–60 min, 6,387 cases/),
    ).toBeInTheDocument();
  });

  it('says so when a group has no timed cases', () => {
    renderChart();
    expect(screen.getByText('No timed cases')).toBeInTheDocument();
  });

  it('names the phase in the accessible title', () => {
    renderChart();

    expect(
      screen.getByRole('img', { name: /Anaesthesia to incision by procedure/ }),
    ).toBeInTheDocument();
  });

  it('labels the axis so the bar is not mistaken for a range of one case', () => {
    renderChart();
    expect(screen.getByText(/middle half of cases/)).toBeInTheDocument();
  });

  it('renders when nothing is summarised', () => {
    const { container } = renderChart([{ key: 'x', label: 'x', summary: null }]);
    expect(container.querySelectorAll('rect.phase-iqr')).toHaveLength(0);
  });
});
