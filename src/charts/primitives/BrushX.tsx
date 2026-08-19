import { useEffect, useRef, type ReactElement } from 'react';
import { brushX, type D3BrushEvent } from 'd3-brush';
import { select } from 'd3-selection';
import type { ScaleLinear } from 'd3-scale';

interface BrushXProps {
  innerWidth: number;
  innerHeight: number;
  /** Maps data space to pixels. Used to convert the pixel selection back. */
  scale: ScaleLinear<number, number>;
  /** Current selection in *data* space, or null for none. */
  selection: [number, number] | null;
  onChange: (range: [number, number] | null) => void;
}

/**
 * Horizontal range brush. The single place in this codebase where D3 owns DOM.
 *
 * The rule stated in the architecture notes is that D3 may own a subtree only
 * when it owns a *gesture*, and that subtree must be a leaf React never renders
 * into. Brushing qualifies: d3-brush maintains a state machine bound to a node,
 * handles pointer capture, touch, and modifier keys, and exposes a programmatic
 * move() API. Reimplementing that in React means reimplementing all of it,
 * worse. So the <g> below is empty in JSX and D3 fills it — ownership is never
 * shared, which is the failure mode, rather than imperative code being the
 * failure mode.
 *
 * Note this is pointer-only: d3-brush has no keyboard affordance. The panel
 * pairs it with a range slider that writes the same state, so the filter is
 * fully operable without a mouse.
 */
export function BrushX({
  innerWidth,
  innerHeight,
  scale,
  selection,
  onChange,
}: BrushXProps): ReactElement {
  const gRef = useRef<SVGGElement>(null);
  const brushRef = useRef<ReturnType<typeof brushX> | null>(null);

  // Held in refs so the brush is not torn down and rebuilt whenever the parent
  // re-renders with a new closure. Recreating it mid-gesture drops the drag.
  const onChangeRef = useRef(onChange);
  const scaleRef = useRef(scale);
  useEffect(() => {
    onChangeRef.current = onChange;
    scaleRef.current = scale;
  });

  useEffect(() => {
    const g = gRef.current;
    if (g === null || innerWidth <= 0 || innerHeight <= 0) return;

    const behaviour = brushX()
      .extent([
        [0, 0],
        [innerWidth, innerHeight],
      ])
      .on('end', (event: D3BrushEvent<unknown>) => {
        // The critical guard. brush.move() below dispatches the same events a
        // user gesture does, but without a sourceEvent. Without this check the
        // programmatic sync re-reports its own move, which dispatches a state
        // change, which syncs the brush again — the classic feedback loop.
        if (event.sourceEvent === undefined || event.sourceEvent === null) return;

        if (event.selection === null) {
          onChangeRef.current(null);
          return;
        }

        const [x0, x1] = event.selection as [number, number];

        // A click without a drag clears rather than selecting a zero-width
        // range, which would match no cases and look like a broken filter.
        if (Math.abs(x1 - x0) < 1) {
          onChangeRef.current(null);
          return;
        }

        onChangeRef.current([scaleRef.current.invert(x0), scaleRef.current.invert(x1)]);
      });

    brushRef.current = behaviour;
    const g3 = select(g);
    g3.call(behaviour);

    return () => {
      // Detach D3's listeners and clear the subtree it created. Without this,
      // a resize leaves the previous brush's handlers attached to orphaned
      // nodes — the leak the original had with its body-appended tooltips.
      g3.on('.brush', null);
      g3.selectAll('*').remove();
      brushRef.current = null;
    };
  }, [innerWidth, innerHeight]);

  // Store -> brush. Runs when the selection changes from anywhere else: the
  // slider, "Clear filters", or a shared URL.
  useEffect(() => {
    const g = gRef.current;
    const behaviour = brushRef.current;
    if (g === null || behaviour === null) return;

    // behaviour.move(g, value) rather than g.call(behaviour.move, value): the
    // two are equivalent, but passing the method as a detached reference trips
    // the unbound-method rule for no benefit.
    const g3 = select(g);
    if (selection === null) {
      behaviour.move(g3, null);
    } else {
      behaviour.move(g3, [scale(selection[0]), scale(selection[1])]);
    }
  }, [selection, scale]);

  return <g ref={gRef} data-testid="brush" />;
}
