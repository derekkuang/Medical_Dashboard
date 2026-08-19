import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { scaleLinear } from 'd3-scale';
import { BrushX } from './BrushX';

const scale = scaleLinear().domain([0, 100]).range([0, 200]);

function renderBrush(
  selection: [number, number] | null,
  onChange: (range: [number, number] | null) => void,
) {
  return render(
    <svg>
      <BrushX
        innerWidth={200}
        innerHeight={100}
        scale={scale}
        selection={selection}
        onChange={onChange}
      />
    </svg>,
  );
}

describe('BrushX', () => {
  it('lets D3 populate the group React leaves empty', () => {
    // The <g> is a leaf in JSX. Everything inside it is D3's, which is what
    // keeps ownership unshared rather than contested.
    const { container } = renderBrush(null, vi.fn());
    const group = container.querySelector('[data-testid="brush"]');

    expect(group?.childElementCount).toBeGreaterThan(0);
  });

  it('does not report a change when the selection is set programmatically', () => {
    // The critical guard. brush.move() emits the same events a real gesture
    // does, but with no sourceEvent. Without the check, syncing the brush from
    // the store re-reports its own move, which dispatches a state change, which
    // syncs the brush again — an infinite loop.
    const onChange = vi.fn();
    const { rerender } = renderBrush(null, onChange);

    rerender(
      <svg>
        <BrushX
          innerWidth={200}
          innerHeight={100}
          scale={scale}
          selection={[20, 60]}
          onChange={onChange}
        />
      </svg>,
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not report a change when the selection is cleared programmatically', () => {
    const onChange = vi.fn();
    const { rerender } = renderBrush([20, 60], onChange);

    rerender(
      <svg>
        <BrushX
          innerWidth={200}
          innerHeight={100}
          scale={scale}
          selection={null}
          onChange={onChange}
        />
      </svg>,
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a selection overlay reflecting the current range', () => {
    const { container } = renderBrush([25, 75], vi.fn());

    // d3-brush marks the selected region with rect.selection; 25-75 of a
    // 0-100 domain over 200px is 50px wide.
    const selectionRect = container.querySelector('rect.selection');
    expect(selectionRect?.getAttribute('width')).toBe('100');
  });

  it('tears down D3 listeners and nodes on unmount', () => {
    // Leaving them attached is how the original leaked tooltips onto <body>.
    const { container, unmount } = renderBrush(null, vi.fn());
    unmount();

    expect(container.querySelector('[data-testid="brush"]')).toBeNull();
  });

  it('draws nothing when the chart area has no width', () => {
    const { container } = render(
      <svg>
        <BrushX innerWidth={0} innerHeight={0} scale={scale} selection={null} onChange={vi.fn()} />
      </svg>,
    );

    expect(container.querySelector('[data-testid="brush"]')?.childElementCount).toBe(0);
  });
});
