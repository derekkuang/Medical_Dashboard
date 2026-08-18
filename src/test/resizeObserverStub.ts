import type { Size } from '@/hooks/useResizeObserver';

/**
 * jsdom implements no layout, so ResizeObserver does not exist and every
 * measured element would report 0x0 — which every chart correctly refuses to
 * draw into. This stub reports a fixed size so charts render in tests.
 *
 * Deliberately not a full implementation: it fires once on observe and never
 * again. Tests that need a resize should re-render at a different size rather
 * than depend on observer semantics jsdom cannot reproduce anyway.
 */
let stubbedSize: Size = { width: 800, height: 400 };

export function setStubbedElementSize(size: Size): void {
  stubbedSize = size;
}

export function resetStubbedElementSize(): void {
  stubbedSize = { width: 800, height: 400 };
}

class ResizeObserverStub implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    this.callback(
      [{ target, contentRect: stubbedSize as DOMRectReadOnly } as ResizeObserverEntry],
      this,
    );
  }

  unobserve(): void {
    // no-op
  }

  disconnect(): void {
    // no-op
  }
}

export function installResizeObserverStub(): void {
  globalThis.ResizeObserver = ResizeObserverStub;
}
