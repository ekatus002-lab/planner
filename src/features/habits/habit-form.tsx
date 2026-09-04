'use client';

import { useState, type FormEvent } from 'react';
import { usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { useAreas } from '@/features/areas/use-areas';
import { linkHabitToGoal, unlinkHabitFromGoal } from '@/features/goals/goal-repository';
import { useGoalOptions, useLinkedGoalIdsForHabit } from '@/features/goals/use-goals';
import { createHabit, updateHabit } from './habit-repository';
import type { Habit, IsoWeekday } from './habit-types';

const TITLE_MAX_LENGTH = 160;
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить привычку';
const EMPTY_WEEKDAYS_ERROR_MESSAGE = 'Выберите хотя бы один день недели';

const WEEKDAY_OPTIONS: { iso: IsoWeekday; label: string }[] = [
  { iso: 1, label: 'Пн' },
  { iso: 2, label: 'Вт' },
  { iso: 3, label: 'Ср' },
  { iso: 4, label: 'Чт' },
  { iso: 5, label: 'Пт' },
  { iso: 6, label: 'Сб' },
  { iso: 7, label: 'Вс' },
];

type Props = {
  userId: string;
  /** When provided, the form edits this habit instead of creating a new one. */
  habit?: Habit;
  onSaved: () => void;
  onCancel?: () => void;
};

export function HabitForm({ userId, habit, onSaved, onCancel }: Props) {
  const db = usePowerSync() as CommonPowerSyncDatabase | null;
  const { areas } = useAreas(userId);
  const goalOptions = useGoalOptions(userId);
  const linkedGoalIds = useLinkedGoalIdsForHabit(habit?.id);

  const [title, setTitle] = useState(habit?.title ?? '');
  const [areaId, setAreaId] = useState(habit?.areaId ?? '');
  const [weekdays, setWeekdays] = useState<IsoWeekday[]>(habit?.weekdays ?? [1, 2, 3, 4, 5, 6, 7]);
  const [startDate, setStartDate] = useState(habit?.startDate ?? '');
  const [endDate, setEndDate] = useState(habit?.endDate ?? '');
  const [targetValue, setTargetValue] = useState(habit?.targetValue?.toString() ?? '');
  const [targetUnit, setTargetUnit] = useState(habit?.targetUnit ?? '');
  const [active, setActive] = useState(habit?.active ?? true);
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // `selectedGoalIds` starts `null` (meaning "use the watched
  // `linkedGoalIds`") and only becomes an explicit array once the user
  // actually toggles a checkbox - avoiding a render-time state sync from a
  // query that only resolves after the form's first render.
  const goalIds = selectedGoalIds ?? linkedGoalIds;

  function toggleWeekday(iso: IsoWeekday) {
    setWeekdays((current) =>
      current.includes(iso) ? current.filter((day) => day !== iso) : [...current, iso].sort(),
    );
  }

  function toggleGoal(goalId: string) {
    setSelectedGoalIds((current) => {
      const base = current ?? linkedGoalIds;
      return base.includes(goalId) ? base.filter((id) => id !== goalId) : [...base, goalId];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle.length > TITLE_MAX_LENGTH) {
      setError(SAVE_ERROR_MESSAGE);
      return;
    }
    if (weekdays.length === 0) {
      setError(EMPTY_WEEKDAYS_ERROR_MESSAGE);
      return;
    }
    if (!db) {
      setError(SAVE_ERROR_MESSAGE);
      return;
    }

    setIsSaving(true);
    try {
      const parsedTargetValue = targetValue.trim() === '' ? null : Number(targetValue);
      let habitId = habit?.id;

      if (habit) {
        await updateHabit(db, habit.id, {
          title: trimmedTitle,
          areaId: areaId || null,
          weekdays,
          startDate: startDate || null,
          endDate: endDate || null,
          targetValue: parsedTargetValue,
          targetUnit: targetUnit.trim() || null,
          active,
        });
      } else {
        const created = await createHabit(db, {
          userId,
          title: trimmedTitle,
          areaId: areaId || null,
          weekdays,
          startDate: startDate || null,
          endDate: endDate || null,
          targetValue: parsedTargetValue,
          targetUnit: targetUnit.trim() || null,
          active,
        });
        habitId = created.id;
      }

      if (habitId) {
        const toAdd = goalIds.filter((id) => !linkedGoalIds.includes(id));
        const toRemove = linkedGoalIds.filter((id) => !goalIds.includes(id));
        for (const goalId of toAdd) await linkHabitToGoal(db, userId, goalId, habitId);
        for (const goalId of toRemove) await unlinkHabitFromGoal(db, goalId, habitId);
      }

      setError(null);
      onSaved();
    } catch {
      setError(SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  // Mirrors TaskForm's/GoalForm's field/button styling for visual
  // consistency across the app's inline create/edit forms: `text-base`
  // (16px) keeps iOS Safari from auto-zooming on focus, and `min-h-11` gives
  // every field/button a 44px+ touch target.
  const fieldClassName = 'mt-1 block w-full min-h-11 rounded-md border px-3 py-2 text-base';
  const buttonClassName = 'min-h-11 rounded-md border px-4 py-2 text-sm font-medium';

  return (
    <form onSubmit={handleSubmit} aria-label="Привычка" className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium">Название</span>
        <input
          aria-label="Название"
          value={title}
          maxLength={TITLE_MAX_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          required
          className={fieldClassName}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Сфера жизни</span>
        <select
          aria-label="Сфера жизни"
          value={areaId ?? ''}
          onChange={(event) => setAreaId(event.target.value)}
          className={fieldClassName}
        >
          <option value="">Без сферы</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Дни недели</legend>
        <div className="flex flex-wrap gap-1">
          {WEEKDAY_OPTIONS.map((option) => {
            const checked = weekdays.includes(option.iso);
            return (
              <label
                key={option.iso}
                className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border px-2 text-sm font-medium ${
                  checked ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={option.label}
                  checked={checked}
                  onChange={() => toggleWeekday(option.iso)}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <label className="block min-w-0 flex-1">
          <span className="text-sm font-medium">Дата начала</span>
          <input
            type="date"
            aria-label="Дата начала"
            value={startDate ?? ''}
            onChange={(event) => setStartDate(event.target.value)}
            className={fieldClassName}
          />
        </label>

        <label className="block min-w-0 flex-1">
          <span className="text-sm font-medium">Дата окончания</span>
          <input
            type="date"
            aria-label="Дата окончания"
            value={endDate ?? ''}
            onChange={(event) => setEndDate(event.target.value)}
            className={fieldClassName}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Количественная цель</span>
        <input
          type="number"
          aria-label="Количественная цель"
          value={targetValue}
          onChange={(event) => setTargetValue(event.target.value)}
          className={fieldClassName}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Единица измерения</span>
        <input
          aria-label="Единица измерения"
          value={targetUnit}
          onChange={(event) => setTargetUnit(event.target.value)}
          className={fieldClassName}
        />
      </label>

      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          aria-label="Активна"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          className="size-4"
        />
        <span className="text-sm font-medium">Активна</span>
      </label>

      {goalOptions.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Цели</legend>
          <div className="space-y-1">
            {goalOptions.map((goal) => (
              <label key={goal.id} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Цель: ${goal.title}`}
                  checked={goalIds.includes(goal.id)}
                  onChange={() => toggleGoal(goal.id)}
                  className="size-4"
                />
                <span className="text-sm">{goal.title}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={isSaving} className={buttonClassName}>
          Сохранить
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClassName}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
