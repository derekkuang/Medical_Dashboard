import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DepartmentBar } from '@/transforms/departments';
import { DepartmentBars } from './DepartmentBars';

const BARS: DepartmentBar[] = [
  { department: 'General surgery', total: 4930, matched: 4930 },
  { department: 'Thoracic surgery', total: 1111, matched: 0 },
  { department: 'Urology', total: 117, matched: 117 },
];

function renderBars(overrides: Partial<Parameters<typeof DepartmentBars>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <DepartmentBars
      bars={BARS}
      maxTotal={4930}
      selected={null}
      onSelect={onSelect}
      width={600}
      height={200}
      description="3 departments."
      {...overrides}
    />,
  );
  return { onSelect };
}

describe('DepartmentBars', () => {
  it('exposes every bar as a button rather than hiding them behind role=img', () => {
    // role="img" would hide the interior entirely, making the filter
    // unreachable for anyone not using a pointer.
    renderBars();

    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('names each bar with both its cohort and its total', () => {
    renderBars();

    expect(
      screen.getByRole('button', { name: 'Thoracic surgery: 0 of 1,111 cases' }),
    ).toBeInTheDocument();
  });

  it('reports which department is selected', () => {
    renderBars({ selected: 'Urology' });

    expect(screen.getByRole('button', { name: /Urology/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /General surgery/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('activates on click', async () => {
    const { onSelect } = renderBars();

    await userEvent.click(screen.getByRole('button', { name: /Urology/ }));

    expect(onSelect).toHaveBeenCalledWith('Urology');
  });

  it('activates on Enter', async () => {
    const { onSelect } = renderBars();

    screen.getByRole('button', { name: /Urology/ }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith('Urology');
  });

  it('activates on Space, as a button must', async () => {
    const { onSelect } = renderBars();

    screen.getByRole('button', { name: /Urology/ }).focus();
    await userEvent.keyboard(' ');

    expect(onSelect).toHaveBeenCalledWith('Urology');
  });

  it('is reachable by tabbing', async () => {
    renderBars();

    await userEvent.tab();

    expect(screen.getByRole('button', { name: /General surgery/ })).toHaveFocus();
  });

  it('keeps an excluded department visible instead of dropping it', () => {
    // Thoracic surgery has 0 matched. The original drew only filtered data, so
    // the row vanished and the user could not see the filter had removed it.
    renderBars();

    expect(screen.getByRole('button', { name: /Thoracic surgery: 0 of/ })).toBeInTheDocument();
  });

  it('survives an empty table without a degenerate scale', () => {
    renderBars({ bars: [], maxTotal: 0 });

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
