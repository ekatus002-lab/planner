import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoalCard } from './goal-card';
import type { Goal } from './goal-types';
import type { GoalWithProgress } from './use-goals';

function baseGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    userId: 'user-1',
    areaId: null,
    title: 'English B2',
    description: '',
    startDate: '2026-08-01',
    endDate: '2026-12-31',
    progressMode: 'hybrid',
    manualProgress: 0,
    manualAdjustment: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseItem(overrides: Partial<GoalWithProgress> = {}): GoalWithProgress {
  return {
    goal: baseGoal(),
    progress: { automatic: 0, manual: 0, displayed: 0, taskRate: null, habitRate: null },
    linkedTaskCount: 0,
    completedLinkedTaskCount: 0,
    linkedHabitCount: 0,
    ...overrides,
  };
}

describe('GoalCard', () => {
  it('renders "start – end" when both dates are set', () => {
    render(<GoalCard item={baseItem()} />);
    expect(screen.getByText('2026-08-01 – 2026-12-31')).toBeInTheDocument();
  });

  it('renders just the start date, with no dash, when only start is set', () => {
    render(<GoalCard item={baseItem({ goal: baseGoal({ startDate: '2026-08-01', endDate: null }) })} />);
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it('renders just the end date, with no dash, when only end is set', () => {
    render(<GoalCard item={baseItem({ goal: baseGoal({ startDate: null, endDate: '2026-12-31' }) })} />);
    expect(screen.getByText('2026-12-31')).toBeInTheDocument();
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it('omits the date range text entirely, with no stray dash or bullet, when neither date is set', () => {
    render(
      <GoalCard
        item={baseItem({
          goal: baseGoal({ startDate: null, endDate: null }),
          linkedTaskCount: 2,
          completedLinkedTaskCount: 1,
        })}
      />,
    );
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
    const detail = screen.getByText(/Задачи 1\/2/);
    expect(detail.textContent).toBe('Задачи 1/2');
    expect(detail.textContent?.startsWith('•')).toBe(false);
  });
});
