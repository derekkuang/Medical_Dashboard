import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from './App';

// Smoke test. Its job is to prove the test harness itself works — jsdom, the
// React 18 renderer and jest-dom matchers — before any real component depends
// on it. Queried by role rather than text so it survives copy changes.
describe('App', () => {
  it('renders the application shell', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /vitals unveiled/i })).toBeInTheDocument();
  });
});
