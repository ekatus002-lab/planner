'use client';

import { useState, type FormEvent } from 'react';
import { usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { format, parse } from 'date-fns';
import { useAreas } from '@/features/areas/use-areas';
import { createTask, updateTask } from './task-repository';
import { scheduleAllDayTask, scheduleDateOnlyTask, scheduleTimedTask } from './scheduling';
import type { Task, TaskPriority } from './task-types';

const TITLE_MAX_LENGTH = 240;
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить задачу';
const TIME_INPUT_FORMAT = 'HH:mm';
const DATE_TIME_PARSE_FORMAT = "yyyy-MM-dd'T'HH:mm";

type Props = {
  userId: string;
  /** When provided, the form edits this task instead of creating a new one. */
  task?: Task;
  onSaved: () => void;
  onCancel?: () => void;
  /**
   * Shows the date/all-day/start-time/end-time scheduling fields, in
   * addition to the base task fields. Only the calendar (`calendar-board.tsx`)
   * invokes the form this way - Backlog's own create/edit flow never touches
   * scheduling, so it omits this prop entirely.
   */
  showScheduling?: boolean;
};

// HH:mm shown in a <input type="time"> for a scheduled instant, in the
// browser's local timezone (matching how the calendar itself positions the
// event) - or "" when the task has no specific time yet.
function toTimeInputValue(iso: string | null): string {
  return iso ? format(new Date(iso), TIME_INPUT_FORMAT) : '';
}

// Combines a date-only value ("2026-08-28") with a time-only value
// ("09:00") into a UTC ISO instant, interpreting both as the browser's local
// timezone - the inverse of `toTimeInputValue`.
function toIsoInstant(date: string, time: string): string {
  return parse(`${date}T${time}`, DATE_TIME_PARSE_FORMAT, new Date()).toISOString();
}

export function TaskForm({ userId, task, onSaved, onCancel, showScheduling = false }: Props) {
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
  const [scheduledDate, setScheduledDate] = useState(task?.scheduledDate ?? '');
  const [allDay, setAllDay] = useState(task?.allDay ?? false);
  const [startTime, setStartTime] = useState(toTimeInputValue(task?.startAt ?? null));
  const [endTime, setEndTime] = useState(toTimeInputValue(task?.endAt ?? null));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function applyScheduling(db: CommonPowerSyncDatabase, target: Task) {
    if (!scheduledDate) return;

    if (allDay) {
      await scheduleAllDayTask(db, target, scheduledDate);
    } else if (startTime && endTime) {
      await scheduleTimedTask(db, target, toIsoInstant(scheduledDate, startTime), toIsoInstant(scheduledDate, endTime));
    } else {
      await scheduleDateOnlyTask(db, target, scheduledDate);
    }
  }

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
        if (showScheduling) {
          await applyScheduling(db, task);
        }
      } else {
        const created = await createTask(db, {
          userId,
          title: trimmedTitle,
          description,
          areaId: areaId || null,
          priority,
        });
        if (showScheduling) {
          await applyScheduling(db, created);
        }
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
    <form onSubmit={handleSubmit} aria-label="Задача" className="@container space-y-3">
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

      {showScheduling && (
        <div className="space-y-3 border-t pt-3">
          <label className="block">
            <span className="text-sm font-medium">Дата</span>
            <input
              type="date"
              aria-label="Дата"
              value={scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)}
              className={fieldClassName}
            />
          </label>

          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              aria-label="Весь день"
              checked={allDay}
              onChange={(event) => setAllDay(event.target.checked)}
              className="size-4"
            />
            <span className="text-sm font-medium">Весь день</span>
          </label>

          {!allDay && (
            // A native <input type="time"> renders wider in some browsers/
            // locales (e.g. a 12-hour AM/PM format) than this component was
            // tested against - a fixed viewport breakpoint can't account for
            // that, and this form also renders inside a ~320px desktop
            // sidebar column, narrower than most phones. A container query
            // responds to *this form's own rendered width* instead: stacked
            // by default, side by side only once there is unambiguously
            // enough room for two comfortable fields.
            <div className="flex flex-col gap-2 @min-[500px]:flex-row">
              <label className="block min-w-0 @min-[500px]:flex-1">
                <span className="text-sm font-medium">Начало</span>
                <input
                  type="time"
                  aria-label="Начало"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className={fieldClassName}
                />
              </label>
              <label className="block min-w-0 @min-[500px]:flex-1">
                <span className="text-sm font-medium">Конец</span>
                <input
                  type="time"
                  aria-label="Конец"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className={fieldClassName}
                />
              </label>
            </div>
          )}
        </div>
      )}

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
