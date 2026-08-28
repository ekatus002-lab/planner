# Personal Planner — Product & Technical Design

Date: 2026-08-27
Status: Approved design, pending written-spec review

## 1. Product Goal

Build a private personal planner as a web application and installable PWA. It is designed for one user, works local-first, synchronizes between devices, and combines calendar planning, unscheduled tasks, habits, goals, and monthly analytics in one system.

The planner should feel as responsive as a local app: every action is applied locally first and cloud synchronization happens afterward.

## 2. Primary User Experience

### Desktop layout

The main desktop screen uses a three-column layout:

- Left: Backlog and Goals.
- Center: Calendar (Month / Week / Day) and the selected day's task list.
- Right: Habits and habit statistics.

The center calendar is the primary workspace.

### Mobile / PWA layout

On small screens, the three-column dashboard becomes bottom navigation:

- Today
- Calendar
- Tasks
- Goals
- Review

The mobile experience prioritizes today's habits, today's tasks, and upcoming scheduled items.

## 3. Life Areas

Default life areas:

1. Appearance
2. Sport & Nutrition
3. Study
4. Career
5. Other

Each area has a configurable color. The same color is used consistently across calendar events, tasks, goals, analytics, and legends.

Users may create, rename, recolor, reorder, and archive custom areas.

## 4. Tasks

Tasks use one unified data model rather than separate todo and calendar-event types.

A task can be:

- unscheduled and stored in Backlog;
- assigned to a day without a specific time;
- all-day;
- scheduled for a start/end time;
- linked to a life area;
- linked to a goal;
- completed;
- rescheduled.

Core fields:

- id
- user_id
- area_id
- goal_id (optional)
- title
- description
- status
- scheduled_date (optional)
- start_at (optional)
- end_at (optional)
- all_day
- priority
- completed_at (optional)
- reschedule_count
- created_at
- updated_at
- field_versions / per-field sync metadata

### Calendar interactions

The calendar supports:

- Month / Week / Day views;
- drag task between dates/times;
- resize scheduled task duration;
- all-day tasks;
- drag task from Backlog into calendar;
- drag scheduled task back to Backlog to unschedule it;
- open/edit task from calendar;
- color coding by life area.

## 5. Backlog

Backlog contains tasks that have no scheduled date.

Users can:

- create backlog tasks;
- reorder them;
- assign an area;
- optionally assign a goal;
- drag them directly onto a calendar date/time;
- convert scheduled tasks back into backlog tasks.

## 6. Habits

Habits are modeled separately from tasks because they are recurring behavioral routines rather than one-off work items.

A habit contains:

- id
- user_id
- area_id
- title
- schedule / active weekdays
- optional start_date
- optional end_date
- optional quantitative target
- active flag
- created_at
- updated_at

Each completion is a separate record:

- id
- habit_id
- date
- completed
- optional value
- created_at
- updated_at

Habit UI shows:

- today's status;
- current streak;
- best streak;
- weekly completion;
- monthly completion;
- relationship to goals where relevant.

## 7. Goals

A goal includes:

- id
- user_id
- area_id
- title
- description
- start_date
- end_date
- progress_mode
- manual_adjustment
- created_at
- updated_at

Supported progress modes:

- automatic;
- manual;
- hybrid.

Hybrid mode is the default recommended behavior.

Automatic progress may be calculated from linked tasks and habit completions. Manual adjustment can then increase or decrease the displayed progress.

Goals can link to tasks and habits through relation tables.

## 8. Monthly Review

The planner provides a full monthly review screen.

Metrics include:

- total tasks planned;
- total tasks completed;
- completion rate;
- task completion by week;
- attention split by life area;
- completed tasks by area;
- unfinished tasks;
- rescheduled tasks and reschedule count;
- habit completion rates;
- current and best streaks;
- strongest habits;
- weakest habits;
- goal progress delta during the month.

Charts include:

- weekly completion bar chart;
- life-area distribution chart;
- goal progress chart;
- habit completion summary.

The monthly textual summary is deterministic in MVP 1 and does not require AI.

Example style:

"In August, 124 of 156 tasks were completed (79%). Study and Career received the most attention. English was the most consistent habit at 93%. Portfolio progress increased by 23 percentage points. 17 tasks were rescheduled at least once."

## 9. Local-First Architecture

### Principle

The UI reads from and writes to a local database first. Network access is never required for normal interaction.

Target flow:

React UI -> Local SQLite -> Sync Engine -> Supabase PostgreSQL

### Local database

Use a browser-compatible local SQLite layer. The selected synchronization architecture is PowerSync Web with persistent browser storage.

### Cloud backend

Supabase provides:

- PostgreSQL;
- authentication;
- cloud persistence.

### Authentication

Single-user application with Supabase passwordless email Magic Link.

Authentication is still required so the same private dataset can synchronize securely across devices.

## 10. Synchronization Behavior

All changes are written locally immediately and later synchronized.

The application exposes a lightweight sync status such as:

- Synced
- Syncing
- Offline
- Conflict

### Conflict strategy

Requirement: combine non-overlapping edits automatically and only interrupt the user for a true same-field conflict.

Example:

- Laptop changes task title.
- Phone changes task date.
- Both changes are preserved.

True conflict example:

- Laptop changes title to "Gym + cardio".
- Phone changes the same title to "Yoga" before synchronization.
- User is shown a conflict-resolution UI.

To support this reliably, entities that need conflict-aware editing store per-field version metadata (or equivalent field-level revision information). The sync layer handles ordinary local/offline propagation, while application logic detects unresolved same-field concurrent edits.

Conflict records include:

- entity_type
- entity_id
- field
- local_value
- remote_value
- local_version
- remote_version
- detected_at
- resolved_at
- resolution

## 11. Data Model

