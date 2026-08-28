'use client';

import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { mapAreaRow, type AreaRow } from './area-repository';
import type { Area } from './area-types';

// Mirrors `listAreas` in `area-repository.ts`, but as a *watched* query:
// re-runs (and re-emits) whenever a write touches the `areas` table, giving
// callers a live, non-archived, sort_order-ordered list instead of a
// one-off snapshot.
const AREAS_QUERY = `SELECT id, user_id, name, color, sort_order, archived, created_at, updated_at
  FROM areas
  WHERE user_id = ? AND archived = 0
  ORDER BY sort_order ASC, name ASC`;

export type UseAreasResult = {
  areas: Area[];
  isLoading: boolean;
};

export function useAreas(userId: string): UseAreasResult {
  const { data, isLoading } = useQuery<AreaRow>(AREAS_QUERY, [userId]);
  const areas = useMemo(() => data.map(mapAreaRow), [data]);

  return { areas, isLoading };
}
