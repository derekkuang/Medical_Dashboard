import type { Size } from '@/hooks/useResizeObserver';

/**
 * jsdom has no layout engine and no ResizeObserver, so without a stand-in every
 * measured element reports 0x0 and every chart correctly refuses to draw.
 *
 * The important detail is what this deliberately does *not* do: it does not
 * deliver an observation on observe(). An earlier version did, and that hid a
 * real bug for several commits — the hook depended on the observer for its
 * first measurement, which passed here because the stub fired synchronously,
 * while in a browser it never arrived and every chart stayed blank forever.
 *
 * A real ResizeObserver reports *changes*. Initial size comes from reading the
 * element. So the stub mirrors that: getBoundingClientRect answers, and the
 * observer stays quiet until a test asks it to fire.
 */
let stubbedSize: Size = { width: 800, height: 400 };

const observers = new Set<{ callback: ResizeObserverCallback; targets: Set<Element> }>();

export function setStubbedElementSize(size: Size): void {
  stubbedSize = size;
}

export function resetStubbedElementSize(): void {
  stubbedSize = { width: 800, height: 400 };
}

/** Delivers a resize to everything currently observed, as a real one would. */
export function emitResize(size: Size): void {
  stubbedSize = size;
  for (const observer of observers) {
    const entries = [...observer.targets].map(
      (target) => ({ target, contentRect: size as DOMRectReadOnly }) as ResizeObserverEntry,
    );
    if (entries.length > 0) observer.callback(entries, observer as unknown as ResizeObserver);
  }
}

class ResizeObserverStub implements ResizeObserver {
  private readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    observers.add({ callback, targets: this.targets });
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }
}

export function installResizeObserverStub(): void {
  globalThis.ResizeObserver = ResizeObserverStub;

  // jsdom returns all zeros here. Answering with the stubbed size is what makes
  // the initial-measurement path — the one that actually runs in a browser —
  // exercised by every chart test.
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    return {
      width: stubbedSize.width,
      height: stubbedSize.height,
      top: 0,
      left: 0,
      right: stubbedSize.width,
      bottom: stubbedSize.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };
}
