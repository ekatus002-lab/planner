'use client';

import { useState, type FormEvent } from 'react';
import { usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { useAreas } from './use-areas';
import { createArea, reorderAreas, setAreaArchived, updateArea } from './area-repository';
import type { Area } from './area-types';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_NEW_COLOR = '#9CA3AF';
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить сферу жизни';
const REORDER_ERROR_MESSAGE = 'Не удалось изменить порядок сфер жизни';
const ARCHIVE_ERROR_MESSAGE = 'Не удалось архивировать сферу жизни';

type Props = { userId: string };

export function AreaSettings({ userId }: Props) {
  const db = usePowerSync() as CommonPowerSyncDatabase | null;
  const { areas } = useAreas(userId);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_NEW_COLOR);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) {
      setError(SAVE_ERROR_MESSAGE);
      return;
    }

    try {
      await createArea(db, { userId, name: newName, color: newColor });
      setNewName('');
      setNewColor(DEFAULT_NEW_COLOR);
      setError(null);
    } catch {
      setError(SAVE_ERROR_MESSAGE);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    if (!db) {
      setError(REORDER_ERROR_MESSAGE);
      return;
    }
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= areas.length) return;

    const orderedIds = areas.map((area) => area.id);
    const [movedId] = orderedIds.splice(index, 1);
    orderedIds.splice(targetIndex, 0, movedId);
    try {
      await reorderAreas(db, orderedIds);
      setError(null);
    } catch {
      // `reorderAreas` re-reads `areas` (the watched, persisted list) on
      // every render, so a failed/partial reorder is reflected as-is - no
      // optimistic order to roll back here.
      setError(REORDER_ERROR_MESSAGE);
    }
  }

  async function handleRename(area: Area, name: string) {
    if (!db) {
      setError(SAVE_ERROR_MESSAGE);
      return;
    }
    const trimmed = name.trim();
    if (!trimmed || trimmed === area.name) return;
    try {
      await updateArea(db, area.id, { name: trimmed });
      setError(null);
    } catch {
      setError(SAVE_ERROR_MESSAGE);
    }
  }

  async function handleRecolor(area: Area, color: string) {
    if (!db) {
      setError(SAVE_ERROR_MESSAGE);
      return;
    }
    if (color === area.color || !HEX_COLOR_PATTERN.test(color)) return;
    try {
      await updateArea(db, area.id, { color });
      setError(null);
    } catch {
      setError(SAVE_ERROR_MESSAGE);
    }
  }

  async function handleArchive(area: Area) {
    if (!db) {
      setError(ARCHIVE_ERROR_MESSAGE);
      return;
    }
    try {
      await setAreaArchived(db, area.id, true);
      setError(null);
    } catch {
      setError(ARCHIVE_ERROR_MESSAGE);
    }
  }

  return (
    <section aria-label="Сферы жизни" className="space-y-4">
      <h2 className="text-lg font-semibold">Сферы жизни</h2>

      <ul className="space-y-2">
        {areas.map((area, index) => (
          <AreaRow
            key={area.id}
            area={area}
            canMoveUp={index > 0}
            canMoveDown={index < areas.length - 1}
            onMoveUp={() => handleMove(index, -1)}
            onMoveDown={() => handleMove(index, 1)}
            onRename={(name) => handleRename(area, name)}
            onRecolor={(color) => handleRecolor(area, color)}
            onArchive={() => handleArchive(area)}
          />
        ))}
      </ul>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
        <label className="block min-w-0 flex-1 basis-40">
          <span className="text-sm font-medium">Название</span>
          <input
            aria-label="Название сферы"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="mt-1 block min-h-11 w-full rounded-md border px-3 py-2 text-base"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Цвет</span>
          <input
            type="color"
            aria-label="Цвет сферы"
            value={newColor}
            onChange={(event) => setNewColor(event.target.value)}
            className="mt-1 block h-11 w-11 rounded-md border p-1"
          />
        </label>
        <button type="submit" className="min-h-11 rounded-md border px-4 py-2 text-sm font-medium">
          Добавить сферу
        </button>
      </form>

      {error && <p role="alert">{error}</p>}
    </section>
  );
}

type AreaRowProps = {
  area: Area;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onArchive: () => void;
};

function AreaRow({
  area,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRename,
  onRecolor,
  onArchive,
}: AreaRowProps) {
  // Local drafts let typing/blur-to-commit behave normally without the
  // reactive `useAreas` query (which re-renders on every table write)
  // clobbering an in-progress edit. `prevName`/`prevColor` let us resync a
  // draft whenever the *persisted* value changes (e.g. after the commit
  // below lands, or an edit made elsewhere) using React's "adjust state
  // during render" pattern - deliberately not a `useEffect`, which would
  // call setState a render late and cascade an extra render per keystroke's
  // eventual commit.
  const [nameDraft, setNameDraft] = useState(area.name);
  const [hexDraft, setHexDraft] = useState(area.color);
  // The color wheel input needs its own draft (rather than reusing
  // `hexDraft`) because it must stay a well-formed `#rrggbb` value on every
  // keystroke-equivalent (drag tick) for the native picker to keep working,
  // whereas `hexDraft` is free-typed text that's only validated on commit.
  const [colorDraft, setColorDraft] = useState(area.color);
  const [prevName, setPrevName] = useState(area.name);
  const [prevColor, setPrevColor] = useState(area.color);

  if (area.name !== prevName) {
    setPrevName(area.name);
    setNameDraft(area.name);
  }
  if (area.color !== prevColor) {
    setPrevColor(area.color);
    setHexDraft(area.color);
    setColorDraft(area.color);
  }

  return (
    <li className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0">
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: area.color }}
      />
      <input
        aria-label={`Название: ${area.name}`}
        value={nameDraft}
        onChange={(event) => setNameDraft(event.target.value)}
        onBlur={() => onRename(nameDraft)}
        className="min-h-11 min-w-0 flex-1 basis-32 rounded-md border px-2 text-base"
      />
      <input
        type="color"
        aria-label={`Цвет: ${area.name}`}
        value={colorDraft}
        // Dragging the native color wheel fires `input`/`change` once per
        // drag tick (React's `onChange` is wired to the `input` event), so
        // committing here would write to the local DB - and queue a
        // PowerSync upload - on every tick. Only track the draft locally and
        // commit once the drag ends (blur, or the pointer releasing over the
        // swatch), mirroring the hex-text input below.
        onChange={(event) => setColorDraft(event.target.value)}
        onBlur={() => onRecolor(colorDraft)}
        onPointerUp={() => onRecolor(colorDraft)}
        className="h-11 w-11 shrink-0 rounded-md border p-1"
      />
      <input
        aria-label={`Hex: ${area.name}`}
        value={hexDraft}
        onChange={(event) => setHexDraft(event.target.value)}
        onBlur={() => onRecolor(hexDraft)}
        className="min-h-11 w-24 shrink-0 rounded-md border px-2 text-base"
      />
      <button
        type="button"
        aria-label={`Переместить вверх: ${area.name}`}
        onClick={onMoveUp}
        disabled={!canMoveUp}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border disabled:opacity-40"
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Переместить вниз: ${area.name}`}
        onClick={onMoveDown}
        disabled={!canMoveDown}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border disabled:opacity-40"
      >
        ↓
      </button>
      <button
        type="button"
        aria-label={`Архивировать: ${area.name}`}
        onClick={onArchive}
        className="min-h-11 shrink-0 rounded-md border px-3 text-sm font-medium"
      >
        Архивировать
      </button>
    </li>
  );
}
