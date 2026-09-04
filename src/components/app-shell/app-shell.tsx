'use client';

import { useState, type ComponentType } from 'react';
import { CalendarDays, ListTodo, Repeat } from 'lucide-react';
import { AreaSettings } from '@/features/areas/area-settings';
import { BacklogPanel } from '@/features/tasks/backlog-panel';
import { SyncStatusIndicator } from '@/components/sync/sync-status';

type Props = { userId: string };

// The three sections that exist today. Calendar and Habits are still
// placeholders (built in parallel slices); "Задачи" is also where Goals
// will eventually live alongside Backlog, so its section is a plain
// scrollable container rather than something that assumes it only ever
// holds one child.
type MobileTab = 'tasks' | 'calendar' | 'habits';

const MOBILE_TABS: ReadonlyArray<{ id: MobileTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'tasks', label: 'Задачи', icon: ListTodo },
  { id: 'calendar', label: 'Календарь', icon: CalendarDays },
  { id: 'habits', label: 'Привычки', icon: Repeat },
];

// The Slice A desktop shell locked in the eventual three-column proportions
// (backlog / calendar / habits) without building the calendar or habits
// features themselves - center and right stay explicit placeholders until
// later slices implement them.
//
// Below Tailwind's `md` breakpoint this collapses to a single full-width
// section plus a fixed bottom tab bar (one of the three sections visible at
// a time, chosen by `activeMobileTab`); at `md` and above all three render
// side-by-side exactly as before, ignoring `activeMobileTab` entirely. Each
// section is a single DOM node either way - the breakpoint switch is pure
// CSS (`hidden` / `md:block`), never a duplicated component tree, so there
// is only ever one live `BacklogPanel` instance.
export function AppShell({ userId }: Props) {
  const [isAreaSettingsOpen, setIsAreaSettingsOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('tasks');

  // Returns the *complete* display-related class list for a section: which
  // classes actually get generated for "visible" (`flex`/`block`) vs
  // "hidden" never overlap without a responsive prefix distinguishing them,
  // so there's no same-specificity `hidden`-vs-`flex` cascade-order
  // ambiguity between Tailwind's unprefixed utilities.
  function sectionClassName(tab: MobileTab, display: 'block' | 'flex-center') {
    const visibleClasses = display === 'flex-center' ? 'flex items-center justify-center' : 'block';
    if (activeMobileTab === tab) return visibleClasses;

    const mdVisibleClasses =
      display === 'flex-center' ? 'md:flex md:items-center md:justify-center' : 'md:block';
    return `hidden ${mdVisibleClasses}`;
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
        <>
          <div className="grid flex-1 overflow-hidden md:grid-cols-[320px_1fr_280px]">
            <section
              className={`${sectionClassName('tasks', 'block')} overflow-y-auto border-r p-4 pb-20 md:pb-4`}
            >
              <BacklogPanel userId={userId} />
            </section>
            <section
              className={`${sectionClassName('calendar', 'flex-center')} overflow-y-auto p-4 pb-20 text-center text-muted-foreground md:pb-4`}
            >
              Календарь появится на следующем этапе
            </section>
            <section
              className={`${sectionClassName('habits', 'block')} overflow-y-auto border-l p-4 pb-20 text-center text-muted-foreground md:pb-4`}
            >
              Привычки появятся позже
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
        </>
      )}
    </div>
  );
}
