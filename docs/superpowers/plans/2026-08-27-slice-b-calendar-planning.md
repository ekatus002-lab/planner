# Slice B — Calendar Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn unified task records into a Google-Calendar-like Month/Week/Day planning experience with all-day tasks, day-only tasks, backlog-to-calendar drag/drop, calendar rescheduling, duration resize, and a selected-day task list.

**Architecture:** The calendar is a projection of `tasks`; no separate event table is introduced. UI gestures call scheduling functions in the task repository, which update the same local SQLite row and let PowerSync propagate it. `react-big-calendar` handles time-grid/month rendering and event drag/resize; `dnd-kit` handles external backlog drag state.

**Tech Stack:** Existing Slice A stack plus `react-big-calendar`, `@types/react-big-calendar`, `dnd-kit`, and `date-fns`.

**Spec:** `docs/superpowers/specs/2026-08-27-personal-planner-design.md`

## Global Constraints

- Any local SQLite write failure must surface a blocking action error without pretending success; network/sync failures keep local state and remain non-blocking.
- Slice A exit gate must be green before this plan starts.
- Calendar data comes only from local `tasks`; never duplicate tasks into an `events` table.
- Life-area color remains the single source for event color.
- `scheduled_date` is the authoritative day for date-only/all-day tasks; `start_at`/`end_at` are authoritative for timed tasks.
- Moving a scheduled task to a different calendar date increments `reschedule_count` by exactly one; moving it within the same date changes time but does not increment the counter.
- Dragging a scheduled task back to Backlog clears `scheduled_date`, `start_at`, `end_at`, and `all_day` without marking it complete.
- A timed event must always have both `start_at` and `end_at`, with `end_at > start_at`.
- No recurring tasks in Slice B.

---

## File Structure Locked by This Slice

```text
src/features/calendar/
├── calendar-adapter.ts
├── calendar-board.tsx
├── calendar-event.tsx
├── calendar-types.ts
├── date-navigation.tsx
├── selected-day-list.tsx
└── use-calendar-tasks.ts
src/features/tasks/
├── backlog-panel.tsx
├── scheduling.ts
└── task-repository.ts
src/components/app-shell/app-shell.tsx
tests/e2e/calendar-planning.spec.ts
```

---

### Task 1: Add explicit task scheduling domain operations

**Files:**
- Create: `src/features/tasks/scheduling.ts`
- Modify: `src/features/tasks/task-repository.ts`
- Test: `src/features/tasks/scheduling.test.ts`

**Interfaces:**
- Consumes: `Task`, database, ISO timestamps/date strings.
- Produces:
  - `scheduleTimedTask(db, task, startAt, endAt): Promise<void>`
  - `scheduleAllDayTask(db, task, date): Promise<void>`
  - `scheduleDateOnlyTask(db, task, date): Promise<void>`
  - `unscheduleTask(db, task): Promise<void>`
  - `moveTimedTask(db, task, startAt, endAt): Promise<void>`
  - `resizeTimedTask(db, task, startAt, endAt): Promise<void>`

- [ ] **Step 1: Write failing scheduling tests**

```ts
it('increments reschedule count only when the calendar day changes', async () => {
  const task = seedTimedTask({ startAt: '2026-08-27T09:00:00.000Z', rescheduleCount: 2 });
  await moveTimedTask(db, task, '2026-08-27T11:00:00.000Z', '2026-08-27T12:00:00.000Z');
  expect((await getTask(db, task.id))?.rescheduleCount).toBe(2);

  const moved = (await getTask(db, task.id))!;
  await moveTimedTask(db, moved, '2026-08-28T11:00:00.000Z', '2026-08-28T12:00:00.000Z');
  expect((await getTask(db, task.id))?.rescheduleCount).toBe(3);
});

it('unschedules a task without completing it', async () => {
  const task = seedTimedTask({ status: 'open' });
  await unscheduleTask(db, task);
  const saved = await getTask(db, task.id);
  expect(saved?.scheduledDate).toBeNull();
  expect(saved?.startAt).toBeNull();
  expect(saved?.endAt).toBeNull();
  expect(saved?.status).toBe('open');
});
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
pnpm test -- src/features/tasks/scheduling.test.ts
```

