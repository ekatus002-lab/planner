import { describe, expect, it } from 'vitest';
import { dateOnlyToLocalRange, taskToCalendarEvent, tasksToCalendarEvents } from './calendar-adapter';
import type { Task } from '@/features/tasks/task-types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    userId: 'user-1',
    areaId: null,
    goalId: null,
    title: 'Работа над проектом',
    description: '',
    status: 'open',
    scheduledDate: null,
    startAt: null,
    endAt: null,
    allDay: false,
    priority: 'normal',
    completedAt: null,
    rescheduleCount: 0,
    sortOrder: 0,
    fieldVersions: {},
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

const AREA = { color: '#6B9EEB' };

describe('taskToCalendarEvent', () => {
  it('returns null for an unscheduled backlog task', () => {
    const backlogTask = makeTask();
    expect(taskToCalendarEvent(backlogTask, AREA)).toBeNull();
  });

  it('builds a timed event from start_at/end_at', () => {
    const timedTask = makeTask({
      scheduledDate: '2026-08-28',
      startAt: '2026-08-28T09:00:00.000Z',
      endAt: '2026-08-28T10:00:00.000Z',
      allDay: false,
    });

    const event = taskToCalendarEvent(timedTask, AREA);

    expect(event?.start.toISOString()).toBe(timedTask.startAt);
    expect(event?.end.toISOString()).toBe(timedTask.endAt);
    expect(event?.allDay).toBe(false);
    expect(event?.areaColor).toBe('#6B9EEB');
    expect(event?.taskId).toBe(timedTask.id);
    expect(event?.title).toBe('Работа над проектом');
    expect(event?.task).toBe(timedTask);
  });

  it('builds an all-day event spanning the local scheduled day', () => {
    const allDayTask = makeTask({ scheduledDate: '2026-08-28', allDay: true });

    const event = taskToCalendarEvent(allDayTask, AREA);

    expect(event?.allDay).toBe(true);
    expect(event?.start.getFullYear()).toBe(2026);
    expect(event?.start.getMonth()).toBe(7); // August, 0-indexed
    expect(event?.start.getDate()).toBe(28);
    expect(event?.start.getHours()).toBe(0);
  });

  it('builds a date-only "day task" event rendered in the all-day row', () => {
    const dateOnlyTask = makeTask({ scheduledDate: '2026-08-28', allDay: false });

    const event = taskToCalendarEvent(dateOnlyTask, AREA);

    expect(event).not.toBeNull();
    expect(event?.allDay).toBe(true);
    expect(event?.task.allDay).toBe(false);
  });

  it('falls back to a neutral color when the task has no area', () => {
    const task = makeTask({ scheduledDate: '2026-08-28', allDay: true });
    expect(taskToCalendarEvent(task, null)?.areaColor).toBe('#9CA3AF');
  });

  it('stays visible when completed, so historical days remain reviewable', () => {
    const completedTask = makeTask({
      scheduledDate: '2026-08-28',
      startAt: '2026-08-28T09:00:00.000Z',
      endAt: '2026-08-28T10:00:00.000Z',
      status: 'completed',
      completedAt: '2026-08-28T10:05:00.000Z',
    });

    expect(taskToCalendarEvent(completedTask, AREA)).not.toBeNull();
  });
});

describe('dateOnlyToLocalRange', () => {
  it('spans exactly one local day', () => {
    const { start, end } = dateOnlyToLocalRange('2026-08-28');
    expect(start.getDate()).toBe(28);
    expect(end.getDate()).toBe(29);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('tasksToCalendarEvents', () => {
  it('resolves each task area color by id and drops backlog tasks', () => {
    const scheduled = makeTask({ id: 'a', areaId: 'career', scheduledDate: '2026-08-28', allDay: true });
    const backlog = makeTask({ id: 'b' });

    const events = tasksToCalendarEvents([scheduled, backlog], { career: '#9B75E8' });

    expect(events).toHaveLength(1);
    expect(events[0].areaColor).toBe('#9B75E8');
  });
});