Core tables:

- profiles / users
- areas
- tasks
- habits
- habit_completions
- goals
- goal_tasks
- goal_habits
- conflicts
- monthly_snapshots

Monthly snapshots are used to preserve month-end goal progress and analytics baselines where historical comparison would otherwise be affected by later edits.

## 12. PWA Behavior

The web application is installable as a PWA.

Required behavior:

- installable from supported browsers;
- app icon and manifest;
- standalone display mode;
- shell/assets available offline;
- planner data available offline through the local database;
- network loss does not block task/habit/goal editing;
- synchronization resumes after connectivity returns.

Push notifications are explicitly out of scope for MVP 1.

## 13. UI Technology

Proposed stack:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- react-big-calendar
- dnd-kit
- Recharts
- date-fns
- PowerSync Web
- Supabase PostgreSQL
- Supabase Auth (Magic Link)
- PWA manifest + service worker
- Vercel deployment

## 14. UI Components / Boundaries

Primary feature modules:

### Calendar

Responsible for calendar presentation, date navigation, drag/drop scheduling, event resizing, and selected-day state.

### Tasks

Responsible for task CRUD, task detail form, completion, backlog, scheduling state, and task filters.

### Areas

Responsible for category CRUD, colors, ordering, and archived categories.

### Habits

Responsible for habit definitions, daily completion records, streaks, and habit stats.

### Goals

Responsible for goal CRUD, task/habit relations, and progress calculation.

### Review

Responsible for month-level queries, charts, comparisons, summaries, and snapshots.

### Sync

Responsible for local database access, sync status, upload/download orchestration, and conflict detection/resolution.

### Auth

Responsible for Magic Link login, session restoration, and logout.

Each feature should expose a narrow public API and should not reach into another feature's storage implementation directly.

## 15. Error Handling

The app should distinguish between local action failures and synchronization failures.

Local write failure:

- show an immediate blocking error for that action;
- do not pretend the action succeeded.

Sync failure:

- keep the local change;
- show Offline or Sync error status;
- retry automatically later;
- avoid blocking normal use.

Conflict:

- preserve both candidate values;
- show a dedicated conflict resolver;
- allow explicit user choice;
- record the resolution and continue syncing.

## 16. Testing Strategy

### Unit tests

- goal progress calculations;
- streak calculations;
- monthly statistics;
- reschedule counting;
- conflict detection logic;
- deterministic monthly summary generation.

### Component tests

- task form;
- habit completion controls;
- goal progress controls;
- backlog interactions;
- conflict resolver.

### Integration tests

- create backlog task -> schedule in calendar;
- reschedule task;
- complete task;
- habit completion -> streak update;
- goal progress from linked task/habit;
- offline edit -> reconnect -> sync;
- two-device different-field merge;
- two-device same-field conflict.

### E2E tests

- Magic Link login flow where test environment permits;
- desktop planner primary workflow;
- mobile/PWA primary workflow;
- offline mode behavior;
- month review generation.

## 17. MVP 1 Scope

Included:

- Magic Link login
- local-first storage
- cross-device cloud synchronization
- default and custom life areas
- unified tasks
- backlog
- Month / Week / Day calendar
- drag/drop backlog -> calendar
- drag/drop calendar rescheduling
- event resizing
- all-day tasks
- habits
- streaks
- goal links
- automatic/manual/hybrid goal progress
- monthly review
- charts
- deterministic month summary
- PWA installability
- offline usage
- sync status
- conflict detection and resolution

Explicitly deferred:

- push notifications
- AI planner
- Google Calendar sync
- recurring tasks
- subtasks
- file attachments
- rich notes
- home-screen widgets
- multi-user sharing
- native iOS app
- native Android app

## 18. MVP Success Criteria

MVP is successful when:

1. A user can install the PWA and sign in via email Magic Link.
2. A user can create and edit tasks with no internet connection.
3. A backlog task can be dragged onto a calendar date/time and becomes scheduled.
4. Scheduled tasks can be moved and resized from the calendar.
5. Habits can be completed offline and streaks/statistics update immediately.
6. Goals can link to tasks/habits and show hybrid progress.
7. The same dataset synchronizes across desktop and phone after connectivity returns.
8. Different-field concurrent edits merge automatically.
9. Same-field concurrent edits surface a resolvable conflict.
10. The monthly review reports tasks, habits, areas, reschedules, goal progress, charts, and deterministic textual summary.

## 19. Delivery Decomposition

The product is implemented in four sequential slices so Claude Code works against a bounded subsystem at each stage instead of attempting the entire planner in one pass.

### Slice A — Foundation and local task system

- Next.js/PWA shell
- Supabase Magic Link auth
- PowerSync/local database plumbing
- areas
- unified tasks
- backlog
- basic offline CRUD
- sync status

Exit criterion: create/edit/complete/unschedule tasks offline and synchronize them after reconnecting.

### Slice B — Calendar planning

- Month / Week / Day calendar
- task scheduling
- all-day tasks
- drag Backlog -> Calendar
- calendar drag/reschedule
- duration resize
- selected-day task list

Exit criterion: the calendar and backlog operate on the same task records without duplicate event models.

### Slice C — Habits and goals

- habit definitions and schedules
- habit completion records
- streaks and completion percentages
- goals
- task/habit goal links
- automatic/manual/hybrid progress

Exit criterion: daily routines and goals work offline and recalculate immediately from local data.

### Slice D — Review, conflict UX, and release hardening

- monthly analytics
- monthly snapshots
- charts
- deterministic summary
- field-level conflict detection
- conflict resolution UI
- PWA/offline hardening
- cross-device tests
- deployment validation

Exit criterion: two devices can safely synchronize, true conflicts are resolvable, and month-end reporting remains historically stable.