Expected: FAIL because scheduling functions do not exist.

- [ ] **Step 3: Implement scheduling operations as atomic local SQL updates**

For timed scheduling, calculate `scheduled_date` from the local calendar date chosen by the user and persist the UTC instant separately:

```ts
await db.execute(
  `UPDATE tasks SET scheduled_date = ?, start_at = ?, end_at = ?, all_day = 0,
   reschedule_count = ?, updated_at = ? WHERE id = ?`,
  [dateKey, startAt, endAt, nextRescheduleCount, now, task.id],
);
```

For all-day:

```ts
scheduled_date = date
start_at = null
end_at = null
all_day = 1
```

For day-only:

```ts
scheduled_date = date
start_at = null
end_at = null
all_day = 0
```

- [ ] **Step 4: Run tests**

```bash
pnpm test -- src/features/tasks/scheduling.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit domain scheduling**

```bash
git add src/features/tasks
 git commit -m "feat: add unified task scheduling operations"
```

---

### Task 2: Build the calendar projection adapter and watched range query

**Files:**
- Create: `src/features/calendar/calendar-types.ts`
- Create: `src/features/calendar/calendar-adapter.ts`
- Create: `src/features/calendar/use-calendar-tasks.ts`
- Test: `src/features/calendar/calendar-adapter.test.ts`

**Interfaces:**
- Consumes: `Task` and `Area`.
- Produces `PlannerCalendarEvent`:

```ts
export type PlannerCalendarEvent = {
  id: string;
  taskId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  areaColor: string;
  task: Task;
};
```

- [ ] **Step 1: Write failing adapter tests for timed and all-day tasks**

```ts
expect(taskToCalendarEvent(timedTask, area)?.start.toISOString()).toBe(timedTask.startAt);
expect(taskToCalendarEvent(allDayTask, area)?.allDay).toBe(true);
expect(taskToCalendarEvent(backlogTask, area)).toBeNull();
```

- [ ] **Step 2: Verify failure**

```bash
pnpm test -- src/features/calendar/calendar-adapter.test.ts
```

- [ ] **Step 3: Implement the adapter**

Rules:

```text
backlog task -> null
completed task -> still visible if its date is within selected range, but visually completed
start_at/end_at -> timed event
scheduled_date + all_day=1 -> all-day event spanning that local day
scheduled_date + all_day=0 + no times -> rendered in all-day row with a "day task" visual marker, because time grid has no time to place it
```

Use a `dateOnlyToLocalRange(dateKey)` helper based on `date-fns` to avoid treating date-only values as UTC midnight.

- [ ] **Step 4: Implement watched range query**

`useCalendarTasks(userId, visibleStart, visibleEnd)` watches local SQLite rows whose `scheduled_date` is within the requested local date range. Include open and completed tasks so checked tasks remain visible for historical review.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test -- src/features/calendar/calendar-adapter.test.ts
 git add src/features/calendar
 git commit -m "feat: project tasks into calendar events"
```

---

### Task 3: Render Month / Week / Day calendar views

**Files:**
- Create: `src/features/calendar/calendar-board.tsx`
- Create: `src/features/calendar/calendar-event.tsx`
- Create: `src/features/calendar/date-navigation.tsx`
- Modify: `src/components/app-shell/app-shell.tsx`
- Test: `src/features/calendar/calendar-board.test.tsx`

**Interfaces:**
- Consumes: `PlannerCalendarEvent[]`, selected date, view state.
- Produces a center-column calendar with `month | week | day`, date navigation, event colors, and selected-day callback.

- [ ] **Step 1: Install calendar dependencies**

```bash
pnpm add react-big-calendar date-fns
pnpm add -D @types/react-big-calendar
```

- [ ] **Step 2: Write failing view-switch test**

```tsx
render(<CalendarBoard userId="user-1" />);
await user.click(screen.getByRole('button', { name: 'Month' }));
expect(screen.getByTestId('planner-calendar')).toHaveAttribute('data-view', 'month');
await user.click(screen.getByRole('button', { name: 'Day' }));
expect(screen.getByTestId('planner-calendar')).toHaveAttribute('data-view', 'day');
```

