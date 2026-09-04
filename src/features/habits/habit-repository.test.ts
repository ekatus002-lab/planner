import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import {
  createHabit,
  expectedHabitDates,
  isHabitScheduledOn,
  listHabitCompletions,
  listHabitsWithCompletions,
  setHabitCompletion,
  updateHabit,
} from './habit-repository';
import type { CreateHabitInput, Habit } from './habit-types';

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    userId: 'user-1',
    areaId: null,
    title: 'Test habit',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startDate: null,
    endDate: null,
    targetValue: null,
    targetUnit: null,
    active: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isHabitScheduledOn / expectedHabitDates', () => {
  it('matches ISO weekdays and date boundaries', () => {
    const habit = makeHabit({ weekdays: [1, 3, 5], startDate: '2026-08-24', endDate: '2026-08-31' });
    expect(isHabitScheduledOn(habit, '2026-08-24')).toBe(true); // Monday
    expect(isHabitScheduledOn(habit, '2026-08-25')).toBe(false); // Tuesday
    expect(isHabitScheduledOn(habit, '2026-08-26')).toBe(true); // Wednesday
    expect(isHabitScheduledOn(habit, '2026-09-02')).toBe(false); // after end_date
  });

  it('treats a null start/end date as unbounded', () => {
    const habit = makeHabit({ weekdays: [1] });
    expect(isHabitScheduledOn(habit, '2020-01-06')).toBe(true); // a Monday
    expect(isHabitScheduledOn(habit, '2020-01-07')).toBe(false); // a Tuesday
  });

  it('rejects a date before start_date even on a scheduled weekday', () => {
    const habit = makeHabit({ weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: '2026-08-24' });
    expect(isHabitScheduledOn(habit, '2026-08-20')).toBe(false);
  });

  it('lists expected dates inclusive of both window ends, filtered by weekday and habit bounds', () => {
    const habit = makeHabit({ weekdays: [1, 3, 5], startDate: '2026-08-24', endDate: '2026-08-31' });
    expect(expectedHabitDates(habit, '2026-08-24', '2026-08-30')).toEqual([
      '2026-08-24', // Mon
      '2026-08-26', // Wed
      '2026-08-28', // Fri
    ]);
  });

  it('returns an empty list when the window has no scheduled days', () => {
    const habit = makeHabit({ weekdays: [6, 7] });
    expect(expectedHabitDates(habit, '2026-08-24', '2026-08-28')).toEqual([]);
  });
});

describe('habit-repository', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  function seedHabit(overrides: Partial<CreateHabitInput> = {}) {
    return createHabit(db, { userId: 'user-1', title: 'Английский', ...overrides });
  }

  it('creates a habit with sane defaults', async () => {
    const habit = await seedHabit();

    expect(habit.title).toBe('Английский');
    expect(habit.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(habit.active).toBe(true);
    expect(habit.areaId).toBeNull();
    expect(habit.startDate).toBeNull();
    expect(habit.endDate).toBeNull();
    expect(habit.targetValue).toBeNull();
    expect(habit.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('trims the title and rejects a blank one', async () => {
    const habit = await seedHabit({ title: '  Йога  ' });
    expect(habit.title).toBe('Йога');

    await expect(seedHabit({ title: '   ' })).rejects.toThrow('Habit title is required');
  });

  it('rejects an empty weekday set, since such a habit could never be due', async () => {
    await expect(seedHabit({ weekdays: [] })).rejects.toThrow('Habit must be scheduled on at least one weekday');
  });

  it('updates mutable fields, rejecting an empty weekday set on update too', async () => {
    const habit = await seedHabit({ weekdays: [1, 2, 3, 4, 5] });

    await updateHabit(db, habit.id, { title: '  Английский B2  ', weekdays: [6, 7], active: false });

    const [withCompletions] = await listHabitsWithCompletions(db, 'user-1', '2026-08-01', '2026-08-31', {
      includeInactive: true,
    });
    expect(withCompletions.habit.title).toBe('Английский B2');
    expect(withCompletions.habit.weekdays).toEqual([6, 7]);
    expect(withCompletions.habit.active).toBe(false);

    await expect(updateHabit(db, habit.id, { weekdays: [] })).rejects.toThrow(
      'Habit must be scheduled on at least one weekday',
    );
  });

  it('upserts one completion row per (habit, date), overwriting the prior value', async () => {
    await seedHabit();
    await setHabitCompletion(db, 'user-1', 'habit-1', '2026-08-27', true);
    await setHabitCompletion(db, 'user-1', 'habit-1', '2026-08-27', false);

    const rows = await listHabitCompletions(db, 'user-1', '2026-08-27', '2026-08-27');
    expect(rows).toHaveLength(1);
    expect(rows[0].completed).toBe(false);
  });

  it('stores an optional quantitative value alongside a completion', async () => {
    await seedHabit();
    await setHabitCompletion(db, 'user-1', 'habit-1', '2026-08-27', true, 25);

    const rows = await listHabitCompletions(db, 'user-1', '2026-08-27', '2026-08-27');
    expect(rows[0].value).toBe(25);
  });

  it('lists active habits with their completions in the given window', async () => {
    const habit = await seedHabit();
    const inactive = await seedHabit({ title: 'Архивная привычка', active: false });
    await setHabitCompletion(db, 'user-1', habit.id, '2026-08-27', true);
    await setHabitCompletion(db, 'user-1', habit.id, '2026-09-05', true); // outside window

    const results = await listHabitsWithCompletions(db, 'user-1', '2026-08-01', '2026-08-31');

    expect(results).toHaveLength(1);
    expect(results[0].habit.id).toBe(habit.id);
    expect(results[0].completions.map((c) => c.date)).toEqual(['2026-08-27']);
    expect(results.some((r) => r.habit.id === inactive.id)).toBe(false);
  });
});
