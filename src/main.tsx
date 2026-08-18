import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');

// Fail loudly rather than with a null-deref further down. `strict` would let a
// non-null assertion through here; an explicit throw names the actual problem.
if (!container) {
  throw new Error('Root element #root not found — index.html and main.tsx are out of sync');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