- [ ] **Step 3: Verify failure**

```bash
pnpm test -- src/features/calendar/calendar-board.test.tsx
```

- [ ] **Step 4: Implement CalendarBoard**

Use `dateFnsLocalizer` with the app locale. Keep `view` and `date` controlled in React state. Provide custom event styling based on `event.areaColor`; completed events receive reduced opacity and a line-through title.

The toolbar must expose exact labels:

```text
Today
Month
Week
Day
```

- [ ] **Step 5: Open and edit a task from the calendar**

`onSelectEvent` opens the existing TaskForm populated from `event.task`. Extend the form with scheduling fields when invoked from calendar context: date, all-day toggle, start time, end time. Saving must call scheduling repository functions so edits preserve the unified task model and reschedule-count rules. Add a component test that clicking an event titled `Работа над проектом` opens the editor with its area and time prefilled.

- [ ] **Step 6: Replace the Slice A calendar placeholder in AppShell**

Desktop center becomes `CalendarBoard`. Mobile route wiring may remain minimal until Slice D; this task only ensures the responsive layout does not overflow at 390px width.

- [ ] **Step 7: Run tests, lint, build**

```bash
pnpm test -- src/features/calendar/calendar-board.test.tsx
pnpm lint
pnpm build
```

- [ ] **Step 8: Commit calendar views**

```bash
git add src/features/calendar src/components/app-shell
 git commit -m "feat: add month week and day calendar views"
```

---

### Task 4: Drag Backlog tasks into the calendar and scheduled tasks back to Backlog

**Files:**
- Modify: `src/features/tasks/backlog-panel.tsx`
- Modify: `src/features/calendar/calendar-board.tsx`
- Create: `src/features/calendar/planner-dnd-context.tsx`
- Test: `src/features/calendar/backlog-calendar-dnd.test.tsx`

**Interfaces:**
- Consumes: `scheduleTimedTask`, `scheduleDateOnlyTask`, `unscheduleTask`.
- Produces: external drag payload `{ type: 'task'; taskId: string }` shared by Backlog and Calendar, plus persisted Backlog ordering.

- [ ] **Step 1: Install dnd-kit**

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Write failing DnD integration test around the domain callbacks**

Rather than trying to emulate browser pointer geometry in jsdom, test that dropping a backlog task onto a calendar slot calls the scheduling boundary with the exact slot:

```tsx
expect(onSchedule).toHaveBeenCalledWith('task-1', {
  date: '2026-08-28',
  startAt: '2026-08-28T09:00:00.000Z',
  endAt: '2026-08-28T10:00:00.000Z',
});
```

Also test that dropping a scheduled task onto the Backlog drop zone calls `onUnschedule('task-1')`.

- [ ] **Step 3: Add sortable Backlog ordering**

Use `@dnd-kit/sortable` for reorder-only drags inside Backlog. Add `reorderBacklogTasks(db, orderedTaskIds)` to the task repository and persist `sort_order` as `10, 20, 30...` in one local transaction. This reorder must not set schedule fields or increment `reschedule_count`. Add a repository/component test proving the order survives reload.

- [ ] **Step 4: Implement `PlannerDndContext`**

It stores only drag identity; scheduling rules remain in task scheduling domain code. Backlog rows are draggable; Backlog panel also becomes a droppable target for scheduled task payloads.

- [ ] **Step 5: Wire React Big Calendar external drop**

On an external drop into a timed slot, use a default duration of `60 minutes`. On a drop into an all-day/month cell, create a date-only task unless the user explicitly chose all-day in task editor.

- [ ] **Step 6: Add visual drop feedback**

While dragging:

```text
Backlog -> calendar: highlight valid calendar cell
Scheduled task -> Backlog: show "Переместить в Backlog"
```

Do not persist any change until a valid drop completes.

- [ ] **Step 7: Run tests and commit**

```bash
pnpm test -- src/features/calendar/backlog-calendar-dnd.test.tsx
pnpm lint
 git add src/features
 git commit -m "feat: drag tasks between backlog and calendar"
```

---

### Task 5: Enable calendar event move and resize

