import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AgeBin } from '@/transforms/histogram';
import { AgeHistogram } from './AgeHistogram';

/**
 * Charts take view models, not domain objects, so these tests need no store, no
 * data loading and no SurgeryCase — just an array of bins.
 */
const BINS: AgeBin[] = [
  { x0: 0, x1: 25, count: 2, male: 1, female: 1 },
  { x0: 25, x1: 50, count: 5, male: 3, female: 2 },
  { x0: 50, x1: 75, count: 0, male: 0, female: 0 },
  { x0: 75, x1: 100, count: 3, male: 1, female: 1 },
];

function renderChart(props: Partial<Parameters<typeof AgeHistogram>[0]> = {}) {
  return render(
    <AgeHistogram
      bins={BINS}
      domain={[0, 100]}
      maxCount={5}
      width={600}
      height={300}
      splitBySex={false}
      description="10 cases with a recorded age. Median 40 years."
      brushSelection={null}
      onBrushChange={() => undefined}
      {...props}
    />,
  );
}

describe('AgeHistogram', () => {
  it('carries the finding in its accessible name', () => {
    // A screen reader gets one accurate sentence rather than a pile of rects.
    renderChart();

    expect(
      screen.getByRole('img', { name: /10 cases with a recorded age\. Median 40 years/ }),
    ).toBeInTheDocument();
  });

  it('draws one bar per non-empty bin', () => {
    const { container } = renderChart();

    // Empty bins render nothing rather than a zero-height rect, which would
    // still catch the pointer and show a tooltip for no data.
    // Scoped to bars: d3-brush adds its own overlay and selection rects.
    expect(container.querySelectorAll('rect.age-bar')).toHaveLength(3);
  });

  it('labels each bar with its range and count', () => {
    renderChart();
    expect(screen.getByText('Ages 25 to 50: 5 cases')).toBeInTheDocument();
  });

  it('splits a bar into male, female and unrecorded segments', () => {
    // The parts must sum to the whole: a case with unrecorded sex still has to
    // appear, or the stacked bar would be shorter than the bin's count.
    const bins: AgeBin[] = [{ x0: 0, x1: 50, count: 5, male: 2, female: 2 }];
    renderChart({ bins, splitBySex: true, maxCount: 5 });

    expect(screen.getByText(/2 male/)).toBeInTheDocument();
    expect(screen.getByText(/2 female/)).toBeInTheDocument();
    expect(screen.getByText(/1 sex not recorded/)).toBeInTheDocument();
  });

  it('omits a segment with no cases in it', () => {
    const bins: AgeBin[] = [{ x0: 0, x1: 50, count: 4, male: 4, female: 0 }];
    renderChart({ bins, splitBySex: true, maxCount: 4 });

    expect(screen.getByText(/4 male/)).toBeInTheDocument();
    expect(screen.queryByText(/female/)).not.toBeInTheDocument();
  });

  it('renders axis titles', () => {
    renderChart();

    expect(screen.getByText('Age (years)')).toBeInTheDocument();
    expect(screen.getByText('Cases')).toBeInTheDocument();
  });

  it('survives an empty cohort without a degenerate scale', () => {
    // maxCount 0 would give a [0, 0] y domain, mapping every value to one pixel.
    const { container } = renderChart({ bins: [], maxCount: 0 });

    expect(container.querySelectorAll('rect.age-bar')).toHaveLength(0);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('keeps bars at least one pixel wide on a narrow panel', () => {
    // 20 bins into 200px leaves under 10px each; subtracting the gap can go
    // negative, and a negative width silently drops the rect.
    const { container } = renderChart({ width: 200 });

    const widths = [...container.querySelectorAll('rect.age-bar')].map((r) =>
      Number(r.getAttribute('width')),
    );
    expect(widths.every((w) => w >= 1)).toBe(true);
  });
});
