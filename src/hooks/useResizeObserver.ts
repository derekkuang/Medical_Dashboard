import { useCallback, useEffect, useRef, useState } from 'react';

export interface Size {
  width: number;
  height: number;
}

/**
 * Measures an element and re-reports when it changes size.
 *
 * Charts need a pixel width before they can build a scale, and the container's
 * width is only known after layout. The alternative — a fixed viewBox scaled by
 * the browser — is what the original did, and it stretches text and stroke
 * widths along with the geometry.
 *
 * Returns a *callback* ref rather than an object ref. An effect with an empty
 * dependency list runs once, while the ref is still null, so an element that
 * mounts later — behind a conditional, as the telemetry panel's chart area does
 * once a case is chosen — would never be observed and would measure zero
 * forever. A callback ref fires on every attach and detach, which is exactly
 * the signal needed.
 *
 * Width is 0 until the first observation. Callers must treat that as "not yet
 * measured" and skip rendering rather than build a scale over a zero range.
 */
export function useResizeObserver(): [(node: Element | null) => void, Size] {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: Element | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (node === null) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;

      // contentRect excludes padding and borders, which is what the drawing
      // area actually gets. borderBoxSize would overstate it.
      const { width, height } = entry.contentRect;

      // Bail out when nothing changed. ResizeObserver fires on layout settling,
      // and a state write per fire would re-render the chart for no visual
      // difference.
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });

    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return [ref, size];
}
