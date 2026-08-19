import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { type ReactElement } from 'react';
import { emitResize, setStubbedElementSize } from '@/test/resizeObserverStub';
import { useResizeObserver } from './useResizeObserver';

function Probe(): ReactElement {
  const [ref, { width, height }] = useResizeObserver();
  return (
    <div ref={ref}>
      <span data-testid="size">{`${String(Math.round(width))}x${String(Math.round(height))}`}</span>
    </div>
  );
}

describe('useResizeObserver', () => {
  it('reports a size without waiting for the observer to deliver', () => {
    // The regression that matters. ResizeObserver reports *changes*; depending
    // on it for the first measurement left every chart at width 0 in a real
    // browser while passing against a stub that fired synchronously. The stub
    // is now silent until asked, so this asserts the element is read on attach.
    setStubbedElementSize({ width: 640, height: 300 });
    render(<Probe />);

    expect(screen.getByTestId('size')).toHaveTextContent('640x300');
  });

  it('updates when the element later changes size', () => {
    setStubbedElementSize({ width: 400, height: 200 });
    render(<Probe />);
    expect(screen.getByTestId('size')).toHaveTextContent('400x200');

    act(() => {
      emitResize({ width: 900, height: 250 });
    });

    expect(screen.getByTestId('size')).toHaveTextContent('900x250');
  });

  it('measures an element that mounts later', () => {
    // A callback ref fires on attach, so a chart area revealed by a conditional
    // is measured; an effect with empty deps would have missed it.
    function Late({ show }: { show: boolean }): ReactElement {
      const [ref, { width }] = useResizeObserver();
      return (
        <div>
          <span data-testid="w">{String(Math.round(width))}</span>
          {show && <div ref={ref} />}
        </div>
      );
    }

    setStubbedElementSize({ width: 512, height: 100 });
    const { rerender } = render(<Late show={false} />);
    expect(screen.getByTestId('w')).toHaveTextContent('0');

    rerender(<Late show />);
    expect(screen.getByTestId('w')).toHaveTextContent('512');
  });
});
