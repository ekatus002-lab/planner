import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { createArea, listAreas, updateArea } from './area-repository';

type SeedAreaOverrides = Partial<{
  id: string;
  userId: string;
  name: string;
  color: string;
  sortOrder: number;
  archived: number;
}>;

async function seedArea(db: TestDatabase, overrides: SeedAreaOverrides = {}) {
  const area = {
    id: overrides.id ?? randomUUID(),
    userId: overrides.userId ?? 'user-1',
    name: overrides.name ?? 'Area',
    color: overrides.color ?? '#EC8FB6',
    sortOrder: overrides.sortOrder ?? 0,
    archived: overrides.archived ?? 0,
  };
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO areas (id, user_id, name, color, sort_order, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [area.id, area.userId, area.name, area.color, area.sortOrder, area.archived, now, now],
  );
  return area;
}

describe('area-repository', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  it('lists non-archived areas for the user ordered by sort_order', async () => {
    await seedArea(db, { id: 'a', name: 'Career', sortOrder: 20 });
    await seedArea(db, { id: 'b', name: 'Health', sortOrder: 10 });
    await seedArea(db, { id: 'c', name: 'Archived', sortOrder: 5, archived: 1 });
    await seedArea(db, { id: 'd', userId: 'user-2', name: 'Other user' });

    const areas = await listAreas(db, 'user-1');

    expect(areas.map((a) => a.name)).toEqual(['Health', 'Career']);
    expect(areas.every((a) => a.userId === 'user-1')).toBe(true);
    expect(areas.every((a) => a.archived === false)).toBe(true);
  });

  it('maps color, sortOrder, and timestamps as plain typed fields', async () => {
    await seedArea(db, { id: 'a', name: 'Career', color: '#112233', sortOrder: 30 });

    const [area] = await listAreas(db, 'user-1');

    expect(area.color).toBe('#112233');
    expect(area.sortOrder).toBe(30);
    expect(typeof area.createdAt).toBe('string');
    expect(typeof area.updatedAt).toBe('string');
  });

  it('returns an empty list when the user has no areas', async () => {
    await seedArea(db, { userId: 'user-2' });

    expect(await listAreas(db, 'user-1')).toEqual([]);
  });

  describe('createArea uniqueness guard', () => {
    // Postgres enforces this with a unique index
    // (`areas_user_name_active_idx` on `user_id, lower(name) where archived
    // = 0`), but that index is server-only: without a matching local check,
    // a duplicate name would write locally, then fail forever once
    // `uploadData` tried to sync it. Guarding here keeps the failure
    // immediate and user-visible instead of a wedged upload queue.
    it('rejects a name that collides case-insensitively with an existing non-archived area', async () => {
      await seedArea(db, { name: 'Творчество' });

      await expect(
        createArea(db, { userId: 'user-1', name: 'ТВОРЧЕСТВО', color: '#112233' }),
      ).rejects.toThrow(/already exists/i);
    });

    it('allows the same name for a different user', async () => {
      await seedArea(db, { userId: 'user-1', name: 'Творчество' });

      await expect(
        createArea(db, { userId: 'user-2', name: 'Творчество', color: '#112233' }),
      ).resolves.toMatchObject({ name: 'Творчество' });
    });

    it('allows a name that only collides with an archived area', async () => {
      await seedArea(db, { name: 'Творчество', archived: 1 });

      await expect(
        createArea(db, { userId: 'user-1', name: 'Творчество', color: '#112233' }),
      ).resolves.toMatchObject({ name: 'Творчество' });
    });
  });

  describe('updateArea rename uniqueness guard', () => {
    it('rejects renaming to a name that collides case-insensitively with another non-archived area', async () => {
      await seedArea(db, { id: 'a', name: 'Карьера' });
      await seedArea(db, { id: 'b', name: 'Учёба' });

      await expect(updateArea(db, 'b', { name: 'КАРЬЕРА' })).rejects.toThrow(/already exists/i);
    });

    it('allows renaming an area to keep its own current name', async () => {
      await seedArea(db, { id: 'a', name: 'Карьера' });

      await expect(updateArea(db, 'a', { name: 'Карьера' })).resolves.toBeUndefined();
    });

    it('allows renaming to a name that only collides with an archived area', async () => {
      await seedArea(db, { id: 'a', name: 'Творчество', archived: 1 });
      await seedArea(db, { id: 'b', name: 'Учёба' });

      await expect(updateArea(db, 'b', { name: 'Творчество' })).resolves.toBeUndefined();
    });
  });
});
