'use client';

import { useState, type FormEvent } from 'react';
import { usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { useAreas } from '@/features/areas/use-areas';
import { createGoal, updateGoal } from './goal-repository';
import type { Goal, GoalProgressMode } from './goal-types';

const TITLE_MAX_LENGTH = 200;
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить цель';

type Props = {
  userId: string;
  /** When provided, the form edits this goal instead of creating a new one. */
  goal?: Goal;
  onSaved: () => void;
  onCancel?: () => void;
};

export function GoalForm({ userId, goal, onSaved, onCancel }: Props) {
  const db = usePowerSync() as CommonPowerSyncDatabase | null;
  const { areas } = useAreas(userId);

  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [areaId, setAreaId] = useState(goal?.areaId ?? '');
  const [startDate, setStartDate] = useState(goal?.startDate ?? '');
  const [endDate, setEndDate] = useState(goal?.endDate ?? '');
  const [progressMode, setProgressMode] = useState<GoalProgressMode>(goal?.progressMode ?? 'hybrid');
  const [manualProgress, setManualProgress] = useState(goal?.manualProgress?.toString() ?? '0');
  const [manualAdjustment, setManualAdjustment] = useState(goal?.manualAdjustment?.toString() ?? '0');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle.length > TITLE_MAX_LENGTH) {
      setError(SAVE_ERROR_MESSAGE);
      return;
    }
    if (!db) {
      setError(SAVE_ERROR_MESSAGE);
      return;
    }

    setIsSaving(true);
    try {
      if (goal) {
        await updateGoal(db, goal.id, {
          title: trimmedTitle,
          description,
          areaId: areaId || null,
          startDate: startDate || null,
          endDate: endDate || null,
          progressMode,
          manualProgress: Number(manualProgress) || 0,
          manualAdjustment: Number(manualAdjustment) || 0,
        });
      } else {
        await createGoal(db, {
          userId,
          title: trimmedTitle,
          description,
          areaId: areaId || null,
          startDate: startDate || null,
          endDate: endDate || null,
          progressMode,
          manualProgress: Number(manualProgress) || 0,
          manualAdjustment: Number(manualAdjustment) || 0,
        });
      }

      setError(null);
      onSaved();
    } catch {
      setError(SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  // Mirrors `TaskForm`'s field/button styling for visual consistency across
  // the two inline create/edit forms that share the left column: `text-base`
  // (16px) keeps iOS Safari from auto-zooming on focus, and `min-h-11` gives
  // every field/button a 44px+ touch target.
  const fieldClassName = 'mt-1 block w-full min-h-11 rounded-md border px-3 py-2 text-base';
  const buttonClassName = 'min-h-11 rounded-md border px-4 py-2 text-sm font-medium';

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Цель"
      className="space-y-3 rounded-xl border bg-card p-3 ring-1 ring-foreground/10"
    >
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
        <span className="text-sm font-medium">Описание</span>
        <textarea
          aria-label="Описание"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
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

      <div className="flex gap-2">
        <label className="block min-w-0 flex-1">
          <span className="text-sm font-medium">Начало</span>
          <input
            type="date"
            aria-label="Начало"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className={fieldClassName}
          />
        </label>

        <label className="block min-w-0 flex-1">
          <span className="text-sm font-medium">Окончание</span>
          <input
            type="date"
            aria-label="Окончание"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className={fieldClassName}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Режим прогресса</span>
        <select
          aria-label="Режим прогресса"
          value={progressMode}
          onChange={(event) => setProgressMode(event.target.value as GoalProgressMode)}
          className={fieldClassName}
        >
          <option value="automatic">Автоматический</option>
          <option value="manual">Ручной</option>
          <option value="hybrid">Гибридный</option>
        </select>
      </label>

      {progressMode === 'manual' && (
        <label className="block">
          <span className="text-sm font-medium">Ручной прогресс, %</span>
          <input
            type="number"
            aria-label="Ручной прогресс, %"
            value={manualProgress}
            min={0}
            max={100}
            onChange={(event) => setManualProgress(event.target.value)}
            className={fieldClassName}
          />
        </label>
      )}

      {progressMode === 'hybrid' && (
        <label className="block">
          <span className="text-sm font-medium">Ручная корректировка, %</span>
          <input
            type="number"
            aria-label="Ручная корректировка, %"
            value={manualAdjustment}
            min={-100}
            max={100}
            onChange={(event) => setManualAdjustment(event.target.value)}
            className={fieldClassName}
          />
        </label>
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
