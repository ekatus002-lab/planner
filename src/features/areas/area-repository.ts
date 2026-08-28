import type { CommonPowerSyncDatabase } from '@powersync/web';
import type { Area } from './area-types';

// Column names mirror the local SQLite `areas` table (and, in turn,
// `supabase/migrations/202608270001_foundation.sql`) exactly. Exported so
// `use-areas.ts` can type the raw rows returned by its watched query without
// redeclaring the shape.
export type AreaRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
  archived: number;
  created_at: string;
  updated_at: string;
};

// Hex color validation shared by create/update - matches the brief's
// `^#[0-9A-Fa-f]{6}$` requirement.
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// Single mapper used by every area query - converts SQLite's integer boolean
// representation to a real TypeScript boolean. Exported so `use-areas.ts`
// (Task 6's reactive hook) maps rows identically to the one-off queries
// below, instead of maintaining a second mapping.
export function mapAreaRow(row: AreaRow): Area {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Lists the user's non-archived areas, ordered for stable display in
// selectors (matches the ordering `useAreas` will watch in Task 6).
export async function listAreas(db: CommonPowerSyncDatabase, userId: string): Promise<Area[]> {
  const rows = await db.getAll<AreaRow>(
    `SELECT id, user_id, name, color, sort_order, archived, created_at, updated_at
     FROM areas
     WHERE user_id = ? AND archived = 0
     ORDER BY sort_order ASC, name ASC`,
    [userId],
  );

  return rows.map(mapAreaRow);
}

export type CreateAreaInput = {
  userId: string;
  name: string;
  color: string;
  // Defaults to the current max sort_order (among non-archived areas) plus
  // 10, matching the increment-of-10 spacing the default seed data uses.
  sortOrder?: number;
};

export type UpdateAreaInput = Partial<{
  name: string;
  color: string;
}>;

async function nextSortOrder(db: CommonPowerSyncDatabase, userId: string): Promise<number> {
  const row = await db.getOptional<{ max_sort_order: number | null }>(
    'SELECT MAX(sort_order) as max_sort_order FROM areas WHERE user_id = ? AND archived = 0',
    [userId],
  );
  return (row?.max_sort_order ?? 0) + 10;
}

// Creates a new, non-archived life area. New-task selectors (`useAreas`)
// pick this up immediately since it watches the same `archived = 0` query.
export async function createArea(db: CommonPowerSyncDatabase, input: CreateAreaInput): Promise<Area> {
  const name = input.name.trim();
  if (!name) throw new Error('Area name is required');
  if (!HEX_COLOR_PATTERN.test(input.color)) {
    throw new Error('Area color must be a 6-digit hex value (e.g. #112233)');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const sortOrder = input.sortOrder ?? (await nextSortOrder(db, input.userId));

  await db.execute(
    `INSERT INTO areas (id, user_id, name, color, sort_order, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, input.userId, name, input.color, sortOrder, now, now],
  );

  return {
    id,
    userId: input.userId,
    name,
    color: input.color,
    sortOrder,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

// Renames and/or recolors an area in place. Never touches `sort_order` or
// `archived` - those are mutated only via `reorderAreas`/`setAreaArchived`
// so each concern stays independently testable.
export async function updateArea(db: CommonPowerSyncDatabase, id: string, patch: UpdateAreaInput): Promise<void> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('Area name is required');
    assignments.push('name = ?');
    values.push(name);
  }
  if (patch.color !== undefined) {
    if (!HEX_COLOR_PATTERN.test(patch.color)) {
      throw new Error('Area color must be a 6-digit hex value (e.g. #112233)');
    }
    assignments.push('color = ?');
    values.push(patch.color);
  }

  if (assignments.length === 0) {
    return;
  }

  assignments.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  await db.execute(`UPDATE areas SET ${assignments.join(', ')} WHERE id = ?`, values);
}

// Archives (or unarchives) an area without deleting the row or rewriting any
// task that references it: `area_id` on historical tasks is left untouched,
// so those tasks keep rendering the archived area's name/color, while
// `listAreas`/`useAreas` (both filtered to `archived = 0`) stop offering it
// as a selector for new tasks.
export async function setAreaArchived(db: CommonPowerSyncDatabase, id: string, archived: boolean): Promise<void> {
  await db.execute('UPDATE areas SET archived = ?, updated_at = ? WHERE id = ?', [
    archived ? 1 : 0,
    new Date().toISOString(),
    id,
  ]);
}

// Persists a new relative order for the given area ids, assigning
// sequential `sort_order` values in increments of 10 - the same spacing the
// default seed data uses (10, 20, 30, ...), leaving room for future
// insertions without a full renumber.
export async function reorderAreas(db: CommonPowerSyncDatabase, orderedIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  for (let index = 0; index < orderedIds.length; index += 1) {
    await db.execute('UPDATE areas SET sort_order = ?, updated_at = ? WHERE id = ?', [
      (index + 1) * 10,
      now,
      orderedIds[index],
    ]);
  }
}
