import type { CommonPowerSyncDatabase } from '@powersync/web';
import type { Area } from './area-types';

// Column names mirror the local SQLite `areas` table (and, in turn,
// `supabase/migrations/202608270001_foundation.sql`) exactly.
type AreaRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
  archived: number;
  created_at: string;
  updated_at: string;
};

// Single private mapper used by every area query - converts SQLite's
// integer boolean representation to a real TypeScript boolean.
function mapAreaRow(row: AreaRow): Area {
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
