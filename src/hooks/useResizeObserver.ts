import { useEffect, useRef, useState, type RefObject } from 'react';

export interface Size {
  width: number;
  height: number;
}

/**
 * Measures an element and re-reports when it changes size.
 *
 * Charts need a pixel width before they can build a scale, and the container's
 * width is only known after layout. The alternative — reading a fixed viewBox
 * and letting the browser scale the SVG — is what the original did, and it
 * stretches text and stroke widths along with the geometry.
 *
 * Returns 0 until the first observation. Callers must treat that as "not yet
 * measured" and skip rendering rather than build a scale over a zero range.
 */
export function useResizeObserver<T extends Element>(): [RefObject<T>, Size] {
  // useRef<T>(null), not useRef<T | null>(null): React 18 types only accept the
  // former where a DOM `ref` prop is expected.
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;

      // contentRect excludes padding and borders, which is what the drawing
      // area actually gets. borderBoxSize would overstate it.
      const { width, height } = entry.contentRect;

      // Bail out when nothing changed. ResizeObserver can fire on layout
      // settling, and a state write per fire would re-render the chart for no
      // visual difference.
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return [ref, size];
}
