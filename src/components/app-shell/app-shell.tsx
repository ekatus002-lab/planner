'use client';

import { useState } from 'react';
import { usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { AreaSettings } from '@/features/areas/area-settings';
import { BacklogPanel } from '@/features/tasks/backlog-panel';
import { scheduleFromBacklogById, unscheduleTaskById, moveScheduledTaskById } from '@/features/tasks/scheduling';
import { CalendarBoard } from '@/features/calendar/calendar-board';
import { PlannerDndContext } from '@/features/calendar/planner-dnd-context';
import { HabitsPanel } from '@/features/habits/habits-panel';
import { GoalsPanel } from '@/features/goals/goals-panel';
import { SyncStatusIndicator } from '@/components/sync/sync-status';

type Props = { userId: string };

// Local calendar "today" as a `YYYY-MM-DD` string - deliberately built from
// `Date`'s local-timezone getters (not `toISOString`, which is UTC), since
// habit scheduling/streaks are about the day the *device* is currently on,
// matching `isHabitScheduledOn`'s local-calendar-date semantics.
function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// The desktop shell: three-column layout (backlog+goals / calendar / habits).
//
// Backlog and the calendar are dragged between here (`PlannerDndContext`
// wraps both), not inside either feature's own component - dnd-kit only
// correlates a drag's `active`/`over` state within one shared `DndContext`
// instance, and these two panels are siblings in this grid.
export function AppShell({ userId }: Props) {
  const [isAreaSettingsOpen, setIsAreaSettingsOpen] = useState(false);
  const [today] = useState(todayLocalDate);
  const db = usePowerSync() as CommonPowerSyncDatabase | null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b p-4">
        <h1 className="text-lg font-semibold">Мой планер</h1>
        <div className="flex items-center gap-4">
          <SyncStatusIndicator />
          <button type="button" onClick={() => setIsAreaSettingsOpen((open) => !open)}>
            {isAreaSettingsOpen ? 'Назад к планеру' : 'Сферы жизни'}
          </button>
        </div>
      </header>

      {isAreaSettingsOpen ? (
        <div className="flex-1 overflow-y-auto p-4">
          <AreaSettings userId={userId} />
        </div>
      ) : (
        <PlannerDndContext
          onScheduleFromBacklog={(taskId, slot) => {
            if (db) return scheduleFromBacklogById(db, taskId, slot);
          }}
          onUnschedule={(taskId) => {
            if (db) return unscheduleTaskById(db, taskId);
          }}
          onMoveScheduledTask={(taskId, startAt, endAt) => {
            if (db) return moveScheduledTaskById(db, taskId, startAt, endAt);
          }}
        >
          <div className="grid flex-1 grid-cols-[320px_1fr_280px] overflow-hidden">
            <section className="space-y-6 overflow-y-auto border-r p-4">
              <BacklogPanel userId={userId} />
              <GoalsPanel userId={userId} today={today} />
            </section>
            <section className="min-w-0 overflow-hidden p-4">
              <CalendarBoard userId={userId} />
            </section>
            <section className="overflow-y-auto border-l p-4">
              <HabitsPanel userId={userId} today={today} />
            </section>
          </div>
        </PlannerDndContext>
      )}
    </div>
  );
}
