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
    if (!trimmedTitle || trimmedTitle.length > TITLE_MAX_LENGTH || !startDate || !endDate) {
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
          startDate,
          endDate,
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
          startDate,
          endDate,
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

  return (
    <form onSubmit={handleSubmit} aria-label="Цель" className="space-y-3">
      <label className="block">
        <span>Название</span>
        <input
          aria-label="Название"
          value={title}
          maxLength={TITLE_MAX_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>

      <label className="block">
        <span>Описание</span>
        <textarea
          aria-label="Описание"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <label className="block">
        <span>Сфера жизни</span>
        <select
          aria-label="Сфера жизни"
          value={areaId ?? ''}
          onChange={(event) => setAreaId(event.target.value)}
        >
          <option value="">Без сферы</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span>Начало</span>
        <input
          type="date"
          aria-label="Начало"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          required
        />
      </label>

      <label className="block">
        <span>Окончание</span>
        <input
          type="date"
          aria-label="Окончание"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          required
        />
      </label>

      <label className="block">
        <span>Режим прогресса</span>
        <select
          aria-label="Режим прогресса"
          value={progressMode}
          onChange={(event) => setProgressMode(event.target.value as GoalProgressMode)}
        >
          <option value="automatic">Автоматический</option>
          <option value="manual">Ручной</option>
          <option value="hybrid">Гибридный</option>
        </select>
      </label>

      {progressMode === 'manual' && (
        <label className="block">
          <span>Ручной прогресс, %</span>
          <input
            type="number"
            aria-label="Ручной прогресс, %"
            value={manualProgress}
            min={0}
            max={100}
            onChange={(event) => setManualProgress(event.target.value)}
          />
        </label>
      )}

      {progressMode === 'hybrid' && (
        <label className="block">
          <span>Ручная корректировка, %</span>
          <input
            type="number"
            aria-label="Ручная корректировка, %"
            value={manualAdjustment}
            min={-100}
            max={100}
            onChange={(event) => setManualAdjustment(event.target.value)}
          />
        </label>
      )}

      {error && <p role="alert">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={isSaving}>
          Сохранить
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
