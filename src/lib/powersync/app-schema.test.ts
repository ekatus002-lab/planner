import { AppSchema } from './app-schema';

it('contains the Slice A sync tables', () => {
  expect(
    AppSchema.tables.map((table) => table.name).sort(),
  ).toEqual(['areas', 'tasks']);
});
