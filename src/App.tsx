import type { ReactElement } from 'react';

/**
 * Placeholder shell. Deliberately empty of features: the scaffold, CI pipeline
 * and container image are proven green before any visualisation exists, so that
 * a later red build points at the feature rather than the plumbing.
 */
export function App(): ReactElement {
  return (
    <main>
      <h1>Vitals Unveiled</h1>
      <p>Scaffold is up. No features yet.</p>
    </main>
  );
}
