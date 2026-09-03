import { describe, expect, it } from 'vitest';
import { assertLocalSupabaseUrl } from './global-setup';

// Plain Vitest unit tests for pure helper logic `global-setup.ts` exports -
// not a Playwright spec (see `playwright.config.ts`'s `testMatch`, which
// scopes Playwright to `*.spec.ts` so it doesn't try to load this file).
describe('assertLocalSupabaseUrl', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'])(
    'allows a local Supabase URL (%s)',
    (url) => {
      expect(() => assertLocalSupabaseUrl(url)).not.toThrow();
    },
  );

  it.each([
    'https://xyzcompany.supabase.co',
    'https://my-project.supabase.co',
    'http://staging.internal.example.com:54321',
    'http://not-localhost:54321',
  ])('refuses a non-local Supabase URL (%s)', (url) => {
    expect(() => assertLocalSupabaseUrl(url)).toThrow(/refused to run/);
  });

  it('refuses a value that is not a valid URL at all', () => {
    expect(() => assertLocalSupabaseUrl('not-a-url')).toThrow(/not a valid URL/);
  });
});
