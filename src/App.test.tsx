import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

// Smoke test for the composition root: providers, theme and shell wired
// together. Behaviour is covered against DashboardContent, which can be given
// an isolated store; App deliberately owns the singleton.
describe('App', () => {
  it('renders the application shell', () => {
    globalThis.fetch = () => Promise.resolve(new Response('caseid\n1', { status: 200 }));

    render(<App />);

    expect(screen.getByRole('heading', { name: /vitals unveiled/i })).toBeInTheDocument();
  });
});