**Files:**
- Modify: `src/features/calendar/calendar-board.tsx`
- Modify: `src/features/calendar/calendar-event.tsx`
- Test: `src/features/calendar/calendar-resize.test.tsx`

**Interfaces:**
- Consumes: `moveTimedTask`, `resizeTimedTask`, `scheduleAllDayTask`.
- Produces event drag and resize callbacks that persist directly to the unified task row.

- [ ] **Step 1: Write callback tests**

```tsx
await moveEvent({ event, start: new Date('2026-08-29T13:00:00Z'), end: new Date('2026-08-29T14:00:00Z'), isAllDay: false });
expect(moveTimedTask).toHaveBeenCalledWith(expect.anything(), event.task, '2026-08-29T13:00:00.000Z', '2026-08-29T14:00:00.000Z');

await resizeEvent({ event, start: event.start, end: new Date('2026-08-27T11:30:00Z') });
expect(resizeTimedTask).toHaveBeenCalled();
```

- [ ] **Step 2: Verify failure**

```bash
pnpm test -- src/features/calendar/calendar-resize.test.tsx
```

- [ ] **Step 3: Enable `withDragAndDrop` addon**

Configure `react-big-calendar` DnD addon with controlled `events`, `onEventDrop`, `onEventResize`, `resizable`, and `draggableAccessor` that returns false for completed tasks.

- [ ] **Step 4: Preserve task duration when dragging**

If a one-hour task is moved from 09:00 to 15:00, new `end_at` must be 16:00 unless the library supplies a new end. Do not silently reset duration.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test -- src/features/calendar/calendar-resize.test.tsx src/features/tasks/scheduling.test.ts
 git add src/features/calendar
 git commit -m "feat: move and resize scheduled tasks"
```

---

### Task 6: Add selected-day task list and calendar E2E workflow

**Files:**
- Create: `src/features/calendar/selected-day-list.tsx`
- Modify: `src/features/calendar/calendar-board.tsx`
- Create: `tests/e2e/calendar-planning.spec.ts`
- Test: `src/features/calendar/selected-day-list.test.tsx`

**Interfaces:**
- Consumes: selected local date and local task query.
- Produces the `Дела на день` panel with timed, all-day, and date-only tasks in one list.

- [ ] **Step 1: Write failing selected-day list test**

Seed three tasks on the same date: 09:00 timed, date-only, 18:00 timed. Assert order is:

```text
09:00 task
18:00 task
date-only task
```

All-day tasks render before timed tasks.

- [ ] **Step 2: Implement selected-day query and list**

Each row shows:

```text
checkbox | time/all-day marker | title | area dot | area name
```

Checking a task uses existing `setTaskCompleted` and updates both list and calendar reactively.

- [ ] **Step 3: Write E2E primary planning workflow**

`tests/e2e/calendar-planning.spec.ts` covers:

```text
1. Create "Работа над проектом" in Backlog.
2. Drag it to tomorrow at 10:00.
3. Assert it disappears from Backlog and appears in Week view.
4. Drag it from 10:00 to 14:00 on the same day; reschedule_count remains unchanged.
5. Drag it to the following day; reschedule_count increments once.
6. Resize to 90 minutes.
7. Select that day and complete it from "Дела на день".
8. Reload and assert scheduled/completed state persists.
```

- [ ] **Step 4: Run Slice B verification**

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:e2e -- tests/e2e/calendar-planning.spec.ts
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit Slice B exit state**

```bash
git add src tests
 git commit -m "test: verify unified backlog and calendar workflow"
```

## Slice B Exit Gate

```text
[ ] Month / Week / Day all render from the same local task rows.
[ ] Backlog task order can be rearranged and survives reload.
[ ] Backlog task can be dragged to a timed slot.
[ ] Scheduled task can be dragged back to Backlog.
[ ] Timed task can be moved and resized.
[ ] Moving between dates increments reschedule_count once; same-day time changes do not.
[ ] All-day and date-only tasks render without fake timed records.
[ ] Calendar event click opens the unified task editor.
[ ] Selected-day list and calendar stay reactive to completion changes.
[ ] Slice B unit/component/E2E tests pass.
```
