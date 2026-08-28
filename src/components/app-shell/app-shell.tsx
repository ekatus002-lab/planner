'use client';

import { useState } from 'react';
import { AreaSettings } from '@/features/areas/area-settings';
import { BacklogPanel } from '@/features/tasks/backlog-panel';

type Props = { userId: string };

// The Slice A desktop shell: locks in the eventual three-column proportions
// (backlog / calendar / habits) without building the calendar or habits
// features themselves - center and right stay explicit placeholders until
// later slices implement them.
export function AppShell({ userId }: Props) {
  const [isAreaSettingsOpen, setIsAreaSettingsOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b p-4">
        <h1 className="text-lg font-semibold">Мой планер</h1>
        <button type="button" onClick={() => setIsAreaSettingsOpen((open) => !open)}>
          {isAreaSettingsOpen ? 'Назад к планеру' : 'Сферы жизни'}
        </button>
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
          <section className="flex items-center justify-center border-l p-4 text-center text-muted-foreground">
            Привычки появятся позже
          </section>
        </div>
      )}
    </div>
  );
}
