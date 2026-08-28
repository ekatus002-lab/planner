export type TaskStatus = 'open' | 'completed';
export type TaskPriority = 'low' | 'normal' | 'high';

export type Task = {
  id: string;
  userId: string;
  areaId: string | null;
  goalId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  scheduledDate: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  priority: TaskPriority;
  completedAt: string | null;
  rescheduleCount: number;
  sortOrder: number;
  fieldVersions: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  userId: string;
  title: string;
  areaId?: string | null;
  description?: string;
  priority?: TaskPriority;
};

// Fields a caller may patch after creation. `id`, `userId`, `status`,
// `completedAt`, and the timestamps are intentionally excluded: `status`/
// `completedAt` are only mutated together via `setTaskCompleted`, and the
// audit fields are managed by the repository itself.
export type UpdateTaskInput = Partial<{
  title: string;
  description: string;
  areaId: string | null;
  goalId: string | null;
  priority: TaskPriority;
  scheduledDate: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  rescheduleCount: number;
  sortOrder: number;
}>;
