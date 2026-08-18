import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL's auto-cleanup only registers when a global `afterEach` exists at import
// time. Registering it explicitly keeps it working regardless of how Vitest is
// configured, and stops one test's DOM leaking into the next — which is exactly
// the class of bug the original had with its body-appended tooltips.
afterEach(() => {
  cleanup();
});
