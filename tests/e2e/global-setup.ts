import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The sign-in screen authenticates one fixed, pre-provisioned account by PIN
// (a real `signInWithPassword` grant) - it has no per-run/per-user signup
// flow to drive from a browser. For specs that need an authenticated session
// without going through that screen (e.g. testing what an authenticated
// visitor sees), provision a throwaway Supabase auth user via the admin
// (service-role) API, sign in as it to obtain a genuine session, and persist
// that session as a Playwright storage state file that those specs point
// `test.use({ storageState })` at. This never touches production
// route-protection code (`src/lib/supabase/proxy.ts` still runs its normal
// `getClaims()` check); it only supplies the cookie a real sign-in would have
// produced.
const STORAGE_STATE_PATH = path.resolve(__dirname, '.auth/user.json');
const APP_COOKIE_DOMAIN = 'localhost';

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '../../.env.local');
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Hostnames this script is allowed to run against. It creates real accounts
// via the service-role admin API, so a misconfigured `.env.local` (or a
// future CI environment) accidentally pointed at a shared/staging/prod
// Supabase project must never be able to silently do that there.
// `URL#hostname` keeps the brackets on an IPv6 literal (e.g. `[::1]`), so
// both forms are listed.
const LOCAL_SUPABASE_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Throws unless `supabaseUrl` points at a local Supabase instance. Exported
 * for unit testing (see `global-setup.test.ts`); called from `globalSetup`
 * before anything that talks to Supabase.
 */
export function assertLocalSupabaseUrl(supabaseUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(supabaseUrl).hostname;
  } catch {
    throw new Error(
      `tests/e2e/global-setup.ts: NEXT_PUBLIC_SUPABASE_URL ("${supabaseUrl}") is not a valid URL.`,
    );
  }

  if (!LOCAL_SUPABASE_HOSTNAMES.has(hostname)) {
    throw new Error(
      `tests/e2e/global-setup.ts refused to run against "${supabaseUrl}": its hostname ` +
        `("${hostname}") is not one of ${[...LOCAL_SUPABASE_HOSTNAMES].join(', ')}. This script ` +
        'creates real user accounts via the Supabase service-role admin API - it must only ever ' +
        'run against a local Supabase instance, never a shared/staging/production project. If ' +
        'NEXT_PUBLIC_SUPABASE_URL is genuinely meant to point elsewhere, this guard needs a ' +
        'deliberate, reviewed change, not a workaround.',
    );
  }
}

/**
 * Reproduces the cookie `@supabase/ssr`'s `createBrowserClient` would have
 * written after a real sign-in: JSON-serialize the session, base64url-encode
 * it, and prefix with `base64-` (see
 * `@supabase/ssr/dist/main/cookies.js#createStorageFromOptions`). The storage
 * key mirrors `@supabase/supabase-js`'s default
 * (`sb-${new URL(url).hostname.split('.')[0]}-auth-token`, see
 * `SupabaseClient.ts`).
 */
function buildSupabaseAuthCookie(supabaseUrl: string, session: unknown) {
  const name = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')}`;
  return { name, value };
}

export default async function globalSetup() {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or ' +
        'SUPABASE_SERVICE_ROLE_KEY. tests/e2e/global-setup.ts needs all three to provision ' +
        'an authenticated Playwright storage state (see .env.local).',
    );
  }

  assertLocalSupabaseUrl(supabaseUrl);

  const email = `e2e-${randomUUID()}@example.com`;
  const password = `E2e-${randomUUID()}`;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createUserError) {
    throw new Error(`Failed to create e2e test user: ${createUserError.message}`);
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in e2e test user: ${signInError?.message ?? 'no session returned'}`);
  }

  const cookie = buildSupabaseAuthCookie(supabaseUrl, signInData.session);

  mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  writeFileSync(
    STORAGE_STATE_PATH,
    JSON.stringify(
      {
        cookies: [
          {
            name: cookie.name,
            value: cookie.value,
            domain: APP_COOKIE_DOMAIN,
            path: '/',
            expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
            httpOnly: false,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
      null,
      2,
    ),
  );
}
