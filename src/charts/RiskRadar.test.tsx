import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RadarAxis } from '@/transforms/cohort';
import { wilsonInterval } from '@/transforms/stats';
import { RiskRadar } from './RiskRadar';

const AXES: RadarAxis[] = [
  {
    key: 'icu',
    label: 'Admitted to ICU',
    estimate: wilsonInterval(30, 80),
    baseline: wilsonInterval(1204, 6388),
  },
  {
    key: 'mortality',
    label: 'Died in hospital',
    estimate: wilsonInterval(2, 80),
    baseline: wilsonInterval(57, 6388),
  },
  {
    key: 'bleeding',
    label: 'Blood loss over 500 mL',
    estimate: wilsonInterval(12, 60),
    baseline: wilsonInterval(530, 3987),
  },
];

function renderRadar(overrides: Partial<Parameters<typeof RiskRadar>[0]> = {}) {
  return render(
    <RiskRadar
      axes={AXES}
      cohortSize={80}
      plottable
      width={520}
      height={320}
      description="80 similar cases."
      {...overrides}
    />,
  );
}

describe('RiskRadar', () => {
  it('labels every axis', () => {
    renderRadar();

    expect(screen.getByText('Admitted to ICU')).toBeInTheDocument();
    expect(screen.getByText('Died in hospital')).toBeInTheDocument();
    expect(screen.getByText('Blood loss over 500 mL')).toBeInTheDocument();
  });

  it('states each axis in absolute terms as well as relative', () => {
    // A ratio alone is unreadable: five times a 0.89% baseline is still 4.5%.
    renderRadar();

    expect(screen.getByText(/37\.5% · 2\.0× baseline/)).toBeInTheDocument();
  });

  it('draws the interval as a band, not just a line', () => {
    // The honest part. A small cohort produces a band wide enough to swallow
    // the estimate, which the original drew as a single confident triangle.
    const { container } = renderRadar();

    expect(container.querySelector('path.radar-band')).toBeInTheDocument();
    expect(container.querySelector('path.radar-estimate')).toBeInTheDocument();
  });

  it('draws the band as a ring using the even-odd rule', () => {
    const { container } = renderRadar();
    const band = container.querySelector('path.radar-band');

    expect(band?.getAttribute('fill-rule')).toBe('evenodd');
    // Two subpaths: the upper polygon and the lower one punched out of it.
    expect((band?.getAttribute('d') ?? '').split('Z').length - 1).toBe(2);
  });

  it('refuses to draw a polygon for a cohort too small to support it', () => {
    // The original's central mistake, and the one thing this rebuild must not
    // reproduce.
    const { container } = renderRadar({ plottable: false, cohortSize: 11 });

    expect(container.querySelector('path.radar-estimate')).not.toBeInTheDocument();
    expect(container.querySelector('path.radar-band')).not.toBeInTheDocument();
    expect(screen.getByText(/Only 11 similar cases/)).toBeInTheDocument();
  });

  it('marks an axis with no recorded outcome rather than plotting zero', () => {
    const withGap: RadarAxis[] = [
      { key: 'icu', label: 'Admitted to ICU', estimate: null, baseline: wilsonInterval(1, 10) },
    ];
    renderRadar({ axes: withGap });

    expect(screen.getByText('not recorded')).toBeInTheDocument();
  });

  it('clamps a ratio beyond the outermost ring and says it clamped', () => {
    const extreme: RadarAxis[] = [
      {
        key: 'mortality',
        label: 'Died in hospital',
        estimate: wilsonInterval(20, 40),
        baseline: wilsonInterval(57, 6388),
      },
    ];
    renderRadar({ axes: extreme });

    expect(screen.getByText(/>4× baseline/)).toBeInTheDocument();
  });

  it('carries the finding in its accessible name', () => {
    renderRadar();

    expect(
      screen.getByRole('img', {
        name: /Outcome risk relative to the dataset.*80 similar cases/,
      }),
    ).toBeInTheDocument();
  });

  it('renders with no axes at all', () => {
    const { container } = renderRadar({ axes: [] });
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
