import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { installResizeObserverStub, resetStubbedElementSize } from './resizeObserverStub';

// jsdom has no layout engine and no ResizeObserver, so charts would measure
// 0x0 and refuse to draw. Installed globally rather than per-file so a new
// chart test does not have to remember.
installResizeObserverStub();

// RTL's auto-cleanup only registers when a global `afterEach` exists at import
// time. Registering it explicitly keeps it working regardless of how Vitest is
// configured, and stops one test's DOM leaking into the next — which is exactly
// the class of bug the original had with its body-appended tooltips.
afterEach(() => {
  cleanup();
  resetStubbedElementSize();
});
