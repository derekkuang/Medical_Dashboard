import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { ChartFrame } from './ChartFrame';
import { AxisBottom, AxisLeft } from './Axis';
import { bandTicks, linearTicks } from './ticks';

describe('linearTicks', () => {
  it('turns a scale into plain offsets and labels', () => {
    // D3 does the maths; what comes out is numbers and strings for React to
    // render. Nothing here touches a DOM node.
    const scale = scaleLinear().domain([0, 100]).range([0, 200]);
    const ticks = linearTicks(scale, 5);

    expect(ticks[0]).toEqual({ offset: 0, label: '0' });
    expect(ticks.at(-1)).toEqual({ offset: 200, label: '100' });
  });

  it('applies the supplied formatter', () => {
    const scale = scaleLinear().domain([0, 1]).range([0, 100]);
    const ticks = linearTicks(scale, 2, (v) => `${String(Math.round(v * 100))}%`);

    expect(ticks.map((t) => t.label)).toContain('100%');
  });
});

describe('bandTicks', () => {
  it('centres a tick on every band', () => {
    // Every category gets one: a band scale has no "about this many", and
    // dropping some would leave bars unlabelled.
    const scale = scaleBand().domain(['a', 'b']).range([0, 100]).padding(0);
    const ticks = bandTicks(scale);

    expect(ticks).toEqual([
      { offset: 25, label: 'a' },
      { offset: 75, label: 'b' },
    ]);
  });
});

describe('ChartFrame', () => {
  it('labels the chart for assistive technology', () => {
    render(
      <ChartFrame width={400} height={200} title="Age distribution" description="Median 59 years">
        {() => <rect width={10} height={10} />}
      </ChartFrame>,
    );

    // aria-labelledby points at both the title and the description, so the
    // accessible name carries the finding, not just the chart's name.
    expect(
      screen.getByRole('img', { name: /Age distribution.*Median 59 years/ }),
    ).toBeInTheDocument();
  });

  it('hands children the area inside the margins', () => {
    let received = { innerWidth: 0, innerHeight: 0 };

    render(
      <ChartFrame
        width={400}
        height={200}
        margin={{ top: 10, right: 20, bottom: 30, left: 40 }}
        title="t"
      >
        {(dims) => {
          received = dims;
          return null;
        }}
      </ChartFrame>,
    );

    expect(received).toEqual({ innerWidth: 340, innerHeight: 160 });
  });

  it('renders nothing before the container has been measured', () => {
    // Building a scale over a zero or negative range yields NaN geometry, which
    // renders as an invisible, silently broken chart.
    const { container } = render(
      <ChartFrame width={0} height={0} title="t">
        {() => <rect />}
      </ChartFrame>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the margins exceed the available space', () => {
    const { container } = render(
      <ChartFrame width={30} height={30} title="t">
        {() => <rect />}
      </ChartFrame>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('exposes interior children when a chart declares keyboard targets', () => {
    // role="img" hides descendants; charts with real focus targets opt out.
    render(
      <ChartFrame width={400} height={200} title="t" role="group">
        {() => <rect />}
      </ChartFrame>,
    );

    expect(screen.getByRole('group', { name: 't' })).toBeInTheDocument();
  });
});

describe('AxisBottom', () => {
  it('renders one label per tick', () => {
    render(
      <svg>
        <AxisBottom
          ticks={[
            { offset: 0, label: '0' },
            { offset: 50, label: '50' },
          ]}
          innerWidth={100}
          innerHeight={50}
        />
      </svg>,
    );

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders an axis title when given one', () => {
    render(
      <svg>
        <AxisBottom ticks={[]} innerWidth={100} innerHeight={50} label="Age (years)" />
      </svg>,
    );

    expect(screen.getByText('Age (years)')).toBeInTheDocument();
  });
});

describe('AxisLeft', () => {
  it('renders one label per tick', () => {
    render(
      <svg>
        <AxisLeft ticks={[{ offset: 10, label: '250' }]} />
      </svg>,
    );

    expect(screen.getByText('250')).toBeInTheDocument();
  });
});
