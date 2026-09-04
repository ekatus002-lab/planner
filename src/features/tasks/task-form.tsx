'use client';

import { useState, type FormEvent } from 'react';
import { usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { useAreas } from '@/features/areas/use-areas';
import { createTask, updateTask } from './task-repository';
import type { Task, TaskPriority } from './task-types';

const TITLE_MAX_LENGTH = 240;
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить задачу';

type Props = {
  userId: string;
  /** When provided, the form edits this task instead of creating a new one. */
  task?: Task;
  onSaved: () => void;
  onCancel?: () => void;
};

export function TaskForm({ userId, task, onSaved, onCancel }: Props) {
  // `usePowerSync` is typed against `@powersync/common`'s
  // `AbstractPowerSyncDatabase`; `createTask`/`updateTask` are typed against
  // `@powersync/web`'s structurally-identical `CommonPowerSyncDatabase` (see
  // `PowerSyncTestProvider` for the same cross-package relationship in
  // tests).
  const db = usePowerSync() as CommonPowerSyncDatabase | null;
  const { areas } = useAreas(userId);

  const [title, setTitle] = useState(task?.title ?? '');
  const [areaId, setAreaId] = useState(task?.areaId ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal');
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
      if (task) {
        await updateTask(db, task.id, {
          title: trimmedTitle,
          description,
          areaId: areaId || null,
          priority,
        });
      } else {
        await createTask(db, {
          userId,
          title: trimmedTitle,
          description,
          areaId: areaId || null,
          priority,
        });
      }
      // Only clear the error and report success once the local write has
      // actually committed - never optimistically.
      setError(null);
      onSaved();
    } catch {
      // Keep the entered values and the form open; the write failed so
      // there is nothing to show as saved.
      setError(SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  // Shared with area-settings.tsx's inputs: `text-base` (16px) keeps iOS
  // Safari from auto-zooming on focus, and `min-h-11` gives every field a
  // 44px+ touch target - both requirements only bite on a real phone, never
  // in jsdom-based tests.
  const fieldClassName = 'mt-1 block w-full min-h-11 rounded-md border px-3 py-2 text-base';
  const buttonClassName = 'min-h-11 rounded-md border px-4 py-2 text-sm font-medium';

  return (
    <form onSubmit={handleSubmit} aria-label="Задача" className="space-y-3">
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
        <span className="text-sm font-medium">Приоритет</span>
        <select
          aria-label="Приоритет"
          value={priority}
          onChange={(event) => setPriority(event.target.value as TaskPriority)}
          className={fieldClassName}
        >
          <option value="low">Низкий</option>
          <option value="normal">Обычный</option>
          <option value="high">Высокий</option>
        </select>
      </label>

      {error && <p role="alert">{error}</p>}

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
