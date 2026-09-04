import { AppSchema } from './app-schema';

it('contains the Slice A/B/C sync tables', () => {
  expect(
    AppSchema.tables.map((table) => table.name).sort(),
  ).toEqual([
    'areas',
    'goal_habits',
    'goal_tasks',
    'goals',
    'habit_completions',
    'habits',
    'tasks',
  ]);
});
