'use client';

import { useState } from 'react';
import { AreaSettings } from '@/features/areas/area-settings';
import { BacklogPanel } from '@/features/tasks/backlog-panel';
import { HabitsPanel } from '@/features/habits/habits-panel';
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

// The Slice A/C desktop shell: locks in the eventual three-column
// proportions (backlog+goals / calendar / habits). The center calendar
// column stays an explicit placeholder until Slice B implements it.
export function AppShell({ userId }: Props) {
  const [isAreaSettingsOpen, setIsAreaSettingsOpen] = useState(false);
  const [today] = useState(todayLocalDate);

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
        <div className="grid flex-1 grid-cols-[320px_1fr_280px] overflow-hidden">
          <section className="overflow-y-auto border-r p-4">
            <BacklogPanel userId={userId} />
          </section>
          <section className="flex items-center justify-center p-4 text-center text-muted-foreground">
            Календарь появится на следующем этапе
          </section>
          <section className="overflow-y-auto border-l p-4">
            <HabitsPanel userId={userId} today={today} />
          </section>
        </div>
      )}
    </div>
  );
}
