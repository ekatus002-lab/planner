import { describe, expect, it, vi } from 'vitest';
import { resolvePlannerDrop } from './planner-dnd-context';

function dragEvent(activeData: unknown, overData: unknown | null) {
  return {
    active: { data: { current: activeData } },
    over: overData === null ? null : { data: { current: overData } },
  };
}

describe('resolvePlannerDrop', () => {
  it('schedules a backlog task dropped onto a timed calendar slot, applying the default 60-minute duration', async () => {
    const onScheduleFromBacklog = vi.fn();
    const onUnschedule = vi.fn();
    const onMoveScheduledTask = vi.fn();

    await resolvePlannerDrop(
      dragEvent(
        { type: 'task', source: 'backlog', taskId: 'task-1' },
        { type: 'calendar-slot', date: '2026-08-28', startAt: '2026-08-28T09:00:00.000Z' },
      ),
      { onScheduleFromBacklog, onUnschedule, onMoveScheduledTask },
    );

    expect(onScheduleFromBacklog).toHaveBeenCalledWith('task-1', {
      date: '2026-08-28',
      startAt: '2026-08-28T09:00:00.000Z',
      endAt: '2026-08-28T10:00:00.000Z',
    });
    expect(onUnschedule).not.toHaveBeenCalled();
    expect(onMoveScheduledTask).not.toHaveBeenCalled();
  });

  it('schedules a backlog task dropped onto a bare month/date cell as date-only (no times)', async () => {
    const onScheduleFromBacklog = vi.fn();

    await resolvePlannerDrop(
      dragEvent({ type: 'task', source: 'backlog', taskId: 'task-1' }, { type: 'calendar-slot', date: '2026-08-28' }),
      { onScheduleFromBacklog, onUnschedule: vi.fn(), onMoveScheduledTask: vi.fn() },
    );

    expect(onScheduleFromBacklog).toHaveBeenCalledWith('task-1', { date: '2026-08-28' });
  });

  it('unschedules a scheduled task dropped onto the Backlog drop zone', async () => {
    const onUnschedule = vi.fn();
    const onScheduleFromBacklog = vi.fn();

    await resolvePlannerDrop(
      dragEvent({ type: 'scheduled-event', taskId: 'task-1', durationMs: 60 * 60 * 1000 }, { type: 'backlog' }),
      { onScheduleFromBacklog, onUnschedule, onMoveScheduledTask: vi.fn() },
    );

    expect(onUnschedule).toHaveBeenCalledWith('task-1');
    expect(onScheduleFromBacklog).not.toHaveBeenCalled();
  });

  it('moves a scheduled task to a new slot, preserving its original duration', async () => {
    const onMoveScheduledTask = vi.fn();

    await resolvePlannerDrop(
      dragEvent(
        { type: 'scheduled-event', taskId: 'task-1', durationMs: 90 * 60 * 1000 },
        { type: 'calendar-slot', date: '2026-08-29', startAt: '2026-08-29T13:00:00.000Z' },
      ),
      { onScheduleFromBacklog: vi.fn(), onUnschedule: vi.fn(), onMoveScheduledTask },
    );

    expect(onMoveScheduledTask).toHaveBeenCalledWith(
      'task-1',
      '2026-08-29T13:00:00.000Z',
      '2026-08-29T14:30:00.000Z',
    );
  });

  it('does nothing when there is no drop target', async () => {
    const handlers = { onScheduleFromBacklog: vi.fn(), onUnschedule: vi.fn(), onMoveScheduledTask: vi.fn() };

    await resolvePlannerDrop(dragEvent({ type: 'task', source: 'backlog', taskId: 'task-1' }, null), handlers);

    expect(handlers.onScheduleFromBacklog).not.toHaveBeenCalled();
    expect(handlers.onUnschedule).not.toHaveBeenCalled();
    expect(handlers.onMoveScheduledTask).not.toHaveBeenCalled();
  });

  it('ignores a backlog-internal reorder drop (handled separately by BacklogPanel)', async () => {
    const handlers = { onScheduleFromBacklog: vi.fn(), onUnschedule: vi.fn(), onMoveScheduledTask: vi.fn() };

    await resolvePlannerDrop(
      dragEvent(
        { type: 'task', source: 'backlog', taskId: 'task-1' },
        { type: 'task', source: 'backlog', taskId: 'task-2' },
      ),
      handlers,
    );

    expect(handlers.onScheduleFromBacklog).not.toHaveBeenCalled();
  });
});
