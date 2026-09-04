'use client';

import { useState, type ComponentType } from 'react';
import { usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { CalendarDays, ListTodo, Repeat } from 'lucide-react';
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

// The three sections of the app. "Задачи" holds Backlog and Goals (per the
// design spec, both live in the left column); "Календарь" and "Привычки" are
// the center and right columns.
type MobileTab = 'tasks' | 'calendar' | 'habits';

const MOBILE_TABS: ReadonlyArray<{ id: MobileTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'tasks', label: 'Задачи', icon: ListTodo },
  { id: 'calendar', label: 'Календарь', icon: CalendarDays },
  { id: 'habits', label: 'Привычки', icon: Repeat },
];

// The desktop shell: three-column layout (backlog+goals / calendar / habits).
//
// Backlog and the calendar are dragged between here (`PlannerDndContext`
// wraps both), not inside either feature's own component - dnd-kit only
// correlates a drag's `active`/`over` state within one shared `DndContext`
// instance, and these two panels are siblings in this grid.
//
// Below Tailwind's `md` breakpoint this collapses to a single full-width
// section plus a bottom tab bar (one of the three sections visible at a
// time, chosen by `activeMobileTab`); at `md` and above all three render
// side-by-side exactly as before, ignoring `activeMobileTab` entirely. Each
// section is a single DOM node either way - the breakpoint switch is pure
// CSS (`hidden` / `md:block`), never a duplicated component tree, so there
// is only ever one live `BacklogPanel`/`CalendarBoard`/`HabitsPanel` instance.
//
// The tab bar itself is a normal (non-`position:fixed`) flex child pinned to
// the bottom of the `h-screen` column, with `shrink-0` so the content grid
// above it (`flex-1 overflow-hidden`, each section scrolling internally)
// never grows underneath it. This deliberately avoids `position:fixed`,
// which on iOS Safari fights the dynamic address-bar/toolbar's effect on
// viewport height; being a real flow participant means it's never covered
// by content and never needs bottom padding on the sections to compensate.
export function AppShell({ userId }: Props) {
  const [isAreaSettingsOpen, setIsAreaSettingsOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('tasks');
  const [today] = useState(todayLocalDate);
  const db = usePowerSync() as CommonPowerSyncDatabase | null;

  // Returns the complete display-related class list for a section: visible
  // ("block") vs hidden never overlap without a responsive prefix
  // distinguishing them, so there's no same-specificity cascade-order
  // ambiguity between Tailwind's unprefixed utilities.
  function sectionClassName(tab: MobileTab) {
    if (activeMobileTab === tab) return 'block';
    return 'hidden md:block';
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-2 border-b p-3 sm:p-4">
        <h1 className="truncate text-base font-semibold sm:text-lg">Мой планер</h1>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <SyncStatusIndicator />
          <button
            type="button"
            onClick={() => setIsAreaSettingsOpen((open) => !open)}
            className="min-h-11 shrink-0 rounded-md border px-3 text-sm font-medium whitespace-nowrap"
          >
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
          <div className="grid flex-1 overflow-hidden md:grid-cols-[320px_1fr_280px]">
            <section className={`${sectionClassName('tasks')} space-y-6 overflow-y-auto border-r p-4`}>
              <BacklogPanel userId={userId} />
              <GoalsPanel userId={userId} today={today} />
            </section>
            <section className={`${sectionClassName('calendar')} min-w-0 overflow-hidden p-4`}>
              <CalendarBoard userId={userId} />
            </section>
            <section className={`${sectionClassName('habits')} overflow-y-auto border-l p-4`}>
              <HabitsPanel userId={userId} today={today} />
            </section>
          </div>

          <nav
            aria-label="Основная навигация"
            className="flex shrink-0 border-t bg-background md:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {MOBILE_TABS.map(({ id, label, icon: Icon }) => {
              const isActive = activeMobileTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setActiveMobileTab(id)}
                  className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                    isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="size-5" />
                  {label}
                </button>
              );
            })}
          </nav>
        </PlannerDndContext>
      )}
    </div>
  );
}
