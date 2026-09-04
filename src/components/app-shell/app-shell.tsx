'use client';

import { useState } from 'react';
import { usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { AreaSettings } from '@/features/areas/area-settings';
import { BacklogPanel } from '@/features/tasks/backlog-panel';
import { scheduleFromBacklogById, unscheduleTaskById, moveScheduledTaskById } from '@/features/tasks/scheduling';
import { CalendarBoard } from '@/features/calendar/calendar-board';
import { PlannerDndContext } from '@/features/calendar/planner-dnd-context';
import { SyncStatusIndicator } from '@/components/sync/sync-status';

type Props = { userId: string };

// The desktop shell: three-column layout (backlog / calendar / habits).
// Slice B fills in the center calendar column; the right (habits) column
// remains an explicit placeholder until Slice C implements it.
//
// Backlog and the calendar are dragged between here (`PlannerDndContext`
// wraps both), not inside either feature's own component - dnd-kit only
// correlates a drag's `active`/`over` state within one shared `DndContext`
// instance, and these two panels are siblings in this grid.
export function AppShell({ userId }: Props) {
  const [isAreaSettingsOpen, setIsAreaSettingsOpen] = useState(false);
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
            <section className="overflow-y-auto border-r p-4">
              <BacklogPanel userId={userId} />
            </section>
            <section className="min-w-0 overflow-hidden p-4">
              <CalendarBoard userId={userId} />
            </section>
            <section className="flex items-center justify-center border-l p-4 text-center text-muted-foreground">
              Привычки появятся позже
            </section>
          </div>
        </PlannerDndContext>
      )}
    </div>
  );
}
