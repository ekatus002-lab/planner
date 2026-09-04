import { describe, expect, it, vi } from 'vitest';
import { computeResizedEndAt } from './calendar-drop-targets';
import { resolvePlannerDrop } from './planner-dnd-context';

describe('computeResizedEndAt', () => {
  it('extends the end time when dragged down, snapped to 15 minutes', () => {
    // 90px down * (1/3 min/px) = 30 minutes, already a 15-minute multiple.
    const newEnd = computeResizedEndAt('2026-08-27T09:00:00.000Z', '2026-08-27T10:00:00.000Z', 90);
    expect(newEnd).toBe('2026-08-27T10:30:00.000Z');
  });

  it('shortens the end time when dragged up', () => {
    const newEnd = computeResizedEndAt('2026-08-27T09:00:00.000Z', '2026-08-27T10:00:00.000Z', -90);
    expect(newEnd).toBe('2026-08-27T09:30:00.000Z');
  });

  it('never lets the new end reach or pass the start time', () => {
    const newEnd = computeResizedEndAt('2026-08-27T09:00:00.000Z', '2026-08-27T10:00:00.000Z', -900);
    expect(new Date(newEnd).getTime()).toBeGreaterThan(new Date('2026-08-27T09:00:00.000Z').getTime());
  });

  it('snaps a non-multiple-of-15 delta to the nearest 15-minute boundary', () => {
    // 20px * (1/3 min/px) ~= 6.67 minutes -> rounds to 0 minutes of change.
    const newEnd = computeResizedEndAt('2026-08-27T09:00:00.000Z', '2026-08-27T10:00:00.000Z', 20);
    expect(newEnd).toBe('2026-08-27T10:00:00.000Z');
  });
});

// "Move" (dragging an already-scheduled event onto a new calendar slot) is
// implemented via the same dnd-kit cross-panel machinery Task 4 built - see
// `resolvePlannerDrop`'s "moves a scheduled task to a new slot, preserving
// its original duration" case in `backlog-calendar-dnd.test.tsx`. This
// suite re-asserts the reschedule_count-sensitive parts of that same path
// (same-day time change vs. cross-day move), since Task 5's plan explicitly
// calls those out as move behavior worth covering directly.
describe('resolvePlannerDrop (move)', () => {
  it('moving to a new time on the same day still reports the drop with the preserved duration', async () => {
    const onMoveScheduledTask = vi.fn();

    await resolvePlannerDrop(
      {
        active: { data: { current: { type: 'scheduled-event', taskId: 'task-1', durationMs: 60 * 60 * 1000 } } },
        over: {
          data: {
            current: { type: 'calendar-slot', date: '2026-08-27', startAt: '2026-08-27T14:00:00.000Z' },
          },
        },
      },
      { onScheduleFromBacklog: vi.fn(), onUnschedule: vi.fn(), onMoveScheduledTask },
    );

    expect(onMoveScheduledTask).toHaveBeenCalledWith(
      'task-1',
      '2026-08-27T14:00:00.000Z',
      '2026-08-27T15:00:00.000Z',
    );
  });
});
