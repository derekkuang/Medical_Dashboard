import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartCard } from './ChartCard';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';

describe('ChartCard', () => {
  it('exposes each panel as a region labelled by its own heading', () => {
    // This is what lets a screen-reader user move between panels instead of
    // reading the dashboard as one undifferentiated block.
    render(
      <ChartCard title="Age distribution">
        <p>content</p>
      </ChartCard>,
    );

    expect(screen.getByRole('region', { name: 'Age distribution' })).toBeInTheDocument();
  });

  it('keeps distinct panels distinctly labelled', () => {
    // useId, not a hardcoded id: two panels of the same type must not collide.
    render(
      <>
        <ChartCard title="Departments">
          <p>a</p>
        </ChartCard>
        <ChartCard title="Procedure phases">
          <p>b</p>
        </ChartCard>
      </>,
    );

    expect(screen.getByRole('region', { name: 'Departments' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Procedure phases' })).toBeInTheDocument();
  });
});

describe('LoadingState', () => {
  it('announces what is loading rather than just that something is', () => {
    render(<LoadingState label="Loading 6,388 surgical cases" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading 6,388 surgical cases');
  });
});

describe('EmptyState', () => {
  it('offers a way out of a cohort that matches nothing', () => {
    const onClick = vi.fn();
    render(<EmptyState title="No matching cases" action={{ label: 'Clear filters', onClick }} />);

    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('runs the escape action when invoked', async () => {
    const onClick = vi.fn();
    render(<EmptyState title="No matching cases" action={{ label: 'Clear filters', onClick }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('ErrorState', () => {
  it('announces immediately and surfaces the real failure', () => {
    // "Something went wrong" is unactionable; the detail is the useful part.
    render(<ErrorState title="Could not load cases" detail="HTTP 503 from /cases.csv" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load cases');
    expect(alert).toHaveTextContent('HTTP 503 from /cases.csv');
  });
});
