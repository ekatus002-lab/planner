'use client';

import { useState } from 'react';
import { AreaSettings } from '@/features/areas/area-settings';
import { BacklogPanel } from '@/features/tasks/backlog-panel';
import { CalendarBoard } from '@/features/calendar/calendar-board';
import { SyncStatusIndicator } from '@/components/sync/sync-status';

type Props = { userId: string };

// The desktop shell: three-column layout (backlog / calendar / habits).
// Slice B fills in the center calendar column; the right (habits) column
// remains an explicit placeholder until Slice C implements it.
export function AppShell({ userId }: Props) {
  const [isAreaSettingsOpen, setIsAreaSettingsOpen] = useState(false);

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
          <section className="min-w-0 overflow-hidden p-4">
            <CalendarBoard userId={userId} />
          </section>
          <section className="flex items-center justify-center border-l p-4 text-center text-muted-foreground">
            Привычки появятся позже
          </section>
        </div>
      )}
    </div>
  );
}
